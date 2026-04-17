-- 243_weekly_digest_cron.sql
-- Schedule weekly digest emails via pg_cron + pg_net.
-- Runs every Monday at 09:00 UTC and calls the send-weekly-digest edge function.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  SELECT jobid
  INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'weekly-digest-send'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
END
$$;

SELECT cron.schedule(
  'weekly-digest-send',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://jmussmwglgbwncgygzbz.supabase.co/functions/v1/send-weekly-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
