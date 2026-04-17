-- 244_weekly_digest_cron.sql
-- Schedule weekly digest emails via pg_cron + pg_net.
-- Runs every Monday at 09:00 UTC and calls the send-weekly-digest edge function.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('send-weekly-digest')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-weekly-digest');

SELECT cron.schedule(
  'send-weekly-digest',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://jmussmwglgbwncgygzbz.supabase.co/functions/v1/send-weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.settings.service_role_key', true), '')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
