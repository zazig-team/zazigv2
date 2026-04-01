status: pass
summary: Updated query-jobs to return top-level feature_title from features join, switched desktop poller to use direct CLI calls for jobs/features data, and updated PipelineColumn to show real job/feature data with active jobs, queued jobs, and correct card layout.
files_changed:
  - supabase/functions/query-jobs/index.ts
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - .reports/junior-engineer-report.md
failure_reason:
