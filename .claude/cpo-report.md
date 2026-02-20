# CPO Report — Job Progress Tracking

## Summary
Added a `progress` integer column (0–100) to the `jobs` table and wired the executor's poll loop to write a time-based progress estimate to the DB every 30 seconds. On completion, progress is set to 100. On failure/timeout, progress is left as-is to show how far the job got.

## Files Changed
- `supabase/migrations/009_add_progress_to_jobs.sql` — new migration adding `progress` column with CHECK constraint (0–100, default 0)
- `packages/local-agent/src/executor.ts` — added `startedAt: number` to `ActiveJob` interface; `pollJob()` now writes time-based progress estimate to Supabase when session is alive; `sendJobComplete()` now includes `progress: 100` in DB update
- `packages/local-agent/src/executor.test.ts` — new test file with 6 tests covering progress formula, integration (poll writes progress, completion sets 100, failure doesn't include progress)
- `.claude/cpo-report.md` — this report

## Tests
- 6 new tests in `executor.test.ts`:
  - Pure formula: linear 0→95 over JOB_TIMEOUT_MS, capped at 95
  - Integration: poll writes progress to Supabase when session alive
  - Integration: progress increases over successive polls
  - Integration: sendJobComplete sets progress: 100
  - Integration: failure path doesn't reset progress
  - Integration: sendJobFailed does not include progress field
- 25/25 tests passing across local-agent package (6 executor + 9 verifier + 10 branches)
- TypeScript compiles cleanly (`npm run typecheck` exit 0)

## SQL Migration

```sql
-- 009_add_progress_to_jobs.sql
-- Add progress tracking column to jobs table.
-- progress: integer 0-100, default 0.
-- Local agent executor writes this during the poll loop.
-- Readable by dashboard directly via Supabase REST API.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0
        CHECK (progress >= 0 AND progress <= 100);

COMMENT ON COLUMN public.jobs.progress IS
    'Execution progress estimate 0-100. Written by local-agent poll loop. Resets to 100 on completion.';
```

## Acceptance Criteria
- [x] `supabase/migrations/009_add_progress_to_jobs.sql` created
- [x] `ActiveJob.startedAt: number` field added
- [x] `pollJob()` writes progress to DB when session alive
- [x] `sendJobComplete()` sets progress: 100 in DB update
- [x] All tests pass: `cd packages/local-agent && npm test`
- [x] TypeScript compiles: `npm run typecheck` from repo root
- [x] Progress formula is correct (0→95 linear over JOB_TIMEOUT_MS, capped at 95)

## Token Usage
- Routing: claude-ok
- Claude used directly for all implementation, testing, and verification
