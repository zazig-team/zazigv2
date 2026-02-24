-- 037_orchestrator_cron.sql
-- Schedule the orchestrator edge function to run every minute via pg_cron + pg_net.
-- The orchestrator handles heartbeat draining, dead machine reaping, and job dispatch.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule: invoke orchestrator every minute.
-- Uses the project's anon key (public, safe to embed — same as CLI).
-- The orchestrator is deployed with --no-verify-jwt so anon key is sufficient.
SELECT cron.schedule(
  'orchestrator-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://jmussmwglgbwncgygzbz.supabase.co/functions/v1/orchestrator',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptdXNzbXdnbGdid25jZ3lnemJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTMyNDEsImV4cCI6MjA4NzAyOTI0MX0.bI2U8TNQ5FZ5ri3DUWJGZFuvC99WGc-fslmZZ5TcQo0"}'::jsonb,
    body    := '{}'::jsonb
  ) AS request_id;
  $$
);
