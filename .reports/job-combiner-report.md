status: success
branch: feature/desktop-sidebar-lists-all-permanent-agen-434544fa
merged:
  - job/62913dea-9c9c-41d0-be00-b15034a2c057
conflicts_resolved: []
failure_reason:

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
