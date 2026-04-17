status: pass
summary: Implemented persistent-agent dead-session respawn handling with circuit-breaker protections and wired it into heartbeat and post-spawn failure paths.
files_changed:
  - packages/local-agent/src/executor.ts
failure_reason: ""

summary: Added migration 241_weekly_digest_data_fn.sql with a SECURITY DEFINER get_weekly_digest_data(UUID) JSONB function that returns weekly shipped features, merged PR count, failed jobs, and founder email for a company.
files_changed:
  - supabase/migrations/241_weekly_digest_data_fn.sql
failure_reason:
