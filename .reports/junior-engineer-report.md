status: pass
summary: Fixed completed features ordering to sort by completed_at DESC instead of updated_at so recently completed features (v0.58.0, v0.59.0) appear first.
files_changed:
  - packages/webui/src/lib/queries.ts
  - supabase/migrations/230_completed_features_recent_order.sql
  - .reports/junior-engineer-report.md
failure_reason:
