# Realtime Reconnection Loop — Bug Report & Fix Recommendations

**Date:** 2026-03-05
**For:** Chris (engineering fix)
**From:** CPO (Tom's agent) + Codex + Gemini second opinions
**Severity:** P0 — pipeline-blocking, recurring

---

## TL;DR

The daemon's Supabase Realtime inbound channel periodically enters a tight reconnect loop (~1/second) that never recovers. When this happens, the daemon can't receive job dispatch events and can't send completion messages reliably. The orchestrator misses these too. Jobs sit in `dispatched` forever. Only fix today is a full daemon restart. This has happened at least 4 times across sessions.

---

## The Bug — What Happens

Daemon log when the bug is active (repeats every ~1 second indefinitely):

```
WARN [local-agent] Inbound channel closed unexpectedly. Scheduling reconnect.
[local-agent] Reconnecting in 1000ms (attempt #1)...
[local-agent] Connected to outbound channel: orchestrator:commands
[local-agent] Connected to inbound channel: agent:toms-macbook-pro-2023-local:00000000-...
WARN [local-agent] Inbound channel closed unexpectedly. Scheduling reconnect.
```

The sequence every cycle:
1. `cleanupChannels()` removes both channels
2. `connect()` creates fresh channels and subscribes
3. Both channels reach `SUBSCRIBED` — `onBothReady()` fires, resets `reconnectAttempts = 0`
4. **Immediately** after, `CLOSED` fires on the inbound channel
5. `scheduleReconnect()` calculates delay = `min(1000 * 2^0, 30000)` = 1000ms (because attempts just got reset to 0)
6. After 1 second, go to step 1

The backoff **never escalates** because the reset happens before the close.

---

## Two Bugs, One Root Cause

### Bug A: Backoff Reset (connection.ts lines 306-345)

```typescript
const onBothReady = (): void => {
  if (inReady && outReady) {
    this.reconnectAttempts = 0;  // ← PREMATURE RESET
    this.startHeartbeat();
  }
};
```

The counter resets the instant both channels subscribe. When `CLOSED` fires milliseconds later, the backoff starts from scratch. This is why it's always "attempt #1" in the logs.

### Bug B: Server-side channel closure (root cause)

Why does `CLOSED` fire immediately after `SUBSCRIBED`? Three leading hypotheses (all models agree these are the most likely):

1. **Channel cleanup race condition** — `removeChannel()` in cleanup may not fully complete server-side before `connect()` creates new channels with the same name. The server sees a duplicate channel name and closes the new one. The fact that cleanup errors are swallowed (`catch { }`) hides evidence of this.

2. **Server-side channel/connection limits** — The Supabase project may have a concurrent channel limit. Two permanent channels (inbound + outbound) plus the orchestrator's ephemeral channels (created every 10s) may push past the limit, causing the server to evict the newest channel.

3. **WebSocket transport degradation** — Under load (10+ concurrent features), the underlying WebSocket connection degrades. The `supabase-js` Realtime client internally shares one WebSocket for all channels. If the WebSocket enters an unhealthy state, individual channels can be closed by the multiplexer.

---

## Affected Code

### Daemon — `packages/local-agent/src/connection.ts`

| Section | Lines | What It Does |
|---------|-------|-------------|
| Channel setup | 244-304 | Creates inbound (`agent:{machineId}:{companyId}`) and outbound (`orchestrator:commands`) channels |
| Subscribe callbacks | 306-345 | Dual-ready gate, backoff reset on SUBSCRIBED, CLOSED triggers reconnect |
| Reconnection | 560-586 | Exponential backoff (1s base, 2x multiplier, 30s max) — but broken by premature reset |
| Channel cleanup | 539-558 | `removeChannel()` with swallowed errors |
| Job recovery polling | `job-recovery.ts` | Heartbeat-integrated fallback — resets `dispatched` jobs to `queued` (5-min grace) |

### Orchestrator — `supabase/functions/orchestrator/index.ts`

| Section | Lines | What It Does |
|---------|-------|-------------|
| Realtime listener | 3537-3589 | Ephemeral 4-second listen on `orchestrator:commands` per invocation |
| Stale job reaper | 432-459 | Resets `dispatched`/`executing` jobs with `updated_at` > 2 min |
| Feature lifecycle | main flow | Polling fallback for missed state transitions |
| Main handler | 3633-3677 | 10-second cron: listen → reap → process → dispatch → refresh |

---

## Recommended Fixes

### Fix 1: Stability Window for Backoff Reset (MUST DO)

**The problem:** `reconnectAttempts` resets to 0 on SUBSCRIBED, so backoff never escalates.

**The fix:** Don't reset the counter immediately. Use a stability timer.

```typescript
const onBothReady = (): void => {
  if (inReady && outReady) {
    // DON'T reset immediately — wait for stability
    this.startHeartbeat();

    // Only reset after 30s of stable connection
    this.stabilityTimer = setTimeout(() => {
      this.reconnectAttempts = 0;
    }, 30_000);
  }
};
```

And in `scheduleReconnect()`, clear the stability timer:

```typescript
private scheduleReconnect(): void {
  if (this.stabilityTimer) {
    clearTimeout(this.stabilityTimer);
    this.stabilityTimer = null;
  }
  // ... rest of existing logic
}
```

**Effect:** If CLOSED fires within 30s of SUBSCRIBED, the backoff counter keeps escalating: 1s → 2s → 4s → 8s → 16s → 30s max. The tight loop becomes a slow retry. If the connection stays up for 30s, it's genuinely healthy and the counter resets.

**All three models (Claude, Codex, Gemini) independently recommended this exact pattern.**

### Fix 2: Stop Swallowing Cleanup Errors (MUST DO)

**The problem:** `cleanupChannels()` catches and swallows all errors, hiding evidence of the root cause.

```typescript
// CURRENT — hides problems
if (this.outChannel) {
  try { await this.supabase.removeChannel(this.outChannel); } catch { }
}
```

**The fix:** Log the errors instead of swallowing them.

```typescript
if (this.outChannel) {
  try {
    await this.supabase.removeChannel(this.outChannel);
  } catch (err) {
    console.warn(`[local-agent] removeChannel(outbound) failed:`, err);
  }
  this.outChannel = null;
}
```

**Effect:** We'll see what's actually happening during cleanup. This may reveal the root cause (duplicate channels, WebSocket state issues, etc.).

### Fix 3: Add `await` Guard Between Cleanup and Connect (SHOULD DO)

**The problem:** `cleanupChannels()` may not fully propagate to the server before `connect()` creates new channels with the same name.

**The fix:** Add a small delay between cleanup and reconnect.

```typescript
this.reconnectTimer = setTimeout(async () => {
  this.reconnectTimer = null;
  await this.cleanupChannels();
  await new Promise(r => setTimeout(r, 500)); // Let server process removal
  await this.connect();
}, delay);
```

**Effect:** Gives the server time to fully tear down the old channels before new ones with the same names are created. Addresses the cleanup race condition hypothesis.

### Fix 4: Orchestrator Polling Fallback for Missed Completions (SHOULD DO)

**The problem:** The orchestrator's 4-second Realtime window means 6 seconds of every 10 are a blackout. Any `job_complete` sent during those 6 seconds is lost forever.

**The fix:** In `processFeatureLifecycle()` (or a new function called from the main handler), add a query:

```sql
-- Find features stuck because orchestrator missed a completion event
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

If a feature is in a "working" state but all its jobs are complete (none queued/dispatched/executing), the orchestrator missed a completion event. Process the transition.

**Effect:** The Realtime channel becomes the fast path (instant). Polling becomes the reliable path (catches anything missed within 10s). This is the safety net that makes the system self-healing regardless of Realtime health.

### Fix 5: Realtime Client Configuration (NICE TO HAVE)

Investigate `supabase-js` Realtime client options that may help:

- **`heartbeatIntervalMs`** — The Realtime client has its own internal heartbeat to keep the WebSocket alive. Default may be too aggressive or too passive.
- **`timeout`** — Connection timeout before retry.
- **`transport`** — May be able to force WebSocket (vs long-polling fallback).
- **Channel `ack: true`** — Currently disabled. Enabling it for the outbound channel would let the daemon know if messages were received by the server.

---

## Priority Order

1. **Fix 1 (stability window)** — stops the tight loop, buys time for everything else
2. **Fix 2 (log cleanup errors)** — reveals root cause data
3. **Fix 4 (orchestrator polling fallback)** — makes the system self-healing
4. **Fix 3 (cleanup-connect delay)** — addresses likely root cause
5. **Fix 5 (client config)** — optimization

Fixes 1-3 are probably a single PR. Fix 4 is a separate PR touching the orchestrator.

---

## How to Reproduce

1. Run 5+ features through the pipeline simultaneously
2. Wait — the daemon will eventually enter the reconnect loop (usually within 30-60 minutes under sustained load)
3. Check with `tail -f ~/.zazigv2/local-agent-00000000.log | grep "Scheduling reconnect"`
4. If you see "attempt #1" repeating every second, you've hit it

Alternatively, check `zazig status` — if it shows 0 active jobs, 0 slots used, but the DB has `dispatched` jobs, the Realtime channel is broken.

---

## Evidence From Today (2026-03-05)

- Breakdown job `bc42b958` and pipeline-technician job `2dbfa038` both dispatched to machine `b9233ea4`
- Neither job has log files in `~/.zazigv2/job-logs/` — the daemon never received the dispatch
- Daemon log shows the reconnect loop active at the time (every 1 second)
- `zazig status` showed 0 active jobs, 0 slots used despite 2 dispatched + 2 queued in DB
- Feature `a8d4b54f` (Inbox Redesign) stuck in `breaking_down` for 1.5+ hours

---

## Appendix: Model Opinions

### Gemini (gemini-2.5-pro)

**Root cause:** Likely server-side termination — either RLS policy failure, channel limits, or cleanup race condition. Emphasised that swallowed cleanup errors are dangerous and hiding root cause signals.

**Key unique insight:** The `ack: false` configuration cements fire-and-forget. For critical messages like `job_complete`, enabling `ack: true` would provide delivery confirmation.

**Architecture recommendation:** Make polling the primary mechanism, Realtime the optimization. Write job status to DB first, broadcast second.

### Codex (o4-mini)

Codex hung during analysis (20+ mins, zero output). Killed. Two-model consensus is sufficient — Claude and Gemini independently converged on the same root cause and fix recommendations.

### Claude (analysis)

**Root cause:** Cleanup race condition most likely — `removeChannel()` is async server-side, new channels with same name conflict. Backoff reset is the amplifier that turns a recoverable issue into an infinite loop.

**Key unique insight:** The job recovery polling in `job-recovery.ts` already exists on the daemon side but uses a 5-minute grace period. Reducing this grace period and adding the equivalent on the orchestrator side (Fix 4) would make the system self-healing.

---

*Report generated 2026-03-05. Three-model consensus on all core recommendations.*
