-- 237_reap_stale_requested_expert_sessions.sql
-- Reaper for zombie expert_sessions that block orchestrator concurrency.
--
-- Problem: autoTriageNewIdeas / autoEnrich / autoSpec each count active
-- headless sessions (status IN ('requested','run')) against the company's
-- max_concurrent before dispatching. If a session is created but the machine
-- never claims it, it sits at 'requested' forever and permanently consumes
-- a concurrency slot. Observed in prod: 3 requested triage-analyst sessions
-- from 2026-03-13 and 2026-03-18 silently blocked all auto-triage on
-- zazig-dev for weeks. Same risk for 'claimed' (machine claimed but never
-- started) and long-running 'run' sessions that crashed mid-flight.
--
-- This adds a pg_cron job that runs every 5 minutes and cancels:
--   * requested sessions older than 1 hour  (machine never claimed)
--   * claimed   sessions older than 1 hour  (claimed but never started)
--   * starting  sessions older than 30 min  (started but never reached run)
--   * run       sessions older than 4 hours (alive but orphaned)
--
-- Thresholds are conservative — real auto-triage sessions complete in
-- 1–3 minutes. Anything beyond these windows is a crashed local-agent.

-- Idempotent re-apply support
SELECT cron.unschedule('reap-stale-expert-sessions')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reap-stale-expert-sessions');

SELECT cron.schedule(
  'reap-stale-expert-sessions',
  '*/5 * * * *',
  $$
  UPDATE public.expert_sessions
     SET status = 'cancelled'
   WHERE (status = 'requested' AND created_at < now() - interval '1 hour')
      OR (status = 'claimed'   AND created_at < now() - interval '1 hour')
      OR (status = 'starting'  AND created_at < now() - interval '30 minutes')
      OR (status = 'run'       AND (started_at IS NULL OR started_at < now() - interval '4 hours'));
  $$
);
