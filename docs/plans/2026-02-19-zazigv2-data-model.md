# zazigv2 Data Model — Design Document

**Date:** 2026-02-19
**Status:** proposed
**Authors:** Chris (owner), CPO (agent)
**Supersedes:** Core Tables section of `2026-02-18-orchestration-server-design.md`

---

## Context

The initial VPE-authored schema (`001_initial_schema.sql`) had three tables: machines, jobs, events. Through design review with the owner, we identified fundamental gaps:

- No multi-tenancy (single Supabase shared across paying companies)
- No concept of roles as a platform construct
- No project hierarchy (jobs floated with just a Trello card_id)
- Persistent agents (CPO, CTO) treated as special infrastructure rather than long-running jobs
- Trello as source of truth (being removed)
- No inter-agent communication model
- No feature-level product planning

This document defines the complete data model for zazigv2.

---

## Entity Hierarchy

```
roles (global — platform-defined)
│
companies (tenant boundary)
├── company_roles (which roles enabled + memory)
├── machines (contributor laptops)
├── projects
│   └── features (product work)
│       └── jobs (execution units)
├── jobs (company-scoped, no feature — persistent agents, bugs)
├── messages (per-job communication)
└── events (lifecycle log)
```

---

## Tables

### roles

Global platform table. Defines the available agent roles across all companies.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `name` | text | UNIQUE. e.g. `cpo`, `cto`, `engineer`, `reviewer` |
| `prompt` | text | System prompt for this role |
| `description` | text | Human-readable description |
| `is_persistent` | boolean | If true, system auto-creates a standing job when a company enables this role. Job is always redispatched if it stops. |
| `default_model` | text | Suggested model tier (e.g. `opus`, `sonnet`, `codex`) |
| `created_at` | timestamptz | |

**Key decisions:**
- Roles are platform-managed, not company-created. Companies choose which roles to enable.
- `is_persistent` drives orchestrator behavior: persistent role jobs are never marked `complete` (only if the company disables the role). If a persistent job stops or its machine goes offline, the orchestrator redispatches it automatically.

---

### companies

Tenant boundary. Everything is scoped to a company.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `name` | text | Company name |
| `status` | text | CHECK (`active`, `suspended`, `archived`) |
| `created_at` | timestamptz | |

---

### company_roles

Which roles a company has enabled.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `role_id` | uuid | FK → roles |
| `enabled` | boolean | DEFAULT true |
| `created_at` | timestamptz | |

**Key decisions:**
- When a company enables a persistent role, the system auto-creates a standing job for it.
- Config overrides (model, tool access, etc.) intentionally omitted — add when we find a need.
- UNIQUE constraint on (`company_id`, `role_id`).

---

### machines

Contributor machines that connect to the orchestrator.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `name` | text | e.g. `toms-macbook` |
| `slots_claude_code` | int | Total capacity |
| `slots_codex` | int | Total capacity |
| `last_heartbeat` | timestamptz | |
| `status` | text | CHECK (`online`, `offline`) |
| `created_at` | timestamptz | |

**Key decisions:**
- No `hosts_cpo` or any role-specific columns. Persistent agents are jobs — the orchestrator assigns them to machines dynamically.
- Slots are total capacity. Available slots = total minus count of active jobs on this machine.
- UNIQUE constraint on (`company_id`, `name`).

---

### projects

A company's product/repo. Features and project-scoped jobs belong here.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `name` | text | e.g. `zazigv2`, `marginscape` |
| `repo_url` | text | GitHub repo URL |
| `status` | text | CHECK (`active`, `paused`, `archived`) |
| `created_at` | timestamptz | |

**Key decisions:**
- No Trello board references. The orchestrator's job queue replaces Trello.
- UNIQUE constraint on (`company_id`, `name`).

---

### features

The unit of product work. Human-facing. Lives on roadmaps.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `project_id` | uuid | FK → projects |
| `title` | text | e.g. "Build auth system" |
| `description` | text | Requirements, acceptance criteria |
| `status` | text | CHECK (`proposed`, `designing`, `in_progress`, `complete`) |
| `created_by` | text | `human` or role name |
| `created_at` | timestamptz | |

**Key decisions:**
- Features are created by humans or CPO.
- CPO discusses features with the human, designs them, then breaks them into jobs.
- The orchestrator does not see features — it only sees jobs.

---

### jobs

The unit of execution. What the orchestrator dispatches to machines.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `project_id` | uuid | FK → projects. **Nullable** — persistent agent jobs and company-wide work have no project. |
| `feature_id` | uuid | FK → features. **Nullable** — persistent agents, bugs, and standalone tasks have no feature. |
| `role` | text | Which role executes this job (FK-like to roles.name) |
| `job_type` | text | CHECK (`code`, `infra`, `design`, `research`, `docs`, `bug`, `persistent_cpo`) |
| `complexity` | text | CHECK (`simple`, `medium`, `complex`). Nullable for persistent jobs. |
| `slot_type` | text | CHECK (`claude_code`, `codex`). Nullable for persistent jobs. |
| `machine_id` | uuid | FK → machines. **Nullable** — set when dispatched, cleared when parked. |
| `status` | text | CHECK (`queued`, `dispatched`, `executing`, `waiting_on_human`, `reviewing`, `complete`, `failed`) |
| `branch` | text | Git branch. Primary code state for resumability. |
| `context` | text | Original brief + evolving summary. Updated throughout lifecycle. |
| `raw_log` | text | Full unedited agent output. Debug trail. Appended on every flush. |
| `result` | text | Final output when complete (equivalent of cpo-report.md). |
| `pr_url` | text | |
| `started_at` | timestamptz | |
| `completed_at` | timestamptz | |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Auto-updated via trigger |

**Key decisions:**

- **Persistent agents are jobs.** A CPO job with `job_type = 'persistent'` behaves like any other job — dispatched to a machine, tracked by the orchestrator. If the machine goes offline, the orchestrator redispatches it. No special `persistent_agents` table needed.

- **Bugs are jobs with no feature.** `job_type = 'bug'`, `feature_id = NULL`. Anyone can report a bug, but CPO triages and creates the job (sets role, complexity, context) for consistency with the feature → job flow.

- **Persistent agents consume slots.** A CPO job running on a machine occupies a `claude_code` slot. The orchestrator accounts for this when calculating available capacity.

- **Resumability from database state.** When a job parks (e.g. `waiting_on_human`), the agent: (1) commits and pushes to `branch`, (2) appends full state to `raw_log`, (3) updates `context` with a clean summary, (4) posts a message explaining what's needed, (5) sets status → `waiting_on_human`, (6) exits, freeing the machine slot. A new agent picks up by reading `context` + messages + checking out `branch`.

- **`raw_log` is for debugging.** Full unedited agent output before summarization. Kept to diagnose issues at this stage. Can move to cold storage later.

- **`context` is mutable.** Starts as the original brief, evolves as the agent works. Stores only information not already in the branch code — decisions, reasoning, human responses, what to do next.

---

### messages

Inter-agent and agent-to-human communication, scoped to a job.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `job_id` | uuid | FK → jobs. **Nullable** — rare, for company-wide announcements. |
| `from_role` | text | Who sent it (`cpo`, `engineer`, `human`, etc.) |
| `to_role` | text | Who it's for. **Nullable** = broadcast to all job participants. |
| `content` | text | The message |
| `message_type` | text | CHECK (`question`, `answer`, `status_update`, `blocked`) |
| `created_at` | timestamptz | |

**Key decisions:**

- **Replaces Slack threads for agent collaboration.** In v1, agents communicated via Slack mentions. Now it's structured messages in the database.
- **`waiting_on_human` is a message pattern.** Agent posts a message with `to_role = 'human'`, `message_type = 'question'`, and sets the job status to `waiting_on_human`. Human replies, job goes back to `queued`.
- **Agent-to-agent questions don't block.** If CPO asks CTO "how should we deploy this?", the job stays `executing`. Only human-directed questions change job status.

---

### events

Append-only lifecycle log. Scoped to a company, tagged with whatever context applies.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `job_id` | uuid | FK → jobs. **Nullable.** |
| `machine_id` | uuid | FK → machines. **Nullable.** |
| `role` | text | **Nullable.** Which role generated this event. |
| `event_type` | text | e.g. `job_dispatched`, `machine_offline`, `cpo_standup`, `bug_detected` |
| `detail` | jsonb | Free-form payload, structure varies by event_type |
| `created_at` | timestamptz | |

