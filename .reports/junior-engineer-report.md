status: pass
summary: Implemented three desktop UX bug fixes: WebSocket auto-reconnect with exponential backoff in pty.ts, robust session name matching with persistent_agents support in PipelineColumn.tsx, and CPO back-navigation button with terminal:attachDefault IPC in App.tsx/PipelineColumn.tsx/index.ts/preload.ts.
files_changed:
  - packages/desktop/src/main/pty.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - packages/desktop/src/renderer/App.tsx
  - packages/desktop/src/main/index.ts
  - packages/desktop/src/main/preload.ts
  - packages/desktop/src/main/ipc-channels.ts
  - packages/desktop/src/renderer/global.d.ts
  - .reports/junior-engineer-report.md
