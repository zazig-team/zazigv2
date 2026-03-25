# Feature-Level TDD: Replace Verify Step with CI-Gated Merging

## Problem

The current verify step (reviewer agent) is a rubber stamp. It runs after combining, spawns a Claude agent to "review" code, but:
- Passive verification unconditionally triggers merging on `job_complete` — it never checks the pass/fail result
- Active verification checks pass/fail but isn't the default
- The per-job JobVerifier (rebase, test, lint, typecheck) is dead code — never called
- Burns a Claude slot and adds latency for zero value

## Proposal

Replace the verify step with **feature-level TDD**: the first job created for every feature writes integration tests that prove the acceptance criteria. All subsequent implementation jobs work towards making those tests pass. CI runs on the PR and the orchestrator auto-merges when green.

## New Feature Lifecycle

```
breaking_down → building → combining_and_pr → [CI runs on PR] → merging → complete
```

The `verifying` status is removed entirely.

### What Changes

| Current | New |
|---------|-----|
| Breakdown creates implementation jobs | Breakdown creates a **test job first**, then implementation jobs |
| Combine complete → `verifying` → reviewer agent → `merging` | Combine complete → PR created → CI runs → orchestrator polls → `merging` |
| Reviewer agent writes `reviewer-report.md` | GitHub Actions runs tests, lint, typecheck |
| `verifying` feature status | Removed — stays in `combining_and_pr` until CI passes |

## Design

### 1. Test Job (First Job in Every Feature)

When the breakdown agent (or `triggerBreakdown`) creates jobs for a feature, the **first job** should be a test-writing job:

- **role**: `test-engineer` (new role)
- **job_type**: `test`
- **context**: The feature spec, acceptance criteria, and description
- **purpose**: Write integration/e2e tests that encode the acceptance criteria as executable assertions
- **output**: Test files committed to the feature branch
- **depends_on**: `[]` (no dependencies — runs first)

All subsequent implementation jobs would `depends_on` the test job (or at minimum, the tests exist on the feature branch before implementation begins).

The test job's output becomes the source of truth for "is this feature done?" — if the tests pass, the feature works.

#### Open Questions

- **What testing framework?** This depends on the target repo. The test job needs to know what framework is available (jest, vitest, playwright, etc.) and where tests live.
- **Should the test job run the tests to confirm they fail?** Classic TDD says yes — red, green, refactor. The test job could verify the tests fail (proving they're actually testing something), then implementation jobs make them pass.
- **How does the breakdown agent know to create this job first?** Options:
  - The breakdown agent's prompt explicitly instructs it to create a test job first
  - The orchestrator injects a test job automatically before breakdown results are saved
  - `triggerBreakdown` creates the test job itself, then the breakdown agent creates the rest
- **What if the repo has no test infrastructure?** The test job could set it up, or the feature could skip the test job for repos without a test framework configured.

### 2. CI Workflow (GitHub Actions)

The target repos need a CI workflow that runs on PRs. This is standard GitHub Actions:

```yaml
# .github/workflows/ci.yml
name: CI
on:
  pull_request:
    branches: [master]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run typecheck
```

This already exists for zazigv2 itself. For customer repos, the setup job or project onboarding would need to ensure this workflow exists.

### 3. Orchestrator: Poll PR CI Status and Auto-Merge

The orchestrator loop (`processFeatureLifecycle`) gets a new step replacing the `combining_and_pr → verifying` transition:

**New step: `combining_and_pr` → check PR CI → `merging`**

```
For each feature in 'combining_and_pr' where combine job is complete:
  1. Check if PR exists (feature.pr_url / feature.pr_number)
  2. If no PR yet → skip (PR creation is async)
  3. If PR exists → check CI status via GitHub API
  4. If CI passing → call triggerMerging()
  5. If CI failing → mark feature as failed with CI error details
  6. If CI pending → skip (check again next loop iteration)
```

#### GitHub API for CI Status

The orchestrator already has `GITHUB_TOKEN` configured and uses it for PR creation. To check CI status:

```typescript
// GET /repos/{owner}/{repo}/commits/{ref}/check-runs
const response = await fetch(
  `https://api.github.com/repos/${owner}/${repo}/commits/${branch}/check-runs`,
  { headers: { Authorization: `Bearer ${githubToken}` } }
);
const { check_runs } = await response.json();

// All checks must be complete and successful
const allPassed = check_runs.length > 0
  && check_runs.every(run => run.status === "completed" && run.conclusion === "success");
const anyFailed = check_runs.some(run => run.status === "completed" && run.conclusion === "failure");
const pending = check_runs.some(run => run.status !== "completed");
```

#### Auto-Merge

Once CI passes, the orchestrator calls `triggerMerging()` (existing function) which:
1. Creates a merge job
2. Transitions feature from current status → `merging`
3. The merge job merges the PR via the GitHub API or pushes to master

The `triggerMerging` CAS guard currently expects `verifying` as the source status — this needs to change to `combining_and_pr`.

### 4. Code Changes Required

#### Remove
- `triggerFeatureVerification()` from `pipeline-utils.ts`
- All calls to `triggerFeatureVerification` in `agent-event/handlers.ts` and `orchestrator/index.ts`
- The `verifying` feature status (migration to remove from constraint)
- The `verification_type` column on features (or leave it, it's harmless)
- Reviewer role prompt (migration 078) — or leave it for expert sessions
- `verify_queued` and `verify_failed` job statuses (or leave for backward compat)

#### Modify
- `processFeatureLifecycle` step 4: replace `combining_and_pr → verifying` with `combining_and_pr → check CI → merging`
- `triggerMerging`: change CAS source status from `verifying` to `combining_and_pr`
- `handleJobComplete` in `agent-event/handlers.ts`: when combine job completes, skip the verify trigger — the orchestrator loop handles the CI check
- Breakdown agent prompt / `triggerBreakdown`: ensure test job is created first

#### Add
- New `processFeatureLifecycle` step: poll PR CI status for `combining_and_pr` features
- `test-engineer` role and prompt (migration)
- Helper function: `checkPRCIStatus(owner, repo, branch)` → `"passing" | "failing" | "pending"`
- CI workflow template for new project repos (could be part of `zazig setup`)

### 5. Migration Path

This can be rolled out incrementally:

1. **Phase 1**: Add CI status polling + auto-merge. Remove verify step. Features go straight from combine → CI check → merge. No test job yet.
2. **Phase 2**: Add test-engineer role. Breakdown creates test job first. Implementation jobs depend on it.
3. **Phase 3**: Enforce test job — features without a passing test job can't proceed to combining.

Phase 1 alone delivers most of the value (removing the useless verify step, adding real CI gating). Phase 2 is the TDD improvement that makes CI meaningful — without it, CI just runs whatever tests already exist in the repo.

### 6. Edge Cases

- **No CI workflow in repo**: The orchestrator should handle the case where a PR has zero check runs. Options: auto-merge anyway (current behavior, effectively), or require at least one check.
- **CI flaky/stuck**: Need a timeout. If CI hasn't completed after N minutes (configurable, default 15?), mark as needing attention rather than waiting forever.
- **Feature has no PR**: Some features (standalone jobs) may not create PRs. These should skip the CI gate.
- **PR merge conflicts**: CI may pass but merge fails due to conflicts with master. The merge job already handles this — it would fail and the feature would need a fix cycle.
