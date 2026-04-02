status: success
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
