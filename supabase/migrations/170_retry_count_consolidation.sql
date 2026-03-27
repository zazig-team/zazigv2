-- Migration 170: Consolidate retry tracking — remove ci_fail_count, add failed_retrying job status

BEGIN;

-- 1. Drop ci_fail_count from features (retry_count is the single source of truth now)
ALTER TABLE public.features DROP COLUMN IF EXISTS ci_fail_count;

-- 2. Add failed_retrying to jobs status constraint
-- This status means: job failed but a retry job has been queued; this record is kept for audit.
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN (
  'created',
  'queued',
  'executing',
  'waiting_on_human',
  'complete',
  'failed',
  'failed_retrying',
  'cancelled'
));

-- 3. Helper RPC to atomically increment retry_count on a feature
CREATE OR REPLACE FUNCTION public.increment_feature_retry_count(p_feature_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.features
  SET retry_count = retry_count + 1,
      updated_at  = now()
  WHERE id = p_feature_id;
$$;

COMMIT;
