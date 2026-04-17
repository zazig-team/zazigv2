status: pass
summary: Added migration 241_weekly_digest_data_fn.sql with a SECURITY DEFINER get_weekly_digest_data(UUID) JSONB function that returns weekly shipped features, merged PR count, failed jobs, and founder email for a company.
files_changed:
  - supabase/migrations/241_weekly_digest_data_fn.sql
failure_reason:
