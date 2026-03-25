-- Migration 172: Treat failed_retrying as a terminal status in all_feature_jobs_complete
-- A failed_retrying job has been superseded by a retry job — it should not block
-- the feature from advancing to the next pipeline stage.

BEGIN;

CREATE OR REPLACE FUNCTION public.all_feature_jobs_complete(p_feature_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.jobs
    WHERE feature_id = p_feature_id
      AND status NOT IN ('complete', 'failed', 'cancelled', 'failed_retrying')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

COMMIT;
