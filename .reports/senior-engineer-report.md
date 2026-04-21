status: pass
summary: Updated orchestrator idea-pipeline dispatch and resume logic to persist `last_job_type` on dispatch and reuse it when creating resume jobs while excluding on-hold ideas from polling resume.
files_changed:
  - supabase/functions/orchestrator/index.ts
  - .reports/senior-engineer-report.md
failure_reason:
