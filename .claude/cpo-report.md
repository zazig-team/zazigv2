# CPO Report: Local Agent Direct DB Writes + Orchestrator Bugfixes

## What Was Done

Local agent executor now writes job status directly to the `jobs` table via Supabase REST (primary path), with Realtime broadcast retained as a secondary signal. This eliminates the dependency on the orchestrator's 4-second Realtime listen window for job status propagation — matching the heartbeat pattern already implemented in `connection.ts`.

Two orchestrator bugs were fixed:
1. `handleHeartbeat` was using `.eq('id', machineId)` but `machineId` is the machine name string, not UUID. Fixed to `.eq('name', machineId)`.
2. Execution order changed from reap-dispatch-listen to listen-reap-dispatch, ensuring freshly-received heartbeats are processed before the reaper evaluates machine liveness.

New RLS migration grants `anon` role SELECT+UPDATE on `machines` and `jobs` tables for direct-write access.

## Files Changed

- `packages/local-agent/src/executor.ts` — added `SupabaseClient` param; `sendJobStatus`, `sendJobComplete`, `sendJobFailed` now write to DB first, then broadcast
- `packages/local-agent/src/index.ts` — passes `conn.supabase` to `JobExecutor` constructor
- `supabase/functions/orchestrator/index.ts` — fixed heartbeat handler column match; fixed execution order
- `supabase/migrations/004_rls_direct_writes.sql` — anon role RLS policies for machines and jobs

## Tests Added/Passing

- No automated tests in this repo yet (pre-merge-check confirmed "no test script")
- TypeScript typecheck passes across all workspaces (shared, local-agent, orchestrator)
- Lint passes

## Owner Action Required

1. **Apply migration**: `supabase db push` (adds RLS policies for anon direct writes)
2. **Deploy orchestrator**: `supabase functions deploy orchestrator` (picks up bugfixes)
3. **Manual e2e test**: start local agent, dispatch a job, verify DB writes land without depending on Realtime

## Manual Test Steps

1. Apply migration to Supabase: `supabase db push`
2. Deploy orchestrator: `supabase functions deploy orchestrator`
3. Start local agent: `cd packages/local-agent && npm start`
4. Check `machines` table — `last_heartbeat` should update every 30s via direct DB write
5. Insert a test job (status=queued) into `jobs` table for the connected machine's company
6. Orchestrator should dispatch it; verify `jobs.status` transitions: queued → dispatched → executing → complete
7. Kill local agent, wait 2+ min, verify reaper marks machine offline and re-queues any active jobs
8. Confirm orchestrator logs show listen → reap → dispatch order

## Token Usage

- Model: Claude Opus 4.6
- Budget routing: claude-ok (direct code writing)

## PR

https://github.com/zazig-team/zazigv2/pull/12
