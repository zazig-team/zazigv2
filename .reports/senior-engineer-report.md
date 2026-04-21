status: pass
summary: Implemented migration 249 to add `ideas.on_hold`, add nullable `ideas.type` with a type check constraint, and replace `ideas_status_check` with the full existing-plus-new pipeline status set using idempotent patterns.
files_changed:
  - supabase/migrations/249_ideas_pipeline_columns.sql
  - .reports/senior-engineer-report.md
failure_reason: ""
