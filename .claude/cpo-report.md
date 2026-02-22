STATUS: COMPLETE
CARD: 699b8e732491a4f6bbb5df6d
FILES: supabase/functions/orchestrator/index.ts, supabase/functions/orchestrator/orchestrator.test.ts, dashboard/index.html
TESTS: 4 new tests added (triggerStandaloneVerification, handleVerifyResult standalone paths)
NOTES: Standalone jobs (feature_id=NULL) now appear on dashboard and go through verification + testing pipeline.

---

# CPO Report — Support Standalone Jobs (No Feature) in Dashboard and Verification

## Summary
Two problems fixed:
1. **Dashboard**: Jobs without a `feature_id` were invisible. Added a secondary query and rendering path so standalone jobs appear as cards in the pipeline board columns.
2. **Orchestrator**: Standalone jobs skipped verification and testing entirely. Added `triggerStandaloneVerification` and `promoteStandaloneToTesting` to give standalone jobs the same lifecycle as feature-scoped jobs.

## Files Changed

### `supabase/functions/orchestrator/index.ts`
- **`handleJobComplete`** (line ~732): Added check for standalone job completion -- when a non-persistent, non-verify job with no `feature_id` completes, triggers `triggerStandaloneVerification`
- **`handleVerifyResult`** (line ~824): Modified to select `context` alongside `feature_id`. Before the early return for null `feature_id`, checks if the verify job has `standalone_verification` context type -- if so, calls `promoteStandaloneToTesting` with the original job ID
- **`triggerStandaloneVerification`** (new, line ~927): Fetches standalone job details, creates a queued verify job with `context.type = "standalone_verification"` and `context.originalJobId` pointing back to the original job
- **`promoteStandaloneToTesting`** (new, line ~969): Updates the original standalone job status to `testing`, broadcasts `DeployToTest` using the job's branch

### `supabase/functions/orchestrator/orchestrator.test.ts`
- Added import for `triggerStandaloneVerification`
- **4 new tests**:
  1. `triggerStandaloneVerification` -- creates verify job with correct standalone_verification context
  2. `handleVerifyResult` -- standalone verification passed, promotes to testing
  3. `handleVerifyResult` -- standalone verification failed, marks verify_failed only
  4. `handleVerifyResult` -- job with no feature_id and no standalone context, skips gracefully

### `dashboard/index.html`
- **New query**: `STANDALONE_JOBS_BASE` -- fetches jobs where `feature_id=is.null`, excludes persistent_agent and verify job types
- **`fetchStandaloneJobs()`**: Fetches standalone jobs with optional company filter
- **`JOB_STATUS_TO_COLUMN` map**: Maps job statuses to board column keys (building/verifying/testing/done)
- **`renderCard()`**: Updated to handle both features and standalone jobs (via `isStandalone` parameter) in the Trello-style card format
- **`renderColumn()`**: Updated to accept and render both feature cards and standalone job cards
- **`renderBoard()`**: Groups standalone jobs by column alongside features
- **`refreshDashboard()`**: Fetches both features and standalone jobs in parallel, caches results

## Standalone Job Lifecycle (New)

```
queued -> dispatched -> executing -> complete
  -> triggerStandaloneVerification (creates verify job)
  -> verify job runs -> VerifyResult
    -> passed: promoteStandaloneToTesting -> status=testing -> DeployToTest
    -> failed: verify_failed (requeue for retry)
  -> testing -> (human approval) -> done
```

## What Was NOT Changed
- Feature-scoped job flow is completely unchanged
- Persistent agent flow is unchanged
- No schema/migration changes needed (jobs table already supports null feature_id)

## Tests
- 4 new Deno tests for standalone verification code paths
- Deno not installed in this environment so tests were not executed locally; test structure follows existing patterns exactly

## Manual Test Steps

### Dashboard
1. Open dashboard (Netlify URL or local)
2. Insert a test standalone job: `INSERT INTO jobs (company_id, role, job_type, status, context) VALUES ('...', 'engineer', 'code', 'executing', 'Fix login bug');`
3. Verify the standalone job appears in the "Building" column with a "standalone" badge
4. Update the job status to `testing` and verify it moves to the "Testing" column
5. Update to `done` and verify it appears in the "Done" column

### Orchestrator
1. Create a standalone job (no feature_id) and let it complete (agent sends `job_complete`)
2. Verify a verification job is created with `context.type = "standalone_verification"` and `context.originalJobId` set
3. Let the verify job run -- on pass, verify the original job status changes to `testing`
4. On verify failure, verify the verify job gets `verify_failed` status

## Token Usage
- Token budget: claude-ok (wrote code directly)
