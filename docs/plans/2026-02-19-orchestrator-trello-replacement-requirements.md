# Orchestrator Task System: Requirements from Trello Audit

**Date:** 2026-02-19
**Author:** Tom + Claude (audit session)
**Status:** Draft — input for orchestrator design
**Context:** Full audit of current Trello usage across all agents, automated tools, and skills. Cross-referenced against compute architecture design and product vision.

---

## Purpose

The Phase 2 orchestrator replaces Trello as the source of truth for task management, agent routing, and inter-role communication. This document captures **what the orchestrator's task system must do**, derived from auditing every Trello operation the engine currently performs.

The orchestrator design (`2026-02-17-compute-architecture-design.md`) covers dispatch and inter-agent communication well. This document fills in the gaps: task metadata, project organization, human interaction, and observability.

---

## Current Trello Surface Area

17 distinct API operations used across 6 agent roles + 2 automated tools. The data model subset is small:

- **Boards** (id, name) — 11+ boards, one per project
- **Lists** (id, name) — fixed 6-column structure: Backlog, Up Next, In Progress, Needs Human, Review, Done
- **Cards** (id, name, desc, idList, labels, dateLastActivity)
- **Labels** (id, name, color) — 12+ types used as agent routing control signals
- **Comments** (text, author, date) — structured inter-agent communication

Not used: checklists, attachments, webhooks, power-ups, member assignment, custom fields, due dates (present but unused in routing).

Trello serves four distinct roles today:
1. **Kanban board** — workflow columns
2. **Agent control plane** — labels route agent behavior
3. **Async message queue** — Solomon Bridge (agent↔founder relay)
4. **Dashboard data source** — polled for card counts and status

---

## Requirement 1: Task Metadata / Tags as Control Signals

### What Trello Does

Labels are the **primary control plane** for all agent behavior. Every label triggers specific routing logic:

| Label | Agent Effect |
|-------|-------------|
| `blocked` | VP-Eng skips; Supervisor logs hygiene violation |
| `urgent` | VP-Eng dispatches first, before all non-urgent tasks |
| `needs-human` | VP-Eng skips, moves to Needs Human column |
| `assigned-{user}` | VP-Eng on shared projects only pulls tasks matching its user |
| `codex-first` | VP-Eng dispatches via Codex (cheap model) |
| `claude-ok` | VP-Eng dispatches via Sonnet (reasoning model) |
| `design` | VP-Eng skips; must be resolved via CPO deep dive first |
| `research` | VP-Eng uses subagent (no persistent session) |
| `tech-review` | VP-Eng registers gate and skips; CTO processes; Supervisor enforces timeout |
| `team` | VP-Eng uses agent team pattern; requires human approval |
| `cpo-generated` | Visual cue that card was auto-generated |
| `bug-scan` | Marks auto-found bugs from nightly scan |

Labels are added/removed by multiple agents throughout a task's lifecycle. A single task can have multiple labels simultaneously (e.g., `urgent` + `claude-ok` + `assigned-tom`).

### What the Orchestrator Needs

A typed tag/attribute system on tasks with these properties:

```
Task:
  tags: Set[str]              # mutable, multi-valued (replaces labels)
  token_budget: enum          # codex-first | claude-ok | team-ok
  assignment: str | null      # user assignment (replaces assigned-{user} labels)
  gate: GateState | null      # replaces tech-review label + comment-based classification
```

**Requirements:**
- Tags must be addable and removable independently (not bulk-replace)
- Tags must be queryable: "give me all tasks with tag `urgent` and no tag `blocked`"
- A predefined tag vocabulary with semantic meaning, enforced by the orchestrator
- Tags drive routing rules in the orchestrator (equivalent to label-based if/else in agent manuals)
- The routing rules should be declarative config, not hardcoded in agent code

### Gate System (Replaces tech-review Label + Comments)

The current gate system uses a combination of label + comment + timestamp:
1. CPO adds `tech-review` label to card
2. CTO reads card, writes classification comment: `"tech-review classification: mechanical"` or `"architecture"`
3. VP-Eng reads comment to determine gate type
4. Supervisor watches `dateLastActivity` for timeout
5. After timeout, Supervisor auto-clears mechanical gates

The orchestrator should model this as a first-class concept:

