status: success
branch: feature/fix-master-ci-failure-run-npm-run-test-aa9308b7
merged:
  - job/99f1ccd0-607d-4baa-9810-763565c7f179 (already merged — skipped)
conflicts_resolved:
  - file: .reports/job-combiner-report.md, resolution: kept current feature branch report over stale master report from prior combine job
failure_reason:

## Notes

The job branch `job/99f1ccd0-607d-4baa-9810-763565c7f179` had already been fully merged into master
(as commit `4102b92f fix: deploy all edge functions to resolve master CI failures (#406)`).

`git branch --merged` confirmed the branch was already merged relative to HEAD.
`git log job/... ^master` returned no unique commits.

The feature branch `feature/fix-master-ci-failure-run-npm-run-test-aa9308b7` was pushed to origin
with this report commit to allow PR creation.

CI workflow: `ci.yml` already exists on master — no injection needed.
- PR created: https://github.com/zazig-team/zazigv2/pull/409
