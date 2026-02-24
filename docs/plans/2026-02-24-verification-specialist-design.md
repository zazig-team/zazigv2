# Verification Specialist Contractor

**Date:** 2026-02-24
**Status:** Implemented and deployed (PR #94)
**Author:** Tom + Claude (brainstorming session)
**Pattern:** Contractor Pattern (skill + MCP). See `2026-02-24-idea-to-job-pipeline-design.md` Section 6.
**Companion:** `2026-02-24-idea-to-job-pipeline-design.md` (pipeline context), `2026-02-24-jobify-skill-design.md` (contractor pattern reference)

---

## Context

We've been manually creating test jobs, polling their status, and validating results. This is the fourth time we've done it today (single dispatch, sequential DAG, parallel DAG, commission contractor). The pattern is always: create jobs via Supabase → wait → query status → check timing/ordering → report pass/fail.

This should be a contractor. The pipeline already has the contractor pattern (skill + MCP tools), and the orchestrator already has verification stages. We're filling the gap: **active acceptance test execution** (as opposed to passive code review, which the existing `reviewer` role handles).

## What We're Building

A **Verification Specialist** contractor that:
- Gets auto-commissioned when a feature's jobs are all done (for features flagged `verification_type: 'active'`)
- Reads the feature's Gherkin acceptance criteria
- Actively exercises the system (creates test jobs, queries results, calls edge functions)
- Reports pass/fail per AC

The pipeline smoke tests become the first use case — a feature with ACs that test the pipeline infrastructure itself.

---

## Where It Fits

```
[existing]  building → combining → verifying → deploying_to_test
                                      |
                        ┌──────────────┼──────────────┐
                        |              |              |
                  passive (default)    |        active
                  existing reviewer    |        NEW: Verification Specialist
                  code review +        |        exercises system against ACs
                  rebase/test/lint     |        creates test jobs, polls, validates
                        |              |              |
                        └──────────────┼──────────────┘
                                       |
                              deploying_to_test
```

The `verification_type` column on features controls which path. Default is `passive` (existing behavior unchanged).

---

## Implementation (9 steps) — All Complete

### Step 1: Migration — `verification-specialist` role ✅

**Created:** `supabase/migrations/046_verification_specialist_role.sql` (renumbered from 045 — 045 was taken by features_priority)

Inserted into `roles` table with full role prompt defining report format, constraints, and output contract. Skills: `{verify-feature}`.

### Step 2: Migration — `verification_type` column on features ✅

**Created:** `supabase/migrations/047_feature_verification_type.sql` (renumbered from 046)

```sql
ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS verification_type text NOT NULL DEFAULT 'passive'
  CHECK (verification_type IN ('passive', 'active'));
```

### Step 3: `query-jobs` edge function ✅

**Created:** `supabase/functions/query-jobs/index.ts` + `deno.json`

Mirrors `query-features/index.ts`. Accepts `job_id`, `feature_id`, `status`. Returns: id, title, status, role, job_type, complexity, depends_on, started_at, completed_at, result, feature_id, project_id.

### Step 4: `query_jobs` MCP tool ✅

**Edited:** `packages/local-agent/src/agent-mcp-server.ts`

Added `query_jobs` tool calling the `query-jobs` edge function.

### Step 5: `verify-feature` skill file ✅

**Created:** `projects/skills/verify-feature.md`

Full contractor skill with 6-step procedure, polling strategy (10s intervals, 3 min per-AC timeout, 15 min total), report format, and MCP tool mapping.

### Step 6: Update `workspace.ts` — role-scoped tools ✅

**Edited:** `packages/local-agent/src/workspace.ts`

```typescript
"verification-specialist": ["query_features", "query_jobs", "batch_create_jobs", "commission_contractor"],
```

### Step 7: Update `commission-contractor` edge function ✅

**Edited:** `supabase/functions/commission-contractor/index.ts`

- Added `"verification-specialist"` to `CONTRACTOR_ROLES`, titles, types
- `feature_id` required (same validation as breakdown-specialist)

### Step 8: Update orchestrator — auto-commission on feature completion ✅

**Edited:** `supabase/functions/orchestrator/index.ts`

Three changes:
1. `dispatchQueuedJobs`: Routes `verify` jobs with `role !== "verification-specialist"` to VerifyJob; verification-specialist gets normal StartJob (full workspace)
2. `triggerFeatureVerification`: Reads `verification_type` from feature; branches to active (verification-specialist) or passive (reviewer) path
3. `handleJobComplete`: Active verification result parsing — starts with "PASSED" → `initiateTestDeploy()`, otherwise → notify CPO

### Step 9: Update `commission_contractor` MCP tool ✅

**Edited:** `packages/local-agent/src/agent-mcp-server.ts`

Added `"verification-specialist"` to the role enum in the zod schema.

---

## Files Summary

| File | Action | Migration # |
|------|--------|-------------|
| `supabase/migrations/046_verification_specialist_role.sql` | CREATE | 046 |
| `supabase/migrations/047_feature_verification_type.sql` | CREATE | 047 |
| `supabase/functions/query-jobs/index.ts` | CREATE | — |
| `supabase/functions/query-jobs/deno.json` | CREATE | — |
| `projects/skills/verify-feature.md` | CREATE | — |
| `supabase/functions/commission-contractor/index.ts` | EDIT | — |
| `supabase/functions/orchestrator/index.ts` | EDIT | — |
| `packages/local-agent/src/agent-mcp-server.ts` | EDIT | — |
| `packages/local-agent/src/workspace.ts` | EDIT | — |

## Deployment

All migrations run and edge functions deployed (2026-02-24). Verified:
- `verification-specialist` role exists in DB with correct model/skills
- `verification_type` column exists on features with default `'passive'`
- `query-jobs`, `commission-contractor`, `orchestrator` edge functions deployed

---

## Testing

After building, we verify by:

1. **Set the "Pipeline Smoke Test" feature** to `verification_type: 'active'` and populate its `acceptance_tests` with Gherkin ACs for our 4 proven tests
2. **Commission the verification specialist** manually via the edge function (or let the orchestrator auto-trigger it)
3. **Watch it run** — the contractor should create test jobs, poll their status, validate DAG ordering and timing, and produce a verification report
4. **Check the report** — should show pass/fail per AC, matching what we validated manually today

This proves the general pattern works. Every future feature with `verification_type: 'active'` gets automated acceptance testing for free.

---

## Prompt Phasing

Given the parallel execution pattern we used earlier today:

**Phase 1** (parallel): Steps 1-2 (migrations) + Step 5 (skill file) — no code dependencies between them
**Phase 2** (parallel with 1): Steps 3-4 (query-jobs edge function + MCP tool) + Steps 6-7 (workspace + commission-contractor updates) + Step 9
**Phase 3** (depends on 1+2): Step 8 (orchestrator changes)
**Phase 4**: Deploy edge functions + run migrations, then test
