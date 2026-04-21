status: pass
summary: Implemented migration 248 to add nullable jobs.idea_id with idempotent FK to ideas(id) using ON DELETE SET NULL and an index on jobs.idea_id.
files_changed:
  - supabase/migrations/248_jobs_idea_id.sql
  - .reports/junior-engineer-report.md
failure_reason: 
