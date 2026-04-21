# Autonomous Idea Pipeline

**Date:** 2026-04-18 (updated 2026-04-21)
**Status:** Design approved
**Author:** CPO + Founder

## Problem

Ideas enter the system as raw text and stall without human intervention. The existing auto-triage/spec/promote automation runs AI workloads on the orchestrator edge function — wrong architecture. The system should process ideas end-to-end autonomously using jobs on company machines.

## Core Concept

Every idea is fully processed without human intervention. The orchestrator manages a state machine per idea, dispatching focused jobs to available machines. Any job can chat with the user through a platform-level messaging system. All AI work runs on company machines via jobs — zero AI credits on the edge function.

## Idea Types

The triager classifies every idea into one of:

- **Bug** — something's broken
- **Feature** — build something new
- **Task** — non-code work (docs, decks, research)
- **Initiative** — big effort that breaks into smaller ideas

Classification is automatic from the raw text. Users do not need to tag ideas.

## Three Routing Paths

Bugs and features converge — both promote to features in the existing build pipeline. The only difference is how the triager enriches them (bugs get diagnosis/repro, features get research/requirements).

| Type | Path |
|------|------|
| Bug / Feature | `triaging → enriched → promoted to feature → existing build pipeline` |
| Task | `triaging → enriched → executing → done` |
| Initiative | `triaging → enriched → breaking_down → spawned` (child ideas enter pipeline as `new`) |

## Idea Lifecycle

```
new → triaging → enriched → routed
```

From `routed`:

- **Bug/Feature:** Promote to feature. Enters existing pipeline (breaking_down → building → merging → shipped).
- **Task:** `executing → done`. Job does the non-code work, commits output to the company repo, and links it on the idea.
- **Initiative:** `breaking_down → spawned`. Job splits into individual ideas that re-enter the pipeline as `new`.

### Hold

Any idea can be paused via a boolean `on_hold` field. When `on_hold = true`, the orchestrator skips it entirely. When the user un-holds, the idea resumes from its current status — no status tracking gymnastics needed.

### Awaiting Response

When a job suspends after the 10-minute idle timeout, the idea status moves to `awaiting_response`. It stays there until the user replies, at which point the orchestrator picks it up and creates a resume job.

## Projects

**Every idea must have a `project_id`.** The triager assigns it — either an existing product project or the company-level project.

### Company Project

Every company has a default company project for non-code work (sales decks, research, marketing, docs). This is a regular project with a git repo, referenced via `company_project_id` on the `companies` table.

- Non-code task output is committed to this repo (HTML presentations, docs, research, campaign copy, etc.)
- Versioned in git — full history, diffs, collaboration
- Any job can find the company repo by looking up `companies.company_project_id`

### Schema Changes

- `companies.company_project_id` — FK to `projects.id`, references the default company project

## Jobs

| Stage | Job Type | What It Does |
|-------|----------|-------------|
| triaging | `idea-triage` | Classifies type, assigns project, researches context, enriches detail, asks user questions if needed |
| executing | `task-execute` | Does the non-code work (docs, decks, research), commits output to company repo |
| breaking_down | `initiative-breakdown` | Splits initiative into individual ideas that re-enter the pipeline |

Bug/feature building uses the existing feature job pipeline — no new job types needed there.

### Concurrency

- Multiple idea jobs can run in parallel across the system (different ideas on different machines).
- **One active job per idea at a time.** The idea pipeline is sequential — triage, then route, then execute. No parallel jobs on a single idea.
- The only fan-out is initiatives, which create **new ideas** (not parallel jobs on the same idea).

## Job Infrastructure

Idea jobs use the **same `jobs` table** as feature jobs. Same queue, same dispatch, same local agent pickup. No separate infrastructure.

- Feature jobs → `feature_id` set (existing)
- Idea jobs → `idea_id` set (new column on jobs table)

One job system, two pipelines feeding into it. A machine picks up whatever job is next in the queue regardless of whether it came from an idea or a feature.

## Platform Chat System

A capability available to **any job**, not specific to any stage.

### How it works

- Each idea has a chat thread (new table: `idea_messages`)
- Jobs post messages via a tool/API: `ask_user(idea_id, question)`
- User sees messages in the iOS app via **Supabase Realtime** subscription
- Job listens for replies via **Supabase Realtime** on the same channel
- Full conversation history persists on the idea — every job's questions and user's answers in one thread

