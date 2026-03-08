# Triggers & Events — Design Reconciliation

**Date:** 2026-03-08
**Original design:** `docs/plans/active/2026-02-22-triggers-and-events-design.md` (V2.2)
**Original review:** `docs/plans/archived/2026-02-22-triggers-and-events-design-review.md`
**Status:** Reconciliation against current codebase (March 2026)

---

## Summary

The original design specified 12 subsystems across heartbeats, scheduling,
wake services, event queues, lifecycle hooks, concurrency lanes, webhooks,
emergency stop, budget tracking, daemon recovery, and active hours.

**1 partially shipped. 11 not built.**

The codebase has evolved significantly since Feb 22. The orchestrator,
daemon, persistent agents, workspaces, and pipeline are all live and
working — but without most of the infrastructure this design specified.
The system runs on a simpler model: poll DB, dispatch jobs, wait for
completion. No proactive waking, no event queue, no policy enforcement.

---

## Subsystem Status

### 1. Heartbeat — PARTIALLY SHIPPED (DIFFERENTLY)

**What exists:**
- Machine heartbeat every 30s via DB write to `machines.last_heartbeat`
- Machine status (online/offline), slot availability, agent version tracked
- Slot reconciliation (`reconcileSlots()`) runs every 60s

**What's missing from the design:**
- Per-job health reporting (stuck detection, permission blocking, output stall)
- Context health for persistent agents (compaction triggers, token estimation)
- HTTP POST to dedicated heartbeat Edge Function (currently direct DB write)
- `stuck_count`, `last_stuck_at`, `dispatch_attempt_id` columns on jobs
- `stuck_threshold` on roles table

**Assessment:** Current heartbeat is sufficient for machine liveness but blind
to individual job health. The zombie job fixes (created_at timeout, terminal
feature guards) partially compensate, but stuck agent detection is still a gap.

**Recommendation:** Extend heartbeat payload to include per-job status. This is
the highest-value increment — enables stuck detection without building the
full events queue.

---

### 2. Scheduler / Cron — NOT BUILT

**Original design:** `scheduled_jobs` table, `run_scheduler()` Postgres
function called by pg_cron, `compute_next_run()`, consecutive error backoff,
two execution modes (isolated/relay).

**What exists instead:** Nothing. Scheduled work doesn't exist. CPO heartbeat
was proposed (auto-triage idea in inbox) but not implemented.

**Assessment:** Still needed. Key use cases:
- Nightly archiver (move old completed/failed features)
- Pipeline health check (detect stuck features, zombie jobs)
- Standup reminder (wake CPO at session start)
- Roadmap review (periodic capability health assessment)

**Recommendation:** This is now a capability on the dynamic roadmap. Original
design is still sound — pg_cron + scheduled_jobs table is the right approach.
Re-spec as a standalone feature when ready to build.

---

### 3. Wake Service — NOT BUILT

**Original design:** `wake-agent` Edge Function with priority routing,
1500ms coalescing window, cheap-check escalation (deterministic pre-screening
before injecting into agent context), prompt overflow strategy.

**What exists instead:** Nothing. Persistent agents (CPO, CTO) run in tmux
but can only be interacted with via `send_message` MCP tool or human terminal
attachment. No proactive waking.

**Assessment:** This is the critical enabler for autonomous CPO. Without wake,
CPO can't respond to completions, failures, scheduled events, or webhooks
without human intervention.

**Recommendation:** High priority. But the design assumed an events queue
feeding the wake service. Consider a simpler v1: orchestrator broadcasts
key events (job complete, feature failed) via Realtime, daemon injects
into persistent agent's tmux session. Skip the full events queue for now.

---

### 4. Events Queue — NOT BUILT

**Original design:** `agent_events` table with claim/ack semantics,
`FOR UPDATE SKIP LOCKED`, trust classification (internal/authenticated/external),
dedup, dead-letter queue.

**What exists instead:** Jobs table serves as the only work queue. No general
event queue for notifications, webhooks, or cross-agent communication.

**Assessment:** The full claim/ack queue is overengineered for current scale
(2 machines, <10 concurrent agents). The core need is: things happen in the
system → the right agent gets told about it.

**Recommendation:** Defer the full queue. Implement a lightweight
`agent_notifications` table (target_role, event_type, payload, delivered_at)
that the wake service reads. Upgrade to claim/ack when scale demands it.

---

### 5. Lifecycle Hooks — NOT BUILT

**Original design:** Phase 1 hardcoded hooks (`budget-gate`, `active-hours-gate`,
`slot-validator`, `trust-gate`, `wake-cpo-on-complete`, `slack-notify-stuck`,
etc.), Phase 2 DB-configurable.

**What exists instead:** The orchestrator has some inline checks (zombie timeout,
terminal feature guards) but no hook abstraction.

**Assessment:** The hook pattern is good but premature. Current inline checks
work. The most valuable hooks are:
- `wake-cpo-on-complete` — enables autonomous CPO loop
- `budget-gate` — safety net for runaway agents
- `slack-notify-stuck` — operational alerting

**Recommendation:** Don't build the hook framework. Instead, add the 2-3
highest-value behaviors inline in the orchestrator. Extract to hooks when
we have 10+ and the pattern is proven.

---

### 6. Concurrency Lanes — NOT BUILT

**Original design:** `jobs.lane` column (main/background), priority-based
dispatch within main lane, background gets 1 slot max, backpressure limits.

**What exists instead:** All jobs compete equally for slots. No lane
isolation. The `capability_lanes` table exists but is a product roadmap
feature (dashboard swim lanes), not orchestrator infrastructure.

**Assessment:** Lane isolation becomes important when background work
(automated scans, reviews, health checks) competes with user-initiated
feature work. Currently not a problem because scheduled work doesn't exist.

