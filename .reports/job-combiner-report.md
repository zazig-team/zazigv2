status: success
branch: feature/desktop-company-picker-dropdown-to-selec-9d25de2d
merged:
  - job/ebd4de18-0435-4c7d-b72a-76a356d2b0d9
conflicts_resolved: []
failure_reason:

PR created: https://github.com/zazig-team/zazigv2/pull/381

## Notes
- Job branch merged successfully with no conflicts
- CI workflow already exists on master — skipped CI injection
- Feature branch pushed and PR created at zazig-team/zazigv2#381

## Job (ebd4de18): Desktop company picker dropdown
- packages/desktop/src/main/cli.ts — company picker CLI support
- packages/desktop/src/main/index.ts — IPC handlers for company selection
- packages/desktop/src/main/ipc-channels.ts — new IPC channel definitions
- packages/desktop/src/main/poller.ts — poller updates for company data
- packages/desktop/src/main/preload.ts — preload bridge exposure
- packages/desktop/src/renderer/components/PipelineColumn.tsx — dropdown UI