```
GateState:
  type: str                   # "tech-review", "design-review", etc.
  classification: str | null  # "mechanical" | "architecture" (set by reviewer)
  gated_at: datetime          # when the gate was registered
  reviewer_role: str          # which role should review (e.g., "cto")
  timeout_hours: int          # auto-clear threshold (e.g., 4h for mechanical)
  auto_clearable: bool        # derived from classification
```

---

## Requirement 2: Project-Scoped Task Organization

### What Trello Does

11+ boards, one per project (ink, aida, marginscape, spine-platform, etc.) plus shared boards (exec-team, zazig-engine, zazig-web-ui). Each board has the same 6-column structure. Agents query per-board: "what's in Up Next for Aida?"

CPO standup reads across ALL boards. VP-Eng reads per-board in priority order. CTO scans ALL boards for `tech-review` tasks.

### What the Orchestrator Needs

Tasks must be project-scoped:

```
Task:
  project: str                # "aida", "ink", "zazig-engine", etc.
  status: enum                # backlog | up_next | in_progress | needs_human | review | done | archived
```

**Requirements:**
- Query by project: "all tasks for project `aida` with status `up_next`"
- Query across projects: "all tasks with tag `tech-review` across all projects" (CTO scan)
- Project-level aggregate views: "count of tasks per status per project" (dashboard)
- The 6-status workflow is universal — all projects share it
- Shared projects (zazig-engine) have assignment-based filtering; personal projects don't

---

## Requirement 3: Solomon Bridge (Bidirectional Async Human Channel)

### What Trello Does

Three dedicated lists on the Exec Team board function as an async message queue:

```
Agent Decision Needed ──→ Awaiting Owner (card created by CPO/VP-Eng)
                              ↓
                         [Solomon relays to Telegram]
                              ↓
                         [Founder replies via Telegram]
                              ↓
                         Tom Responded (card created by Solomon)
                              ↓
                         [CPO reads answer, archives card]

From Tom ────────────→ (founder-initiated: voice captures, async instructions)
                              ↓
                         [CPO reads, creates tasks, archives card]
```

This is richer than simple yes/no approval:
- Multi-question escalation cards (CPO asks 3 questions, founder answers all)
- Voice captures from founder via Telegram (async instructions)
- Founder-initiated messages ("Hey, I had an idea about...")
- Durable — survives agent restarts, visible in Trello UI

### What the Orchestrator Needs

A first-class **founder interaction queue** separate from the task queue:

```
FounderMessage:
  id: str
  direction: enum             # agent_to_founder | founder_to_agent
  source_role: str            # which role created/should handle this
  channel: str                # "slack" | "telegram" | "web" | "voice"
  status: enum                # pending | delivered | responded | processed
  content: str                # the question or instruction
  response: str | null        # founder's answer
  created_at: datetime
  responded_at: datetime | null
```

**Requirements:**
- Agents can create escalation messages with questions for the founder
- Messages are relayed to founder via their preferred channel (Slack DM, Telegram, web dashboard, push notification)
- Founder responses flow back and are routable to the originating role
- Founder can initiate messages (voice captures, async ideas) that are routed to the appropriate role (usually CPO)
- Messages are durable and queryable (audit trail)
- The Slack-native approval workflow (evolution plan card 2.3) is a **subset** of this — simple approve/decline is one interaction pattern, but the queue must support open-ended Q&A

---

## Requirement 4: Task-Level Timestamps

### What Trello Does

`dateLastActivity` is a server-side timestamp updated on any card activity (moved, commented, field changed). Used for:
- Gate timeout calculation (how long has `tech-review` been waiting?)
- Stale card detection (done-archiver prunes cards inactive >24h)
- Standup reporting ("this card hasn't moved in 3 days")

### What the Orchestrator Needs

```
Task:
  created_at: datetime
  updated_at: datetime        # server-managed, updated on ANY mutation
  status_changed_at: datetime # when the status last changed (for staleness)
  gate_registered_at: datetime | null  # if gated, when was the gate set
```

**Requirements:**
- `updated_at` must be server-managed (not client-set) to prevent clock skew
- Must be queryable: "tasks where `status_changed_at` < now - 24h" (stale detection)
- Gate timeout calculation: `now - gate_registered_at > timeout_hours`

---

## Requirement 5: Comments / Activity Log

### What Trello Does

