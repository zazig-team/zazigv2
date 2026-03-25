# CI-Gated Pipeline Phase 2: TDD Test Job

## Context

Phase 1 shipped (March 16-17): CI status polling, auto-merge on green, auto-fail on red, workflow injection for repos without CI. Three sub-features, all complete.

Phase 1 made CI the quality gate. Phase 2 makes CI meaningful by generating tests that encode acceptance criteria before implementation begins.

Design doc for Phase 1: `docs/plans/2026-03-12-feature-level-tdd-ci-verification.md`

## Problem

CI runs whatever tests already exist in the repo. For new features, there are often no relevant tests — CI passes vacuously. The pipeline has a quality gate with nothing behind it.

## Solution

Add a `writing_tests` stage to the feature lifecycle. After breakdown completes, the orchestrator injects a test job that writes feature-level integration tests from the spec and acceptance criteria. Implementation jobs only start after the test job completes. CI then validates that implementation makes those tests pass.

## Feature Lifecycle

```
breaking_down → writing_tests → building → combining_and_pr → ci_checking → merging → complete
```

`writing_tests` is a new stage between `breaking_down` and `building`. Fast-track features skip it (same as they skip breakdown).

## Design

### 1. Orchestrator: triggerTestWriting()

New function modelled on `triggerBreakdown()`. Called when the breakdown job completes.

**Transition:** `breaking_down → writing_tests` (CAS guard prevents double-firing)

**Inserts a single job:**

| Field | Value |
|-------|-------|
| role | `test-engineer` |
| job_type | `test` |
| slot_type | `claude_code` |
| model | `claude-sonnet-4-6` |
| status | `created` |
| complexity | `medium` |

**Job context payload:**

```json
{
  "type": "test",
  "featureId": "<uuid>",
  "title": "<feature title>",
  "spec": "<feature spec>",
  "acceptance_tests": "<feature acceptance_tests>",
  "test_dir": "tests/features/",
  "example_tests": ["packages/local-agent/src/executor.test.ts"]
}
```

`example_tests` is hardcoded for zazigv2. Per-project customisation is out of scope.

### 2. processFeatureLifecycle() Changes

**Modified step — breakdown complete:**

Currently: breakdown job completes → feature transitions to `building`.
New: breakdown job completes → feature transitions to `writing_tests`, orchestrator calls `triggerTestWriting()`.

**New step — test job complete:**

For features in `writing_tests` status:
- Query the test job for this feature
- If complete → transition `writing_tests → building`
- If failed → existing retry/escalation handles it (no new logic)
- If still running → skip (check again next loop)

### 3. Test Engineer Role

New contractor role: `test-engineer`

**Prompt focus:**
- Read the feature spec and acceptance_tests from job context
- Read existing test files in the repo for patterns and conventions (pointed at example files)
- Write integration/feature-level tests to `tests/features/` directory
- Tests encode the acceptance criteria as executable assertions
- Do NOT implement any feature code — tests only
- Tests should fail against the current codebase (testing something that doesn't exist yet)

**Model:** Sonnet. On failure, follows existing retry/escalation ladder (Sonnet → Opus → stop).

### 4. Database Migration

Single migration with three changes:

1. **Add `writing_tests` to feature status constraint** — between `breaking_down` and `building`
2. **Add `test` to job_type constraint** — alongside `breakdown`, `code`, `combine`, `verify`, `merge`, `ci_check`, `deploy_to_test`
3. **Insert `test-engineer` contractor role** — with prompt, model set to `claude-sonnet-4-6`

No new tables, no new columns, no schema changes beyond expanding two enum constraints and inserting a role row.

### 5. Dashboard

Map `writing_tests` → "WRITING TESTS" in the frontend status config. One-line change. The feature card, job dots, and detail panel all work with any status — no other UI changes needed.

## What's NOT in Phase 2

- **Red-green verification** — confirming tests fail before implementation starts (Phase 3)
- **Per-project test config** — framework detection, custom test directories, custom example files
- **Test quality validation** — assessing whether generated tests are meaningful
- **Changes to breakdown agent or batch-create-jobs** — untouched
- **Changes to CI workflow** — `tests/features/` is picked up automatically by `npm run test`

## Risks

| Risk | Mitigation |
|------|------------|
| Test-engineer writes tests that don't compile | Retry/escalation handles compile failures — same as any failed job |
| Tests are too trivial or don't test the right thing | Accepted for Phase 2. Test quality is a Phase 3 concern |
| Extra latency from the new stage | One job, runs in parallel with nothing. Adds minutes, not hours |
| Tests reference implementation that doesn't exist yet | Expected — tests are written first, implementation makes them pass |

## Files Affected

- `supabase/functions/orchestrator/index.ts` — `triggerTestWriting()`, `processFeatureLifecycle()` modifications
- `supabase/functions/_shared/pipeline-utils.ts` — possible helper additions
- `supabase/migrations/` — new migration (status constraint, job_type constraint, role insert)
- `packages/webui/` — status label mapping for dashboard
- Contractor role prompt — in the migration SQL

## Relationship to Phase 3

Phase 3 adds enforcement: features without a passing test job can't proceed to combining. Phase 3 may also add red-green verification (confirm tests fail before implementation, confirm they pass after). Phase 2 gets the mechanics in place — Phase 3 makes them strict.
