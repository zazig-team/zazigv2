-- Migration 032: Require feature_id on all jobs
-- Deletes existing orphaned jobs (dev/test data only), then enforces NOT NULL.

-- Step 1: Delete any jobs with no feature_id.
DELETE FROM public.jobs WHERE feature_id IS NULL;

-- Step 2: Make feature_id NOT NULL.
ALTER TABLE public.jobs
    ALTER COLUMN feature_id SET NOT NULL;
