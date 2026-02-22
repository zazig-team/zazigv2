# Triggers and Events System Design

**Date:** 2026-02-22
**Status:** Draft (V2.2)
**Authors:** Tom Weaver, Claude
**Informed by:**
- OpenClaw gateway deep-dive (`docs/research/2026-02-19-openclaw-openclaw.md`)
- Gateway + trigger architecture research — Gemini (`docs/research/2026-02-22-agent-gateway-trigger-architecture-(gemini).md`)
- Gateway + trigger architecture research — OpenAI (`docs/research/2026-02-22-agent-gateway-trigger-architecture-(openai).md`)
**V1 reviewed by:** gpt-5.3-codex (xhigh reasoning), gemini-3.1-pro-preview
**V2 reviewed by:** gpt-5.3-codex (xhigh reasoning), gemini-3.1-pro-preview — 15 fixes incorporated as V2.1
**V2.1 reviewed by:** Claude (review-plan walkthrough), gpt-5.3-codex (second opinion on review) — 16 fixes incorporated as V2.2

---

## Problem

The orchestrator design (2026-02-18) and pipeline design (2026-02-20) define *what* the system does — dispatch jobs, move cards through states, verify and merge. But neither defines the *trigger and event infrastructure* that makes it responsive:

- Machine heartbeats exist (30s interval) but report only "alive or dead." Per-job health — stuck agents, idle sessions, permission prompts — is invisible to the orchestrator. (Gap analysis Flag 9)
- Scheduled work (nightly scans, done-archiver, market researcher) is mentioned but undesigned. (Gap analysis Flag 10, orchestrator open question #11)
- CPO has no way to wake up proactively. Standup reminders, pipeline health checks, and roadmap reviews all require a human to message first.
- When a job completes, CPO has no structured way to find out. Async results (cron scans, webhook callbacks) have no relay mechanism.
- No policy enforcement layer exists. Budget checks, safety gates, and slot validation happen implicitly in dispatch logic rather than as composable hooks.
- The slot system defines capacity but not queuing discipline. Different work types (scheduled vs human-dispatched vs proactive) can block each other.
- External events (GitHub PR merged, CI passed, webhook callbacks) have no path into the orchestrator.
- **(V2)** No distinction between trusted internal triggers and untrusted external triggers — a verified HMAC webhook and a scheduled cron event flow through the same path with the same permissions.
- **(V2)** No emergency stop mechanism — if agents go rogue or burn budget, the only option is to close laptop lids and wait for heartbeat timeout.
- **(V2)** Every agent wake costs an LLM turn, even when there's nothing actionable — no deterministic pre-screening.

This doc designs the missing layer: **triggers** (what causes work to happen) and **events** (how subsystems communicate about it).

### What This Doc Does NOT Cover

- Job dispatch logic, slot assignment, machine selection — see orchestrator design (2026-02-18)
- Job lifecycle state machine, branch strategy, verification — see pipeline design (2026-02-20)
- Agent messaging (Slack/Discord inbound/outbound) — see messaging design (2026-02-22)
- Feature/job schema, CPO role boundaries — see pipeline design (2026-02-20)

---

## Architecture Overview

Seven subsystems + three cross-cutting capabilities, three layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CLOUD (Supabase)                                │
│                                                                         │
│  ┌────────────┐  ┌──────────────┐  ┌───────────┐  ┌────────────────┐  │
│  │ Scheduler  │  │ Wake Service │  │ Hooks     │  │ External       │  │
│  │ (cron)     │  │ (poke)       │  │ Engine    │  │ Triggers       │  │
│  └─────┬──────┘  └──────┬───────┘  └─────┬─────┘  └───────┬────────┘  │
│        │                │                 │                │           │
│        └────────┬───────┴────────┬────────┘                │           │
│                 ▼                ▼                          │           │
│        ┌────────────────────────────────┐                  │           │
│        │       Events Table            │◀─────────────────┘           │
│        │  (Postgres, trust-classified)  │                              │
│        └────────────────┬───────────────┘                              │
│                         │ Supabase Realtime                            │
│  ┌──────────┐           │                                              │
│  │  ESTOP   │═══════════╪═══ kill broadcast ═══════════════╗           │
│  │ (freeze) │           │                                  ║           │
│  └──────────┘           │                                  ║           │
│        ┌────────────────┼──────────────┐                   ║           │
│        │                │              │                   ║           │
│  ┌─────┴──────────┐  ┌─┴────────────┐                    ║           │
│  │ Lane: Main     │  │ Lane: Backgnd│                     ║           │
│  │ (user+sched)   │  │ (verify/sys) │                     ║           │
│  └────────────────┘  └──────────────┘                     ║           │
└──────────────────────────────────────────────────────────║───────────┘
                         │                                 ║
              Supabase Realtime (websocket)                ║
                         │                                 ║
         ┌───────────────┼───────────────┐                 ║
         ▼                               ▼                 ▼
┌──────────────────┐           ┌──────────────────┐
│  Tom's Machine   │           │  Chris's Machine │
│  Local Agent     │           │  Local Agent     │
│  ─────────────── │           │  ─────────────── │
│  Heartbeat       │           │  Heartbeat       │
│  (machine+job+   │           │  (machine+job+   │
│   context health)│           │   context health)│
│  Cheap-Check     │           │  Cheap-Check     │
│  Escalation      │           │  Escalation      │
│  Coalesced Wake  │           │  Coalesced Wake  │
│  Handler         │           │  Handler         │
└──────────────────┘           └──────────────────┘
```

---

## 1. Heartbeat System (Deep Health)

### What exists today

The orchestrator design specifies machine-level heartbeats: local agent sends a pulse every 30s, orchestrator marks the machine dead after 2 minutes of silence. This tells you "the machine is reachable" but nothing about whether agents on it are actually working.

### What this adds

Per-job health reporting inside the existing heartbeat envelope. The local agent inspects each running agent session and reports structured health data. **(V2)** Also reports context health for persistent agents.

### Heartbeat Payload (extended)

```typescript
interface Heartbeat {
  type: "heartbeat";
  protocolVersion: number;
  machineId: string;
  timestamp: string;                // ISO 8601
  machine: {
    status: "online";
    cpuLoad: number;                // 0-1, optional
    memoryUsedPct: number;          // 0-100, optional
  };
  jobs: JobHealth[];                // one entry per active job
  cpo?: CpoHealth;                 // only if this machine hosts CPO
}

interface JobHealth {
  jobId: string;
  status: "executing" | "idle" | "stuck" | "completing";
  lastActivityAt: string;          // ISO 8601 — last tool call or output
  lastToolCall?: string;           // name of the last tool invoked
  toolCallAge: number;             // seconds since last tool call started
  permissionBlocked: boolean;      // agent is waiting for user approval
  tmuxSessionAlive: boolean;       // tmux session exists
  outputStalled: boolean;          // no new output for >60s during execution
}

interface CpoHealth {
  sessionAlive: boolean;
  lastActivityAt: string;
  idle: boolean;                   // REPL waiting for input
  messageQueueDepth: number;       // pending Slack messages waiting to be injected
  context: ContextHealth;          // V2: context window health
}

// V2: track context health for persistent agents
interface ContextHealth {
  estimatedTokens: number;         // approximate context usage from tmux output markers
  compactionTriggered: boolean;    // whether Claude Code has auto-compacted recently
  lastCompactionAt?: string;       // ISO 8601
  turnsSinceCompaction: number;    // how many turns since last compaction/restart
}
```

### How the local agent collects job health

For each running job (tracked in its `activeJobs` map):

1. **tmux session check**: `tmux has-session -t {sessionName}` — sets `tmuxSessionAlive`
2. **Output capture**: `tmux capture-pane -t {sessionName} -p` — capture last N lines
3. **Activity detection**: Compare captured output to previous capture. If identical for >60s during `executing` status → `outputStalled: true`
4. **Permission detection**: Scan captured output for known permission prompt patterns ("Allow?", "Do you want to", "approve") → `permissionBlocked: true`
5. **Tool call tracking**: Parse Claude Code's tool-use indicators from output — extract last tool name and timestamp
6. **Status inference**:
   - `permissionBlocked` → `stuck`
   - `outputStalled && status === executing` → `stuck`
   - `!tmuxSessionAlive` → report job as failed (separate from heartbeat — send `JobResult` with error)
   - Active output flowing → `executing`
   - REPL prompt visible → `idle`

### (V2) Context health collection for CPO

For the persistent CPO session, the local agent additionally:

1. **Compaction detection**: Scan tmux output for Claude Code's compaction indicators ("Conversation was automatically compacted", "context window")
2. **Turn counting**: Track agent response cycles since last compaction or session restart
3. **Token estimation**: Count approximate message pairs × average tokens, or parse Claude Code's context usage indicator if visible

### Orchestrator decisions from heartbeat data

| Condition | Action |
|-----------|--------|
| `job.status === "stuck"` for 2 consecutive heartbeats (60s) | Log warning, increment `stuck_count` on job |
| `stuck_count >= stuck_threshold` (configurable per-role, default 3 = 90s) | Kill agent session, requeue job with `stuck_context` |
| `job.permissionBlocked === true` | Notify human via Slack: "Agent on {machine} is blocked on a permission prompt for job {jobId}" |
| `job.tmuxSessionAlive === false` | Treat as job failure — requeue |
| `cpo.sessionAlive === false` | Restart CPO session (existing behavior) |
| `cpo.messageQueueDepth > 5` | Log warning — CPO is falling behind on messages |
| `cpo.context.turnsSinceCompaction > 100` | **(V2)** Log warning — CPO may need session restart for fresh context |
| `cpo.context.compactionTriggered && cpo.context.turnsSinceCompaction > 200` | **(V2)** Auto-restart CPO session (compaction has happened and context is deep) |
| No heartbeat for 2 minutes | Existing behavior: mark machine dead, requeue all jobs |

### Stuck threshold configuration

The `stuck_threshold` (number of consecutive stuck heartbeats before kill+requeue) is configurable per role in the `roles` table:

```sql
ALTER TABLE public.roles ADD COLUMN stuck_threshold INTEGER DEFAULT 3;
-- 3 × 30s = 90s default. Increase for roles that use long-running tools (e.g. CTO doing architecture review).
```

### (V2.1) Dispatch attempt fencing

When a job is dispatched, the orchestrator generates a fresh `dispatch_attempt_id` (UUID) and writes it to the job row. The local agent includes this ID in every heartbeat and JobResult message.

**Why this matters**: After estop, daemon restart, or heartbeat timeout requeue, a stale agent (from a previous dispatch) could still be running in a tmux session and may report completion for a job that has already been requeued and dispatched to someone else. Without fencing, the stale report wins and corrupts the new run.

**Enforcement**: All state transitions on jobs use compare-and-set:
```sql
-- Only accept JobResult if the attempt ID matches
UPDATE jobs SET status = $1, result = $2
WHERE id = $3 AND dispatch_attempt_id = $4;
-- If 0 rows affected → stale attempt, discard the result
```

The local agent receives `dispatch_attempt_id` in the dispatch message and includes it in:
- Every heartbeat `JobHealth` entry
- The `JobResult` message on completion/failure
- The `interrupted` report on graceful shutdown

### Database

**(V2.1)** Heartbeat liveness data is persisted in the `machines` table with TTL-based expiry, not held in Edge Function memory (which doesn't survive redeploys). The orchestrator updates machine liveness on each heartbeat and makes requeue decisions from DB state.

```sql
ALTER TABLE public.machines ADD COLUMN last_heartbeat_at TIMESTAMPTZ;
ALTER TABLE public.machines ADD COLUMN heartbeat_payload JSONB;  -- latest heartbeat for inspection
-- Requeue trigger: machines WHERE last_heartbeat_at < now() - interval '2 minutes' AND status = 'online'
```

Only job-level *decisions* (requeue, notify) create durable records in the existing `jobs` and `events` tables.

### (V2.2) Heartbeat Receiver

The cloud-side processor for heartbeats is an **HTTP POST to a `heartbeat` Edge Function** — not a Realtime channel listener. Edge Functions are invocation-based and can't listen persistently, but they can process incoming HTTP requests.

`supabase/functions/heartbeat/index.ts`:

```typescript
// POST /functions/v1/heartbeat
// Body: Heartbeat payload (see interface above)
// Auth: requires machine token (service_role or machine-specific JWT)

async function handleHeartbeat(heartbeat: Heartbeat, supabase: SupabaseClient) {
  // 1. Update machine liveness
  await supabase.from("machines").update({
    last_heartbeat_at: new Date().toISOString(),
    heartbeat_payload: heartbeat,
    status: "online",
  }).eq("id", heartbeat.machineId);

  // 2. Process per-job health
  for (const job of heartbeat.jobs) {
    // Verify dispatch_attempt_id matches before acting on any job health data
    const { data: dbJob } = await supabase.from("jobs")
      .select("dispatch_attempt_id, stuck_count")
      .eq("id", job.jobId).single();

    if (!dbJob || dbJob.dispatch_attempt_id !== job.dispatchAttemptId) continue; // stale

    if (job.status === "stuck") {
      const newStuckCount = (dbJob.stuck_count ?? 0) + 1;
      await supabase.from("jobs").update({
        stuck_count: newStuckCount,
        last_stuck_at: new Date().toISOString(),
      }).eq("id", job.jobId);

      // Threshold check
      const { data: role } = await supabase.from("roles")
        .select("stuck_threshold").eq("name", job.role).single();
      const threshold = role?.stuck_threshold ?? 3;

      if (newStuckCount >= threshold) {
        await runHooks("job.stuck", { jobId: job.jobId, reason: job.status }, supabase);
        // Kill + requeue handled by orchestrator dispatch loop
      }
    } else {
      // Reset stuck count on healthy heartbeat
      await supabase.from("jobs").update({ stuck_count: 0 }).eq("id", job.jobId);
    }
  }

  // 3. Process CPO health (if present)
  if (heartbeat.cpo?.context) {
    const ctx = heartbeat.cpo.context;
    if (ctx.turnsSinceCompaction > 100) {
      // Log warning — CPO context getting deep
    }
    if (ctx.compactionTriggered && ctx.turnsSinceCompaction > 200) {
      // Auto-restart CPO session
    }
  }

  return { ok: true };
}
```

The local agent sends heartbeats as HTTP POST every 30 seconds. The Edge Function is stateless — all liveness state is in the `machines` table.

**Exception**: `stuck_count` is tracked on the `jobs` row as a column:

```sql
ALTER TABLE public.jobs ADD COLUMN stuck_count INTEGER DEFAULT 0;
ALTER TABLE public.jobs ADD COLUMN last_stuck_at TIMESTAMPTZ;

-- V2.1: Dispatch attempt fencing — prevents stale agents from corrupting requeued jobs
ALTER TABLE public.jobs ADD COLUMN dispatch_attempt_id UUID;          -- set on each dispatch, included in heartbeat/JobResult
ALTER TABLE public.jobs ADD COLUMN origin_trust_level TEXT;           -- V2.1: trust provenance from triggering event
ALTER TABLE public.jobs ADD COLUMN origin_event_id UUID;              -- V2.1: which agent_event created this job
ALTER TABLE public.jobs ADD COLUMN origin_source TEXT;                -- V2.1: 'scheduled:{id}', 'webhook:{source}', 'manual', etc.
```

---

## 2. Cron / Scheduler

### Design

Cloud-side scheduler running as a Supabase Edge Function (`scheduler`), invoked by Supabase's built-in `pg_cron` extension. The scheduler reads a `scheduled_jobs` table and creates standard jobs in the `jobs` table — reusing the entire existing dispatch pipeline.

**Key principle**: The scheduler creates jobs, not results. It never executes anything itself. A scheduled task is just "create a job with this spec at this time."

### `scheduled_jobs` table

```sql
CREATE TABLE public.scheduled_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,              -- human-readable ("nightly-bug-scan")
  schedule      TEXT NOT NULL,              -- cron expression ("0 2 * * *") or interval ("every:30m")
  timezone      TEXT DEFAULT 'UTC',         -- IANA timezone for cron expressions
  enabled       BOOLEAN DEFAULT true,

  -- Job template: what job to create when the schedule fires
  job_spec      TEXT NOT NULL,              -- markdown spec for the agent
  job_role      TEXT NOT NULL,              -- which role executes this
  job_complexity TEXT DEFAULT 'simple',     -- simple/medium/complex
  feature_id    UUID REFERENCES features(id), -- optional parent feature

  -- Execution mode
  session_mode  TEXT DEFAULT 'isolated',    -- 'isolated' (fresh session) or 'relay' (surface via CPO)
  wake_target   TEXT,                       -- if session_mode='relay': which agent to wake (e.g. 'cpo')

  -- State
  last_run_at   TIMESTAMPTZ,
  next_run_at   TIMESTAMPTZ,               -- pre-computed by scheduler
  consecutive_errors INTEGER DEFAULT 0,
  last_error    TEXT,

  -- Lane assignment
  lane          TEXT DEFAULT 'background',  -- V2.2: explicit lane. Must match jobs.lane CHECK ('main' | 'background'). Default 'background' for scheduled work.

  -- Dedup
  dedup_key     TEXT,                       -- if set, won't create a new job if one with this key is already queued/executing

  -- V2: Audit
  created_by    TEXT NOT NULL,              -- who created this: 'seed', 'admin:{userId}', 'cpo', 'api'
  updated_by    TEXT,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- V2: Only service_role can insert/update/delete. Read is open to authenticated.
CREATE POLICY "scheduled_jobs_read" ON public.scheduled_jobs
  FOR SELECT USING (true);
-- Insert/update/delete restricted to service_role (Edge Functions only).
-- No direct user manipulation — all changes go through an admin Edge Function.
```

### Two execution modes

**Isolated** (`session_mode = 'isolated'`): Scheduler creates a standard job in the `jobs` table. Orchestrator dispatches it to an available machine. Agent runs in a fresh session, produces output, job completes normally. Used for: nightly bug scan, done-archiver, dependency audit.

**Relay** (`session_mode = 'relay'`): Scheduler enqueues a system event targeting the `wake_target` agent (typically CPO). The agent's next wake cycle picks it up and processes it in its existing session context. Used for: standup reminders, pipeline health summaries, roadmap reviews — things that need CPO's full conversation context.

### Scheduler Function (V2.1: Postgres function, not Edge Function)

**(V2.1)** The scheduler runs as a Postgres stored procedure called directly by `pg_cron`, eliminating the HTTP hop to an Edge Function. This removes network latency, DNS resolution, and cold-start overhead from the most reliable subsystem.

`migrations/xxx_scheduler_function.sql`:

```sql
CREATE OR REPLACE FUNCTION public.run_scheduler()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job RECORD;
BEGIN
  -- V2.1: Entire fire is transactional per job. FOR UPDATE SKIP LOCKED prevents double-fire.
  FOR job IN
    SELECT * FROM scheduled_jobs
    WHERE enabled = true AND next_run_at <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- V2.1: Idempotency — unique constraint prevents duplicate fires on retry
    BEGIN
      IF job.session_mode = 'isolated' THEN
        -- Check dedup_key
        IF job.dedup_key IS NOT NULL AND EXISTS (
          SELECT 1 FROM jobs WHERE source = 'scheduled:' || job.id AND status IN ('queued', 'executing')
        ) THEN
          CONTINUE; -- skip, already running
        END IF;

        INSERT INTO jobs (spec, role, complexity, feature_id, status, source, lane, company_id)
        VALUES (job.job_spec, job.job_role, job.job_complexity, job.feature_id, 'queued',
                'scheduled:' || job.id, job.lane, job.company_id);

      ELSIF job.session_mode = 'relay' THEN
        INSERT INTO agent_events (company_id, target_agent, event_type, reason, payload, trust_level)
        VALUES (job.company_id, job.wake_target, 'scheduled',
                'scheduled:' || job.name,
                jsonb_build_object('name', job.name, 'spec', job.job_spec, 'scheduled_job_id', job.id),
                'internal');
        -- Note: wake broadcast handled by agent_events INSERT trigger or polled by daemon
      END IF;

      -- V2.2: next_run_at is pre-computed on create/update by the admin Edge Function
      -- (see "next_run_at computation" below). The scheduler just advances it.
      UPDATE scheduled_jobs
      SET last_run_at = now(),
          next_run_at = public.compute_next_run(job.schedule, job.timezone),
          consecutive_errors = 0
      WHERE id = job.id;

    EXCEPTION WHEN OTHERS THEN
      UPDATE scheduled_jobs
      SET consecutive_errors = consecutive_errors + 1,
          last_error = SQLERRM,
          next_run_at = GREATEST(
            next_run_at,
            now() + (ARRAY[1, 5, 15, 60, 240])[LEAST(consecutive_errors + 1, 5)] * interval '1 minute'
          )
      WHERE id = job.id;
    END;
  END LOOP;
END;
$$;
```

Each job fire is wrapped in its own `BEGIN...EXCEPTION` block inside the loop, making each fire transactionally idempotent — if the INSERT succeeds but the UPDATE fails, the next run will skip via dedup check.

### Error backoff

```
backoff_minutes = [1, 5, 15, 60, 240][min(consecutive_errors, 4)]
next_run_at = greatest(normal_next_run, now() + backoff_minutes)
```

After 5 consecutive errors, the job is auto-disabled (`enabled = false`) and an event is logged for human attention.

### pg_cron setup (V2.1: direct function call, no HTTP hop)

```sql
-- V2.1: Call Postgres function directly — no Edge Function, no network hop
SELECT cron.schedule(
  'trigger-scheduler',
  '* * * * *',
  $$SELECT public.run_scheduler()$$
);
```

### (V2.2) `next_run_at` computation

`next_run_at` is **pre-computed on create and update** by the admin Edge Function (or seed script), not computed dynamically inside the scheduler. The scheduler function calls `compute_next_run()` only to advance to the next fire time after a successful run.

```sql
-- Thin wrapper — uses pg_cron's cron expression parser for standard cron,
-- or simple interval arithmetic for 'every:Nm' syntax.
CREATE OR REPLACE FUNCTION public.compute_next_run(
  p_schedule TEXT, p_timezone TEXT DEFAULT 'UTC'
) RETURNS TIMESTAMPTZ LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_schedule LIKE 'every:%' THEN
    -- Interval syntax: 'every:30m', 'every:6h'
    RETURN now() + p_schedule[7:]::interval;
  ELSE
    -- Cron expression: use pg_cron's internal parser via cron.schedule dry-run,
    -- or a simple next-match algorithm against the 5-field cron spec.
    -- Implementation: parse fields, find next matching minute from now() in p_timezone.
    -- For phase 1, a simple Postgres implementation covers standard 5-field cron.
    -- If complex expressions are needed later, move to app-layer computation.
    RETURN NULL; -- placeholder: implement cron field matching
  END IF;
END;
$$;
```

**Phase 1 pragmatic approach**: Since all seed scheduled jobs use simple cron expressions (hourly, daily, weekly), the admin Edge Function computes `next_run_at` in TypeScript (using a library like `cron-parser`) and writes it on INSERT/UPDATE. The Postgres function above is the fallback for the scheduler's post-fire advancement. This avoids the need for a full cron parser in Postgres on day one.

### Seed data (initial scheduled jobs)

| Name | Schedule | Mode | Role | Lane | Purpose |
|------|----------|------|------|------|---------|
| `nightly-done-archiver` | `0 3 * * *` | isolated | junior-engineer | `main` | Archive done jobs older than 7 days |
| `nightly-bug-scan` | `0 4 * * *` | isolated | senior-engineer | `main` | Scan codebase for known antipatterns |
| `standup-reminder` | `0 9 * * 1-5` | relay (CPO) | — | — | Wake CPO to initiate standup |
| `pipeline-health` | `*/30 * * * *` | relay (CPO) | — | — | Wake CPO to check pipeline state |
| `roadmap-review` | `0 10 * * 1` | relay (CPO) | — | — | Weekly roadmap health check |

Isolated jobs that create actual work should set `lane='main'`. Relay jobs don't create jobs (they create events), so lane is N/A. The `'background'` default is for system maintenance jobs (verification, code review) created by the orchestrator itself.

---

## 3. Agent Wake System (Universal Poke)

### The problem

CPO needs to wake up for many reasons: scheduled reminders, job completions, webhook callbacks, human messages. Each trigger currently requires its own injection mechanism. The messaging design has `MessageInbound` for Slack. The scheduler needs something else. Job completion needs yet another path.

### Design: single wake function, reason-based routing

Inspired by OpenClaw's `requestHeartbeatNow()` pattern, adapted for distributed architecture. Any subsystem that wants to wake an agent calls a single Edge Function with a reason string. The local daemon coalesces multiple wake requests and processes them as a batch.

### Wake Service Edge Function

`supabase/functions/wake-agent/index.ts`:

```typescript
interface WakeRequest {
  targetAgent: string;     // "cpo", "cto", or a jobId
  reason: string;          // "scheduled:standup-reminder", "job-complete:abc123", "webhook:github-pr-merged", "manual"
  payload?: string;        // optional context (JSON string)
  priority: -1 | 0 | 1;   // -1=low, 0=normal, 1=high (matches agent_events.priority)
}
```

The Edge Function:
1. **(V2)** Checks global estop flag — if frozen, reject wake unless reason is `manual` or `estop:resume`
2. Validates the request
3. Inserts into `agent_events` table (see section 4)
4. Broadcasts a `wake:{targetAgent}` event on the Supabase Realtime channel for the machine hosting that agent
5. Returns `{ ok: true, eventId }`

### Local daemon: coalesced wake handler

The local agent listens for `wake:*` events on its Realtime channel. When one arrives:

1. **Coalesce (throttle, NOT debounce)**: On first wake event, start a 1500ms timer. Collect all subsequent events during that window. At exactly 1500ms, process the batch, then reset. New events arriving during processing are queued for the next cycle. This is a time-bucket throttle — a rolling debounce would cause starvation under steady event streams.
2. **Priority sort**: high > normal > low. Within same priority, FIFO.
3. **Drain events**: Query `agent_events` table for all undrained events targeting this agent.
4. **(V2) Cheap-check escalation**: Before injecting into the agent (which costs an LLM turn), run deterministic pre-checks — see section 3a.
5. **Build prompt**: Based on the highest-priority reason:
   - `scheduled:*` → "You have a scheduled task: {payload}"
   - `job-complete:*` → "A job has completed. Here are the results: {payload}"
   - `webhook:*` → "An external event occurred: {payload}"
   - `manual` → standard heartbeat/proactive check
   - Multiple reasons → combine into a single prompt with sections
   - **(V2.1) Prompt overflow strategy**: If more than `max_batch_size` events are pending, the prompt builder truncates: deliver the newest `max_batch_size` events in full, and prepend a summary line for the rest (e.g., "Plus 32 older events: 28 low-priority pipeline-health checks (suppressed), 3 job completions, 1 webhook"). This prevents blowing out the agent's context window on event storms.
6. **Inject into agent session**: Same `tmux send-keys` mechanism as `MessageInbound`
7. **(V2.1) Mark events as acked**: `UPDATE agent_events SET acked_at = now() WHERE id IN (...)` — only after successful inject. See Section 4 for claim/ack semantics.

### (V2.2) Wake Broadcast After Enqueue

Postgres stored procedures (like `enqueue_agent_event` and `run_scheduler`) cannot push to Supabase Realtime channels directly — Realtime is a separate service. This creates a latency gap: events sit in the queue until the 60s recovery poller fires.

**Resolution by caller type:**

| Caller | Wake broadcast mechanism |
|--------|------------------------|
| Edge Functions (wake-agent, webhooks, estop) | Broadcast via `supabase.channel()` after RPC call — Edge Functions have full Realtime access |
| Postgres functions (run_scheduler) | No broadcast. Accept 60s poller latency. Scheduled events are already on 60s cron, so worst case is 60s additional delay — acceptable for cron workloads. |
| Future: high-latency-sensitive Postgres callers | Use `pg_notify('wake_channel', target_agent)` + a thin Edge Function listener that converts `LISTEN/NOTIFY` to Realtime broadcast. Not needed for phase 1. |

This means the wake-agent Edge Function's step 4 ("broadcasts a `wake:{targetAgent}` event") is the primary fast path. The recovery poller is the guaranteed-delivery fallback.

### Coalescing rationale

OpenClaw uses 250ms. Gemini's V1 review flagged this as too tight for distributed systems where network jitter can spread events. 1500ms is our default — long enough to batch rapid-fire events (e.g., 3 jobs completing within a second), short enough that the agent responds within 2 seconds. Configurable per-machine in `machine.yaml`:

```yaml
wake:
  coalesce_ms: 1500       # default
  max_batch_size: 10      # max events per wake cycle
```

### (V2) 3a. Cheap-Check Escalation

OpenClaw's heartbeat system runs an "emptiness pre-flight" before waking the agent — if HEARTBEAT.md is empty, it skips the wake entirely. This prevents burning an LLM turn on nothing.

zazigv2 adapts this as a deterministic pre-check pipeline that runs *after* events are claimed but *before* injection into the agent session:

```typescript
interface CheapCheckResult {
  inject: boolean;       // should we wake the agent?
  reason?: string;       // why we're skipping
}

function runCheapChecks(events: AgentEvent[], agentState: AgentState): CheapCheckResult {
  // 1. Empty batch — nothing to deliver
  if (events.length === 0) {
    return { inject: false, reason: "no_events" };
  }

  // 2. All events are low-priority informational and agent is busy executing
  if (events.every(e => e.priority <= -1) && agentState.status === "executing") {
    return { inject: false, reason: "low_priority_agent_busy" };
    // Events are acked with skip_reason — they won't be re-claimed
  }

  // 3. Duplicate suppression: if the combined prompt would be identical to
  //    the last injected prompt (same reasons, same payloads), skip
  const promptHash = hashPrompt(events);
  if (promptHash === agentState.lastInjectedPromptHash) {
    return { inject: false, reason: "duplicate_prompt" };
  }

  // 4. Rate limit: if agent was woken less than 30s ago, defer (re-queue for next cycle)
  if (agentState.lastWokenAt && Date.now() - agentState.lastWokenAt < 30_000) {
    return { inject: false, reason: "rate_limited" };
    // Note: events are released back to unclaimed. They'll be re-claimed on the next cycle.
  }

  return { inject: true };
}
```

**Cost saving**: For a CPO woken 48 times per day (30m pipeline-health × 48 half-hours), cheap-checks can eliminate ~30-40% of wakes where there's nothing new to report. At ~$0.05-0.20 per Opus turn, this saves $1-4/day per persistent agent.

When a cheap-check skips injection, claimed events are acked with a `skip_reason` (they've been processed — the decision was "nothing to do"). The skip is logged so the orchestrator can track suppression rates.

### CPO proactive behavior

With the wake system, CPO's proactive behaviors become simple scheduled_jobs entries:

- **Standup at 9am** → scheduler creates relay event → wake service pokes CPO → CPO runs standup
- **Pipeline check every 30m** → same path → CPO checks queue depth, stuck jobs, stale features
- **Job completion** → orchestrator calls wake service when job transitions to `done` → CPO summarizes

No special machinery. Every trigger flows through the same wake → coalesce → cheap-check → inject pipeline.

### (V2.2) Note: Slack message injection unification

The messaging design (`docs/plans/2026-02-22-agent-messaging-bidirectional.md`) currently injects Slack messages directly into tmux sessions via `MessageInbound`. This creates a **dual injection path** that can race with the events queue. Both paths write to the same tmux session without coordination.

**Recommendation for messaging design update**: Slack messages should enqueue as `agent_events` with `event_type='message'` and `priority=1` (high). All injection goes through the wake handler. This ensures:
- Single injection path into each agent session — no races
- Messages benefit from claim/ack semantics (no silent loss)
- Priority ordering works across all event types
- Cheap-check can suppress duplicate messages

The `MessageInbound` direct-inject path should be removed from the messaging design and replaced with an `enqueue_agent_event` call.

---

## 4. System Events Queue

### The problem

Subsystems need to communicate asynchronously: cron results need to reach CPO, job completions need to surface at standup, webhook callbacks need to be relayed. In-memory queues don't work — Edge Functions are stateless and agents run on different machines.

### Design: Postgres-backed event queue

```sql
CREATE TABLE public.agent_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  target_agent  TEXT NOT NULL,              -- "cpo", "cto", or a specific jobId
  target_machine TEXT,                      -- optional: route to specific machine
  event_type    TEXT NOT NULL,              -- "scheduled", "job_complete", "webhook", "system", "message"
  reason        TEXT NOT NULL,              -- wake reason string (e.g. "scheduled:standup-reminder")
  payload       JSONB,                      -- event-specific data
  priority      INTEGER DEFAULT 0,          -- -1=low, 0=normal, 1=high (numeric for correct ORDER BY)

  -- V2: Trust classification
  trust_level   TEXT NOT NULL DEFAULT 'internal'
    CHECK (trust_level IN ('internal', 'authenticated', 'external')),

  -- Lifecycle (V2.1: three-phase — pending → claimed → acked)
  created_at    TIMESTAMPTZ DEFAULT now(),
  claimed_at    TIMESTAMPTZ,               -- V2.1: set when local agent claims the event (lease)
  claimed_by    TEXT,                       -- V2.1: machine_id that claimed it
  acked_at      TIMESTAMPTZ,               -- V2.1: set AFTER successful inject into agent session
  expired_at    TIMESTAMPTZ,               -- set by retention policy
  claim_attempts INTEGER DEFAULT 0,        -- V2.1: retry counter
  last_error    TEXT,                       -- V2.1: last inject failure reason

  -- Dedup
  dedup_key     TEXT,                       -- optional: prevent consecutive identical events
  context_key   TEXT                        -- optional: group related events
);

-- V2.1: index covers unclaimed (pending) and claimed-but-unacked events
CREATE INDEX idx_agent_events_pending
  ON public.agent_events (target_agent, company_id)
  WHERE acked_at IS NULL AND expired_at IS NULL;

CREATE INDEX idx_agent_events_created
  ON public.agent_events (created_at);

ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;
```

### (V2) Trust levels

Every event carries a `trust_level` that classifies its origin:

| Level | Meaning | Who sets it | What it can do |
|-------|---------|-------------|---------------|
| `internal` | Created by orchestrator, scheduler, or hooks engine | Edge Functions running as service_role | Trigger state transitions, direct job mutations, unrestricted payload |
| `authenticated` | Created from a verified external source (HMAC-signed webhook, authenticated API call) | Webhook handler after signature verification | Enqueue events, trigger hooks, but NOT direct state mutations without hook approval |
| `external` | Created from an unverified or low-trust source | Webhook handler when signature is missing or unrecognized source | Enqueue events only. Payload is sanitized (stripped of any embedded instructions). Cannot trigger state transitions directly. |

The trust level flows through the entire pipeline:
- Wake handler includes trust level in the prompt context so the agent knows the provenance
- Hooks can gate on trust level (e.g., `job.before_dispatch` can reject jobs created from `external` triggers)
- The prompt builder wraps `external` payloads in a clear boundary: `"[External event — unverified source]: {sanitized_payload}"`
- **(V2.1)** Trust provenance is persisted on the `jobs` table (`origin_trust_level`, `origin_event_id`, `origin_source`) so it survives the event → job transformation and is available to all hooks and downstream systems

### Operations

**(V2.1) All queue operations are Postgres stored procedures** called via `supabase.rpc()`. PostgREST does not support `FOR UPDATE SKIP LOCKED` via standard client queries — stored procedures are required for correct queue semantics.

**Enqueue** (called by scheduler, orchestrator, webhook handlers):
```sql
CREATE OR REPLACE FUNCTION public.enqueue_agent_event(
  p_company_id UUID, p_target_agent TEXT, p_event_type TEXT,
  p_reason TEXT, p_payload JSONB, p_priority INTEGER DEFAULT 0,
  p_trust_level TEXT DEFAULT 'internal', p_dedup_key TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_id UUID;
BEGIN
  -- Consecutive dedup: skip if an unclaimed event with same dedup_key exists
  IF p_dedup_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM agent_events
    WHERE target_agent = p_target_agent AND company_id = p_company_id
      AND acked_at IS NULL AND expired_at IS NULL AND dedup_key = p_dedup_key
    LIMIT 1
  ) THEN
    RETURN NULL; -- deduplicated
  END IF;

  INSERT INTO agent_events (company_id, target_agent, event_type, reason, payload, priority, trust_level, dedup_key)
  VALUES (p_company_id, p_target_agent, p_event_type, p_reason, p_payload, p_priority, p_trust_level, p_dedup_key)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
```

**(V2.1) Claim** (called by local agent wake handler — acquires lease, does NOT ack):
```sql
CREATE OR REPLACE FUNCTION public.claim_agent_events(
  p_target_agent TEXT, p_company_id UUID, p_machine_id TEXT, p_limit INTEGER DEFAULT 50
) RETURNS SETOF agent_events
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH claimable AS (
    SELECT id FROM agent_events
    WHERE target_agent = p_target_agent AND company_id = p_company_id
      AND claimed_at IS NULL AND acked_at IS NULL AND expired_at IS NULL
    ORDER BY priority DESC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE agent_events SET claimed_at = now(), claimed_by = p_machine_id, claim_attempts = claim_attempts + 1
  WHERE id IN (SELECT id FROM claimable)
  RETURNING *;
END;
$$;
```

**(V2.1) Ack** (called AFTER successful inject into agent session):
```sql
CREATE OR REPLACE FUNCTION public.ack_agent_events(p_event_ids UUID[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE agent_events SET acked_at = now() WHERE id = ANY(p_event_ids);
END;
$$;
```

**(V2.1) Release** (called on inject failure — returns events to pending for retry):
```sql
CREATE OR REPLACE FUNCTION public.release_agent_events(p_event_ids UUID[], p_error TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE agent_events
  SET claimed_at = NULL, claimed_by = NULL, last_error = p_error
  WHERE id = ANY(p_event_ids);

  -- DLQ: expire events that have failed too many times
  UPDATE agent_events SET expired_at = now(), last_error = 'DLQ: max retries exceeded'
  WHERE id = ANY(p_event_ids) AND claim_attempts >= 3;
END;
$$;
```

**Important (V2.1)**: The local agent claims events atomically, then attempts to inject into tmux. On successful inject → call `ack_agent_events`. On inject failure → call `release_agent_events` with error context. Events released back to pending will be retried on the next wake cycle. After 3 failed claims, events are sent to the dead letter queue (expired with reason). This replaces V2's at-most-once semantics with at-least-once + DLQ.

**Peek** (called by local agent to check without claiming):
```sql
SELECT * FROM agent_events
WHERE target_agent = $1 AND company_id = $2 AND acked_at IS NULL AND expired_at IS NULL
  AND claimed_at IS NULL
ORDER BY priority DESC, created_at ASC;
```

**(V2.1) Stale claim recovery**: Claims older than 5 minutes without ack are auto-released (the claiming daemon likely crashed):
```sql
-- Run as part of the recovery poller
UPDATE agent_events SET claimed_at = NULL, claimed_by = NULL
WHERE claimed_at < now() - interval '5 minutes' AND acked_at IS NULL AND expired_at IS NULL;
```

**Cap**: Maximum 50 unclaimed events per agent. On insert, if count exceeds 50, the oldest low-priority events are auto-expired:
```sql
-- Trigger function
UPDATE agent_events SET expired_at = now()
WHERE id IN (
  SELECT id FROM agent_events
  WHERE target_agent = NEW.target_agent AND company_id = NEW.company_id AND acked_at IS NULL AND expired_at IS NULL
  ORDER BY priority ASC, created_at ASC
  LIMIT greatest(0, (
    SELECT count(*) FROM agent_events
    WHERE target_agent = NEW.target_agent AND company_id = NEW.company_id AND acked_at IS NULL AND expired_at IS NULL
  ) - 50)
);
```

### Retention

Daily cleanup via scheduled job:
```sql
DELETE FROM agent_events WHERE acked_at < now() - interval '7 days';
DELETE FROM agent_events WHERE expired_at < now() - interval '1 day';
DELETE FROM agent_events WHERE created_at < now() - interval '30 days';
```

---

## 5. Lifecycle Hooks

### The problem

The orchestrator makes dispatch, verification, and deployment decisions. Currently these decisions are monolithic — embedded in Edge Function logic with no way to compose additional checks, enforce policies, or observe transitions without modifying the orchestrator code.

### Design: typed hooks on state transitions

Hooks fire on job and feature state transitions. Each hook is a row in a config table that maps a transition to an action. Actions are either **checks** (can block the transition) or **notifications** (fire-and-forget).

### `hooks` table

```sql
CREATE TABLE public.hooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  event         TEXT NOT NULL,              -- hook event name (see list below)
  action_type   TEXT NOT NULL,              -- "check" or "notify"
  handler       TEXT NOT NULL,              -- Edge Function name or "builtin:{name}"
  priority      INTEGER DEFAULT 0,         -- higher runs first
  fail_policy   TEXT DEFAULT 'closed',     -- "closed" (block on timeout) or "open" (allow on timeout)
  enabled       BOOLEAN DEFAULT true,
  config        JSONB DEFAULT '{}',        -- hook-specific configuration
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hooks ENABLE ROW LEVEL SECURITY;

-- V2: Same as scheduled_jobs — read-only for authenticated, write via service_role
CREATE POLICY "hooks_read" ON public.hooks
  FOR SELECT USING (true);
```

### Hook events

| Event | Fires when | Check can block? | Use cases |
|-------|-----------|-----------------|-----------|
| `job.before_dispatch` | Job about to be dispatched to a machine | Yes | Budget check, slot validation, active-hours gate, **(V2)** trust-level gate |
| `job.dispatched` | Job successfully dispatched | No (notify) | Slack notification, logging |
| `job.started` | Agent acknowledged and began work | No (notify) | Start timer, update dashboard |
| `job.before_complete` | Agent reports completion, before verification | Yes | Output validation, safety scan |
| `job.completed` | Job done (post-verification) | No (notify) | Wake CPO, update feature status, metrics |
| `job.failed` | Job crashed or unrecoverable error | No (notify) | Alert human, requeue logic |
| `job.stuck` | Heartbeat reports stuck agent (2+ cycles) | No (notify) | Alert human, auto-restart |
| `feature.verified` | All jobs merged, feature verification passed | No (notify) | Deploy to test env, notify human |
| `feature.approved` | Human approved | No (notify) | Merge to main, deploy to prod |
| `feature.rejected` | Human rejected | No (notify) | Route feedback, triage |
| `wake.before_inject` | About to inject a wake message into agent | Yes | Rate limiting, active-hours gate |
| **(V2)** `estop.activated` | Emergency stop triggered | No (notify) | Alert all humans, log |
| **(V2)** `estop.resumed` | Emergency stop lifted | No (notify) | Alert all humans, log |

### Hook execution model

**Check hooks** (can block):
1. Run sequentially in priority order (highest first)
2. Each returns `{ allow: true }` or `{ allow: false, reason: string }`
3. If any check returns `allow: false`, the transition is blocked and the reason is logged
4. Timeout: 5 seconds per hook. On timeout, **per-hook failure policy** applies:
   - `fail_policy: "closed"` (default for safety/budget/access hooks) → treat as `{ allow: false, reason: "hook timeout" }`. Transition is blocked. Retries with backoff.
   - `fail_policy: "open"` (opt-in for non-critical checks) → treat as `{ allow: true }`. Logs a warning.

**Notify hooks** (V2.1: awaited with bounded timeout, NOT fire-and-forget):
1. Run in parallel (`await Promise.allSettled`) — must be awaited to prevent Edge Function termination before completion
2. Errors are logged but don't affect the transition
3. Timeout: 10 seconds total budget for all notify hooks combined

### Implementation phasing (V2.1)

**(V2.1)** Both reviewers flagged the full DB-configurable hooks engine as overbuilt for current scale. **Phase 1**: Ship the built-in hooks below as hardcoded TypeScript functions (no `hooks` table, no dynamic loading). **Phase 2**: Promote to DB-configurable when custom hooks are needed. The hook interface (`runHooks(event, context)`) stays the same either way — only the backend changes.

### Built-in hooks (seeded)

| Name | Event | Type | What it does |
|------|-------|------|-------------|
| `budget-gate` | `job.before_dispatch` | check | Checks daily API spend against budget threshold |
| `active-hours-gate` | `job.before_dispatch` | check | Blocks dispatch outside configured active hours |
| `slot-validator` | `job.before_dispatch` | check | Confirms slot is actually available (race condition guard) |
| **(V2)** `trust-gate` | `job.before_dispatch` | check | Blocks jobs originating from `external` trust level |
| `wake-cpo-on-complete` | `job.completed` | notify | Enqueues event for CPO when any job completes |
| `slack-notify-stuck` | `job.stuck` | notify | Posts to Slack when an agent is stuck |
| `slack-notify-testing` | `feature.verified` | notify | Notifies human that feature is ready for testing |
| `active-hours-wake` | `wake.before_inject` | check | Blocks non-urgent wakes outside active hours |

### Hook execution in the orchestrator

The orchestrator calls `runHooks(event, context)` at each transition point. This is a utility function, not a separate service.

**(V2.2) Phase 1 — hardcoded hooks** (no `hooks` table, no dynamic loading):

```typescript
// Phase 1: Built-in hooks as a simple map of handler functions
const BUILTIN_HOOKS: Record<string, Array<{
  name: string;
  type: "check" | "notify";
  handler: (ctx: HookContext) => Promise<HookResult>;
}>> = {
  "job.before_dispatch": [
    { name: "budget-gate", type: "check", handler: budgetGateCheck },
    { name: "active-hours-gate", type: "check", handler: activeHoursCheck },
    { name: "slot-validator", type: "check", handler: slotValidatorCheck },
    { name: "trust-gate", type: "check", handler: trustGateCheck },
  ],
  "job.completed": [
    { name: "wake-cpo-on-complete", type: "notify", handler: wakeCpoOnComplete },
  ],
  "job.stuck": [
    { name: "slack-notify-stuck", type: "notify", handler: slackNotifyStuck },
  ],
  "feature.verified": [
    { name: "slack-notify-testing", type: "notify", handler: slackNotifyTesting },
  ],
  "wake.before_inject": [
    { name: "active-hours-wake", type: "check", handler: activeHoursWakeCheck },
  ],
  "estop.activated": [
    { name: "slack-notify-estop", type: "notify", handler: slackNotifyEstop },
  ],
};

async function runHooks(
  event: string,
  context: HookContext,
  supabase: SupabaseClient
): Promise<{ allowed: boolean; reasons: string[] }> {
  const hooks = BUILTIN_HOOKS[event] ?? [];

  // Run checks sequentially
  for (const hook of hooks.filter(h => h.type === "check")) {
    const result = await Promise.race([
      hook.handler(context),
      new Promise<HookResult>(resolve =>
        setTimeout(() => resolve({ allow: false, reason: "hook timeout" }), 5000)
      ),
    ]);
    if (!result.allow) {
      return { allowed: false, reasons: [result.reason] };
    }
  }

  // Fire notifiers in parallel with bounded timeout
  const notifiers = hooks.filter(h => h.type === "notify");
  await Promise.allSettled(
    notifiers.map(hook =>
      Promise.race([hook.handler(context), new Promise(resolve => setTimeout(resolve, 10000))])
    )
  );

  return { allowed: true, reasons: [] };
}
```

**(Phase 2) DB-configurable hooks** — same interface, reads from `hooks` table instead of `BUILTIN_HOOKS` map:

```typescript
async function runHooks(
  event: string,
  context: HookContext,
  supabase: SupabaseClient
): Promise<{ allowed: boolean; reasons: string[] }> {
  const hooks = await supabase
    .from("hooks")
    .select("*")
    .eq("company_id", context.companyId)
    .eq("event", event)
    .eq("enabled", true)
    .order("priority", { ascending: false });

  const checks = hooks.data.filter(h => h.action_type === "check");
  const notifiers = hooks.data.filter(h => h.action_type === "notify");

  // Run checks sequentially
  for (const hook of checks) {
    const result = await executeHook(hook, context, { timeout: 5000 });
    if (!result.allow) {
      return { allowed: false, reasons: [result.reason] };
    }
  }

  // V2.1: Fire notifiers in parallel — MUST await to prevent Edge Function exit before completion
  await Promise.allSettled(
    notifiers.map(hook => executeHook(hook, context, { timeout: 10000 }))
  );

  return { allowed: true, reasons: [] };
}
```

### (V2.2) Budget Tracking

The `budget-gate` hook and estop auto-trigger both reference daily spend thresholds, but no mechanism existed to track spend. This subsection fills that gap.

**Data source**: Each `JobResult` includes token counts from the agent's session. The orchestrator accumulates these into a `daily_spend` table.

```sql
CREATE TABLE public.daily_spend (
  company_id    UUID NOT NULL REFERENCES companies(id),
  spend_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  total_input_tokens  BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  estimated_cost_usd  NUMERIC(10,4) DEFAULT 0,  -- computed from token counts × per-model rates
  updated_at    TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company_id, spend_date)
);

ALTER TABLE public.daily_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily_spend_read" ON public.daily_spend FOR SELECT USING (true);
-- Write via service_role only (orchestrator)
```

**Accumulation**: When the orchestrator processes a `JobResult`:

```typescript
async function accumulateSpend(supabase: SupabaseClient, companyId: string, result: JobResult) {
  if (!result.tokenUsage) return;

  const costUsd = estimateCost(result.tokenUsage, result.model);

  await supabase.rpc("accumulate_daily_spend", {
    p_company_id: companyId,
    p_input_tokens: result.tokenUsage.inputTokens,
    p_output_tokens: result.tokenUsage.outputTokens,
    p_cost_usd: costUsd,
  });
}
```

```sql
CREATE OR REPLACE FUNCTION public.accumulate_daily_spend(
  p_company_id UUID, p_input_tokens BIGINT, p_output_tokens BIGINT, p_cost_usd NUMERIC
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO daily_spend (company_id, spend_date, total_input_tokens, total_output_tokens, estimated_cost_usd)
  VALUES (p_company_id, CURRENT_DATE, p_input_tokens, p_output_tokens, p_cost_usd)
  ON CONFLICT (company_id, spend_date) DO UPDATE SET
    total_input_tokens = daily_spend.total_input_tokens + p_input_tokens,
    total_output_tokens = daily_spend.total_output_tokens + p_output_tokens,
    estimated_cost_usd = daily_spend.estimated_cost_usd + p_cost_usd,
    updated_at = now();
END;
$$;
```

**Budget-gate hook reads**:
```typescript
const { data: spend } = await supabase.from("daily_spend")
  .select("estimated_cost_usd")
  .eq("company_id", companyId)
  .eq("spend_date", new Date().toISOString().split("T")[0])
  .single();

const dailySpend = spend?.estimated_cost_usd ?? 0;
if (dailySpend >= config.estop_threshold_usd) {
  // Trigger estop
} else if (dailySpend >= config.daily_limit_usd) {
  return { allow: false, reason: `Daily budget exceeded: $${dailySpend}` };
}
```

**Cost estimation**: Token-to-USD rates are configured per-model in `companies.config` JSONB:
```json
{
  "cost_per_1k_input": { "opus": 0.015, "sonnet": 0.003, "codex": 0.001 },
  "cost_per_1k_output": { "opus": 0.075, "sonnet": 0.015, "codex": 0.002 }
}
```

---

## 6. Concurrency Lanes

### The problem

The orchestrator's slot system defines *how many* agents can run simultaneously on each machine. But it doesn't define *queuing discipline* — what happens when all slots are full. Different work types (human-dispatched features, scheduled scans, CPO proactive checks) compete for the same slots with no isolation.

### Design: three lanes with independent queues

Inspired by OpenClaw's CommandLane pattern, adapted for the distributed model. Lanes are logical partitions of the `jobs` table, not separate tables.

### Lane definitions (V2.1: simplified to 2 lanes)

**(V2.1)** V2 proposed 3 lanes (main/cron/system). Both reviewers flagged this as overbuilt for 2 machines / 4 agents. Simplified to 2 lanes — can be expanded later when scale demands it.

| Lane | Column value | Max concurrent (per machine) | Purpose |
|------|-------------|------------------------------|---------|
| `main` | `lane = 'main'` | Machine's `slots_claude_code` + `slots_codex` | Human-dispatched feature jobs + scheduled jobs |
| `background` | `lane = 'background'` | 1 | Orchestrator-internal (verification, code review, system maintenance) |

### Schema change

```sql
ALTER TABLE public.jobs ADD COLUMN lane TEXT DEFAULT 'main'
  CHECK (lane IN ('main', 'background'));
```

### How lanes interact with slots

Lanes share the machine's physical slots but have independent concurrency limits:

- **main** lane uses the machine's configured slots (the existing system). If Tom's machine has 2 Claude Code + 1 Codex, main lane can use all 3. Scheduled jobs (cron) also run in main lane — at current scale there's no need to isolate them.
- **background** lane gets 1 dedicated slot, carved from the machine's total. Used for verification, code review, and orchestrator-internal work that shouldn't block main work.

If a machine has 3 total slots: main can use up to 3 when background is idle, but drops to 2 if a background job is active.

### Queue priority within main lane

Jobs within the main lane are dispatched by priority:

```sql
ALTER TABLE public.jobs ADD COLUMN priority INTEGER DEFAULT 0;
-- Higher = dispatched first. Default 0. Urgent = 10. Background = -5.
```

The orchestrator's dispatch loop:
```sql
SELECT * FROM jobs
WHERE status = 'queued' AND lane = $1  -- 'main' or 'background'
ORDER BY priority DESC, created_at ASC
LIMIT 1;
```

### Lane isolation: why it matters

Without lanes, a verification job can block a human-dispatched urgent feature fix from getting a slot. With lanes:
- Background jobs (verification, system maintenance) never starve main work
- Main work is prioritized by urgency, not arrival time

### Backpressure

| Lane | Queue depth limit | On overflow |
|------|-------------------|-------------|
| main | No limit (bounded by Trello/feature count) | Jobs wait |
| background | 10 | Oldest queued background job is cancelled, event logged |

---

## 7. External Triggers

### The problem

The orchestrator currently has one input: polling the `jobs` table. External systems (GitHub, CI, Slack interactive components, future integrations) need a path to trigger orchestrator actions.

### Design: webhook receiver Edge Function

`supabase/functions/webhooks/index.ts` — a single endpoint that accepts webhooks from multiple sources, normalizes them, and routes to the appropriate action.

### Endpoint

```
POST https://{supabase-url}/functions/v1/webhooks/{source}
```

Where `{source}` is: `github`, `ci`, `slack-interactive`, or a custom identifier.

### (V2) Trusted vs Untrusted Pipeline

Research across OpenClaw, NanoClaw, and ZeroClaw shows webhook handlers need to distinguish trust levels at ingestion, not downstream. The webhook function runs two pipelines:

**Trusted pipeline** (HMAC verified, known source in `webhook_sources` table):
- Can directly mutate job state (e.g., advance a job when CI passes)
- Can create `authenticated` trust-level events
- Full payload passed through (no sanitization)
- Hooks receive `context.trustLevel = "authenticated"`

**Untrusted pipeline** (signature missing, verification failed, or unknown source):
- Can ONLY enqueue `external` trust-level events — no direct state mutations
- Payload is sanitized: strip any text that looks like prompt injection (embedded instructions, markdown with command-like syntax)
- Events are tagged so the `trust-gate` hook can block downstream dispatch
- Rate limited: max 10 events per source per minute

```typescript
function classifyTrust(source: string, signatureValid: boolean, sourceRegistered: boolean): TrustLevel {
  if (sourceRegistered && signatureValid) return "authenticated";
  if (sourceRegistered && !signatureValid) return "external"; // known source, bad sig
  return "external"; // unknown source
}

function sanitizePayload(payload: unknown): unknown {
  // Strip embedded instructions, control characters, excessive nesting
  // Truncate to 10KB max
  // Return sanitized copy
}
```

### GitHub webhook handler

```typescript
// POST /webhooks/github
// Verified via HMAC signature (X-Hub-Signature-256)

switch (event.type) {
  case "pull_request.closed":
    if (event.pull_request.merged) {
      // Find the job associated with this PR (by branch name convention)
      // Transition job to next state
      // Enqueue event for CPO: "PR #{number} merged for job {jobId}"
    }
    break;

  case "check_suite.completed":
    // CI passed/failed for a branch
    // If associated with a job in 'verifying' state:
    //   passed → advance to next state
    //   failed → attach failure context, transition to verify_failed
    break;

  case "issue_comment.created":
    // External contributor comment on a PR
    // Enqueue event for the reviewing agent
    break;
}
```

### Webhook registration table

```sql
CREATE TABLE public.webhook_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  source        TEXT NOT NULL,              -- "github", "ci", "custom"
  secret        TEXT NOT NULL,              -- HMAC secret for signature verification
  enabled       BOOLEAN DEFAULT true,
  config        JSONB DEFAULT '{}',         -- source-specific config (repo filter, event filter)

  -- V2: Audit
  created_by    TEXT NOT NULL,              -- 'admin:{userId}', 'api'
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.webhook_sources ENABLE ROW LEVEL SECURITY;

-- V2.1: Secret column MUST NOT be readable by authenticated users.
-- Only service_role can read secrets (for HMAC verification in Edge Functions).
-- Authenticated users can read non-secret columns for admin UI.
CREATE POLICY "webhook_sources_read_public" ON public.webhook_sources
  FOR SELECT USING (true);
-- IMPORTANT: Use a VIEW or column-level security to exclude `secret` from authenticated reads.
-- The Edge Function verifier runs as service_role and can access the raw table.
CREATE VIEW public.webhook_sources_safe AS
  SELECT id, company_id, source, enabled, config, created_by, created_at
  FROM public.webhook_sources;
-- Authenticated users query the view, not the table directly.
```

### (V2.2) Company resolution for webhooks

The webhook URL format is `POST /webhooks/{source}` — no `company_id` in the path. For multi-company routing, the webhook handler resolves company from the **webhook secret**:

```typescript
// Each company has a unique secret per source. The secret in the HMAC header
// identifies both the source AND the company in a single lookup.
const { data: webhookSource } = await supabase.from("webhook_sources")
  .select("company_id, source, secret, config")
  .eq("source", source)
  .eq("enabled", true);

// Try each registered source's secret to find the matching company
for (const ws of webhookSource ?? []) {
  if (verifyHmac(rawBody, ws.secret, signatureHeader)) {
    return { companyId: ws.company_id, trustLevel: "authenticated", config: ws.config };
  }
}
// No match → external/untrusted
return { companyId: null, trustLevel: "external" };
```

For single-company deployments (our current setup), this is a single-row lookup. For multi-company, it's bounded by the number of companies with the same source type — typically 1-3.

### Webhook processing flow

```
1. Receive POST /webhooks/{source}
2. (V2.2) Look up webhook_sources by source, verify HMAC against each company's secret to resolve company_id
3. Classify trust: verified signature + known source → "authenticated", else → "external"
4. If "authenticated" → trusted pipeline:
   a. Normalize payload to internal event format
   b. Route: state transition (direct), agent notification (enqueue + wake), or hook trigger
5. If "external" → untrusted pipeline:
   a. **(V2.1)** Rate-limit check FIRST, before any DB writes: 10/min keyed by `company_id + source + client_IP` (not just source — prevents bypass via multiple sources)
   b. Sanitize payload: strip injection patterns, control characters, excessive nesting; truncate to 10KB max
   c. Enqueue as agent_event with trust_level='external' only — no direct mutations
6. Return 200 on successful enqueue/state-update. Return 500 on processing failure.
   Return 200 for unrecognized events to avoid retry noise.
7. Log raw payload and routing decision in the events table
```

### Idempotency

GitHub (and most webhook sources) may retry on timeout. Each webhook event has a delivery ID. Store processed delivery IDs in a dedup table:

```sql
CREATE TABLE public.webhook_deliveries (
  delivery_id   TEXT NOT NULL,
  source        TEXT NOT NULL,
  company_id    UUID NOT NULL REFERENCES companies(id),
  processed_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (source, delivery_id)       -- scoped per source to avoid cross-source collisions
);

-- Cleanup: DELETE WHERE processed_at < now() - interval '24 hours'
```

---

## 8. Emergency Stop (V2)

### The problem

Research on ZeroClaw's `estop` mechanism and practitioner failure reports (agents burning API budget, stuck in loops, executing unintended actions) reveals a critical gap: there is no way to immediately halt all agent execution from the cloud. The existing mechanisms — graceful SIGTERM, heartbeat timeout, split-brain self-kill — are all local-first and take 30-120 seconds. When an agent is actively burning money or doing something wrong, you need a kill switch that takes effect in seconds.

### Design: global freeze flag + kill broadcast

The emergency stop is a two-part mechanism:

1. **Global freeze flag** in the `companies` table — prevents new work from starting
2. **Kill broadcast** via Supabase Realtime — tells local agents to terminate active sessions immediately

### Schema

```sql
ALTER TABLE public.companies ADD COLUMN estop_active BOOLEAN DEFAULT false;
ALTER TABLE public.companies ADD COLUMN estop_epoch INTEGER DEFAULT 0;    -- V2.1: monotonic counter, incremented on each activate
ALTER TABLE public.companies ADD COLUMN estop_activated_at TIMESTAMPTZ;
ALTER TABLE public.companies ADD COLUMN estop_activated_by TEXT;     -- 'human:{userId}', 'hook:budget-gate', etc.
ALTER TABLE public.companies ADD COLUMN estop_reason TEXT;
```

**(V2.1) Delivery guarantee**: The Realtime broadcast is best-effort for speed, but the DB flag is the hard guarantee. Every state-mutating Edge Function checks `estop_active` via a shared utility:

```typescript
async function assertNotFrozen(supabase: SupabaseClient, companyId: string): Promise<void> {
  const { data } = await supabase.from("companies").select("estop_active, estop_reason").eq("id", companyId).single();
  if (data?.estop_active) {
    throw new HttpError(423, `Emergency stop active: ${data.estop_reason}`);
  }
}
```

The local daemon treats HTTP 423 from any Supabase call as an immediate local kill signal — same behavior as receiving the Realtime broadcast.

### Edge Function: `estop`

`supabase/functions/estop/index.ts`:

```typescript
// POST /functions/v1/estop
// Body: { action: "activate" | "resume", reason: string }
// Auth: requires service_role or authenticated user with admin role

async function handleEstop(action: "activate" | "resume", reason: string, activatedBy: string) {
  if (action === "activate") {
    // 1. Set global freeze
    await supabase.from("companies").update({
      estop_active: true,
      estop_activated_at: new Date().toISOString(),
      estop_activated_by: activatedBy,
      estop_reason: reason,
    }).eq("id", companyId);

    // V2.2: Increment estop_epoch first (used for ACK protocol)
    const { data: company } = await supabase.from("companies")
      .select("estop_epoch").eq("id", companyId).single();
    const newEpoch = (company?.estop_epoch ?? 0) + 1;
    await supabase.from("companies").update({ estop_epoch: newEpoch }).eq("id", companyId);

    // 2. Broadcast kill to all machines (V2.2: include estop_epoch for ACK protocol)
    await supabase.channel(`company:${companyId}`)
      .send({ type: "broadcast", event: "estop", payload: { action: "kill", reason, epoch: newEpoch } });

    // 3. Fire hooks
    await runHooks("estop.activated", { companyId, reason, activatedBy }, supabase);

    // 4. Transition all executing/dispatched/verifying jobs to 'queued'
    // V2.2: Added 'verifying' — verification agents also burn budget and must stop
    await supabase.from("jobs").update({ status: "queued", stuck_count: 0 })
      .eq("company_id", companyId)
      .in("status", ["executing", "dispatched", "verifying"]);

    return { ok: true, message: "Emergency stop activated. All agents will be terminated." };
  }

  if (action === "resume") {
    await supabase.from("companies").update({
      estop_active: false,
      estop_activated_at: null,
      estop_activated_by: null,
      estop_reason: null,
    }).eq("id", companyId);

    await supabase.channel(`company:${companyId}`)
      .send({ type: "broadcast", event: "estop", payload: { action: "resume" } });

    await runHooks("estop.resumed", { companyId, activatedBy }, supabase);

    return { ok: true, message: "Emergency stop lifted. Normal operations resumed." };
  }
}
```

### Local agent: estop handler

```typescript
supabaseChannel.on("broadcast", { event: "estop" }, async (payload) => {
  if (payload.action === "kill") {
    log.warn(`ESTOP received: ${payload.reason}. Killing all active agents.`);
    for (const [jobId, job] of activeJobs) {
      await killTmuxSession(job.sessionName);
      activeJobs.delete(jobId);
    }
    // Don't send JobResult — orchestrator already requeued all jobs
    // Stay connected — wait for resume
  }

  if (payload.action === "resume") {
    log.info("ESTOP lifted. Resuming normal operations.");
    // Send fresh heartbeat with empty jobs array
    // Orchestrator will start dispatching again
  }
});
```

### (V2.1) Machine ACK protocol

After broadcasting estop, the orchestrator expects each online machine to ACK within 30 seconds:

```sql
-- Estop ACK tracking
CREATE TABLE public.estop_acks (
  company_id    UUID NOT NULL REFERENCES companies(id),
  machine_id    UUID NOT NULL REFERENCES machines(id),
  estop_epoch   INTEGER NOT NULL,
  acked_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (company_id, machine_id, estop_epoch)
);
```

The local daemon sends an ACK after killing all sessions:
```typescript
await supabase.from("estop_acks").upsert({
  company_id: companyId,
  machine_id: machineId,
  estop_epoch: payload.epoch,
});
```

A background check (every 10s while estop is active) quarantines non-acking machines:
```sql
-- Machines that haven't ACKed within 30s are marked quarantined
UPDATE machines SET status = 'quarantined'
WHERE company_id = $1 AND status = 'online'
  AND id NOT IN (
    SELECT machine_id FROM estop_acks WHERE company_id = $1 AND estop_epoch = $2
  );
```

Quarantined machines are excluded from dispatch even after estop resumes — they require a fresh heartbeat to re-register.

### What checks the estop flag

Every state-mutating operation in the orchestrator checks `estop_active` before proceeding:
- Dispatch loop: skip if estop active
- Wake service: reject non-manual wakes if estop active
- Scheduler: skip all job creation if estop active
- Webhook handler: enqueue events only (no state mutations) if estop active

### Automatic estop triggers

The `budget-gate` hook can be configured to trigger estop automatically:

```json
{
  "daily_limit_usd": 50,
  "estop_threshold_usd": 100,
  "action_at_limit": "block_dispatch",
  "action_at_threshold": "activate_estop"
}
```

When daily spend exceeds `estop_threshold_usd`, the budget-gate hook calls the estop Edge Function directly. This is the automated "circuit breaker" that prevents runaway costs.

---

## 9. Daemon Restart Recovery (V2)

### The problem

When the local agent daemon restarts (crash, update, `zazig restart`), its in-memory `activeJobs` map is lost. Without recovery, the daemon doesn't know which tmux sessions belong to it, and the orchestrator may think jobs are still running (until heartbeat timeout).

### Design: persisted active-jobs manifest

The local agent writes its active jobs to disk on every state change:

```typescript
const MANIFEST_PATH = path.join(os.homedir(), ".zazigv2", "active-jobs.json");

interface ActiveJobManifest {
  machineId: string;
  updatedAt: string;
  jobs: Array<{
    jobId: string;
    sessionName: string;     // tmux session name
    startedAt: string;
    lane: string;
    role: string;
  }>;
}
```

### Recovery on startup

When the daemon starts:

1. **(V2.2) Orphan session discovery**: Before reading the manifest, scan for ALL tmux sessions matching the `zazig-*` naming convention:
   ```bash
   tmux ls -F '#{session_name}' 2>/dev/null | grep '^zazig-'
   ```
   This catches sessions from a crashed daemon that never wrote the manifest.

2. **Read manifest** from `~/.zazigv2/active-jobs.json`

3. **Cross-reference** manifest + tmux + DB:
   - Session in manifest AND tmux → re-adopt into `activeJobs` map, continue monitoring
   - Session in manifest but NOT in tmux → job died during restart. Report `JobResult { status: "interrupted" }` to orchestrator
   - **(V2.2)** Session in tmux but NOT in manifest → orphan. Query DB for matching job by session name convention. If found and still `executing`, re-adopt. If not found or job already requeued → kill the orphan session immediately (it's burning budget with no oversight).

4. **Send fresh heartbeat** with the reconciled set of active jobs
5. **The orchestrator reconciles**: if it had already requeued a job (because heartbeat timed out), but the daemon now reports the job alive, the orchestrator cancels the requeue and re-associates the job with this machine

This prevents both: (a) orphaned tmux sessions running without monitoring, and (b) unnecessary requeues of jobs that survived the restart.

### Manifest write frequency

The manifest is written:
- When a job is started (added to activeJobs)
- When a job completes (removed from activeJobs)
- On graceful shutdown (SIGTERM handler writes final state)

NOT written on every heartbeat — that would be excessive I/O. If the daemon crashes between a job start and the next manifest write, the worst case is one job that's in tmux but not in the manifest. The heartbeat timeout (2 minutes) handles this — the orchestrator will requeue.

---

## Active Hours

Active hours are enforced via hooks, not as a standalone subsystem. Two built-in hooks handle this:

### `active-hours-gate` (on `job.before_dispatch`)

Blocks job dispatch outside configured hours. Configuration stored in the hook's `config` JSONB:

```json
{
  "start": "08:00",
  "end": "22:00",
  "timezone": "Europe/London",
  "exempt_priorities": [10],
  "exempt_lanes": ["background"]
}
```

Urgent jobs (priority 10) and system lane jobs bypass the gate.

### `active-hours-wake` (on `wake.before_inject`)

Blocks non-urgent agent wakes outside configured hours. Same config format. Exempt reasons: `"manual"`, `"message_inbound"` (human Slack messages always go through).

### Per-role configuration (future)

Active hours could be per-role rather than global. For now, one global config per company is sufficient. If needed later, the hook's `config` can be extended:

```json
{
  "roles": {
    "cpo": { "start": "08:00", "end": "22:00", "timezone": "Europe/London" },
    "junior-engineer": { "start": "00:00", "end": "24:00" }
  }
}
```

---

## How It All Fits Together

### Scenario 1: Nightly bug scan

```
03:00 UTC — pg_cron calls run_scheduler() directly in Postgres
  → scheduler reads scheduled_jobs: "nightly-bug-scan" is due
  → scheduler checks dedup_key: no existing queued/executing job with this key
  → scheduler INSERTs into jobs (lane='main', role='senior-engineer', status='queued')
  → orchestrator picks up queued job
  → orchestrator checks estop_active → false, proceed
  → runHooks('job.before_dispatch', context):
    → active-hours-gate: cron lane is exempt → allow
    → budget-gate: under threshold → allow
    → trust-gate: source is 'scheduled' (internal) → allow
  → dispatch to available machine
  → agent executes, produces report
  → job completes → runHooks('job.completed', context):
    → wake-cpo-on-complete: enqueues agent_event for CPO (trust_level='internal')
    → wake service broadcasts to CPO's machine
  → CPO's local agent coalesces, claims events via RPC
  → cheap-check: events contain actionable content → inject
  → inject succeeds → ack events
  → CPO processes and files findings
```

### Scenario 2: Standup at 9am

```
09:00 Europe/London — pg_cron fires scheduler
  → scheduler reads: "standup-reminder" due, session_mode='relay'
  → scheduler INSERTs into agent_events (target_agent='cpo', reason='scheduled:standup-reminder',
    trust_level='internal')
  → scheduler calls wake-agent Edge Function
  → wake service checks estop_active → false, proceed
  → wake service broadcasts wake:cpo to CPO's machine
  → local agent receives wake, waits 1500ms for coalescing
  → claims agent_events via RPC: finds standup-reminder + any overnight job-complete events
  → cheap-check: standup-reminder is actionable, agent is idle → inject
  → builds combined prompt: "Good morning. You have a standup reminder, plus 2 jobs completed overnight."
  → injects into CPO tmux session → success → acks events
  → CPO runs standup workflow
```

### Scenario 3: GitHub PR merged

```
Developer merges PR #42 on GitHub
  → GitHub sends webhook to /webhooks/github
  → Edge Function verifies HMAC signature → valid, known source → trust_level='authenticated'
  → Checks webhook_deliveries for dedup → new delivery
  → Trusted pipeline: parse pull_request.closed, merged=true, branch="job/fix-auth-bug"
  → Look up job by branch name → find job abc123
  → Update job status → triggers runHooks('job.completed')
  → Hooks fire: wake CPO (trust_level='internal' from hook), log event
```

### Scenario 4: Agent stuck on permission prompt

```
Heartbeat from Tom's machine at 10:30:15
  → jobs[0]: { jobId: "abc", status: "stuck", permissionBlocked: true, toolCallAge: 45 }
  → Orchestrator: stuck_count was 1, now 2. Still under threshold (3).

Heartbeat at 10:30:45
  → jobs[0]: still stuck, permissionBlocked: true
  → Orchestrator: stuck_count = 3. Threshold reached.
  → runHooks('job.stuck'): slack-notify-stuck fires → "Agent stuck on permission prompt for job abc on toms-macbook"
  → Orchestrator kills tmux session, requeues job with stuck_context
```

### (V2) Scenario 5: Budget runaway → Emergency stop

```
14:00 — Orchestrator dispatches job xyz
  → budget-gate hook checks: daily spend = $47 (under $50 limit) → allow
  → agent starts executing, makes many API calls

14:15 — Next dispatch attempt for job uvw
  → budget-gate hook checks: daily spend = $52 (over $50 limit) → block dispatch
  → job uvw stays queued

14:30 — Heartbeat-driven budget poll
  → budget-gate detects: daily spend = $98 (approaching $100 estop threshold)
  → logs warning

14:35 — Budget crosses $100
  → budget-gate calls /functions/v1/estop with action='activate'
  → estop Edge Function: sets estop_active=true, increments estop_epoch, broadcasts kill to all machines
  → all local agents: kill all tmux sessions immediately, send estop ACK with epoch
  → orchestrator: transitions all executing/dispatched/verifying jobs to 'queued'
  → hooks: slack notification to all humans "EMERGENCY STOP: daily budget exceeded $100"
  → background check: any machine that hasn't ACKed within 30s is quarantined
  → everything halts until human reviews and calls estop resume
```

### (V2) Scenario 6: Untrusted webhook

```
Unknown source sends POST /webhooks/custom-integration
  → Edge Function: look up webhook_sources → no matching source registered
  → classify trust → "external"
  → untrusted pipeline: sanitize payload, rate-limit check (ok, under 10/min)
  → enqueue agent_event with trust_level='external'
  → wake service pokes CPO
  → CPO's local agent drains events
  → prompt builder wraps: "[External event — unverified source]: {sanitized payload}"
  → CPO receives prompt, can decide what to do with it (likely: ignore or flag for human)
```

### (V2) Scenario 7: Daemon restart recovery

```
Tom's machine: local agent crashes at 11:00
  → last manifest write was at 10:59 with 2 active jobs

11:00:30 — daemon restarts automatically (systemd/launchd)
  → reads ~/.zazigv2/active-jobs.json: 2 jobs listed
  → checks tmux: session for job-A exists, session for job-B is gone
  → re-adopts job-A into activeJobs map
  → reports job-B as interrupted to orchestrator
  → sends fresh heartbeat: [job-A: executing]
  → orchestrator: job-A was about to timeout (no heartbeat for 30s) — now it's back, cancel requeue
  → orchestrator: job-B is interrupted → transitions to queued for redispatch
```

---

## Migration Plan

### New tables (migration 018 or next available)

1. `scheduled_jobs` — cron schedule definitions (V2.2: `lane` defaults to `'background'`, not `'cron'`)
2. `agent_events` — event queue (V2.1: `claimed_at`, `claimed_by`, `acked_at`, `claim_attempts`, `last_error` for claim/ack semantics)
3. `hooks` — lifecycle hook configuration (Phase 2 — Phase 1 uses hardcoded hooks)
4. `webhook_sources` — external webhook registration (V2.1: `webhook_sources_safe` view excludes `secret`)
5. `webhook_deliveries` — idempotency tracking
6. **(V2.1)** `estop_acks` — per-machine estop acknowledgment tracking
7. **(V2.2)** `daily_spend` — daily API spend accumulator (keyed by company_id + date)
8. `ALTER TABLE jobs ADD COLUMN lane, priority, stuck_count, last_stuck_at`
9. **(V2.1)** `ALTER TABLE jobs ADD COLUMN dispatch_attempt_id, origin_trust_level, origin_event_id, origin_source`
10. **(V2)** `ALTER TABLE companies ADD COLUMN estop_active, estop_activated_at, estop_activated_by, estop_reason`
11. **(V2.1)** `ALTER TABLE companies ADD COLUMN estop_epoch`
12. **(V2)** `ALTER TABLE roles ADD COLUMN stuck_threshold`
13. **(V2.1)** `ALTER TABLE machines ADD COLUMN last_heartbeat_at, heartbeat_payload`

### New Postgres functions (V2.1+: replace Edge Functions where possible)

1. `run_scheduler()` — called directly by pg_cron, replaces scheduler Edge Function
2. `enqueue_agent_event()` — atomic event enqueue with dedup
3. `claim_agent_events()` — atomic claim with `FOR UPDATE SKIP LOCKED`
4. `ack_agent_events()` — mark events as successfully delivered
5. `release_agent_events()` — release failed claims back to pending, DLQ after 3 attempts
6. **(V2.2)** `accumulate_daily_spend()` — atomic upsert for daily budget tracking
7. **(V2.2)** `compute_next_run()` — cron expression / interval → next fire time

### New Edge Functions

1. `wake-agent` — universal wake service (V2: checks estop, V2.1: checks estop via DB flag)
2. `webhooks` — external webhook receiver (V2: trusted/untrusted pipeline, V2.1: rate limit by company+source+IP, V2.2: company resolution via secret lookup)
3. **(V2)** `estop` — emergency stop activate/resume (V2.1: sets estop_epoch, waits for ACKs; V2.2: includes epoch in broadcast payload)
4. **(V2.2)** `heartbeat` — receives HTTP POST from local agents, updates `machines.last_heartbeat_at`, evaluates stuck thresholds, runs `job.stuck` hooks

### Local agent changes

1. **Heartbeat**: Extend payload with `JobHealth[]` and `CpoHealth` (V2: includes `ContextHealth`). V2.1: include `dispatch_attempt_id` per job. **(V2.2)** Send as HTTP POST to `heartbeat` Edge Function.
2. **Wake handler**: New `WakeHandler` class — listens for `wake:*` Realtime events, coalesces, claims `agent_events` via RPC, **(V2)** runs cheap-checks, builds prompt (V2.1: overflow truncation), injects, then acks on success / releases on failure
3. **Config**: Add `wake.coalesce_ms` and `wake.max_batch_size` to `machine.yaml`
4. **(V2) Estop handler**: Listen for `estop` broadcast AND treat HTTP 423 as kill signal. V2.1: send estop ACK after killing sessions.
5. **(V2) Active-jobs manifest**: Persist to `~/.zazigv2/active-jobs.json`, recover on startup by reconciling local tmux sessions against DB state
6. **(V2.1) Recovery poller**: Check for unclaimed events (no recency filter) + clean up stale claims every 60s
7. **(V2.2) Orphan session discovery**: On startup, `tmux ls` → find all `zazig-*` sessions → cross-reference manifest + DB → kill unrecognized sessions

### Shared package changes

1. Add `Heartbeat` type with `JobHealth`, `CpoHealth`, and `ContextHealth` to `messages.ts`
2. Add `WakeEvent` type to `messages.ts`
3. **(V2)** Add `TrustLevel` type to `messages.ts`
4. **(V2)** Add `EstopEvent` type to `messages.ts`
5. **(V2.1)** Add `dispatch_attempt_id` to `JobDispatch`, `JobHealth`, and `JobResult` types
6. **(V2.2)** Add `tokenUsage` to `JobResult` type (input/output token counts for budget tracking)

---

## Wake Recovery Poller

Both V1 reviewers flagged that the wake path depends on Supabase Realtime broadcast — if the poke is missed (network blip, daemon restart), events rot in the queue. The fix is a periodic recovery poller on the local agent.

### Design

Every 60 seconds, the local agent runs a lightweight check:

```sql
-- V2.1: No recency filter — catches all undrained events regardless of age.
-- V2 had a 10-minute window that could leave events rotting if daemon was down longer.
SELECT count(*) FROM agent_events
WHERE target_agent = ANY($1)   -- agents hosted on this machine
  AND company_id = $2
  AND acked_at IS NULL
  AND expired_at IS NULL
  AND claimed_at IS NULL;       -- V2.1: only unclaimed events (claimed ones are being processed)
```

If count > 0, trigger the coalesced wake handler as if a Realtime poke arrived. This ensures events are eventually claimed and acked even if all Realtime broadcasts were lost.

**(V2.1) Stale claim cleanup** also runs in this poller:
```sql
-- Release claims older than 5 minutes (claiming daemon likely crashed)
UPDATE agent_events SET claimed_at = NULL, claimed_by = NULL
WHERE claimed_at < now() - interval '5 minutes' AND acked_at IS NULL AND expired_at IS NULL;
```

**Cost**: Two lightweight queries per minute. No overhead when there are no pending events.

---

## Graceful Yield on Shutdown

When the local agent receives SIGTERM (laptop lid close, `zazig stop`, process kill):

1. **Immediately** broadcast slot release: update all machine slots to `available = 0` in Supabase
2. **For each active job**: send `JobResult { status: "interrupted", reason: "machine_shutdown" }` to orchestrator
3. **(V2)** Write final active-jobs manifest to disk (for restart recovery)
4. **Orchestrator**: transitions interrupted jobs to `queued` (requeue, not failed)
5. **Do NOT wait** for agents to finish — SIGTERM gives a 10s window, use it for cleanup messages only

This prevents the 2-minute heartbeat timeout from blocking requeue. The machine's slots are freed immediately.

### Implementation

```typescript
process.on('SIGTERM', async () => {
  log.info('Graceful shutdown initiated');
  // Write manifest for restart recovery (V2)
  await writeActiveJobsManifest();
  // Release slots immediately
  await supabase.from('machines').update({ status: 'offline' }).eq('id', machineId);
  // Notify orchestrator about all active jobs
  for (const [jobId, job] of activeJobs) {
    await broadcastJobResult(jobId, { status: 'interrupted', reason: 'machine_shutdown' });
  }
  // Give 2s for messages to send, then exit
  setTimeout(() => process.exit(0), 2000);
});
```

---

## Split-Brain Protection

If the cloud marks a machine dead (missed heartbeats due to transient network drop) but the local daemon is still running agents, the orchestrator will requeue and re-dispatch those jobs → duplicate execution → blown API budget.

### Design: local agent self-termination

The local agent monitors its own connection health:

1. Track `lastHeartbeatAcked` — timestamp of last successful heartbeat round-trip
2. If `now() - lastHeartbeatAcked > 90 seconds` (3 missed heartbeats):
   - Log: "Lost contact with orchestrator for 90s. Self-terminating active jobs."
   - Kill all active agent tmux sessions
   - **(V2)** Write manifest with empty jobs array (so restart recovery doesn't re-adopt killed sessions)
   - Do NOT requeue (the orchestrator will handle that when it sees the machine as dead)
3. Continue attempting to reconnect. When reconnection succeeds:
   - Send fresh heartbeat with empty `jobs` array
   - Orchestrator re-evaluates slot availability

This ensures **the local daemon and the cloud agree** on whether agents are running. No zombie agents.

---

## Open Questions

1. **Hook execution location**: Should check hooks run in the Edge Function that triggers them (inline), or as separate Edge Function calls? Inline is simpler but couples hook logic to orchestrator code. Separate is more composable but adds latency.
2. **Event queue growth**: With 30m pipeline-health checks, 50 events per agent cap may not be enough for busy companies. Monitor and adjust.
3. **pg_cron availability**: Supabase's pg_cron is available on Pro plans. Verify our plan supports it. Fallback: use a scheduled Edge Function via external cron (e.g., GitHub Actions cron trigger).
4. **Heartbeat cost**: Per-job health checking adds overhead to each heartbeat cycle. Profile the tmux capture + parse cost on machines with 3+ active agents.
5. **(V2) Context health accuracy**: Token estimation from tmux output is necessarily approximate. May need Claude Code to expose context usage via a structured output (feature request or MCP tool).
6. **(V2) Estop resume safety**: After estop, should the orchestrator re-dispatch all queued jobs automatically, or wait for human to explicitly approve each? Current design: auto-resume, but could add a `resume_mode: "auto" | "manual"` flag.
7. **(V2) Cheap-check false negatives**: If cheap-checks suppress too aggressively, agents miss actionable events. Need a monitoring dashboard for suppression rates and a bypass flag (`priority: 1` always passes cheap-checks).

---

## V1 Second Opinions (preserved for reference)

### Codex (gpt-5.3-codex, xhigh reasoning)

**10 findings, severity-ordered (3 critical, 3 high, 4 medium) — all resolved in V1:**

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | Critical | `agent_events.priority` as TEXT produces wrong lexical sort | Changed to `INTEGER DEFAULT 0` with -1/0/1 values |
| 2 | Critical | Drain query missing `expired_at IS NULL` | Added filter to drain and peek queries |
| 3 | Critical | Drain described as non-atomic — duplicates on crash | Rewrote to atomic CTE with `FOR UPDATE SKIP LOCKED` |
| 4 | High | Hooks fail-open on timeout | Added per-hook `fail_policy` column, default `closed` |
| 5 | High | Scheduler query missing `FOR UPDATE SKIP LOCKED` | Added lock clause |
| 6 | High | Wake path relies entirely on Realtime broadcast | Added Wake Recovery Poller |
| 7 | Medium | Webhook "return 200 always" | Changed to 200-on-success, 500-on-failure |
| 8 | Medium | Webhook dedup key not source-scoped | Changed to composite PK `(source, delivery_id)` |
| 9 | Medium | `WakeRequest.priority` as string union | Changed to integers |
| 10 | Medium | 90s stuck threshold may be too aggressive | Made configurable per-role |

### Gemini (gemini-3.1-pro-preview)

Key findings: coalescing window too tight (→ 1500ms), fail-closed default (→ per-hook policy), split-brain risk (→ self-termination), graceful shutdown (→ immediate slot release), throttle vs debounce (→ explicit throttle), wake recovery (→ periodic poller). All resolved in V1.

---

## V2 Second Opinions (incorporated as V2.1)

### Codex (gpt-5.3-codex, xhigh reasoning)

**12 findings, severity-ordered (3 critical, 5 high, 3 medium, 1 low) — all resolved in V2.1:**

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | Critical | Drain-before-inject guarantees silent event loss on inject failure | Replaced with `pending → claimed → acked` semantics with retry + DLQ |
| 2 | Critical | No dispatch attempt fencing — stale agents can corrupt requeued job state | Added `dispatch_attempt_id` with compare-and-set on all state transitions |
| 3 | Critical | `webhook_sources.secret` exposed via permissive `USING (true)` RLS | Created `webhook_sources_safe` view; secret only accessible to service_role |
| 4 | High | Scheduler multi-step fire not transactionally idempotent | Each fire wrapped in per-job `BEGIN...EXCEPTION` block in Postgres function |
| 5 | High | Wake recovery poller ignores events older than 10 minutes | Removed recency filter — checks all unclaimed events |
| 6 | High | Notify hooks `Promise.allSettled` without await — Edge Function can exit first | Changed to `await Promise.allSettled` with bounded timeout |
| 7 | High | Scheduler INSERT doesn't set lane — defaults to `main` but scenario expected `cron` | Added `lane` column to `scheduled_jobs`; scheduler writes it on insert |
| 8 | High | Estop broadcast is one-shot with no delivery guarantee or ACK | Added `estop_epoch`, machine ACK protocol, quarantine for non-acking machines |
| 9 | Medium | Trust provenance dropped during event → job transformation | Added `origin_trust_level`, `origin_event_id`, `origin_source` to jobs |
| 10 | Medium | Heartbeat liveness in Edge Function memory won't survive redeploys | Persisted to `machines` table with `last_heartbeat_at` + TTL |
| 11 | Medium | Webhook ingestion under-specified (company resolution, sanitize logic, rate limit keying) | Tightened rate limit to `company+source+IP`; specified company binding from secret lookup |
| 12 | Low | Full hooks engine + 3 lanes overbuilt for 2 machines / 4 agents | Simplified to 2 lanes; hooks start as hardcoded functions, promote to DB-configurable later |

### Gemini (gemini-3.1-pro-preview)

**10 findings, severity-ordered (4 critical, 3 high, 3 medium) — all resolved in V2.1:**

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | Critical | PostgREST doesn't support `FOR UPDATE SKIP LOCKED` via standard client queries | All queue operations implemented as Postgres stored procedures (RPC) |
| 2 | Critical | pg_cron → Edge Function HTTP hop adds unnecessary latency to scheduler | Scheduler rewritten as Postgres function called directly by pg_cron |
| 3 | Critical | Estop via Realtime-only broadcast has no delivery guarantee | Added DB-level estop check (`assertNotFrozen`) on every Edge Function call; 423 as kill signal |
| 4 | Critical | Untrusted webhook pipeline = denial-of-wallet attack vector | Rate limit enforced at Edge Function layer BEFORE any DB writes |
| 5 | High | 40 coalesced events can blow out agent context window | Added prompt overflow strategy: newest N events in full + summary of overflow |
| 6 | High | Blocking lifecycle hooks with slow external APIs can hang daemon | Hook timeout (5s) + per-hook `fail_policy` already specified; reinforced as hard system timeout |
| 7 | High | Local JSON manifest vs stateless daemon debate | Kept both: manifest for local tmux reconciliation, DB query for cloud state. Daemon is not fully stateless. |
| 8 | Medium | Context health reporting ambiguous — risk of "cognitive health" speculation | Restricted to deterministic metrics: process uptime, token estimate, compaction events, error rate |
| 9 | Medium | Idempotency table (webhook_deliveries) will grow unbounded | Already has 24h cleanup; confirmed via scheduled job |
| 10 | Medium | 3 lanes overbuilt for current scale | Collapsed to 2 lanes: `main` + `background` |

---

## V2.1 Review (incorporated as V2.2)

### Claude (review-plan walkthrough) + Codex (second opinion on review)

**16 findings (6 blocking, 5 significant, 5 worth noting) — all resolved in V2.2:**

| # | Severity | Finding | Source | Resolution |
|---|----------|---------|--------|------------|
| 1 | Blocking | No Postgres-to-Realtime bridge | Review | Wake Broadcast subsection: Edge Functions broadcast after RPC, scheduler accepts 60s poller |
| 2 | Blocking | Heartbeat receiver unspecified | Review | Heartbeat Receiver subsection: HTTP POST to Edge Function |
| 3 | Blocking | Budget tracking undesigned | Review | Budget Tracking subsection: `daily_spend` table + `accumulate_daily_spend` RPC |
| 4 | Blocking | Lane model contradiction (`scheduled_jobs.lane` defaults `'cron'`) | Codex | Default changed to `'background'`, seed data sets `'main'` explicitly |
| 5 | Blocking | Orphaned tmux sessions invisible to recovery | Review + Codex | Orphan session discovery on startup: `tmux ls` → cross-reference |
| 6 | Blocking | Cron `next_run_at` is a placeholder | Review + Codex | Pre-compute on create/update + `compute_next_run()` function |
| 7 | Significant | Dual injection paths (Slack vs events) | Review | Note added: unify in messaging design, Slack → `event_type='message'` |
| 8 | Significant | Estop misses `verifying` state | Review (Codex narrowed) | Added `verifying` to estop transition |
| 9 | Significant | Retention SQL references `drained_at` | Review | Updated to `acked_at` |
| 10 | Significant | Estop epoch missing from broadcast | Codex | Added `epoch` to payload, increment before broadcast |
| 11 | Significant | Stale "drained" language in cheap-check | Codex | Updated to claim/ack terminology |
| 12 | Worth noting | Company resolution for webhooks | Review | Lookup company_id from webhook secret |
| 13 | Worth noting | Phase 1 `runHooks` code missing | Review | Added hardcoded hooks code sample |
| 14 | Worth noting | No observability design | Review | Deferred to implementation card |
| 15 | Worth noting | Architecture diagram showed 3 lanes | Internal | Updated to 2 lanes |
| 16 | Worth noting | Active hours exempt lane = `system` | Internal | Changed to `background` |

___


## What Changed in V2

V1 designed seven subsystems for triggers and events. V2 adds five capabilities surfaced by cross-ecosystem research on OpenClaw, NanoClaw, and ZeroClaw gateway architectures:

| # | Gap | Source | What V2 adds |
|---|-----|--------|-------------|
| 1 | All triggers treated equally — no trust classification | OpenAI research: "distinct ingestion pipelines for trusted vs untrusted triggers" | Trust levels on events + split webhook pipeline |
| 2 | No cloud-side kill switch | ZeroClaw `estop` pattern, Gemini research | Emergency stop mechanism |
| 3 | Every wake costs an LLM turn, even for empty/duplicate events | OpenClaw heartbeat pre-flight emptiness check | Cheap-check escalation before agent wake |
| 4 | CPO context health invisible to orchestrator | OpenClaw compaction stalls (documented failure mode) | Context health in heartbeat |
| 5 | No controls on who can create triggers | OpenAI research: "trigger creation is a persistence mechanism that outlives a session" | Trigger creation privileges (RLS + audit) |

All V1 content is preserved. V1 fixes from Codex + Gemini review are already incorporated.

## What Changed in V2.1

V2 was reviewed by both Codex and Gemini. 15 fixes incorporated (6 critical, 5 high, 4 medium):

| # | Severity | Finding | Source | What V2.1 adds |
|---|----------|---------|--------|----------------|
| 1 | Critical | Drain-before-inject guarantees silent event loss on inject failure | Codex | `pending → claimed → acked` event semantics with retry + DLQ |
| 2 | Critical | No dispatch attempt fencing — stale agents can corrupt requeued job state | Codex | `dispatch_attempt_id` on jobs with compare-and-set transitions |
| 3 | Critical | `webhook_sources.secret` exposed via permissive RLS policy | Codex | Service-role-only read for secret column |
| 4 | Critical | PostgREST doesn't support `FOR UPDATE SKIP LOCKED` | Gemini | All queue operations via Postgres stored procedures (RPC) |
| 5 | Critical | pg_cron → Edge Function HTTP hop is unnecessary latency | Gemini | Scheduler as Postgres function called directly by pg_cron |
| 6 | Critical | Estop broadcast is one-shot with no delivery guarantee | Both | DB-level estop check on every API call + estop_epoch + machine ACK |
| 7 | High | Scheduler multi-step fire not transactionally idempotent | Codex | Transaction + unique constraint `(scheduled_job_id, fire_bucket)` |
| 8 | High | Wake recovery poller ignores events older than 10 minutes | Codex | Removed recency filter — checks all undrained events |
| 9 | High | Notify hooks fire-and-forget — Edge Function can terminate first | Codex | Await with bounded timeout budget |
| 10 | High | Scheduler doesn't set lane explicitly — defaults to wrong lane | Codex | `scheduled_jobs.lane` column, scheduler writes it on insert |
| 11 | High | 3 lanes + dynamic hooks overbuilt for 2 machines / 4 agents | Both | Simplified to 2 lanes (`main` + `background`), hardcoded hooks initially |
| 12 | Medium | 40 coalesced events can blow out agent context window | Gemini | Prompt overflow strategy with truncation/summarization |
| 13 | Medium | Trust provenance dropped during event → job transformation | Codex | `origin_trust_level`, `origin_event_id`, `origin_source` on jobs |
| 14 | Medium | Heartbeat liveness in Edge Function memory won't survive redeploys | Codex | DB-persisted machine liveness with TTL |
| 15 | Medium | Untrusted webhook rate limiting too coarse (source-only key) | Both | Edge-level rate limiting by `company + source + IP` |

## What Changed in V2.2

V2.1 was reviewed via structured walkthrough (review-plan) and validated by Codex second opinion. 16 fixes incorporated (6 blocking, 5 significant, 5 worth noting):

| # | Severity | Finding | Source | What V2.2 adds |
|---|----------|---------|--------|----------------|
| 1 | Blocking | No Postgres-to-Realtime bridge — events sit in queue until 60s poller | Review | Callers broadcast after RPC; scheduled events accept 60s poller latency |
| 2 | Blocking | Heartbeat receiver unspecified — no cloud-side processor defined | Review | Heartbeat Receiver subsection: HTTP POST to Edge Function |
| 3 | Blocking | Budget tracking undesigned — budget-gate hook is non-functional | Review | Budget Tracking subsection: `daily_spend` table + accumulator |
| 4 | Blocking | Lane model contradiction — `scheduled_jobs.lane` defaults `'cron'` but CHECK only allows `'main'\|'background'` | Codex | Default changed to `'background'`, all `'cron'` references removed |
| 5 | Blocking | Orphaned tmux sessions invisible to restart recovery | Review + Codex (upgraded) | Orphan session discovery on daemon startup |
| 6 | Blocking | Cron `next_run_at` is a placeholder — scheduler is a no-op without it | Review + Codex (upgraded) | Pre-compute `next_run_at` on create/update, scheduler just checks `<= now()` |
| 7 | Significant | Dual injection paths — Slack messages vs events queue can race | Review | Note: unify in messaging design — Slack messages enqueue as `event_type='message'` |
| 8 | Significant | Estop misses `verifying` state — verification agents continue burning | Review (Codex narrowed: `deploying` doesn't exist) | Added `verifying` to estop transition |
| 9 | Significant | Retention SQL references renamed `drained_at` column | Review | Updated to `acked_at` |
| 10 | Significant | Estop epoch missing from broadcast payload — ACK protocol broken | Codex | Added `epoch` to broadcast payload, increment before broadcast |
| 11 | Significant | Stale "drained" language in cheap-check section | Codex | Updated to claim/ack terminology |
| 12 | Worth noting | Company resolution for webhooks ambiguous | Review | Lookup company_id from webhook secret |
| 13 | Worth noting | Phase 1 hardcoded `runHooks` code sample missing | Review | Added Phase 1 code alongside Phase 2 |
| 14 | Worth noting | No observability design | Review | Deferred to implementation card |
| 15 | Worth noting | Architecture diagram showed 3 lanes | Internal | Updated to 2 lanes |
| 16 | Worth noting | Active hours exempt lane referenced `system` | Internal | Changed to `background` |
