status: pass
summary: Added error_message/error_details fields to query-jobs edge function and CLI formatted output, plus company-level job listing support
files_changed:
  - supabase/migrations/259_jobs_error_columns.sql
  - supabase/functions/query-jobs/index.ts
  - packages/cli/src/commands/jobs.ts
