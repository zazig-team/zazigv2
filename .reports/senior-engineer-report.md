status: pass
summary: Added behavior-focused regression coverage for persistent-agent sidebar rendering/semantics and queue-driven agent switching, including detach-before-attach sequencing and non-running no-op assertions.
files_changed:
  - packages/desktop/src/renderer/persistent-agents.ts
  - packages/desktop/src/renderer/App.tsx
  - tests/features/desktop-sidebar-persistent-agents-switching.test.ts
failure_reason:
