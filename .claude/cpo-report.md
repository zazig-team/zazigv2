# CPO Report — Pipeline Task 6: Feature Verification in Orchestrator

## Summary
Added feature-level verification to the orchestrator. When a job passes individual verification (`VerifyResult.passed === true`) and all sibling jobs for the same feature are also done, the orchestrator now triggers feature-level verification by inserting a new queued job that will rebase the feature branch on main and run all tests.

## What Was Done

### 1. `handleVerifyResult` handler
- **Failed path**: Sets job `status: "verify_failed"`, stores `verify_context` with test output, clears `machine_id` for requeue.
- **Passed path**: Sets job `status: "done"`, looks up `feature_id`, calls `all_feature_jobs_complete` RPC, and if all jobs are done, calls `triggerFeatureVerification`.

### 2. `triggerFeatureVerification` function
- Sets feature `status: "verifying"`
- Fetches feature details (`feature_branch`, `project_id`, `company_id`, `acceptance_tests`)
- Inserts a new queued job with `role: "reviewer"`, `job_type: "code"`, `complexity: "simple"`, `slot_type: "claude_code"`, and context containing `{ type: "feature_verification", featureBranch, acceptanceTests }`

### 3. `dispatchQueuedJobs` update
- Changed query filter from `.eq("status", "queued")` to `.in("status", ["queued", "verify_failed"])` so verify_failed jobs get re-dispatched
- Updated the optimistic lock to match

### 4. Deno shared shim updated
- Added `VerifyResult`, `VerifyJob`, `DeployToTest`, `FeatureApproved`, `FeatureRejected` type exports
- Added `isVerifyResult`, `isVerifyJob`, `isDeployToTest`, `isFeatureApproved`, `isFeatureRejected` validator functions
- Updated `isOrchestratorMessage` and `isAgentMessage` to include all message types

### 5. `JobRow.feature_id` added
- Added `feature_id: string | null` to the `JobRow` interface for type safety

## Files Changed
- `supabase/functions/orchestrator/index.ts` — added imports, `feature_id` to `JobRow`, `handleVerifyResult`, `triggerFeatureVerification`, wired into `listenForAgentMessages`, updated `dispatchQueuedJobs`
- `supabase/functions/_shared/messages.ts` — added missing type exports and validator functions for full message protocol coverage
- `supabase/functions/orchestrator/orchestrator.test.ts` — new test file with 4 Deno tests
- `.claude/cpo-report.md` — this report

## Tests
- 4 Deno tests written in `orchestrator.test.ts`:
  1. `handleVerifyResult` — failed verification sets job to `verify_failed`
  2. `handleVerifyResult` — passed verification, not all jobs done → no feature trigger
  3. `handleVerifyResult` — passed, all jobs done → `triggerFeatureVerification` called
  4. `triggerFeatureVerification` — sets feature to `verifying`, inserts queued job
- **Deno not installed** on this machine — tests cannot be run locally. Tests are structurally sound and follow Deno test conventions.
- **TypeScript compiles cleanly**: `npm run typecheck` passes across all workspaces (exit 0)

## Acceptance Criteria
- [x] `handleVerifyResult` added and wired in `listenForAgentMessages`
- [x] `verify_failed` path: sets `status: "verify_failed"`, `verify_context`, clears `machine_id`
- [x] `passed` path: sets `status: "done"`, checks `all_feature_jobs_complete`, triggers if all done
- [x] `triggerFeatureVerification` sets feature to `verifying`, inserts queued feature-verification job
- [x] `dispatchQueuedJobs` picks up both `queued` AND `verify_failed` jobs
- [x] `JobRow.feature_id` added to the interface
- [x] TypeScript compiles: `npm run typecheck` passes
- [x] Tests written (4 Deno tests; deno not available to run locally)

## Token Usage
- Routing: claude-ok
- Claude used directly for all implementation and test writing
