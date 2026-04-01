status: fail
summary: Updated query-jobs to return top-level feature_title from a features join and switched desktop pipeline polling/rendering to use real jobs/features data with active and queued job sections.
files_changed:
  - supabase/functions/query-jobs/index.ts
  - packages/desktop/src/main/poller.ts
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
  - .reports/junior-engineer-report.md
failure_reason: Unable to stage/commit due sandbox filesystem restrictions on git object database writes ("unable to create temporary file: Operation not permitted").
