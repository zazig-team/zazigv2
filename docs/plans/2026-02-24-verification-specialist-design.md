# Verification Specialist Contractor

**Date:** 2026-02-24
**Status:** Design complete, ready for implementation
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

## Implementation (9 steps)

### Step 1: Migration — `verification-specialist` role

**Create:** `supabase/migrations/045_verification_specialist_role.sql`

Insert into `roles` table:
- name: `verification-specialist`
- is_persistent: false
- default_model: `claude-sonnet-4-6`
- slot_type: `claude_code`
- prompt: Role prompt explaining the contractor's purpose and report format
- skills: `{verify-feature}`

### Step 2: Migration — `verification_type` column on features

**Create:** `supabase/migrations/046_feature_verification_type.sql`

```sql
ALTER TABLE public.features
  ADD COLUMN verification_type text NOT NULL DEFAULT 'passive'
  CHECK (verification_type IN ('passive', 'active'));
```

- `passive` (default): existing reviewer path (code review + rebase + tests)
- `active`: Verification Specialist exercises the system against ACs

### Step 3: `query-jobs` edge function

**Create:** `supabase/functions/query-jobs/index.ts` + `deno.json`

Pattern: mirrors `query-features/index.ts`. Accepts:
- `job_id` (optional) — single job lookup
- `feature_id` (optional) — all jobs for a feature
- `status` (optional) — filter by status

Returns: id, title, status, role, job_type, depends_on, started_at, completed_at, result.

### Step 4: `query_jobs` MCP tool

**Edit:** `packages/local-agent/src/agent-mcp-server.ts`

Add `query_jobs` tool following existing patterns. Calls the `query-jobs` edge function.

### Step 5: `verify-feature` skill file

**Create:** `projects/skills/verify-feature.md`

The brain of the Verification Specialist. Follows jobify.md pattern. Defines:
- How to parse Gherkin ACs from feature record
- How to translate each AC into executable test steps using MCP tools
- Polling strategy (10s intervals, 3 min per-AC timeout, 15 min total)
- Report format: `.claude/verification-report.md` with per-AC pass/fail

### Step 6: Update `workspace.ts` — role-scoped tools

**Edit:** `packages/local-agent/src/workspace.ts`

Add to `ROLE_ALLOWED_TOOLS`:
```typescript
"verification-specialist": ["query_features", "query_jobs", "batch_create_jobs", "commission_contractor"],
```

### Step 7: Update `commission-contractor` edge function

**Edit:** `supabase/functions/commission-contractor/index.ts`

- Add `"verification-specialist"` to `CONTRACTOR_ROLES`
- Add title: `"Verify feature acceptance criteria"`
- Add job_type: `"verify"`
- Verification specialist requires `feature_id` (like breakdown-specialist)

### Step 8: Update orchestrator — auto-commission on feature completion

**Edit:** `supabase/functions/orchestrator/index.ts`

In `triggerFeatureVerification()`:
- Read `feature.verification_type`
- If `active`: insert a job with `role: "verification-specialist"`, `job_type: "verify"`, context containing feature_id + acceptance_tests
- If `passive`: existing reviewer path (unchanged)

In dispatch logic (`dispatchQueuedJobs`):
- When `job_type === "verify"` and `role === "verification-specialist"`: dispatch as normal `StartJob` (not `VerifyJob`), so it gets full workspace with MCP tools and skills
- When `job_type === "verify"` and `role === "reviewer"`: existing `VerifyJob` path (unchanged)

In `handleJobComplete`:
- Handle verification-specialist completion: read result, if passed → `initiateTestDeploy()`, if failed → notify CPO

### Step 9: Update `commission_contractor` MCP tool

**Edit:** `packages/local-agent/src/agent-mcp-server.ts`

Add `"verification-specialist"` to the role enum in the commission_contractor tool's zod schema.

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/migrations/045_verification_specialist_role.sql` | CREATE |
| `supabase/migrations/046_feature_verification_type.sql` | CREATE |
| `supabase/functions/query-jobs/index.ts` | CREATE |
| `supabase/functions/query-jobs/deno.json` | CREATE |
| `projects/skills/verify-feature.md` | CREATE |
| `supabase/functions/commission-contractor/index.ts` | EDIT |
| `supabase/functions/orchestrator/index.ts` | EDIT |
| `packages/local-agent/src/agent-mcp-server.ts` | EDIT |
| `packages/local-agent/src/workspace.ts` | EDIT |

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
