# Pipeline Dispatch & Realtime — Bug Report

**Date:** 2026-03-06 (updated, originally drafted 2026-03-05)
**For:** Chris (engineering fix)
**From:** CPO (Tom's agent) + Gemini second opinion
**Severity:** P0 — pipeline-blocking

---

## TL;DR

Three bugs found, two confirmed, one with code-level fix recommendations. The March 5 incident (jobs stuck in `dispatched` for 1.5h) was **NOT** the Realtime reconnect loop — it was the orchestrator dispatching to the wrong machine. The reconnect loop is a separate, recurring bug that also needs fixing.

---

## Bug 1: Wrong Machine Dispatch (CONFIRMED — caused the March 5 incident)

### What happened

Two jobs were created on March 5:
- Breakdown job `bc42b958` (18:41 UTC)
- Pipeline-technician job `2dbfa038` (18:59 UTC)

Both were dispatched to machine `b9233ea4`. **Confirmed: this is Chris's machine, not Tom's.** Tom's daemon (`toms-macbook-pro-2023-local`) was healthy with `inbound=joined` the entire time — it was never the target.

Neither machine executed the jobs. They sat in `dispatched` forever.

### Evidence

- Tom's daemon log: `Channel state: inbound=joined` every 30s from 18:24–19:59 UTC. Zero `Broadcast received` or `start_job` events. Healthy channel, never received anything.
- `machines_online: 2` in pipeline snapshot at dispatch time
- `SELECT name FROM machines WHERE id = 'b9233ea4-...'` → Chris's machine (confirmed by Tom)
- No job log files for either job ID in `~/.zazigv2/job-logs/`

### Root cause

The orchestrator's `dispatchQueuedJobs` picks a machine candidate based on available slots. It picked Chris's machine. Chris's daemon either wasn't running, wasn't listening for this company's jobs, or had its own issues.

### What needs fixing

The orchestrator should verify the machine is actually reachable before (or shortly after) marking a job as `dispatched`. Options:

**Option A: Require JobAck within timeout.** After broadcasting `start_job`, wait N seconds for a `JobAck` response. If none arrives, mark the job back to `queued` and try another machine. The daemon already sends `JobAck` — the orchestrator just doesn't check for it.

**Option B: Tighten stale job reaping.** `reapStaleJobs` currently uses a 2-minute threshold. For `dispatched` jobs (not yet `executing`), reduce to 30 seconds. If a job hasn't moved to `executing` within 30s of dispatch, the machine probably never got it.

**Option C: Machine health validation at dispatch time.** Before dispatching, verify `last_heartbeat` is within the last 30s (not just "online" status). A machine can be marked "online" in the DB but actually be in the reconnect loop or otherwise unhealthy.

---

## Bug 2: Realtime Reconnection Loop (CONFIRMED — recurring, separate from Bug 1)

### What happens

The daemon's Realtime inbound channel periodically enters a tight reconnect loop (~1/second) that never self-recovers. Only fix is a daemon restart.

```
WARN [local-agent] Inbound channel closed unexpectedly. Scheduling reconnect.
[local-agent] Reconnecting in 1000ms (attempt #1)...
[local-agent] Connected to outbound channel: orchestrator:commands
[local-agent] Connected to inbound channel: agent:toms-macbook-pro-2023-local:00000000-...
WARN [local-agent] Inbound channel closed unexpectedly. Scheduling reconnect.
```

On March 5, this started at **20:00:00 UTC** (after the dispatch incident) and ran the rest of the day. It's happened at least 4 times across sessions.

### The cycle

1. `cleanupChannels()` removes both channels
2. `connect()` creates fresh channels and subscribes
3. Both channels reach `SUBSCRIBED` → `onBothReady()` fires, resets `reconnectAttempts = 0`
4. **Immediately**, `CLOSED` fires on the inbound channel
5. `scheduleReconnect()` calculates delay = `min(1000 * 2^0, 30000)` = **always 1000ms** (because attempts were just reset)
6. Go to step 1

### Why the backoff never escalates

```typescript
// connection.ts lines 306-345
const onBothReady = (): void => {
  if (inReady && outReady) {
    this.reconnectAttempts = 0;  // ← PREMATURE RESET
    this.startHeartbeat();
  }
};
```

The counter resets the instant both channels subscribe. When `CLOSED` fires milliseconds later, backoff starts from scratch. Always "attempt #1".

### Why CLOSED fires immediately after SUBSCRIBED

Three hypotheses (Claude + Gemini converge):

1. **Channel cleanup race condition** — `removeChannel()` may not fully complete server-side before `connect()` creates channels with the same name. Server sees duplicate → closes new one. Cleanup errors are swallowed (`catch { }`), hiding evidence.

2. **Server-side channel limits** — Supabase project may hit concurrent channel cap. Two permanent channels + orchestrator's ephemeral channels (created every 10s) may exceed limit.

3. **WebSocket transport degradation** — Under load, the shared WebSocket degrades. The `supabase-js` multiplexer closes individual channels when the transport is unhealthy.

### Fixes

#### Fix 2a: Stability Window for Backoff Reset (MUST DO)

Don't reset `reconnectAttempts` on SUBSCRIBED. Wait for 30s of stability first.

```typescript
const onBothReady = (): void => {
  if (inReady && outReady) {
    this.startHeartbeat();
    // Only reset after 30s of stable connection
    this.stabilityTimer = setTimeout(() => {
      this.reconnectAttempts = 0;
    }, 30_000);
  }
};
```

Clear the timer in `scheduleReconnect()`:

```typescript
private scheduleReconnect(): void {
  if (this.stabilityTimer) {
    clearTimeout(this.stabilityTimer);
    this.stabilityTimer = null;
  }
  // ... rest of existing logic
}
```

**Effect:** Backoff escalates properly: 1s → 2s → 4s → 8s → 16s → 30s max. Tight loop becomes a slow retry.

#### Fix 2b: Stop Swallowing Cleanup Errors (MUST DO)

```typescript
// CURRENT — hides problems
try { await this.supabase.removeChannel(this.outChannel); } catch { }

// FIX — log them
try {
  await this.supabase.removeChannel(this.outChannel);
} catch (err) {
  console.warn(`[local-agent] removeChannel(outbound) failed:`, err);
}
```

#### Fix 2c: Delay Between Cleanup and Connect (SHOULD DO)

```typescript
this.reconnectTimer = setTimeout(async () => {
  this.reconnectTimer = null;
  await this.cleanupChannels();
  await new Promise(r => setTimeout(r, 500)); // Let server process removal
  await this.connect();
}, delay);
```

Addresses the cleanup race condition hypothesis.

#### Fix 2d: Realtime Client Configuration (NICE TO HAVE)

- `heartbeatIntervalMs` — tune the Realtime client's internal keepalive
- `ack: true` on outbound channel — delivery confirmation for critical messages
- Investigate `transport` option (WebSocket vs long-polling)

### How to reproduce

1. Run 5+ features through the pipeline simultaneously
2. Wait 30–60 minutes under sustained load
3. `tail -f ~/.zazigv2/local-agent-00000000.log | grep "Scheduling reconnect"`
4. "attempt #1" repeating every second = you've hit it

---

## Bug 3: Verify Dispatch Channel Name (CONFIRMED — code bug)

### The bug

`orchestrator/index.ts` line 1031:

```typescript
async function dispatchVerifyJobToMachine(
  supabase: SupabaseClient,
  machineId: string,  // ← This is a UUID
  companyId: string,
  verifyMsg: VerifyJob,
): Promise<boolean> {
  const channel = supabase.channel(agentChannelName(machineId, companyId));
  //                                                ^^^^^^^^^ UUID, not name!
```

`agentChannelName` expects a machine **name** (e.g. `toms-macbook-pro-2023-local`). This function passes the UUID. The broadcast goes to `agent:{uuid}:{companyId}` — the daemon listens on `agent:{name}:{companyId}`.

**Verify jobs have never been received by any daemon.**

### Fix

Look up the machine name before dispatching, or change the function signature to accept `machineName` instead of `machineId`. Every other dispatch function in the orchestrator correctly uses `candidate.name` or `machine.name`.

---

## Orchestrator Hardening (SHOULD DO alongside the fixes above)

### Polling Fallback for Missed Completions

The orchestrator's 4-second Realtime window means 6 seconds of every 10 are a blackout. Any `job_complete` sent during those 6 seconds is lost.

Add to `processFeatureLifecycle()`:

```sql
-- Features stuck because orchestrator missed a completion event
SELECT f.id, f.status as feature_status
FROM features f
WHERE f.status IN ('building', 'combining', 'verifying')
AND NOT EXISTS (
  SELECT 1 FROM jobs j
  WHERE j.feature_id = f.id
  AND j.status IN ('queued', 'dispatched', 'executing')
)
AND EXISTS (
  SELECT 1 FROM jobs j
  WHERE j.feature_id = f.id
  AND j.status = 'complete'
);
```

If a feature is in a "working" state but all its jobs are done, process the transition. Makes the system self-healing regardless of Realtime health.

---

## Priority Order

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Bug 1: Machine dispatch validation (Option A or B) | Prevents wrong-machine deadlocks | Small–Medium |
| 2 | Bug 2a: Stability window for backoff | Stops infinite 1s reconnect loop | Small |
| 3 | Bug 3: Verify dispatch channel name | Unblocks verify job delivery | One-liner |
| 4 | Bug 2b: Log cleanup errors | Reveals reconnect root cause | One-liner |
| 5 | Orchestrator polling fallback | Self-healing for missed events | Medium |
| 6 | Bug 2c: Cleanup-connect delay | Addresses race condition | Small |
| 7 | Bug 2d: Realtime client config | Optimization | Small |

Fixes 2a + 2b + 2c + 3 could be one PR. Bug 1 + orchestrator polling is a separate PR.

---

## Affected Code Reference

### Daemon — `packages/local-agent/src/connection.ts`

| Section | Lines | What It Does |
|---------|-------|-------------|
| Channel setup | 244-304 | Creates inbound (`agent:{name}:{companyId}`) and outbound (`orchestrator:commands`) channels |
| Subscribe callbacks | 306-345 | Dual-ready gate, backoff reset on SUBSCRIBED, CLOSED triggers reconnect |
| Reconnection | 560-586 | Exponential backoff (broken by premature reset) |
| Channel cleanup | 539-558 | `removeChannel()` with swallowed errors |
| Job recovery polling | `job-recovery.ts` | Resets stale `dispatched` jobs to `queued` (5-min grace) |

### Orchestrator — `supabase/functions/orchestrator/index.ts`

| Section | Lines | What It Does |
|---------|-------|-------------|
| Job dispatch | 900-941 | Broadcasts `start_job` via ephemeral channel |
| Verify dispatch | 1025-1048 | **BUG: passes UUID not name to channel** |
| Realtime listener | 3537-3589 | Ephemeral 4-second listen per invocation |
| Stale job reaper | 432-459 | Resets jobs with `updated_at` > 2 min |
| Main handler | 3633-3677 | 10-second cron cycle |

---

## Appendix: Analysis Sources

**Claude** — Deep codebase exploration of daemon and orchestrator Realtime code. Identified the backoff reset bug, cleanup race condition, and verify dispatch channel name bug. Log forensics disproved original reconnect-loop-as-cause theory.

**Gemini (gemini-2.5-pro)** — Independent second opinion. Converged on same root causes. Unique insight: `ack: false` configuration cements fire-and-forget; enabling `ack: true` for critical messages would provide delivery confirmation. Recommended making polling primary, Realtime the optimization.

---

*Report updated 2026-03-06 after confirming machine `b9233ea4` is Chris's machine.*
