# Autonomous Idea Pipeline

**Date:** 2026-04-18
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
- **Task:** `executing → done`. Job does the non-code work, drops output on the idea.
- **Initiative:** `breaking_down → spawned`. Job splits into individual ideas that re-enter the pipeline as `new`.

## Jobs

| Stage | Job Type | What It Does |
|-------|----------|-------------|
| triaging | `idea-triage` | Classifies type, researches context, enriches detail, asks user questions if needed |
| executing | `task-execute` | Does the non-code work (docs, decks, research), drops output on the idea |
| breaking_down | `initiative-breakdown` | Splits initiative into individual ideas that re-enter the pipeline |

Bug/feature building uses the existing feature job pipeline — no new job types needed there.

## Platform Chat System

A capability available to **any job**, not specific to any stage.

### How it works

- Each idea has a chat thread (new table: `idea_messages`)
- Jobs post messages via a tool/API: `ask_user(idea_id, question)`
- User sees messages in the iOS app and replies
- Job receives the reply and continues
- Full conversation history persists on the idea — every job's questions and user's answers in one thread

### 10-minute idle suspend/resume

- If no user reply in 10 minutes, job saves state to the idea record, closes, frees the machine
- When user eventually replies, orchestrator creates a new job that loads saved state and continues
- If user is actively replying, the job stays alive — most conversations complete in a single job

### State persistence on suspend

- `idea.job_state` — JSON blob: what the job was doing, what it still needs, research so far
- `idea.pending_questions` — what was asked but not yet answered
- New resume job loads this state and picks up where the last job left off

## Stop Conditions

1. **User says hold** — user pauses the idea via the app. Orchestrator won't create new jobs for it.
2. **User goes dark** — triager asked questions, no response after suspend. Idea stays in current state until user comes back and replies.
3. **Job fails** — idea gets flagged, orchestrator can retry or escalate.

## Orchestrator Changes

The orchestrator gains new watch loops:

1. **Watch for `new` ideas** → create `idea-triage` job on available machine
2. **Watch for `enriched` ideas** → route based on type, either promote to feature or create next job
3. **Watch for suspended jobs with new user replies** → create resume job
4. **Watch for completed stage jobs** → advance state, create next job if needed

### What to remove

Remove existing auto-* functions that run AI on the edge function:
- `autoTriageNewIdeas`
- `autoSpecTriagedIdeas`
- `autoPromoteTriagedIdeas`
- `autoEnrichIncompleteTriagedIdeas`

### What to add

- New orchestrator loops that create jobs instead of running AI directly
- `idea_messages` table for chat
- `job_state` and `pending_questions` fields on ideas for suspend/resume
- New idea statuses to match the lifecycle (`triaging`, `enriched`, `routed`, `executing`, `breaking_down`, `spawned`)
- Idea `type` as a first-class field (bug/feature/task/initiative)
- `ask_user` tool available to all job types
- 10-minute idle detection and suspend/resume logic

## Design Decisions

- **No human gates.** Everything runs fully autonomous. User can pause/hold individual ideas.
- **Orchestrator is a dispatcher, not a doer.** It reads state and creates jobs. All AI runs on company machines.
- **Chat is a platform feature.** Any job can ask the user questions, not just the triager.
- **Bugs and features converge.** Both promote to features in the existing build pipeline.
- **Suspend/resume over blocking.** Jobs don't hold machine slots waiting for humans. 10-min active window, then suspend.
- **One conversation thread per idea.** All job interactions with the user appear in a single chat history.