### `idea_messages` table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `idea_id` | UUID FK | Which idea this message belongs to |
| `job_id` | UUID FK (nullable) | Which job sent this message (null for user messages) |
| `sender` | enum: `job`, `user` | Who sent the message |
| `content` | text | Message content |
| `created_at` | timestamptz | When the message was sent |

### 10-minute idle suspend/resume

- If no user reply in 10 minutes, job closes and frees the machine
- Idea status moves to `awaiting_response`
- When user eventually replies, orchestrator creates a new resume job
- If user is actively replying, the job stays alive — most conversations complete in a single job

### Suspend/resume state

**No explicit state blob.** The resume job reconstructs context by:

1. Reading the `idea_messages` conversation history
2. Reading the idea record (type, classification, enriched fields)
3. Reading the project repo for any prior research/work

The conversation IS the state. LLMs are good at picking up context from a thread. This avoids maintaining a structured state contract across job types.

### Realtime architecture

| Consumer | Channel | Purpose |
|----------|---------|---------|
| iOS app | `idea_messages` where `idea_id = X` | Show new messages to the user in real-time |
| Running job | `idea_messages` where `idea_id = X, sender = 'user'` | Receive user replies without polling |
| Orchestrator | `idea_messages` where `sender = 'user'` + idea in `awaiting_response` | Detect replies to suspended jobs, create resume jobs instantly |

The orchestrator uses Realtime (not cron polling) for idea message watching to minimize latency when a user replies. All other orchestrator loops remain on the existing cron cycle.

**Note:** Supabase Realtime reliability has been an issue previously. If Realtime proves unreliable, all three consumers can fall back to polling with minimal code change — the interface (`ask_user()` → wait for reply → timeout) remains the same.

## Stop Conditions

1. **User says hold** — user sets `on_hold = true` via the app. Orchestrator skips the idea entirely.
2. **User goes dark** — job asked questions, no response after 10-min timeout. Idea moves to `awaiting_response` and stays there until the user replies.
3. **Job fails** — idea gets flagged, orchestrator can retry or escalate.

## Orchestrator Changes

The orchestrator gains new watch loops:

1. **Watch for `new` ideas** → create `idea-triage` job on available machine
2. **Watch for `enriched` ideas** → route based on type, either promote to feature or create next job
3. **Watch for user replies on `awaiting_response` ideas** (via Realtime) → create resume job instantly
4. **Watch for completed stage jobs** → advance state, create next job if needed

### What to remove

Remove existing auto-* functions that run AI on the edge function:
- `autoTriageNewIdeas`
- `autoSpecTriagedIdeas`
- `autoPromoteTriagedIdeas`
- `autoEnrichIncompleteTriagedIdeas`

### What to add

- New orchestrator loops that create jobs instead of running AI directly
- Realtime subscription for `idea_messages` (resume job trigger)
- `idea_id` column on `jobs` table (nullable, alongside existing `feature_id`)
- `idea_messages` table for chat
- `on_hold` boolean on ideas
- New idea statuses: `triaging`, `enriched`, `routed`, `executing`, `breaking_down`, `spawned`, `awaiting_response`
- Idea `type` as a first-class field (bug/feature/task/initiative)
- `company_project_id` on `companies` table
- `ask_user` tool available to all job types
- 10-minute idle detection and suspend logic

## Design Decisions

- **No human gates.** Everything runs fully autonomous. User can pause/hold individual ideas.
- **Orchestrator is a dispatcher, not a doer.** It reads state and creates jobs. All AI runs on company machines.
- **Chat is a platform feature.** Any job can ask the user questions, not just the triager.
- **Bugs and features converge.** Both promote to features in the existing build pipeline.
- **Suspend/resume via conversation history.** No explicit state blob — the resume job reads the chat thread and idea record to pick up where the last job left off.
- **Realtime for responsiveness.** Orchestrator uses Supabase Realtime (not cron) to detect user replies and create resume jobs instantly. Fallback to polling if Realtime is unreliable.
- **One conversation thread per idea.** All job interactions with the user appear in a single chat history.
- **Every idea gets a project.** Triager assigns it. Non-code work goes to the company project.
- **Company project for non-code output.** A git repo per company for tasks like presentations, docs, research. Referenced via `companies.company_project_id`.
- **One job per idea at a time.** Pipeline is sequential. Parallelism comes from processing many ideas simultaneously, not multiple jobs on one idea.
- **Hold is a boolean, not a status.** `on_hold = true` pauses without disrupting the status flow.
