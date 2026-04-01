status: pass
summary: Extended the status CLI payload with job/feature metadata and updated the desktop sidebar and poller to render active, queued, failed, and completed sections from status-only polling.
files_changed:
  - packages/cli/src/commands/status.ts
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
failure_reason: 
