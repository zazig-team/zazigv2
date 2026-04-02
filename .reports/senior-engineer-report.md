status: pass
summary: Implemented tmux-based liveness detection for expert sessions — poller enriches run sessions with tmux_alive field, sidebar shows green dot for alive sessions and hides dead ones, transient statuses show yellow indicator.
files_changed:
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - packages/cli/src/commands/status.ts
  - .reports/senior-engineer-report.md
failure_reason: ""

---

summary: Added behavior-focused regression coverage for persistent-agent sidebar rendering/semantics and queue-driven agent switching, including detach-before-attach sequencing and non-running no-op assertions.
files_changed:
  - packages/desktop/src/renderer/persistent-agents.ts
  - packages/desktop/src/renderer/App.tsx
  - tests/features/desktop-sidebar-persistent-agents-switching.test.ts
failure_reason:
