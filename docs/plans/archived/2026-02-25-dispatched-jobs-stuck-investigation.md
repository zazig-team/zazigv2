# Investigation: Jobs Stuck at `dispatched` on Live Machine

**Date:** 2026-02-25
**Author:** CTO (automated investigation)
**Reviewed by:** Codex (gpt-5.3-codex) + Gemini (gemini-3.1-pro-preview)
**Status:** Findings confirmed, remediation proposed

## One-Sentence Verdict

Jobs are dispatched to the daemon via fire-and-forget Realtime broadcast — if the daemon misses the message, the job is orphaned permanently with no self-healing mechanism.

---

## Situation

11 jobs (8 combine, 3 bug) are stuck at `dispatched` status on machine `9b81671b` (toms-macbook-pro-2023-local). The machine is alive, heartbeating normally (last: 21:50 UTC), and reports 1 available claude_code slot. The daemon process is running (PID 78392, started 17:18 UTC). The two other machines (macbook-pro-5-local) are offline since 12:37 UTC.

The oldest stuck job has been at `dispatched` for ~45 minutes. No jobs have completed on this machine during that window, despite continuous heartbeats.

## Root Cause Chain

### The Dispatch Protocol (orchestrator/index.ts)

1. **Slot decrement** (lines 597-613): Orchestrator atomically decrements `slots_claude_code` via CAS guard (`.gt(slotColumn, 0)`), sets `machine_id` and `status = 'dispatched'` on the job. This is committed to the DB.

2. **Realtime broadcast** (lines 731-755): Orchestrator sends a `StartJob` message to channel `agent:{machine.name}` via Supabase Realtime. This is fire-and-forget — no delivery confirmation, no acknowledgement, no retry.

3. **Daemon reception** (connection.ts:325-329): The daemon listens on its machine-specific channel. When a message arrives, `handleIncomingPayload()` validates it via `isOrchestratorMessage()`. If valid, it dispatches to the appropriate handler. If invalid, it logs a warning and **silently returns** — no `JobFailed` sent back.

### Why Messages Are Lost

The DB commit (step 1) happens **before** the Realtime broadcast (step 2). If the daemon is not actively subscribed at the moment of broadcast — due to:

- Realtime channel reconnection (Supabase Realtime has known reconnection gaps)
- WebSocket hiccup
- Daemon restart (the subscription re-establishes, but messages sent during the gap are lost)
- Supabase edge function cold start timing

...the message is dropped. The job remains at `dispatched` with a `machine_id`, but the daemon never received it.

### Why There's No Recovery

Three mechanisms exist for recovery, but none cover this case:

| Mechanism | What it does | Why it doesn't help |
|---|---|---|
| `reapDeadMachines()` | Resets jobs on machines with no heartbeat for 2 min | Machine IS heartbeating — it's alive |
| Daemon startup recovery | On boot, finds `dispatched` jobs assigned to this machine and resets to `queued` | Only runs once at daemon start — not periodic |
| `processFeatureLifecycle()` | Polling fallback for feature status transitions | Operates on feature status, not job dispatch |

**There is no periodic poll for jobs stuck at `dispatched` on a live machine.** Once a Realtime message is lost, the job is permanently orphaned.

### Slot Divergence (Secondary Issue)

When the daemon never receives the `StartJob`:
- The orchestrator's DB has decremented the slot count
- The daemon's in-memory `SlotTracker` was never decremented (it didn't process the message)
- Next heartbeat (every 30s), the daemon overwrites the DB slot count with its in-memory value, restoring capacity
- The orchestrator now sees available slots and can dispatch MORE jobs to the same machine
- But the old dispatched jobs remain orphaned — the orchestrator only dispatches jobs at `queued`, not `dispatched`

This creates a slot leak pattern: slots appear available → more jobs dispatched → more messages potentially lost → more orphaned jobs. The slot count self-heals via heartbeat, but the jobs don't.

### Alternative Hypothesis: Validator Rejection

If the `StartJob` message reaches the daemon but fails validation in `isStartJob()` (validators.ts:84-111), it's silently rejected. Possible causes:

