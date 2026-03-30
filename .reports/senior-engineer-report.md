status: pass
summary: Implemented SessionViewer as a proper exported React-compatible function with SESSION_ENDED_MESSAGE and WAITING_MESSAGE constants that calls embedSession/switchSession, and fixed spy-residue test failures by adding restoreMocks:true to vitest config.
files_changed:
  - packages/tui/src/components/SessionViewer.ts
  - tests/vitest.config.ts
failure_reason:
