status: pass
summary: Implemented tmux-based liveness detection for expert sessions — poller enriches run sessions with tmux_alive field, sidebar shows green dot for alive sessions and hides dead ones, transient statuses show yellow indicator. Also updated local-agent expert session lifecycle to write `run` at launch and never write any post-run completion status to the database.
files_changed:
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - packages/cli/src/commands/status.ts
  - packages/local-agent/src/expert-session-manager.ts
  - packages/local-agent/src/expert-session-manager.test.ts
  - .reports/senior-engineer-report.md
failure_reason: ""