- **Null context** (lines 98-105): `triggerCombining()` correctly sets context, so this shouldn't apply to combine jobs. But other job types (the 3 bug jobs at 21:20, 21:22, 21:45) may have null context if their dispatch path doesn't set it.
- **Invalid model** (line 94): If role-based routing produces a model not in `ALLOWED_MODELS`, the validator rejects. The `job-combiner` role is set to `claude-sonnet-4-6` which IS in the allowed list — but worth verifying at runtime.
- **Missing cardType** (line 91): `"combine"` is in the allowed list.

The silent rejection path produces the same outcome as a lost message — the job stays at `dispatched` forever, the daemon logs a warning but sends no `JobFailed`.

## Evidence Summary

| Signal | Value | Interpretation |
|---|---|---|
| Machine heartbeat | Active (21:50 UTC) | Daemon is running |
| Daemon PID | 78392, started 17:18 UTC | Running for ~4.5 hours |
| Available slots (DB) | 1 claude_code | Slots recovering via heartbeat overwrite |
| Dispatched jobs | 11 (8 combine, 3 bug) | All assigned to same machine |
| Oldest stuck job | 21:12 UTC (~45 min ago) | Well past any reasonable execution time |
| Chris's machines | Offline since 12:37 | Only Tom's machine available for dispatch |
| Recent completions | None visible | Daemon may not be processing ANY jobs |

## Immediate Remediation

Reset the 11 stuck jobs to `queued` with null `machine_id`:

```sql
UPDATE jobs
SET status = 'queued', machine_id = NULL
WHERE status = 'dispatched'
  AND machine_id = '9b81671b-...';  -- full UUID needed
```

This is safe because:
- If the daemon IS actually processing them (unlikely after 45 min), it will fail to update status (CAS guard) and the job will be re-dispatched
- If the daemon is NOT processing them (likely), they'll be picked up on the next orchestrator cycle

**However:** If the root cause is lost Realtime messages, re-queuing will just result in the same jobs being dispatched and lost again. A daemon restart may be needed to re-establish the Realtime subscription cleanly.

## Proposed Permanent Fix: Dispatched Job Recovery Poller

Add to the orchestrator's main polling loop (alongside `processFeatureLifecycle()`):

```typescript
async function recoverStuckDispatched(supabase: SupabaseClient): Promise<void> {
  // Find jobs dispatched >5 minutes ago on machines that ARE alive
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: stuckJobs } = await supabase
    .from("jobs")
    .select("id, machine_id")
    .eq("status", "dispatched")
    .lt("updated_at", fiveMinAgo)
    .limit(50);

  for (const job of (stuckJobs ?? [])) {
    const { data: machine } = await supabase
      .from("machines")
      .select("last_heartbeat")
      .eq("id", job.machine_id)
      .single();

    if (!machine) continue;

    const heartbeatAge = Date.now() - new Date(machine.last_heartbeat).getTime();

    if (heartbeatAge < MACHINE_DEAD_THRESHOLD_MS) {
      // Machine is alive but job is stale — re-queue
      console.log(`[orchestrator] recoverStuckDispatched: job ${job.id} on live machine >5min — re-queuing`);
      await supabase
        .from("jobs")
        .update({ status: "queued", machine_id: null })
        .eq("id", job.id)
        .eq("status", "dispatched"); // CAS guard
    }
    // Dead machines handled by reapDeadMachines()
  }
}
```

**Trade-off:** Creates a retry loop if Realtime is consistently broken. Acceptable — it'll succeed eventually when the channel recovers. But the real fix is making dispatch reliable.

## Proposed Longer-Term Fix: Daemon-Side Polling

Instead of relying solely on Realtime push, the daemon should periodically poll for jobs assigned to its machine:

```typescript
// Every 30s alongside heartbeat
const { data: myJobs } = await supabase
  .from("jobs")
  .select("*")
  .eq("machine_id", myMachineId)
  .eq("status", "dispatched");

for (const job of myJobs) {
  if (!this.activeJobs.has(job.id)) {
    this.handleStartJob(buildStartJobFromRow(job));
  }
}
```

This makes dispatch reliable regardless of Realtime delivery. Realtime becomes an optimization (faster pickup) rather than the sole path.

## Risk Assessment

| Risk | Severity | Likelihood | Notes |
|---|---|---|---|
| Features stuck at `combining` indefinitely | High | **Happening now** — 7 features | Blocked on combine jobs completing |
| Slot exhaustion preventing new work | Low | Mitigated | Heartbeat overwrites restore slots |
| Data loss from orphaned jobs | Low | Unlikely | Jobs exist in DB, just not progressing |
| Cascade if all 11 jobs re-queue simultaneously | Medium | Possible | 11 jobs hitting a 1-slot machine |

## Recommendations (Ordered by Priority)

1. **Reset stuck jobs** + restart daemon to re-establish Realtime subscription
2. **Fix CAS guard** — check affected row count at index.ts:629, don't broadcast if 0
3. **Kill silent rejections** — daemon validator should write `status='failed'` back to DB instead of silently dropping
4. **Daemon-side polling** — primary fix. Every 30s before heartbeat, daemon queries for jobs assigned to its machine_id with `status='dispatched'` and processes any it finds. Makes Realtime an optimisation, not the sole delivery path
5. **Lightweight orchestrator poller** — safety net for when daemon is down/crashed/laptop sleeping but machine appears alive. `recoverStuckDispatched()` with a 10-minute threshold (not 5) to avoid yanking slow-but-running jobs. Solvable race condition, fixable N+1 — worth keeping as defence in depth because daemon-side polling only works if the daemon is running
6. **Dynamic slot calculation** — replace increment/decrement with `max_slots - count(jobs WHERE machine_id = me AND status IN ('dispatched', 'running'))`. Eliminates drift
7. **Consider Postgres Changes subscription** — replace fire-and-forget broadcast with daemon subscribing to `UPDATE on jobs WHERE machine_id = me`. Uses Supabase's replication stream which handles reconnects better
8. **Drop JobAck retry** — incompatible with the 4-second listen window on a serverless function

## Codex Second Opinion (gpt-5.3-codex)

Codex independently verified the codebase and confirmed the core diagnosis. Key additional findings:

1. **JobAck already exists but is ignored.** The daemon sends a `job_ack` message after receiving a StartJob (executor.ts:256), but the orchestrator's handler at index.ts:820 only logs it — no state transition, no retry cancellation. The plumbing for an ack-based retry is half-built.

2. **Optimistic lock doesn't check affected rows.** At index.ts:617, the dispatch uses `.eq("status", "queued")` as a CAS guard, but at index.ts:629 it only checks for errors, not whether any rows were affected. If another orchestrator instance already dispatched the job, this one still proceeds to broadcast — potentially sending a duplicate StartJob for a job already on another machine.

3. **Additional validator failure modes.** Beyond null context and invalid model, `isStartJob` can also reject on: oversize context (validators.ts:105), protocol version mismatch (validators.ts:88). All produce silent rejection.

4. **Agent DB writes are best-effort.** The executor's status update calls (executor.ts:1108, 1136, 1170) don't retry on failure. If the orchestrator's 4-second listen window misses the Realtime broadcast AND the DB write fails, the job is stranded with no record of completion.

5. **Reset safety note.** When resetting stuck jobs, also clear `started_at` (not just `machine_id`) to match the daemon's startup recovery pattern at index.ts:239. CAS guard with `WHERE status='dispatched'` prevents race conditions with actively executing jobs.

## Gemini Second Opinion (gemini-3.1-pro-preview)

Gemini confirmed the root cause diagnosis but **disagreed with the fix prioritisation** and identified correctness issues in Fix 2 and Fix 4.

### Corrections to Proposed Fixes

1. **Fix 1 (reset stuck jobs) has a slot leak.** Resetting `machine_id = NULL` without refunding the slot to the machine table leaks capacity. The SQL must also increment `slots_claude_code` on the machine — or rely on the next heartbeat overwrite to correct it (which our evidence shows already happens). *CTO note: in our system the heartbeat already overwrites DB slots from in-memory state every 30s, so the slot leak is self-correcting. But Gemini's point stands for systems without this reconciliation.*

2. **Fix 2 (orchestrator poller) has a race condition.** If a daemon received the job but is slow (>5 min to transition to `running`), the poller yanks it away and re-queues — causing duplicate execution. Also flagged: N+1 query pattern (machine heartbeat lookup inside a loop).

