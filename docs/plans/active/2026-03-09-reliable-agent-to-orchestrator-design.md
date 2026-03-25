# Reliable Agent-to-Orchestrator Communication

**Date:** 2026-03-09
**Status:** Approved
**Author:** CPO

## Problem

The daemon sends critical messages (job_complete, job_failed, verify_result) to the orchestrator via Supabase Realtime broadcast on the `orchestrator:commands` channel. The orchestrator is an ephemeral edge function that subscribes for only 4 seconds per invocation. Messages sent outside that window are lost permanently — Realtime broadcast has no persistence or replay.

**Impact:** Completed jobs stay in `executing` status. The stale job reaper re-queues them after 2 minutes. The job runs again, overwriting logs and wasting compute. Downstream lifecycle transitions (feature `breaking_down` → `building`) never fire until the re-run's completion message happens to land in the 4-second window.

Heartbeats already solved this: the daemon writes directly to the `machines` table (DB primary, Realtime secondary). Critical job signals need the same reliability.

## Design

### New edge function: `agent-event`

Single HTTP endpoint replacing all daemon→orchestrator Realtime communication.

**Request:**
```
POST /functions/v1/agent-event
Content-Type: application/json
Authorization: Bearer <user-jwt>

{
  "type": "job_complete" | "job_failed" | "job_status" | "job_ack" | "verify_result" | "stop_ack" | "heartbeat",
  "protocolVersion": 1,
  "machineId": "...",
  "jobId": "...",
  ... (type-specific fields — same shapes as current Realtime payloads)
}
```

**Validation:** Reuses existing validators from `@zazigv2/shared` (`isJobComplete`, `isJobFailed`, etc.). Same dispatch table as the current `listenForAgentMessages` function.

**Auth:** Deployed with `--no-verify-jwt`. Manually verifies the caller's JWT user ID against `user_companies` and `machines` tables — same trust boundary the daemon already passes through for DB writes.

**Response:**
- `200 { ok: true }` — message processed
- `400 { ok: false, error: "..." }` — validation failed
- `500 { ok: false, error: "..." }` — handler error

**Handlers:** `handleJobComplete`, `handleJobFailed`, `handleHeartbeat`, etc. are already standalone exported functions in the orchestrator. The `agent-event` edge function imports and calls them directly (or they're extracted into a shared file).

### Daemon changes

**New method: `sendToOrchestrator()`** replaces `this.send()` on the outbound Realtime channel.

```typescript
private async sendToOrchestrator(msg: AgentMessage): Promise<void> {
  const url = `${this.config.supabase.url}/functions/v1/agent-event`;
  const { data: { session } } = await this.dbClient.auth.getSession();
  const token = session?.access_token ?? this.config.supabase.anon_key;

  for (const delay of [0, 1000, 5000, 15000]) {
    if (delay > 0) await sleep(delay);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(msg),
    });

    if (res.ok) return;
    console.warn(`[local-agent] agent-event failed (${res.status}), retrying...`);
  }

  console.error(`[local-agent] agent-event failed after 3 retries`);
}
```

**Retry policy:** 3 retries with backoff (0s, 1s, 5s, 15s). If all fail, log error. The orchestrator's stale job reaper is the last-resort safety net.

**All senders switch:** `sendJobComplete`, `sendJobFailed`, `sendJobAck`, `sendJobStatus`, `sendStopAck`, verify result sender — all call `sendToOrchestrator()` instead of `this.send()`.

**Kill outbound Realtime channel:**
- Remove `this.outChannel` property and `orchestrator:commands` channel subscription from `connection.ts`
- Remove secondary Realtime heartbeat broadcast (DB write is already primary)

### Orchestrator changes

**Remove `listenForAgentMessages()`.** The main handler's step 1 (4-second Realtime listen) is deleted. The orchestrator no longer subscribes to `orchestrator:commands` at all.

**Reaper stays as safety net.** `reapStaleJobs` still runs on every tick. With HTTP + retries, it should almost never fire — it's a circuit breaker, not the primary path.

## Message inventory

| Message | Current | After | Criticality |
|---|---|---|---|
| `heartbeat` | DB write + Realtime | DB write + HTTP | Already reliable |
| `job_complete` | Realtime only | HTTP with retry | Critical |
| `job_failed` | Realtime only | HTTP with retry | Critical |
| `verify_result` | Realtime only | HTTP with retry | Critical |
| `job_ack` | Realtime only | HTTP with retry | Low |
| `job_status` | Realtime only | HTTP with retry | Low |
| `stop_ack` | Realtime only | HTTP with retry | Low |

## Cleanup

**Deleted:**
- `this.outChannel` in `connection.ts`
- `listenForAgentMessages()` in orchestrator
- `orchestrator:commands` channel subscription
- Secondary Realtime heartbeat broadcast

**Added:**
- `supabase/functions/agent-event/index.ts`
- `sendToOrchestrator()` in `connection.ts`

## Migration

No feature flag needed. The old Realtime path is already unreliable — there's no graceful transition to protect.

**Deploy order:**
1. Deploy `agent-event` edge function to staging
2. Update daemon to send via HTTP, rebuild `.mjs` bundle
3. Remove `listenForAgentMessages` from orchestrator
4. All three can ship together

**Release:** Edge function deploys via CI. Daemon bundle needs rebuild and promote.
