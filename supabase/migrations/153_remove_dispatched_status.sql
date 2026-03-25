-- Remove 'dispatched' from jobs status lifecycle.
-- Poll-based claiming now transitions jobs queued -> executing directly.

-- Drop the old status constraint.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Clean up any lingering dispatched rows before re-adding the constraint.
UPDATE public.jobs
SET status = 'queued'
WHERE status = 'dispatched';

-- Re-add status constraint without 'dispatched'.
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

-- Drop the dispatched recovery index (no longer needed).
DROP INDEX IF EXISTS idx_jobs_dispatched_recovery;