3. **Fix 4 (JobAck retry) is architecturally unsound.** The orchestrator is an edge function with a 4-second listen window. Building an ACK-wait into a short-lived serverless function means hanging executions and false timeouts if the ACK arrives at second 5.

### Gemini's Recommended Priority Order

1. **Today:** Reset stuck jobs + fix the CAS guard (check affected row count at index.ts:629, don't broadcast if 0) + make daemon validator write `status='failed'` instead of silent rejection
2. **This week:** Daemon-side polling (our Fix 3) — promotes this from "next sprint" to "this week". This replaces both Fix 2 and Fix 4. Every 30s before heartbeat, daemon queries `SELECT id FROM jobs WHERE machine_id = me AND status = 'dispatched'` and processes any it finds.
3. **Drop:** Fix 2 (orchestrator poller) and Fix 4 (JobAck retry) — both are superseded by daemon-side polling.

### Architectural Recommendations

1. **Consider Postgres Changes over Realtime broadcast.** Instead of fire-and-forget broadcasts, have daemons subscribe to Postgres Changes (`UPDATE on jobs WHERE machine_id = me`). This uses Supabase's replication stream which handles reconnects and missed messages better than generic Realtime.

2. **Calculate slots dynamically instead of increment/decrement.** A machine's capacity should be `max_slots - count(jobs WHERE machine_id = me AND status IN ('dispatched', 'running'))`. Eliminates slot drift entirely. If caching is needed for performance, periodically recalculate from the jobs table.

## Synthesis: Where the Models Agree and Disagree

Three models reviewed this investigation (Claude, Codex gpt-5.3, Gemini 3.1 Pro). All three confirmed the root cause diagnosis. The disagreements are on fix strategy.

### Universal Agreement

- Root cause is fire-and-forget Realtime dispatch with no recovery path
- Daemon-side polling is the correct primary fix
- Silent validator rejection must be replaced with explicit failure
- CAS guard needs row-count checking
- Dynamic slot calculation is the right long-term direction

### Disagreement: Keep or Drop the Orchestrator Poller

**Gemini says drop it** — race condition risk (yanking slow jobs), N+1 queries, superseded by daemon-side polling.

**CTO verdict: keep it, but with a higher threshold.** Daemon-side polling only works when the daemon is running. If a laptop sleeps, daemon crashes without clean exit, or the process is killed, jobs assigned to that machine need server-side recovery. `reapDeadMachines()` covers truly dead machines, but there's a gap between "machine is heartbeating" and "daemon is actually processing jobs" — exactly the failure mode we observed. A 10-minute threshold (not 5) eliminates the race condition concern — no legitimate job takes 10 minutes to transition from `dispatched` to `executing`. The N+1 is trivially fixable with a batch query or JOIN.

### Disagreement: Slot Leak on Reset

**Gemini flags** that resetting `machine_id = NULL` without refunding slots leaks capacity.

**CTO verdict: not a concern in our system.** The daemon's heartbeat overwrites DB slot counts from in-memory state every 30s. The in-memory `SlotTracker` was never decremented for these orphaned jobs (the daemon never received them), so the heartbeat naturally restores correct capacity. Evidence confirms this — the machine shows 1 available slot despite 11 orphaned jobs. The slot self-heals; the job doesn't. That's the bug.

## Related Issues

- **Orchestrator lifecycle polling gaps** (feature `bc9e2a0f`): `processFeatureLifecycle()` missing `combining → verifying` and three other transitions. In pipeline at `ready_for_breakdown`.
- **Clean slate on re-breakdown** (feature `33e0b29e`): Old completed breakdown jobs cause idempotency check to skip re-breakdown. In pipeline at `ready_for_breakdown`.
- **Null-context silent rejection** (feature `2e9a34a6`): Jobs dispatched with null context are silently rejected by the daemon validator. Currently at `building`.

## Files Involved

- `supabase/functions/orchestrator/index.ts` — dispatch logic, polling loop, reapDeadMachines
- `packages/local-agent/src/connection.ts` — Realtime subscription, message handling, heartbeat
- `packages/local-agent/src/executor.ts` — job execution, context resolution
- `packages/shared/src/validators.ts` — StartJob validation (silent rejection path)
