# Exec Heartbeat & Cache-TTL — Autonomous Recurring Work for Persistent Agents

**Date:** 2026-03-09
**Status:** Draft
**Authors:** Tom Weaver, Claude
**Focus Areas:** Autonomous Organisation, The Full Loop
**Depends on:** Persistent Identity (Phase 1 has no other dependencies — see Section 8)
**Informed by:**
- OpenClaw HEARTBEAT.md research (`docs/research/2026-02-19-openclaw-openclaw.md`)
- Triggers & Events V2.2 (`docs/plans/archived/2026-02-22-triggers-and-events-design.md`)
- Triggers & Events reconciliation (`docs/plans/active/2026-03-08-triggers-and-events-reconciliation.md`)
- Getting a Grip proposal (`docs/plans/archived/2026-03-01-getting-a-grip-proposal.md`) — Phase 5: Exec Autonomy
- Chainmaker `new-exec` skill (`.claude/skills/new-exec/SKILL.md`) — HEARTBEAT.md + AGENT.md + operating manual pattern
- Dynamic roadmap design (`docs/plans/active/2026-03-07-dynamic-roadmap-design.md`)

---

## Problem

Persistent execs (CPO, CTO) only act when a human starts a conversation. Between conversations, nothing happens. Ideas accumulate, features fail, documents go stale, the pipeline sits idle. The Getting a Grip proposal called this out as P0: "without this, agents only work when prompted."

Three interrelated gaps:

1. **No recurring tasks.** CPO should triage the inbox every morning, check pipeline health hourly, and review the roadmap weekly. Today these require Tom to open a terminal and type.

2. **Session degradation.** Persistent execs accumulate context until Claude Code auto-compacts, losing nuance and instruction fidelity. Long-running sessions become progressively less capable — the opposite of what you want from a persistent agent.

3. **No context bridge.** When a fresh session starts (after crash, restart, or deliberate reset), there's no mechanism to restore the exec's working knowledge beyond what's in their CLAUDE.md. And there's no way to inject exec context into a *different* session (e.g., an expert session that needs CPO-level awareness).

OpenClaw solved (1) with HEARTBEAT.md — a file of recurring tasks the agent reads on each wake. Chainmaker V1 adapted this with per-exec HEARTBEAT.md + AGENT.md + operating manuals. But neither solved (2) or (3). This design addresses all three.

---

## Architecture: Three Heartbeat Modes

Different agent lifecycles need different heartbeat mechanisms. One size doesn't fit.

```
┌─────────────────────────────────────────────────────────────┐
│                    HEARTBEAT MODES                           │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────┐ │
│  │ Mode 1           │  │ Mode 2           │  │ Mode 3    │ │
│  │ PERSISTENT       │  │ SCHEDULED        │  │ EVENT     │ │
│  │ + CACHE-TTL      │  │ DISPATCH         │  │ TRIGGERED │ │
│  │                  │  │                  │  │           │ │
│  │ Runs continuously│  │ Dormant. Woken   │  │ Dormant.  │ │
│  │ Resets on idle   │  │ by scheduler     │  │ Woken by  │ │
│  │ Picks up         │  │ Fresh session    │  │ events    │ │
│  │ HEARTBEAT.md     │  │ each time        │  │           │ │
│  │ on restart       │  │                  │  │           │ │
│  │                  │  │                  │  │           │ │
│  │ CPO, CTO         │  │ Monitoring Agent │  │ Notifier  │ │
│  │ Future: CFO, CMO │  │ Nightly Archiver │  │ Reviewer  │ │
│  │                  │  │ Health Checker   │  │ On-call   │ │
│  └──────────────────┘  └──────────────────┘  └───────────┘ │
│                                                              │
│  All three modes use the same HEARTBEAT.md file format.      │
│  All three modes feed through the same workspace assembly.   │
└─────────────────────────────────────────────────────────────┘
```

### Mode 1: Persistent + Cache-TTL

For execs that need continuity of conversation (CPO maintaining strategic context, CTO tracking architecture decisions) but also need to stay fresh.

