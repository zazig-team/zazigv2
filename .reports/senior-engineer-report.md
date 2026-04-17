status: pass
summary: Implemented persistent-agent dead-session respawn handling with circuit-breaker protections and wired it into heartbeat and post-spawn failure paths.
files_changed:
  - packages/local-agent/src/executor.ts
failure_reason: ""

summary: Added migration 241_weekly_digest_data_fn.sql with a SECURITY DEFINER get_weekly_digest_data(UUID) JSONB function that returns weekly shipped features, merged PR count, failed jobs, and founder email for a company.

summary: Implemented a new send-weekly-digest Supabase Edge Function with service-role auth, per-company digest orchestration via get_weekly_digest_data, email rendering/sending, per-company logging, and weekly cron scheduling support.
files_changed:
  - supabase/functions/send-weekly-digest/index.ts
  - supabase/functions/send-weekly-digest/deno.json
  - supabase/migrations/241_weekly_digest_data_fn.sql
  - supabase/migrations/242_weekly_digest_cron.sql
failure_reason:
