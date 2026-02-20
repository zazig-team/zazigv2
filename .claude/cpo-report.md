# CPO Report — Pipeline Task 7: Test Environment Deployment + Queue

## Summary
Implemented adapter-based test environment deployer in the local agent and added queue-aware `promoteToTesting` logic to the orchestrator. After feature verification passes, the orchestrator checks whether the test environment is free, promotes the feature to "testing" status, and broadcasts a `DeployToTest` message to local agents.

## Files Changed

### New Files
- `packages/local-agent/src/deployer.ts` — `DeployResult`, `DeployAdapter` interfaces; `NetlifyAdapter`, `SupabaseAdapter`, `TestEnvDeployer` classes
- `packages/local-agent/src/deployer.test.ts` — 7 tests covering all deployer behavior

### Modified Files
- `supabase/functions/orchestrator/index.ts` — Added `promoteToTesting()` function with queue logic; wired `handleJobComplete` to call it for feature_verification jobs; added `DeployToTest` type import; expanded job select to include `context` and `feature_id`

## Deliverable 1: deployer.ts (TDD)

### Architecture
- **DeployAdapter interface** — `deploy(branch, projectId) → DeployResult`
- **NetlifyAdapter** — runs `netlify deploy --branch=<branch> --site=<siteId> --prod`; falls back to projectId when no siteId provided; returns `https://<branch>--<site>.netlify.app` on success
- **SupabaseAdapter** — runs `supabase functions deploy --project-ref=<projectId>`; returns `https://<projectId>.supabase.co` on success
- **TestEnvDeployer** — adapter router: looks up projectType in adapters Map, delegates to matched adapter
- Constructor injection of `ExecFn` (same pattern as verifier.ts) for testability

### Tests (7 passing)
1. `TestEnvDeployer.deploy` — returns error when no adapter for projectType
2. `TestEnvDeployer.deploy` — delegates to adapter and returns its result
3. `NetlifyAdapter.deploy` — calls execFile with correct netlify args, returns success with url
4. `NetlifyAdapter.deploy` — falls back to projectId when no siteId provided
5. `NetlifyAdapter.deploy` — returns failure result when execFile throws
6. `SupabaseAdapter.deploy` — calls execFile with correct supabase args, returns success
7. `SupabaseAdapter.deploy` — returns failure result when execFile throws

## Deliverable 2: promoteToTesting in orchestrator

### Queue Logic
1. Fetch feature details (project_id, company_id, feature_branch)
2. Check if another feature is already in "testing" status for the same project
3. If test env busy → feature stays in "verifying" (queued implicitly)
4. If test env free → update feature status to "testing" → broadcast DeployToTest

### Wiring
- `handleJobComplete` now selects `context` and `feature_id` in addition to `job_type`
- After marking job complete and releasing slot, parses `context` JSON
- If `context.type === "feature_verification"` and feature_id exists → calls `promoteToTesting`

## Tests
- 7/7 deployer tests passing
- 27/27 total tests passing across local-agent (deployer + fix-agent + branches)
- TypeScript compiles cleanly across all workspaces (`npm run typecheck` exit 0)
- Note: executor.test.ts and verifier.test.ts have pre-existing failures (vite can't resolve `@zazigv2/shared` in test context) — unrelated to this PR

## Acceptance Criteria
- [x] `packages/local-agent/src/deployer.ts` created with `DeployResult`, `DeployAdapter`, `NetlifyAdapter`, `SupabaseAdapter`, `TestEnvDeployer`
- [x] `packages/local-agent/src/deployer.test.ts` created with 7 tests, all passing
- [x] `promoteToTesting` added to orchestrator/index.ts
- [x] `handleJobComplete` wired to call `promoteToTesting` for feature_verification jobs
- [x] All local-agent tests pass: `cd packages/local-agent && npm test` (excluding pre-existing failures)
- [x] TypeScript compiles: `npm run typecheck` from repo root

## Token Usage
- Routing: claude-ok
- Claude used directly for all implementation, testing, and verification
