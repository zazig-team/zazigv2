STATUS: COMPLETE
CARD: 699b8e732491a4f6bbb5df6d
FILES: supabase/functions/orchestrator/index.ts, supabase/functions/orchestrator/orchestrator.test.ts, dashboard/index.html, packages/shared/src/messages.ts, packages/shared/src/validators.ts
TESTS: 4 existing tests updated for new signatures; test coverage preserved
NOTES: All 6 PR #61 review findings (3 P1, 3 P2) applied as follow-up commit on cpo/standalone-jobs.

---

# CPO Report -- PR #61 Review Fixes (Standalone Jobs)

## Commit
`521f8c7` -- `fix(standalone-jobs): address PR #61 P1/P2 review findings`

## All 6 Fixes Applied

### Fix 1 (P1-SEC): company_id isolation on promoteStandaloneToTesting
- **File**: `supabase/functions/orchestrator/index.ts`
- Added `companyId` parameter to `promoteStandaloneToTesting()`
- Added `.eq("company_id", companyId)` to both SELECT and UPDATE queries
- In `handleVerifyResult`, now selects `company_id` from verify job row and passes it through
- Null guard if verify job has no company_id

### Fix 2 (P1): Idempotency guard on triggerStandaloneVerification
- **File**: `supabase/functions/orchestrator/index.ts`
- Before INSERT, queries for existing active verify job via `.filter("context->>originalJobId", "eq", jobId)` with `.not("status", "in", '("done","verify_failed")')` and `.maybeSingle()`
- If active verify job exists, logs and returns early -- prevents duplicate verify jobs from at-least-once delivery

### Fix 3 (P1): DeployToTest extended with standaloneJobId + jobType discriminator
- **File**: `packages/shared/src/messages.ts` -- `featureId` now optional, added `standaloneJobId?: string` and `jobType: "feature" | "standalone"`
- **File**: `packages/shared/src/validators.ts` -- `isDeployToTest` validates `jobType`, requires `featureId` for feature deploys, `standaloneJobId` for standalone deploys
- **File**: `supabase/functions/orchestrator/index.ts` -- `promoteStandaloneToTesting` sends `standaloneJobId` + `jobType: "standalone"`, `promoteToTesting` sends `jobType: "feature"`

### Fix 4 (P2): Promise.all in refreshDashboard
- **File**: `dashboard/index.html`
- `fetchFeatures()` and `fetchStandaloneJobs()` now run in parallel via `Promise.all()`

### Fix 5 (P2): Company guard on null activeCompanyId
- **File**: `dashboard/index.html`
- `fetchStandaloneJobs()` returns `[]` immediately when `activeCompanyId` is null -- prevents querying all companies' standalone jobs

### Fix 6 (P2): Set original job status to 'verifying'
- **File**: `supabase/functions/orchestrator/index.ts`
- After successful verify job INSERT in `triggerStandaloneVerification`, updates original job status to `"verifying"`
- Provides idempotency signal and operator visibility

## Standalone Job Lifecycle

```
queued -> dispatched -> executing -> verifying -> testing -> complete (deployed)
  executing -> triggerStandaloneVerification (creates verify job, sets status to verifying)
  verify job runs -> VerifyResult
    -> passed: promoteStandaloneToTesting -> status=testing -> DeployToTest
    -> failed: verify_failed (requeue for retry)
  testing -> (human approval) -> done
```

## Test Updates
- **File**: `supabase/functions/orchestrator/orchestrator.test.ts`
- Added `filter` and `maybeSingle` to mock chain methods
- `triggerStandaloneVerification` test: added mock for idempotency check (returns null) and status update; updated chain count assertion from 2 to 4
- `handleVerifyResult standalone passed` test: added `company_id: "co-1"` to verify job mock data; added `select.eq.eq.single` and `update.eq.eq` patterns for company-scoped promote queries

## Token Usage
- Token budget: claude-ok (wrote code directly)
- No codex delegation needed -- 6 surgical fixes across 5 files

---

# CPO Report -- Standalone Job Lifecycle Fix (PR #61 follow-up)

## Commit
`0ad9439` -- `fix(standalone-jobs): correct job lifecycle -- skip spurious complete state`

## Problem
`handleJobComplete()` unconditionally set `status: "complete"` for all non-persistent jobs, including standalone jobs. Then `triggerStandaloneVerification()` (Fix 6) immediately overrode it to `"verifying"`. This created a spurious state transition: `executing -> complete -> verifying`.

`complete` is the terminal/deployed state -- not "execution finished".

## Fix
In `handleJobComplete()`, added `isStandaloneExecution` check (no `feature_id`, not a `verify` job). Standalone jobs now skip the `status: "complete"` update. The status stays at `executing` momentarily until `triggerStandaloneVerification` sets it to `"verifying"`.

Correct lifecycle: `queued -> executing -> verifying -> testing -> complete (deployed)`

## Scope
- **1 file changed**: `supabase/functions/orchestrator/index.ts` (6 lines added, 1 removed)
- **No test changes**: No `handleJobComplete` tests exist in the test file; `triggerStandaloneVerification` and `handleVerifyResult` tests are unaffected
- **`handleJobFailed`**: Verified correct -- uses `"failed"` or `"queued"`, never `"complete"`

## Token Usage
- Token budget: claude-ok (wrote code directly)
- Surgical 1-file fix, no delegation needed
