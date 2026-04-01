status: pass
summary: Updated the desktop poller to forward normalized expert session data and auto-attach only newly discovered expert tmux sessions after a first-poll baseline. Implemented expert session parsing and rendering in the desktop Pipeline sidebar, including click-to-attach cards and conditional section visibility.
files_changed:
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - .reports/senior-engineer-report.md
failure_reason: ""
