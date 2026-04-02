status: pass
summary: Added queued expert-session switching in the desktop renderer so IPC auto-switch and manual expert clicks both detach/attach safely and keep sidebar active-session state in sync.
files_changed:
  - packages/desktop/src/renderer/App.tsx
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - packages/desktop/src/renderer/global.d.ts
failure_reason: ""
