status: success
branch: feature/desktop-drag-and-drop-image-support-in-c-83946e93
merged:
  - job/455d584c-bc54-4683-8909-55f628535c8c
conflicts_resolved: []
failure_reason:

PR: https://github.com/zazig-team/zazigv2/pull/387

## Notes
- Feature branch created from master (did not exist remotely)
- Job branch merged successfully with no conflicts using `git merge --no-ff`
- CI workflow already exists on master branch — skipped CI injection
- Feature branch pushed and PR created at zazig-team/zazigv2#387

## Job (455d584c): Desktop drag and drop image support
- packages/desktop/src/main/index.ts — IPC handler for image drag and drop
- packages/desktop/src/main/ipc-channels.ts — new IPC channel constant
- packages/desktop/src/main/preload.ts — preload API surface for drag-drop images
- packages/desktop/src/renderer/components/TerminalPane.tsx — drag and drop UI handling
- packages/desktop/src/renderer/global.d.ts — TypeScript type for new preload API
- tests/features/desktop-drag-and-drop-image-support.test.ts — feature test suite
- .reports/junior-engineer-report.md — updated
- .reports/senior-engineer-report.md — updated
- .reports/test-engineer-report.md — updated
