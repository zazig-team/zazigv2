status: pass
summary: Extended `zazig status --json` with job titles/feature joins plus queued and feature summary arrays, then updated desktop polling/rendering to use status-only data with a new queued jobs section.
files_changed:
  - packages/cli/src/commands/status.ts
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - .reports/junior-engineer-report.md
failure_reason: ""
