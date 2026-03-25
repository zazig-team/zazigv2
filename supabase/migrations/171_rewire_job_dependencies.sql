-- Migration 171: Add rewire_job_dependencies RPC
-- Swaps a failed job ID for its retry job ID in all pending jobs' depends_on arrays,
-- so downstream jobs are not left waiting on a job that will never complete.

BEGIN;

CREATE OR REPLACE FUNCTION public.rewire_job_dependencies(
  p_old_job_id UUID,
  p_new_job_id UUID
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH updated AS (
    UPDATE public.jobs
    SET depends_on = array_replace(depends_on, p_old_job_id, p_new_job_id)
    WHERE p_old_job_id = ANY(depends_on)
      AND status IN ('created', 'queued')
    RETURNING id
  )
  SELECT count(*)::integer FROM updated;
$$;

COMMIT;
