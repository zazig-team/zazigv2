STATUS: COMPLETE
CARD: 699ba3315d6b971dae5e79af
FILES: supabase/migrations/023_tech_lead_role.sql, supabase/functions/orchestrator/index.ts, supabase/functions/orchestrator/orchestrator.test.ts
TESTS: 2 new tests pass (triggerBreakdown create + idempotency), 12/14 total pass (2 pre-existing failures)

---

# CPO Report — Tech Lead Role + Breakdown Job Trigger

## Summary
Added Tech Lead role and feature-to-job breakdown pipeline. When a feature reaches status='approved', the orchestrator creates a breakdown job assigned to the tech-lead role. The Tech Lead agent then breaks the feature into implementation jobs.

## What Was Implemented

### Migration 023 (`supabase/migrations/023_tech_lead_role.sql`)
- Added `'approved'` to the `features_status_check` constraint (was missing from the lifecycle)
- Inserted `tech-lead` role with: `is_persistent=false`, `default_model='claude-sonnet-4-6'`, `slot_type='claude_code'`, `skills='{brainstorming}'`
- Role prompt defines scope: read feature spec → break into 1-3 jobs → insert jobs → write report
- Uses `ON CONFLICT (name) DO UPDATE SET` for idempotent re-runs

### Orchestrator Changes (`supabase/functions/orchestrator/index.ts`)
- **`triggerBreakdown(supabase, featureId)`** — exported function that:
  1. Fetches feature (company_id, project_id, title, spec, acceptance_tests)
  2. Idempotency guard: checks for existing non-terminal breakdown job via `.maybeSingle()`
  3. Inserts a `job_type='breakdown'`, `role='tech-lead'`, `status='queued'` job with context containing feature details
  4. CAS-updates feature status from `'approved'` → `'building'`
- **`processApprovedFeatures(supabase)`** — polls for features with `status='approved'` and calls `triggerBreakdown` for each. Wired into the main handler as step 3 (between reapDeadMachines and dispatchQueuedJobs).

### Tests (`supabase/functions/orchestrator/orchestrator.test.ts`)
1. **triggerBreakdown — creates queued breakdown job with correct context**: Verifies job insert with correct company_id, project_id, feature_id, role, job_type, status, and JSON context (type, featureId, title, spec, acceptance_tests). Verifies feature status updated to 'building'.
2. **triggerBreakdown — idempotent: skips if active breakdown job exists**: Verifies no job insert and no feature update when an existing breakdown job is found.
- Added `maybeSingle` to the smart mock's method list.

## Acceptance Criteria Checklist
1. Migration 023 adds `tech-lead` role to roles table
2. `triggerBreakdown()` implemented and exported in orchestrator
3. Orchestrator fires `triggerBreakdown` when a feature has status='approved' (via polling in main handler)
4. Idempotency guard prevents duplicate breakdown jobs (checks for existing non-terminal breakdown job)
5. Feature status transitions: approved → building (CAS-guarded update)
6. 2 new tests pass

## Token Usage
- Token budget: claude-ok (wrote code directly)