Comments on cards serve as structured inter-agent communication:
- CTO writes: `"tech-review classification: mechanical"` — parsed by VP-Eng
- VP-Eng writes: QA summary + agent completion report — read by CPO
- CPO writes: design doc links — confirms handoff
- Supervisor writes: auto-clear notices — audit trail

Comments are also used for founder-facing reporting (PR links, test results).

### What the Orchestrator Needs

```
TaskEvent:
  id: str
  task_id: str
  type: enum                  # comment | status_change | tag_change | gate_event | assignment
  author_role: str            # "cpo", "vp-eng", "system", "founder"
  content: str                # human-readable description
  structured_data: dict | null # machine-parseable metadata (e.g., gate classification)
  created_at: datetime
```

**Requirements:**
- Append-only activity log per task (comments + status changes + tag mutations)
- Machine-parseable structured data for inter-agent protocol messages (gate classification, QA results)
- Human-readable content for founder-facing reporting
- Queryable: "all events on task X by role `cto`"
- The gate classification pattern should use `structured_data` rather than parsing comment text

---

## Requirement 6: Batch Query Endpoint (Board Snapshot)

### What Trello Does

`GET /boards/{id}?lists=open&cards=open` returns the entire board — all lists and all cards — in **one API call**. This is heavily exploited:
- VP-Eng startup: reads all project boards in sequence
- CPO standup: reads all boards for status synthesis
- CTO heartbeat: scans all boards for `tech-review` tasks
- Keepalive hook: counts Up Next cards across all boards

### What the Orchestrator Needs

A batch query that returns the full project state in one call:

```
GET /api/v1/tasks?project=aida&include=events

Response:
{
  "project": "aida",
  "tasks_by_status": {
    "backlog": [...],
    "up_next": [...],
    "in_progress": [...],
    "needs_human": [...],
    "review": [...],
    "done": [...]
  },
  "summary": {
    "total": 47,
    "by_status": {"backlog": 12, "up_next": 3, ...},
    "by_tag": {"urgent": 1, "blocked": 2, ...}
  }
}
```

**Requirements:**
- Single-call full project snapshot (equivalent to `trello-lite board {id}`)
- Cross-project aggregate: "summary of all projects" for dashboard/standup
- Filterable: "only tasks assigned to `tom`" for shared projects
- Include events (comments/activity) optionally (avoid payload bloat when not needed)
- Response should be token-efficient for agent consumption (compact format option)

---

## Requirement 7: Task Lifecycle (Archive/Retention)

### What Trello Does

- Cards move through: Backlog → Up Next → In Progress → Review → Done
- `done-archiver` (nightly launchd job) archives cards in Done that are inactive >24h
- Archived cards are hidden from board views but still queryable via API
- `trello-lite archived-count {board-id}` returns count of archived cards

### What the Orchestrator Needs

```
Task.status progression:
  backlog → up_next → in_progress → needs_human (optional) → review → done → archived

Archive rules:
  - Tasks in "done" for >24h are auto-archived
  - Archived tasks are excluded from default queries
  - Archived tasks are retained for N days (configurable) for audit
  - Archived tasks can be queried explicitly: GET /api/v1/tasks?status=archived&project=aida
```

**Requirements:**
- Auto-archive with configurable retention policy (replaces done-archiver cron job)
- Archived tasks excluded from default queries but accessible for audit
- Status transition validation (can't skip from backlog to done without passing through in_progress)
- Status rollback support (review → in_progress if QA fails)

---

## Requirement 8: Cardify Equivalent (Design Doc → Tasks)

### What Trello Does

The `/cardify` skill converts design documents into Trello cards:
1. Parse design doc into discrete work items
2. Generate a `.cards.md` sibling file with card definitions
3. Push to Trello: create cards in Backlog with labels, descriptions, and assignment

### What the Orchestrator Needs

A task creation API that accepts batch task creation with full metadata:

```
POST /api/v1/tasks/batch
{
  "project": "aida",
  "tasks": [
    {
      "name": "Implement OAuth login",
      "description": "Add Google OAuth...",
      "status": "backlog",
      "tags": ["claude-ok", "design"],
      "assignment": "tom",
      "token_budget": "claude-ok"
    },
    ...
  ]
}
```

**Requirements:**
- Batch creation (cardify generates 5-20 tasks at once)
- Idempotent re-push (update existing tasks by name/ID, don't create duplicates)
- Return created task IDs for `.cards.md` URL generation
- Accept all metadata in a single call (tags, assignment, description)

---

## Requirement 9: Nightly Automated Scans

### What Trello Does

Two automated tools run on launchd schedules:

**done-archiver** (nightly):
- Scans Done list across all 11 boards
- Archives cards inactive >24h
- Covers all projects automatically

**nightly-bug-scan** (nightly):
- Runs static analysis / lint on all projects
- Creates cards in Review list for any findings
- Tags with `bug-scan` label
- Skips findings that already have open cards (dedup)

### What the Orchestrator Needs

- Built-in archive automation (replaces done-archiver — see Requirement 7)
- Task creation API with dedup support (replaces bug-scan card creation)
- Dedup key: task name + project + tag combination
- Scheduled task triggers: "run this scan every 24h" as orchestrator config

---

## Summary: Orchestrator Task Schema

Combining all requirements, the minimum task schema:

```
Task:
  id: str                     # unique identifier
  project: str                # project scope
  name: str                   # human-readable title
  description: str            # acceptance criteria, context
  status: enum                # backlog | up_next | in_progress | needs_human | review | done | archived
  tags: Set[str]              # mutable control signals (replaces labels)
  token_budget: enum          # codex-first | claude-ok | team-ok
  assignment: str | null      # user assignment for shared projects
  gate: GateState | null      # review gate with timeout
  priority: int               # ordering within status column
  created_at: datetime
  updated_at: datetime        # server-managed
  status_changed_at: datetime
  events: List[TaskEvent]     # activity log (comments, status changes, etc.)

GateState:
  type: str                   # "tech-review", "design-review", etc.
  classification: str | null  # "mechanical" | "architecture"
  reviewer_role: str
  gated_at: datetime
  timeout_hours: int
  auto_clearable: bool

TaskEvent:
  id: str
  type: enum                  # comment | status_change | tag_change | gate_event | assignment
  author_role: str
  content: str
  structured_data: dict | null
  created_at: datetime

FounderMessage:
  id: str
  direction: enum             # agent_to_founder | founder_to_agent
  source_role: str
  channel: str
  status: enum                # pending | delivered | responded | processed
  content: str
  response: str | null
  created_at: datetime
  responded_at: datetime | null
```

---

## Migration Path

### Phase 1 (now): Trello stays
- trello-lite is the interface
- All agents, skills, and automated tools use Trello
- No changes needed

### Phase 2 (orchestrator): Trello dies
- Orchestrator implements the task schema above
- Write a `trello-lite` → orchestrator API adapter (same CLI interface, different backend)
- One-time migration: pull current Trello state into orchestrator
- Agent manuals reference task operations generically (already mostly true — they say "move card" not "call Trello API")
- Cardify skill targets orchestrator API
- done-archiver becomes orchestrator config (auto-archive policy)
- nightly-bug-scan targets orchestrator task creation API
- Solomon Bridge becomes FounderMessage queue

### Phase 3 (dashboard): Visual layer
- Dashboard reads from orchestrator API (not Trello)
- Founder sees project status, not task internals
- Board-style views available for power users / co-founders

---

## Open Questions for Chris

1. **State store technology** — The task schema above needs fast queries (filter by project + status + tags). Postgres is the obvious choice for cloud. Is there a local-first option for Phase 1 dogfooding before cloud is ready?

2. **Event sourcing vs. CRUD** — Should tasks be event-sourced (append-only log of mutations) or mutable rows? Event sourcing gives free audit trail but adds query complexity. The `TaskEvent` log is a hybrid — mutable task + append-only events.

3. **Tag vocabulary** — Should tags be free-form strings or a predefined enum? Free-form is flexible but risks typos and drift. Enum is rigid but enforces consistency. Current Trello labels are effectively an enum (12 predefined labels, rarely changed).

4. **Founder message routing** — How does the orchestrator decide which role handles a founder-initiated message? Today CPO is the default receiver. Should this be configurable per-company?

5. **Offline/local mode** — If the orchestrator is cloud-hosted but the founder's Mac is offline, can agents still create/read tasks from a local cache that syncs when connectivity returns? This is the hybrid cache pattern from the 2026-02-13 alternatives research, applied to the orchestrator.
