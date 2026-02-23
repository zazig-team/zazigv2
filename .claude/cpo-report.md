STATUS: COMPLETE
CARD: 699c2685
FILES: supabase/migrations/027_feature_lifecycle.sql (new), supabase/functions/orchestrator/index.ts (modified), packages/shared/src/messages.ts (modified), dashboard/index.html (modified)
TESTS: Typecheck clean across all 4 workspaces
NOTES: 11-status feature lifecycle pipeline, 3 new roles, full orchestrator rewiring

---

# CPO Report — Feature Status Lifecycle Cleanup

## Summary
Replaced the muddled 11-value feature status constraint with a clean 11-status pipeline (10 active + cancelled). Renamed tech-lead → feature-breakdown-expert. Created job-combiner and deployer roles. Rewired the entire orchestrator to support the new pipeline.

## New Pipeline
```
created → ready_for_breakdown → breakdown → building → combining
        → verifying → deploying_to_test → ready_to_test → deploying_to_prod → complete
(+ cancelled at any point)
```

## Changes Made

### 1. Migration 027_feature_lifecycle.sql (new)
- Drops old 11-value `features_status_check` constraint
- Migrates existing rows: proposed/approved/designing/in_progress/design → ready_for_breakdown, done/complete → complete, testing → ready_to_test
- Adds clean 11-status constraint
- Updates `jobs_job_type_check` to add `combine` and `deploy` job types
- Renames `tech-lead` role → `feature-breakdown-expert`
- Updates CPO role prompt to use `ready_for_breakdown`
- Inserts `job-combiner` role with merge prompt
- Inserts `deployer` role with test/prod deploy prompt

### 2. Orchestrator (supabase/functions/orchestrator/index.ts)
- `processApprovedFeatures` → `processReadyForBreakdown`: queries `ready_for_breakdown` status
- `triggerBreakdown`: CAS guard `ready_for_breakdown`, status → `breakdown`, role → `feature-breakdown-expert`
- `handleJobComplete`: added handlers for:
  - `breakdown` completion → feature `breakdown` → `building`
  - `combine` completion → triggers `triggerFeatureVerification`
  - `deploy` (prod) completion → calls `handleProdDeployComplete`
- `triggerCombining` (new): fetches completed job branches, transitions feature `building` → `combining`, inserts combine job
- `handleVerifyResult`: calls `triggerCombining` instead of `triggerFeatureVerification` when all feature jobs done
- `triggerFeatureVerification`: updated CAS exclusion list to include all new late-stage statuses
- `promoteToTesting` → `initiateTestDeploy`: checks for `deploying_to_test`/`ready_to_test` in queue, sets `deploying_to_test`
- `handleDeployComplete`: adds CAS guard `deploying_to_test`, sets `ready_to_test`
- `handleFeatureApproved`: CAS `ready_to_test` → `deploying_to_prod`, dispatches deployer job for prod
- `handleProdDeployComplete` (new): CAS `deploying_to_prod` → `complete`, drains testing queue, runs teardown
- `handleFeatureRejected`: CAS guard updated to `ready_to_test`
- `handleDeployFailed`/`handleDeployNeedsConfig`: CAS guard updated to `deploying_to_test`
- Standalone job pipeline (`triggerStandaloneVerification`, `promoteStandaloneToTesting`) kept intact

### 3. Shared (packages/shared/src/messages.ts)
- `FEATURE_STATUSES` updated to all 11 values
- `FeatureStatus` type automatically derives from the array

### 4. Dashboard (dashboard/index.html)
- COLUMNS array: 9 visible columns matching new pipeline
- CSS variables renamed from `--col-design/--col-done/--col-testing` to match new status keys
- `JOB_STATUS_TO_COLUMN` mapping updated for new column keys

## Verification
- `npm run typecheck`: clean across all 4 workspaces (orchestrator, local-agent, shared, cli)
- No hardcoded `"testing"`, `"done"`, or `"approved"` feature status strings remain in the orchestrator (remaining `"done"`/`"testing"` references are JOB statuses in the standalone pipeline)
- All CAS guards updated to use new status values

## Token Usage
- Budget: claude-ok (wrote code directly)
- Approach: Full discovery read of all 4 files → systematic edits → typecheck → commit
