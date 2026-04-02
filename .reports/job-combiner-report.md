status: success
branch: feature/fix-master-ci-failure-run-npm-run-test-53f5830b
merged: []
conflicts_resolved: []
failure_reason:

## Notes

- jobBranches was empty — no branches to merge
- ci.yml already exists on master (skipped CI injection)
- Feature branch pushed to origin successfully
- PR not created: feature branch is identical to master (no commits to merge)

---

branch: feature/desktop-expert-session-auto-switch-and-s-5b40e4e1
merged:
  - job/bdc3c60a-42cf-45fa-94df-3b72be24a247
conflicts_resolved: []
failure_reason:

## Notes

- Feature branch created from master (did not exist on remote)
- Job branch `job/bdc3c60a-42cf-45fa-94df-3b72be24a247` merged with `--no-ff`, no conflicts
- CI workflow already exists on master — skipped injection
- Feature branch pushed and PR created: https://github.com/zazig-team/zazigv2/pull/396

## Merged Changes

- `App.tsx`: Expert session auto-switch logic and IPC wiring
- `PipelineColumn.tsx`: `onExpertClick` prop and active session highlight
- `ipc-channels.ts`, `preload.ts`, `global.d.ts`: New IPC channel for expert session switching
- `poller.ts`, `index.ts`: Expert session polling support
- `tests/features/desktop-expert-session-auto-switch-state-sync.test.ts`: Feature test coverage

---

branch: feature/expert-session-liveness-tmux-as-source-o-3b53251b
merged:
  - job/fc3a00f7-ece2-4bfa-813e-b29e41aa1e93
  - job/f6892343-093c-4049-ade9-d2dd63ae4e49
  - job/a48076ca-ad09-4058-8755-d64accde03fa
conflicts_resolved:
  - {file: .reports/senior-engineer-report.md, resolution: merged both summaries — tmux liveness detection from job/fc3a00f7 and local-agent run status lifecycle from job/f6892343}
  - {file: .reports/junior-engineer-report.md, resolution: merged both summaries — CLI status whitelist/recency filter from job/fc3a00f7 and orchestrator run status update from job/a48076ca}

## Notes

- All three job branches fetched and merged with --no-ff
- Conflicts were only in report files (.reports/senior-engineer-report.md and .reports/junior-engineer-report.md), resolved by combining both summaries
- CI workflow already exists on master — skipped injection
- Branch pushed and PR created: https://github.com/zazig-team/zazigv2/pull/398

---

branch: feature/desktop-sidebar-lists-all-permanent-agen-434544fa
merged:
  - job/62913dea-9c9c-41d0-be00-b15034a2c057
conflicts_resolved: []

## Notes

- Feature branch created from origin/master
- Job branch merged with --no-ff strategy, no conflicts
- CI workflow already exists on master branch — skipped injection
- PR created: https://github.com/zazig-team/zazigv2/pull/397

## Changes merged

- `.reports/senior-engineer-report.md` — updated
- `.reports/test-engineer-report.md` — added
- `packages/desktop/src/renderer/App.tsx` — updated with persistent agents integration
- `packages/desktop/src/renderer/components/PipelineColumn.tsx` — updated to list all permanent agents
- `packages/desktop/src/renderer/persistent-agents.ts` — new module for tracking persistent agents
- `tests/features/desktop-sidebar-persistent-agents-switching.test.ts` — new feature tests