**Lifecycle:**
1. Exec starts → loads CLAUDE.md + HEARTBEAT.md → runs
2. Exec receives work (human messages, wake events) → processes normally
3. Exec goes idle (no input for `cache_ttl` period, default 30 min)
4. **Session reset**: daemon kills tmux session, immediately restarts
5. Fresh session loads CLAUDE.md + HEARTBEAT.md → executes heartbeat tasks
6. After heartbeat tasks complete → returns to idle, waiting for input

**The key insight**: Clean slate, full memory, every time. The HEARTBEAT.md is the exec's pickup loop — what to check, what to report, what to proactively do. The CLAUDE.md (assembled from DB role prompt + skills + memory) provides the full context. Together they give you a fresh, capable agent that picks up where it left off without context degradation.

**What "full memory" means**: The exec's persistent knowledge lives in:
- `roles.prompt` in the DB (role definition, constraints, style)
- Skills (loaded from `.claude/skills/` into CLAUDE.md at assembly time)
- Memory files (`.claude/memory/` in the persistent workspace — survives resets)
- Repo symlinks (`repos/` directory pointing to project worktrees)
- State files (`.claude/workspace-config.json`, `.role`, `.prompt-hash`)

None of these are in the Claude context window. They're on disk. A session reset loses the *conversation* but preserves all *knowledge*.

### Mode 2: Scheduled Dispatch

For agents that don't need continuity — they run a task and exit. Already designed in the Triggers & Events Scheduler (Section 2, "isolated" mode). The HEARTBEAT.md becomes the job spec.

**Lifecycle:**
1. pg_cron fires at scheduled time
2. Scheduler creates a job with HEARTBEAT.md content as the spec
3. Orchestrator dispatches to available machine
4. Agent runs in fresh session, executes heartbeat tasks, writes report
5. Job completes, agent exits

### Mode 3: Event-Triggered

For agents that wake on specific events (job completion, feature failure, webhook). Already designed in the Wake Service (Section 3). The HEARTBEAT.md provides the "what to check" context, the event payload provides the "why you woke up."

**Lifecycle:**
1. Event occurs (job completes, feature fails, webhook fires)
2. Wake Service creates event targeting the right agent
3. Agent wakes (new session or injection into existing)
4. Agent processes event with HEARTBEAT.md context
5. Agent returns to dormant/idle

---

## Cache-TTL Mechanism

The critical new infrastructure. Runs in the local daemon.

### Idle Detection

The daemon already tracks persistent agents in `this.persistentAgents` map. For each persistent agent, track:

```typescript
interface PersistentAgentState {
  role: string;
  jobId: string;
  tmuxSession: string;
  startedAt: Date;
  lastActivityAt: Date;       // NEW: last tmux output change
  cacheTtlMinutes: number;    // NEW: from roles table, default 30
  hardTtlMinutes: number;     // NEW: max session age before forced reset (default 240)
  heartbeatTasksRun: boolean; // NEW: have we run heartbeat tasks this cycle?
  consecutiveResetFailures: number; // NEW: circuit breaker counter
  lastResetAt: Date | null;   // NEW: for backoff calculation
}
```

**Activity detection** (runs on each machine heartbeat, every 30s):
1. `tmux capture-pane -t {session} -p` — capture current output
2. Compare SHA256 hash with previous capture
3. If different → update `lastActivityAt`
4. If identical AND `now() - lastActivityAt > cacheTtlMinutes` → trigger reset
5. **Hard-TTL safety net**: If `now() - startedAt > hardTtlMinutes` → trigger reset regardless of activity. This catches "noisy-stuck" agents (infinite loops producing output) that would never trigger idle detection. Default: 240 minutes (4 hours).

**Important**: Do NOT reset while the agent is actively executing. Only reset when the agent is truly idle (REPL prompt visible, no tool calls running). The activity detection catches this naturally — if output is changing, the agent is working. The hard-TTL is the exception — it overrides idle detection as a safety net against context bloat and stuck agents.

### Reset Sequence

When cache-TTL expires:

```
1. Graceful exit: send "exit" to tmux → wait 5s for clean shutdown
   (agent may be mid-write to memory files — give it time to finish)
2. If still alive after 5s → SIGTERM → wait 3s → SIGKILL
3. Preserve workspace (don't delete — memory/ and repos/ must survive)
4. Refresh CLAUDE.md (re-assemble from DB — picks up any role prompt changes)
5. Refresh HEARTBEAT.md (re-read from DB or exec config)
6. Refresh skills (re-copy from repo — picks up any skill updates)
7. Start new tmux session with fresh claude process
8. Inject HEARTBEAT.md tasks as first prompt (via SessionStart hook)
9. Mark heartbeatTasksRun = true
10. Agent processes heartbeat → returns to idle → cycle repeats
```