**Recommendation:** Defer until scheduler ships. When background jobs start
running, add lane column and dispatch priority. Simple: feature jobs >
standalone jobs > scheduled jobs.

---

### 7. External Webhooks — NOT BUILT

**Original design:** `webhooks` Edge Function, `webhook_sources` table with
HMAC secrets, `webhook_deliveries` for idempotency, trusted/untrusted
pipeline, payload sanitization, rate limiting.

**What exists instead:** Telegram bot writes directly to ideas inbox.
GitHub webhooks trigger CI/CD but don't feed into the agent system.

**Assessment:** Webhook ingestion is needed for:
- GitHub PR events → agent notifications
- CI/CD results → pipeline state updates
- Slack interactive components → approval flow

The Telegram bot pattern (direct DB write) works for simple intake.
Full webhook infrastructure is needed when we want bidirectional
integration with GitHub and CI.

**Recommendation:** Defer full webhook infra. For GitHub specifically,
the CI/CD autodeploy already handles the main flow. Slack approval
is broken for other reasons (status mismatch bug). Address those
bugs first before building general webhook infrastructure.

---

### 8. Emergency Stop (ESTOP) — NOT BUILT

**Original design:** `estop_active` flag on companies, monotonic epoch
counter, per-machine ACK protocol, Realtime broadcast, daemon handler
that kills all tmux sessions, auto-trigger from budget-gate.

**What exists instead:** Nothing. Kill switch is "manually kill daemon process"
or "update jobs to failed via SQL Editor."

**Assessment:** Still needed as a safety net. Current mitigations (zombie
timeout, slot reconciliation) handle common cases but there's no
"stop everything NOW" button.

**Recommendation:** Build a minimal estop: company flag + Edge Function
endpoint + daemon handler. Skip the epoch/ACK protocol — at 2 machines,
a simple flag check on heartbeat is sufficient. Add the Realtime broadcast
for instant response. This is a safety feature worth having before scale.

---

### 9. Budget Tracking — NOT BUILT

**Original design:** `daily_spend` table, `accumulate_daily_spend()` RPC,
per-model token rates, integration with budget-gate hook.

**What exists instead:** Nothing. No cost visibility.

**Assessment:** Needed for: (a) knowing what we spend, (b) preventing
runaway costs, (c) future multi-tenant billing. The model flexibility
design doc (inbox idea) also needs this.

**Recommendation:** Build `daily_spend` table + accumulator as a standalone
feature. It's simple (1 table, 1 function, report token counts from
job completion). Don't couple it to hooks — just start accumulating data.
Gate/alerting can come later.

---

### 10. Daemon Recovery — NOT BUILT

**Original design:** `active-jobs.json` manifest persisted to disk,
orphan session discovery on startup, recovery reconciliation, graceful
shutdown via SIGTERM handler.

**What exists instead:** Daemon restart kills all running agents. Slot
reconciliation picks up the mismatch within 60s. Orchestrator marks
unresponsive jobs as failed after timeout.

**Assessment:** Current approach works but wastes work. A feature 80%
through building gets killed and restarted from scratch on daemon restart.

**Recommendation:** Low priority. The "Graceful Daemon Shutdown" feature
(still in failed) covers this. Worth building when pipeline throughput
matters enough that wasted work is painful.

---

### 11. Active Hours — NOT BUILT

**Original design:** Hook-based gates on dispatch and wake, timezone-aware,
exemptions for urgent jobs.

**Assessment:** Not needed yet. Tom runs the pipeline manually and controls
when work happens. Becomes relevant with multi-tenant or when scheduled
jobs run autonomously.

**Recommendation:** Defer indefinitely.

---

## Priority Stack (What to Build Next)

Based on current pain points and the autonomous CPO goal:

1. **Budget tracking** — simple, standalone, needed for cost visibility.
   1 table + 1 function. Ship in a single feature.

2. **Minimal estop** — safety net. Company flag + Edge Function + daemon
   handler. No epoch/ACK complexity. Ship in a single feature.

3. **Wake service (v1)** — orchestrator broadcasts events via Realtime,
   daemon injects into persistent agent tmux. No events queue, no
   coalescing. Enables autonomous CPO loop.

4. **Extended heartbeat** — per-job health in heartbeat payload. Stuck
   detection in orchestrator. Builds on existing heartbeat.

5. **Lightweight notifications** — `agent_notifications` table replaces
   full events queue. Wake service reads from it.

6. **Scheduler** — pg_cron + scheduled_jobs. Enables nightly archiver,
   health checks, standup reminders.

Items 1-2 are safety features (build soon).
Items 3-5 are autonomy features (build when ready for autonomous CPO).
Item 6 is a scale feature (build when manual scheduling becomes painful).

---

## What to Do With the Original Design Doc

The V2.2 design is thorough and well-reviewed but written for a system
that didn't exist yet. Now that the orchestrator, daemon, and pipeline
are live, some assumptions have changed:

- **Events queue** is overengineered for current scale — simplify
- **Hooks framework** is premature — inline the valuable behaviors
- **Lanes** should wait for scheduler
- **Webhooks** should wait for real integration needs
- **Active hours** not needed yet

**Recommendation:** Move the original design to `docs/plans/archived/`.
This reconciliation doc becomes the active reference. Individual features
(budget, estop, wake, heartbeat) get their own specs when scheduled.

---

## Relation to Failed Feature

The `Triggers, Events & Wake Infrastructure` feature (f2806c36) failed
in the pipeline. It was too broad — 12 subsystems in one feature.
**Do not retry as a single feature.** Break into the individual items
listed in the priority stack above, each with its own spec and feature.
Mark the original feature as `complete` (superseded by this reconciliation).
