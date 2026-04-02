status: pass
summary: Added queued expert-session switching in the desktop renderer so IPC auto-switch and manual expert clicks both detach/attach safely and keep sidebar active-session state in sync.
files_changed:
  - packages/desktop/src/renderer/App.tsx
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - packages/desktop/src/renderer/global.d.ts
failure_reason: ""

---

summary: Implemented tmux-based liveness detection for expert sessions — poller enriches run sessions with tmux_alive field, sidebar shows green dot for alive sessions and hides dead ones, transient statuses show yellow indicator.
files_changed:
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - packages/cli/src/commands/status.ts

---

summary: Updated local-agent expert session lifecycle to write `run` at launch and never write any post-run completion status to the database.
files_changed:
  - packages/local-agent/src/expert-session-manager.ts
  - packages/local-agent/src/expert-session-manager.test.ts
failure_reason:

---

summary: Added behavior-focused regression coverage for persistent-agent sidebar rendering/semantics and queue-driven agent switching, including detach-before-attach sequencing and non-running no-op assertions.
files_changed:
  - packages/desktop/src/renderer/persistent-agents.ts
  - packages/desktop/src/renderer/App.tsx
  - tests/features/desktop-sidebar-persistent-agents-switching.test.ts