Steps 3-6 mean the agent gets a **fresh context window** with **up-to-date instructions** while keeping its **persistent disk state**. This is the anti-degradation mechanism.

### Reset Circuit Breaker

If the reset sequence itself fails (tmux won't start, workspace assembly errors, agent crashes immediately on startup), the daemon must not enter a tight reset loop.

**Backoff policy:**
- Track `consecutiveResetFailures` per persistent agent
- After each failed reset, increment counter
- If counter reaches 3 within 10 minutes → **pause resets** and alert human via `send_message`: "CPO reset loop detected — 3 consecutive failures. Pausing auto-reset. Manual intervention needed."
- Counter resets to 0 when a session successfully runs for >5 minutes
- Human can manually restart via daemon command or by fixing the underlying issue

### Database Support

```sql
ALTER TABLE roles ADD COLUMN cache_ttl_minutes INTEGER DEFAULT 30;
ALTER TABLE roles ADD COLUMN hard_ttl_minutes INTEGER DEFAULT 240;
-- cache_ttl: 30 min for CPO (active role, frequent resets keep context fresh)
--            60 min for CTO (deeper technical sessions, less frequent reset)
--            NULL for ephemeral roles (no cache-TTL, job lifecycle handles it)
-- hard_ttl:  240 min (4 hours) default — max session age regardless of activity
--            Safety net against noisy-stuck agents and context bloat
```

### Configuration Override

Per-machine override in `machine.yaml`:

```yaml
cache_ttl:
  enabled: true           # master switch (default: true for persistent agents)
  min_session_age: 300    # don't reset sessions younger than 5 minutes
  grace_period: 60        # wait 60s after idle detection before resetting
                          # (prevents reset if human is just thinking)
  suspend_when_attached: true  # suppress cache-TTL while a human has the tmux
                               # session attached (tmux list-clients -t {session})
```

### Human Attachment Detection

**Problem:** If Tom has the CPO terminal open and is reading output or thinking, the session appears "idle" (no output change) but a reset would kill an active human-agent interaction.

**Solution:** Before triggering a cache-TTL reset, check `tmux list-clients -t {session}`. If any client is attached, **suppress the reset entirely** until the human detaches. The `suspend_when_attached` config defaults to `true`.

When the human detaches, the idle timer restarts from that moment — not from the last output change. This prevents a reset firing the instant the human leaves.

Hard-TTL still applies even when attached (safety net for runaway sessions), but fires with a notification: "Session approaching hard-TTL limit. Consider `/compact` or detach to allow reset."

---

## HEARTBEAT.md: Per-Exec Recurring Tasks

Each exec gets a HEARTBEAT.md that defines what they do on wake. Stored in the DB (new column on `roles` or `persistent_agents` table) and written to disk during workspace assembly.

### Format

```markdown
# {Role Name} — Heartbeat Tasks

## On Every Wake

These tasks run every time your session resets. Complete all of them.

1. **Pipeline Health Check**
   - Query active features: how many building, how many stuck >1hr, how many failed in last 24hr
   - If stuck or failure count is concerning, report to human via send_message

2. **Inbox Triage**
   - Query ideas with status 'new': any new items since last check?
   - For each new idea: assess priority (P0-P3) and tag accordingly
   - If P0 idea found, alert human immediately

3. **Stale Feature Scan**
   - Query features in non-terminal states older than 48 hours
   - If found, investigate: is the feature stuck? Did a job fail? Is a machine offline?

## Daily (9am local)

These tasks run once per day, on the first wake after 9am.

4. **Morning Standup**
   - Summarize: what shipped yesterday, what's building now, what's blocked
   - Post standup to human via send_message

5. **Roadmap Review**
   - Check capability progress against this week's goals
   - Flag any capability that's fallen behind schedule

## Weekly (Monday morning)

6. **Architecture Review**
   - Review any design docs modified this week
   - Flag inconsistencies or decisions that need human input
```

### How "Daily" and "Weekly" Work Without a Scheduler

The HEARTBEAT.md uses time-based markers, but the *agent itself* checks the clock — no external scheduler needed for Mode 1. The agent reads HEARTBEAT.md on each wake, checks current time against task schedules, and skips tasks that aren't due.

This is deliberate: it keeps Mode 1 self-contained. The daemon only needs to handle idle detection and session reset. The agent handles its own task scheduling.

For Mode 2 (scheduled dispatch), the scheduler handles timing — HEARTBEAT.md is just the task spec.

### Heartbeat State: Preventing Task Groundhog Day

**Problem (flagged by both Gemini and Codex review):** If cache-TTL resets every 30 minutes, the agent wakes at 9:15am and runs the "Morning Standup" daily task. At 9:45am it resets again, wakes up, sees it's after 9am, and runs the standup *again*. Without durable state, every reset is Groundhog Day.

**Solution:** A `heartbeat-state.json` file in the memory directory, persisted across resets:

```json
// {workspace}/.claude/memory/heartbeat-state.json
{
  "lastWakeAt": "2026-03-09T09:15:00Z",
  "taskCompletions": {
    "morning-standup": "2026-03-09T09:16:32Z",
    "inbox-triage": "2026-03-09T09:17:45Z",
    "roadmap-review": "2026-03-03T09:22:00Z",
    "stale-feature-scan": "2026-03-03T09:25:00Z"
  }
}
```

The SessionStart hook injects this state alongside the HEARTBEAT.md:

```
Read .claude/HEARTBEAT.md for your recurring tasks.
Read .claude/memory/heartbeat-state.json for what you've already completed.
Skip any Daily task completed today. Skip any Weekly task completed this week.
After completing tasks, update heartbeat-state.json with new timestamps.
```

The agent sees "morning-standup last ran today at 09:16" and skips it. Simple, durable, no external infrastructure.

### Storage

```sql
ALTER TABLE roles ADD COLUMN heartbeat_md TEXT;
-- Stored in DB, written to disk during workspace assembly
-- NULL for roles that don't have heartbeat tasks
```

Written to `{workspace}/.claude/HEARTBEAT.md` during `setupJobWorkspace()`. The SessionStart hook reads it on fresh session start.

### Updating HEARTBEAT.md

CPO (or human) can update any exec's HEARTBEAT.md via MCP:

```typescript
// New MCP tool
update_heartbeat({
  role: "cpo",
  heartbeat_md: "# CPO Heartbeat Tasks\n\n## On Every Wake\n..."
})
```

Changes take effect on next session reset (cache-TTL expiry). No restart needed.

---

## Per-Exec Skill: Context Side-Loading

> **Tom's side question:** "Would a new skill per exec enable side-loading their CLAUDE.md into a subsequent non-persistent session that maybe links to their persistent workspace?"

**Yes.** This is the bridge between persistent and ephemeral.

### The Pattern

Each exec gets an auto-generated skill at `.claude/skills/{role-id}/SKILL.md` that contains:

```markdown
---
name: as-{role-id}
description: |
  Load {Role Name}'s context, knowledge, and workspace links into this session.
  Use when you need {role-id}-level awareness in a non-persistent context.
---

# Operating as {Role Name}

## Role Context
{Pulled from roles.prompt — the exec's full role definition}

## Active Knowledge
{Links to the exec's persistent workspace}
- Memory: ~/.zazigv2/{company_id}-{role}-workspace/.claude/memory/
- Repos: ~/.zazigv2/{company_id}-{role}-workspace/repos/
- State: ~/.zazigv2/{company_id}-{role}-workspace/.claude/workspace-config.json

## Current HEARTBEAT.md
{Embedded or linked — what this exec's recurring tasks are}

## Doctrines
{Role-specific beliefs and constraints}

## How to Use This Skill
You are not the {role-id}. You are a session that has been given {role-id}'s
context and workspace access. Use this to:
- Make decisions consistent with {role-id}'s perspective
- Access {role-id}'s memory and state files
- Continue work that {role-id} started
- Provide {role-id}-level analysis without needing the persistent session
```

### Use Cases

1. **Expert session needs CPO context**: Human commissions a Supabase Expert but needs it to understand CPO's current priorities → expert session loads `/as-cpo` skill
2. **Fresh session after crash**: CPO's persistent session died unexpectedly. Before a new persistent session starts, a contractor can `/as-cpo` to handle urgent inbox items
3. **Inter-exec consultation**: CTO needs to understand CPO's current focus areas before making an architecture decision → CTO session loads `/as-cpo` as reference
4. **Handoff between sessions**: A non-persistent diagnostic session discovers something CPO needs to know. It reads the CPO's memory files via the skill to understand context before writing a report

### Generation

These skills are auto-generated during workspace assembly (`setupJobWorkspace`) and refreshed on each cache-TTL reset. They're derived from the DB — not hand-maintained.

```typescript
// In workspace.ts, during persistent agent setup
async function generateExecSkill(role: Role, workspacePath: string): Promise<void> {
  const skillDir = path.join(workspacePath, '.claude', 'skills', `as-${role.name}`);
  await fs.mkdir(skillDir, { recursive: true });

  const skillContent = `---
name: as-${role.name}
description: Load ${role.display_name}'s context into this session
---

# Operating as ${role.display_name}

## Role Context
${role.prompt}

## Workspace
- Memory: ${workspacePath}/.claude/memory/
- Repos: ${workspacePath}/repos/

${role.heartbeat_md ? `## Current Heartbeat Tasks\n${role.heartbeat_md}` : ''}
`;

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillContent);
}
```

### Where Skills Live

**Phase 1: Exec workspace only** (flagged by both reviewers — shared publication risks context leakage)
1. **In the exec's own workspace**: `.claude/skills/as-{role}/SKILL.md` — for self-reference and same-machine access

**Phase 2: Shared repo directory** (with allowlist gating)
2. **In the repo's shared skills directory**: `.claude/skills/as-{role}/SKILL.md` — accessible to any session that includes repo skills (expert sessions, other execs)
3. Gated by an allowlist: only roles explicitly marked `shared_skill: true` in the DB get published to shared skills
4. Skill content is sanitized: workspace links use relative paths, role prompt is summarised (not dumped verbatim), memory file paths are included but marked read-only

The second location is what enables cross-machine side-loading. Any session assembled with `repoInteractiveSkillsDir` pointing to the repo's `.claude/skills/` gets access to all published exec context skills. But Phase 1 keeps it local to avoid accidental privilege/context leakage.

---

## Capability Placement

### Where This Fits on the Roadmap

This is NOT part of Deep Heartbeat. Deep Heartbeat is about **health monitoring** — per-job stuck detection, permission blocking, output stall, context health reporting. It's infrastructure observability.

This is about **exec autonomy** — giving agents the ability to work between human conversations. Different concern, different capability.

**Proposed: New capability node in the "Agent Brain" lane:**

| Capability | Lane | Status | Progress | Depends On | Description |
|-----------|------|--------|----------|------------|-------------|
| **Exec Autonomy** | Agent Brain | draft | 5% | Persistent Identity | Cache-TTL session reset, HEARTBEAT.md recurring tasks, per-exec context skills |

**Why it depends on Persistent Identity:** The per-exec skill pattern (context side-loading) requires persistent identity to be stable — workspace paths, memory files, role prompts all need to be reliably maintained.

**Why it does NOT depend on Deep Heartbeat:** Phase 1 idle detection is a simple tmux output hash comparison — doesn't need Deep Heartbeat's full `JobHealth` infrastructure. Phase 2 can optionally reuse Deep Heartbeat's tmux capture infra for smarter reset triggers (reset on compaction, context health), but that's an enhancement, not a prerequisite.

**Why it does NOT depend on Triggers & Events:** Phase 1 (Persistent + Cache-TTL) runs entirely in the local daemon. Phases 3-4 (Scheduled Dispatch, Event-Triggered) need T&E's Scheduler and Wake Service respectively, but those are later phases that add sophistication — not prerequisites for core autonomy.

### Relationship to Triggers & Events

The three modes map cleanly onto Triggers & Events subsystems:

| Mode | T&E Subsystem | Dependency |
|------|---------------|------------|
| Mode 1: Persistent + Cache-TTL | **None** — daemon-local | Can build independently |
| Mode 2: Scheduled Dispatch | Scheduler (Section 2) | Needs scheduler |
| Mode 3: Event-Triggered | Wake Service (Section 3) | Needs wake service |

---

## Do We Need to Build Triggers & Events First?

**No — but with a nuance.**

### What We Can Build Without T&E

**Mode 1 (Persistent + Cache-TTL) is fully self-contained.** It runs entirely in the local daemon:
- Idle detection → daemon heartbeat loop (already exists)
- Session reset → daemon process management (already exists)
- HEARTBEAT.md loading → workspace assembly (already exists)
- Per-exec skills → workspace assembly (already exists)

No cloud infrastructure dependencies. No new Edge Functions. No new DB tables beyond three columns (`cache_ttl_minutes`, `hard_ttl_minutes`, and `heartbeat_md` on `roles`). Phase 1 depends on local runtime assumptions (SessionStart hooks, tmux process management, filesystem state conventions) that are already proven in the existing persistent agent implementation.

This is the highest-value piece: CPO and CTO become autonomous between conversations.

### What Needs T&E

**Mode 2 (Scheduled Dispatch)** needs the Scheduler subsystem — `scheduled_jobs` table, `pg_cron`, `run_scheduler()` function. This is T&E Section 2.

**Mode 3 (Event-Triggered)** needs the Wake Service — `wake-agent` Edge Function, coalesced wake handler, cheap-check escalation. This is T&E Section 3.

### Recommended Sequence

```
Phase 1 (NOW — no cloud dependencies)
├── Cache-TTL idle detection in daemon (tmux hash + hard-TTL safety net)
├── Session reset sequence (graceful exit + circuit breaker backoff)
├── heartbeat-state.json for task dedup (prevents Groundhog Day)
├── HEARTBEAT.md + hard_ttl_minutes columns on roles table
├── HEARTBEAT.md loading in workspace assembly
├── Per-exec skill generation (exec workspace only — no shared publish)
└── CPO + CTO heartbeat tasks authored

Phase 2 (needs Deep Heartbeat)
├── Activity detection via tmux capture (reuse DH infrastructure)
├── Context health monitoring (know WHEN to reset, not just on idle)
└── Smart reset triggers (reset on compaction, not just idle)

Phase 3 (needs T&E Scheduler)
├── Scheduled dispatch for non-persistent agents
├── Nightly archiver, health checker as scheduled heartbeat jobs
└── Daily/weekly tasks move from agent self-scheduling to real cron

Phase 4 (needs T&E Wake Service)
├── Event-triggered wakes for persistent agents
├── Job completion → CPO notification
├── Feature failure → CPO triage
└── Webhook → agent wake
```

Phase 1 is the 80/20. It gives you autonomous execs with zero infrastructure dependencies. Phases 2-4 add sophistication but are incremental improvements, not prerequisites.

---

## Implementation Plan (Phase 1 Only)

### Migration

```sql
-- xxx_exec_heartbeat.sql
ALTER TABLE roles ADD COLUMN cache_ttl_minutes INTEGER;
ALTER TABLE roles ADD COLUMN hard_ttl_minutes INTEGER DEFAULT 240;
ALTER TABLE roles ADD COLUMN heartbeat_md TEXT;

-- Set defaults for existing persistent roles
UPDATE roles SET cache_ttl_minutes = 30, heartbeat_md = '' WHERE name = 'cpo';
UPDATE roles SET cache_ttl_minutes = 60, heartbeat_md = '' WHERE name = 'cto';
-- Ephemeral roles get NULL (no cache-TTL)
```

### Daemon Changes

**File:** `packages/local-agent/src/executor.ts`

1. **Track activity** in `handlePersistentJob`:
   - Add `lastActivityAt` and `lastOutputHash` to `PersistentAgentState`
   - On each machine heartbeat tick, capture tmux output and compare hash
   - If hash changed → update `lastActivityAt`

2. **Check cache-TTL** in heartbeat loop:
   - If `now() - lastActivityAt > cacheTtlMinutes * 60_000` → trigger reset
   - If `now() - startedAt > hardTtlMinutes * 60_000` → trigger reset (hard-TTL safety net)
   - Guard: don't reset if session is younger than 5 minutes
   - Guard: don't reset if agent is mid-tool-call (output changing) — unless hard-TTL triggered

3. **Reset sequence** (new method `resetPersistentSession`):
   - Graceful exit: send "exit" to tmux, wait 5s, then SIGTERM/SIGKILL if needed
   - Re-fetch role from DB (picks up prompt/heartbeat changes)
   - Re-run `handlePersistentJob` with fresh workspace assembly
   - Inject HEARTBEAT.md tasks + heartbeat-state.json context via SessionStart hook
   - If reset fails: increment `consecutiveResetFailures`, apply backoff (3 failures in 10 min → pause + alert)

### Workspace Changes

**File:** `packages/local-agent/src/workspace.ts`

1. **Write HEARTBEAT.md** during `setupJobWorkspace`:
   - If role has `heartbeat_md`, write to `{workspace}/.claude/HEARTBEAT.md`
   - Seed `heartbeat-state.json` in `{workspace}/.claude/memory/` if it doesn't exist
   - Add to SessionStart hook: "Read .claude/HEARTBEAT.md and .claude/memory/heartbeat-state.json. Execute due tasks. Update heartbeat-state.json after completion."

2. **Generate exec skill** during persistent agent setup:
   - Create `.claude/skills/as-{role}/SKILL.md` in exec workspace only (Phase 1)
   - Phase 2: optionally publish to repo's `.claude/skills/` with allowlist gating

### HEARTBEAT.md Authoring

Initial heartbeat tasks for CPO and CTO — authored by hand (Tom), not auto-generated:

**CPO HEARTBEAT.md** (first draft):
```markdown
# CPO — Heartbeat Tasks

## On Every Wake
1. Read your memory files at .claude/memory/ — restore context from last session
2. Query pipeline health: active features, stuck jobs, failed features in last 24h
3. Query ideas inbox: any new items since your last wake?
4. If anything is concerning, send_message to Tom with a brief summary
5. Update .claude/memory/ with current state

## Daily (first wake after 9am)
6. Morning standup: what shipped, what's building, what's blocked
7. Inbox triage: prioritise any new ideas

## Weekly (first wake on Monday)
8. Roadmap review: capability progress vs goals
9. Stale feature scan: anything stuck >48 hours?
```

**CTO HEARTBEAT.md** (first draft):
```markdown
# CTO — Heartbeat Tasks

## On Every Wake
1. Read your memory files at .claude/memory/ — restore context from last session
2. Check for any design docs modified since last wake
3. Review any open architecture decisions needing input
4. Update .claude/memory/ with current state

## Daily (first wake after 9am)
5. Technical debt scan: any patterns emerging from recent job failures?
6. Check model usage: are roles using appropriate models?

## Weekly (first wake on Monday)
7. Architecture review: any design docs that need reconciliation?
8. Infrastructure health: migration state, edge function deployments
```

---

## Open Questions

1. **Should HEARTBEAT.md be in the DB or filesystem?** Current design says DB (`roles.heartbeat_md`) written to disk during assembly. Alternative: keep in repo as a file (like the `new-exec` skill does for Chainmaker). DB is better for CPO-editability via MCP. Filesystem is better for version control.

2. **Reset notification.** Should the human be notified when a cache-TTL reset happens? Probably not for every reset (noise), but maybe on first reset of the day or if the heartbeat finds something concerning.

3. **Memory persistence format.** The design says "memory files in `.claude/memory/`" but doesn't specify the format. Should this be structured (JSON) or freeform (markdown)? Freeform is more natural for the agent to read/write. Structured is better for tooling.

4. **Inter-exec heartbeat coordination.** If CPO and CTO both reset within seconds of each other, they might both query the same pipeline data and send duplicate reports. Should resets be staggered? Or should the daemon coordinate?

5. **Heartbeat cost model.** At 30-min cache-TTL, CPO resets ~48 times/day. Each cycle costs ~7K tokens (input + output). Rough estimate: **$5-12/day for CPO, $3-6/day for CTO** at Opus pricing. Acceptable for now, but "On Every Wake" tasks should be triaged for necessity — "query pipeline health" every 30 minutes may be overkill. Consider separating "every wake" from "every other wake" if costs are concerning.

6. **CTO MCP tool access.** CTO HEARTBEAT.md tasks need `query_jobs`/`query_features` MCP tools. Verify CTO's `mcp_tools` array in the DB includes these before authoring heartbeat tasks that depend on them.

---

## Relationship to Existing Docs

| Document | Relationship |
|----------|-------------|
| Memory System Design (v5.1) | `.claude/memory/` files are **Phase 1 bridging** — simple pragmatic mechanism until formal memory ships. When Memory P1 ships, `heartbeat-state.json` and `handoff.md` migrate to `memory_chunks` table. Memory files become a cache/convenience layer, not source of truth. Note: the formal memory system principle P2 says "orchestrator-assembled, not agent-self-managed" — Phase 1 deliberately breaks this for pragmatism. |
| Ideas Inbox & Auto-Scheduling | This design implements the "CPO heartbeat picks up triaged ideas" autonomous behavior described in the auto-scheduling design. HEARTBEAT.md task #3 IS the auto-spec trigger. |
| Persistent Identity Reconciliation | Cache-TTL resets resolve the "prompt freshness" gap (item #2 in reconciliation). Re-fetching role prompt from DB on every reset makes `check-prompt-freshness.sh` unnecessary when cache-TTL is active. |
| Triggers & Events V2.2 | This design's Phases 2-4 implement Sections 1-3. Phase 1 is independent. |
| T&E Reconciliation | Priority stack unchanged. This design sits alongside items 3-4 (wake service, extended heartbeat). |
| Getting a Grip (Phase 5) | This IS Phase 5. Cache-TTL + multi-heartbeat, as specified. |
| Auto-Scheduling Design | Auto-greenlight and auto-spec become HEARTBEAT.md tasks for CPO, not separate infrastructure. |
| Persistent Agent Identity | Exec skills (context side-loading) extend the persistent identity model. |
| `new-exec` skill (Chainmaker V1) | Direct spiritual ancestor. HEARTBEAT.md + AGENT.md + operating manual pattern adapted for zazigv2. |
| Dynamic Roadmap | New "Exec Autonomy" capability node proposed. |
| ORG MODEL | Expert Sessions section covers interactive pair-programming. This design covers autonomous recurring work — complementary, not overlapping. |

---

## Review History

### V1 Review — 2026-03-09

**Reviewed by:** Gemini (gemini-cli), Codex (gpt-5.3-codex, medium reasoning)

Both reviewers approved the design for implementation with hardening fixes. All critical/high findings have been incorporated into this version.

| # | Severity | Finding | Source | Resolution |
|---|----------|---------|--------|------------|
| 1 | Critical | Daily/weekly tasks repeat on every cache-TTL reset (Groundhog Day) | Both | Added `heartbeat-state.json` with per-task completion timestamps. SessionStart hook injects state so agent knows what's already run. |
| 2 | Critical | Idle detection misses noisy-stuck agents (infinite loops producing output) | Both | Added hard-TTL (max session age, default 4 hours) that triggers reset regardless of activity. |
| 3 | High | Reset loop risk — no circuit breaker if restart keeps failing | Both | Added `consecutiveResetFailures` counter with backoff: 3 failures in 10 min → pause + alert human. |
| 4 | High | Per-exec skill shared publication risks context/privilege leakage | Both | Phase 1 restricted to exec workspace only. Shared repo publication deferred to Phase 2 with allowlist gating. |
| 5 | High | Memory file race condition — ephemeral session writes while exec is writing | Gemini | Skills instruct consumers: "Don't modify memory — write to your own report." Phase 2 adds filesystem permissions. |
| 6 | High | Skills use absolute paths that break on multi-machine dispatch | Gemini | Phase 1 skills are exec-workspace-local (same machine). Phase 2 addresses cross-machine with relative paths. |
| 7 | High | "Zero dependencies" overstated — Phase 1 depends on SessionStart hooks, local state conventions | Codex | Reworded to "no cloud infrastructure dependencies" — acknowledges local runtime assumptions. |
| 8 | Medium | Graceful exit needed — hard-kill risks memory file corruption mid-write | Gemini | Reset sequence now: send "exit" → wait 5s → SIGTERM → wait 3s → SIGKILL. |
| 9 | Medium | `heartbeat_md` in DB needs versioning/audit for rollback | Codex | Noted as Open Question #5. Defer to Phase 2 — current scale doesn't justify audit infra. |
| 10 | Medium | Testing/observability under-specified | Codex | Acknowledged. Metrics (reset count, heartbeat duration, skip count) to be defined during implementation. |
