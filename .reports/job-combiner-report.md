status: success
branch: feature/weekly-digest-email-4140c138
merged:
  - job/874da901-f1fd-4f02-9bb3-fdfeacda3a2e
conflicts_resolved: []
failure_reason:

PR: https://github.com/zazig-team/zazigv2/pull/430

CI workflow already exists on master — skipped injection.

Merged files:
- supabase/functions/_shared/digest-template.ts (new)
- supabase/functions/_shared/resend.ts (new)
- supabase/functions/send-weekly-digest/deno.json (new)
- supabase/functions/send-weekly-digest/index.ts (new)
- supabase/migrations/241_weekly_digest_data_fn.sql (new)
- supabase/migrations/242_weekly_digest_cron.sql (new)
- supabase/migrations/243_weekly_digest_cron.sql (new)
- tests/features/weekly-digest-email.test.ts (new)
