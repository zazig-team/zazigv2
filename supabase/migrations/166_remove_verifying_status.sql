-- Remove legacy verify-step statuses from feature and job lifecycles.
-- CI-gated pipeline replaces the verify step, so features no longer enter `verifying`
-- and jobs no longer use `verify_queued` / `verify_failed`.

-- Recreate features status constraint without `verifying`.
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'breaking_down',
  'building',
  'combining',
  'combining_and_pr',
  'merging',
  'pr_ready',
  'deploying_to_test',
  'ready_to_test',
  'deploying_to_prod',
  'complete',
  'cancelled',
  'failed'
));

DO $$
DECLARE
  jobs_constraint_def text;
  verify_status_rows bigint;
BEGIN
  -- Ensure it is safe to remove verify job statuses from the constraint.
  SELECT COUNT(*)
  INTO verify_status_rows
  FROM public.jobs
  WHERE status IN ('verify_queued', 'verify_failed');

  IF verify_status_rows > 0 THEN
    RAISE EXCEPTION 'Cannot remove verify job statuses: % rows still use verify_queued/verify_failed', verify_status_rows;
  END IF;

  -- Only update jobs_status_check if it currently allows verify statuses.
  SELECT pg_get_constraintdef(c.oid)
  INTO jobs_constraint_def
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'jobs'
    AND c.conname = 'jobs_status_check';

  IF jobs_constraint_def IS NOT NULL
     AND (
       jobs_constraint_def ILIKE '%verify_queued%'
       OR jobs_constraint_def ILIKE '%verify_failed%'
     ) THEN
    ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;
    ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check CHECK (status IN (
      'created',
      'queued',
      'executing',
      'blocked',
      'reviewing',
      'complete',
      'failed',
      'cancelled'
    ));
  END IF;
END
$$;
