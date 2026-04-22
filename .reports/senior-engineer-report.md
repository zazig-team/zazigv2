status: pass
summary: Implemented `zazig feature-errors` CLI command with feature/job diagnostics, stuck-job detection, recommendations, and optional JSON output; added error_message/error_details columns to jobs via migration; updated query-jobs with error fields and company-level pagination; fixed UUID regex in jobs.ts; added formatted job error display in jobs CLI.
files_changed:
  - packages/cli/src/commands/feature-errors.ts (new)
  - packages/cli/src/commands/jobs.ts
  - packages/cli/src/index.ts
  - supabase/functions/query-jobs/index.ts
  - supabase/migrations/259_jobs_error_columns.sql (new)
  - tests/features/cli-feature-diagnostics.test.ts (new)
  - tests/features/cli-jobs-command-errors-and-filtering.test.ts (new)
failure_reason:
