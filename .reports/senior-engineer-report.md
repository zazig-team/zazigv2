status: pass
summary: Added feature diagnostics CLI command (zazig feature-errors), updated query-features edge function with per-feature error summary fields (failed_job_count, critical_error_count, health), updated query-jobs with error fields, fixed UUID regex in jobs.ts, and updated features CLI to show health indicators.
files_changed:
  - packages/cli/src/commands/feature-errors.ts (new)
  - packages/cli/src/commands/features.ts
  - packages/cli/src/commands/jobs.ts
  - packages/cli/src/index.ts
  - supabase/functions/query-features/index.ts
  - supabase/functions/query-jobs/index.ts
failure_reason:
