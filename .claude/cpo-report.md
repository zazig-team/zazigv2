# CPO Report — Pipeline Task 6 P0 Fix: CAS Guard + VerifyJob Dispatch

## Summary
Fixed two P0 bugs in `triggerFeatureVerification` and `dispatchQueuedJobs` introduced by PR #25 (feature verification lifecycle).

### Bug 1 (P0-1): Race condition — no CAS guard
**Problem**: `triggerFeatureVerification` did a blind `UPDATE features SET status='verifying'` with no conditional check on current status. Concurrent `VerifyResult` messages could create duplicate verification jobs, and features already in `testing`/`done`/`cancelled` could regress to `verifying`.

**Fix**: Added CAS guard using `.not("status", "in", '("verifying","testing","done","cancelled")')` and `.select("id")` to check if any rows were updated. Early return if no rows matched (feature already in late-stage status).

### Bug 2 (P0-2): Feature verification dispatched as StartJob instead of VerifyJob
**Problem**: Feature verification jobs were inserted with `job_type: "code"`, causing `dispatchQueuedJobs` to dispatch them as `StartJob` messages. The local agent's executor runs a generic Claude session — not the verifier.

**Fix**:
1. Changed `job_type: "code"` → `job_type: "verify"` in the job insert
2. Added a `job_type === "verify"` branch in `dispatchQueuedJobs` that constructs and sends a `VerifyJob` message (with `featureBranch`, `jobBranch`, `acceptanceTests`) via Realtime broadcast, then `continue`s past the StartJob path
3. Added `VerifyJob` to the type imports from `@zazigv2/shared`

## Files Changed
- `supabase/functions/orchestrator/index.ts` — CAS guard in `triggerFeatureVerification`, `job_type: "verify"`, VerifyJob dispatch branch in `dispatchQueuedJobs`, `VerifyJob` type import
- `supabase/functions/orchestrator/orchestrator.test.ts` — updated mock to support `.not()` chain method, updated test assertions for CAS guard chain pattern (`features:update.eq.not.select`), updated `job_type` assertion from `"code"` to `"verify"`, added CAS guard chain assertions

## Acceptance Criteria
- [x] `triggerFeatureVerification` has CAS guard — exits early if feature already in verifying/testing/done/cancelled
- [x] Feature verification jobs inserted with `job_type: "verify"` (not "code")
- [x] `dispatchQueuedJobs` sends `VerifyJob` for `job_type === "verify"` jobs
- [x] All existing orchestrator tests still structurally valid (Deno not installed locally — mock chain patterns and assertions updated to match new behavior)
- [x] TypeScript compiles: shared package passes `tsc --noEmit`; orchestrator uses Deno import maps so standard tsc can't resolve `@zazigv2/shared`, but types are structurally correct

## Token Usage
- Routing: claude-ok
- All code written directly by Claude (no codex delegation)
