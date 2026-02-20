# CPO Report: Machine Health + Dead Machine Recovery

## Summary

Implemented machine health detection and dead machine recovery in the orchestrator edge function. The orchestrator now:

1. **Detects dead machines** on each tick and marks them offline, re-queuing their in-flight jobs
2. **Logs events** to the `events` table for both `machine_offline` and `machine_online` transitions
3. **Detects machine recovery** when a heartbeat arrives from a previously-offline machine
4. **Enforces flapping protection** via a 60-second recovery cooldown before dispatching new jobs to a machine that just came back online

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/index.ts` | Added `RECOVERY_COOLDOWN_MS = 60_000` constant |
| `supabase/functions/orchestrator/index.ts` | Added event logging to `reapDeadMachines()`, updated `handleHeartbeat()` for offline-to-online detection with event logging and cooldown tracking, added recovery cooldown filter to `dispatchQueuedJobs()` |

## Design Decisions

- **In-memory cooldown tracking**: Used a `Map<string, number>` in the edge function rather than a DB column. Acceptable tradeoff: lost on cold start means worst case a machine gets jobs slightly sooner. Avoids a migration.
- **Cooldown filtering**: Applied at the machine-fetch stage in `dispatchQueuedJobs()` so cooldown machines are excluded from the candidate pool entirely. Expired entries are cleaned up lazily.
- **Event logging**: `machine_offline` events include `{ jobs_requeued: N }` in detail; `machine_online` events include `{ recovered: true }`.

## Tests

- No test infrastructure in this repo yet (pre-merge-check confirms "no test script")
- TypeScript compiles without errors (`tsc --noEmit` passes)
- Lint passes

## Merge Order Note

This PR touches `supabase/functions/orchestrator/index.ts`, which is also modified by the PR on branch `cpo/commit-local-agent-direct-db`. That PR should be merged first; this one will need a rebase/reconciliation afterward.

## Token Usage

- Token budget: claude-ok (wrote code directly)
- Single-session implementation, no subagents needed