**Examples:**

| Event | job_id | machine_id | role |
|-------|--------|------------|------|
| CPO ran standup | CPO job | Tom's machine | cpo |
| Orchestrator dispatched a job | null | Tom's machine | null |
| Codex agent finished PR | that job | Chris's machine | engineer |
| Machine went offline | null | that machine | null |
| Company created | null | null | null |

---

### memory_chunks

Agent memory. Replaces QMD + filesystem markdown files from v1.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `company_id` | uuid | FK → companies |
| `role` | text | Which role's memory. **Nullable** = shared across roles. |
| `source_path` | text | Original source (for dedup/updates) |
| `text` | text | The chunk content |
| `embedding` | vector | pgvector for semantic search |
| `created_at` | timestamptz | Recency weighting |

**Key decisions:**
- Same memory model as v1 (markdown chunks, scoped by role, searchable) but stored in Supabase instead of local filesystem + QMD.
- Uses Postgres `pg_vector` for semantic search and built-in full-text search to replace QMD's FTS5 + vector + LLM reranking.
- Agents query via a `memory_search()` tool call (same pattern as v1).
- Written on pre-compaction flush when conversation nears context limits.

---

## Indexes

| Table | Index | Reason |
|-------|-------|--------|
| machines | `company_id` | Tenant filtering |
| projects | `company_id` | Tenant filtering |
| features | `company_id`, `project_id` | Tenant filtering, project lookup |
| jobs | `company_id` | Tenant filtering |
| jobs | `status` | Orchestrator polls by status (`queued`, `executing`, etc.) |
| jobs | `machine_id` | Count active jobs per machine for slot availability |
| jobs | `feature_id` | "Show all jobs for this feature" |
| jobs | `project_id` | "Show all jobs for this project" |
| messages | `job_id` | Load message thread for a job |
| messages | `company_id` | Tenant filtering |
| events | `company_id` | Tenant filtering |
| events | `job_id` | Event history for a job |
| events | `created_at` | Time-range queries |
| memory_chunks | `company_id`, `role` | Scoped memory search |

---

## Realtime

The following tables are added to the Supabase Realtime publication:

| Table | Why |
|-------|-----|
| `jobs` | Local agents subscribe to receive dispatched work. Orchestrator watches status changes. |
| `machines` | Orchestrator watches heartbeats and status. |
| `messages` | Agents receive responses to questions in real-time. |

Events and memory_chunks are excluded — write-heavy, read-rarely tables that don't need live subscriptions.

---

## RLS Strategy

All tables use Row Level Security with `company_id` scoping:

- `service_role` gets full access (for the orchestrator and local agents)
- Future: per-company API keys with RLS policies filtering by `company_id`
- Auth model details deferred — figure it out as we build

---

## What This Replaces (from v1)

| v1 | zazigv2 |
|----|---------|
| Trello boards + cards | `features` + `jobs` tables |
| Trello columns (Up Next, In Progress, etc.) | `jobs.status` |
| Card descriptions + annotations | `jobs.context` + `jobs.job_type` + `jobs.complexity` |
| `cpo-events.log` / JSON state files | `events` table |
| Slack thread communication | `messages` table |
| `hosts_cpo` on machines | Persistent agents are jobs, dynamically assigned |
| QMD + filesystem markdown | `memory_chunks` with pgvector |
| `assigned-{name}` labels | `company_id` scoping — shared pipeline per company |
| VP-Eng dispatch decisions | CPO breaks features into jobs, orchestrator dispatches |

---

## Open Questions

1. **Auth model** — How do machines authenticate? Per-company API keys? Supabase auth? Deferred.
2. **Memory chunk size / boundaries** — v1 chunked by markdown headers. Same strategy or different?
3. **Event retention** — Keep forever or add a TTL? `raw_log` on jobs could get large.
4. **Feature → job breakdown UX** — CPO does this via conversation, but what's the mechanical step? CPO calls a tool that creates job rows?
5. ~~**Realtime subscriptions**~~ — Resolved: jobs, machines, and messages.
