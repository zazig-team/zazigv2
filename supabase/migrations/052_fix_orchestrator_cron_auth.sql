-- 052_fix_orchestrator_cron_auth.sql
-- Fix orchestrator cron job: apikey header returns 401, must use Authorization header.
-- The original cron (037) has been silently failing every invocation.

-- 1. Remove the broken cron job
SELECT cron.unschedule('orchestrator-tick');

-- 2. Re-create with correct Authorization header
SELECT cron.schedule(
  'orchestrator-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://jmussmwglgbwncgygzbz.supabase.co/functions/v1/orchestrator',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptdXNzbXdnbGdid25jZ3lnemJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTMyNDEsImV4cCI6MjA4NzAyOTI0MX0.bI2U8TNQ5FZ5ri3DUWJGZFuvC99WGc-fslmZZ5TcQo0"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
