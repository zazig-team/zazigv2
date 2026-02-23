STATUS: COMPLETE
CARD: 699c2a31
BRANCH: cpo/remove-standalone-jobs
FILES: supabase/migrations/031_require_feature_id.sql (new), supabase/functions/orchestrator/index.ts, dashboard/index.html
TESTS: Typecheck clean across all 4 workspaces
NOTES: Removed standalone jobs path — all jobs now require a feature. Auto-create wrapper features for jobs with no feature_id.

---

# CPO Report — Remove Standalone Jobs

## Summary
Removed the entire "standalone jobs" code path. Every job must now belong to a feature. Jobs arriving with no `feature_id` get an auto-created wrapper feature before dispatch. Migration backfills existing standalone jobs and enforces `NOT NULL`.

## Changes

### 1. Migration 031_require_feature_id.sql (new)
- Inserts one "Standalone work" feature per company for existing orphaned jobs
- Links orphaned jobs (`feature_id IS NULL`) to their company's wrapper feature
- `ALTER TABLE jobs ALTER COLUMN feature_id SET NOT NULL`

### 2. Orchestrator (supabase/functions/orchestrator/index.ts)
- **Removed** `triggerStandaloneVerification` function (~60 lines)
- **Removed** `promoteStandaloneToTesting` function (~47 lines)
- **Removed** standalone block in `handleJobComplete` (TODO comment + `if (!jobRow.feature_id)` → `triggerStandaloneVerification`)
- **Removed** standalone verification check in `handleVerifyResult` (`verifyCtx.type === "standalone_verification"` block)
- **Changed** `JobRow.feature_id` from `string | null` → `string`
- **Added** `feature_id` to `dispatchQueuedJobs` select columns
- **Added** auto-create wrapper feature block at top of dispatch loop: creates a "One-off: {title}" feature in `building` status for any job with no `feature_id`

### 3. Dashboard (dashboard/index.html)
- **Removed** `STANDALONE_JOBS_BASE` URL constant
- **Removed** `fetchStandaloneJobs()` function
- **Removed** `.card-standalone-badge` CSS block
- **Removed** `JOB_STATUS_TO_COLUMN` mapping (only used for standalone job column placement)
- **Removed** `lastStandaloneJobs` cache variable
- **Simplified** `renderCard()`: removed `isStandalone` parameter and standalone-specific rendering
- **Simplified** `renderColumn()`: removed `standaloneJobs` parameter
- **Simplified** `renderBoard()`: removed `standaloneJobs` parameter and standalone grouping logic
- **Simplified** `refreshDashboard()`: single `fetchFeatures()` call instead of `Promise.all`

### 4. messages.ts (packages/shared/src/messages.ts)
- No changes needed — no `feature_id` field exists in the protocol message types
- `DeployToTest.standaloneJobId` and `jobType: "standalone"` remain in the protocol for backwards compat (can be cleaned up in a future card)

## Design Decisions
1. **Wrapper features are "One-off: {title}"**: Uses job title or ID as the feature title, with status `building` so they flow through the normal pipeline.
2. **Migration uses "Standalone work" as backfill title**: Simple, descriptive, and `ON CONFLICT DO NOTHING` prevents duplicates if migration is re-run.
3. **Didn't touch DeployToTest protocol**: The `standaloneJobId` and `jobType: "standalone"` fields in messages.ts are protocol-level and affect the local agent contract. Removing them is a separate concern.

## Net Impact
- **-238 lines, +74 lines** across 3 files (net -164 lines)
- Two entire functions removed from orchestrator
- Dashboard fetch reduced from 2 API calls to 1

## Token Usage
- Budget: claude-ok (wrote code directly)
- Approach: Full read of all 4 files → systematic edits → typecheck → commit + push
