-- Add 'created' status to jobs lifecycle.
-- Jobs start as 'created', the orchestrator enriches them with prompt_stack
-- and transitions to 'queued'. Agents only claim 'queued' jobs.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Transition any existing 'queued' jobs that lack prompt_stack to 'created'
-- so they get enriched on the next orchestrator pass.
UPDATE public.jobs
SET status = 'created'
WHERE status = 'queued'
  AND prompt_stack IS NULL;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'created',
    'queued',
    'executing',
    'verify_queued',
    'verify_failed',
    'blocked',
    'reviewing',
    'complete',
    'failed',
    'cancelled'
  ));
