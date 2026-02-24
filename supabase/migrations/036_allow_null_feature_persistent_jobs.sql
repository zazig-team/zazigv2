-- 036_allow_null_feature_persistent_jobs.sql
-- Fix: persistent_agent jobs are company-wide and don't belong to a feature.
-- Migration 032 made feature_id NOT NULL which breaks the persistent job
-- seed trigger. Revert to nullable but add a CHECK so regular jobs still
-- require a feature_id.

-- Step 1: Drop the NOT NULL constraint
ALTER TABLE public.jobs
    ALTER COLUMN feature_id DROP NOT NULL;

-- Step 2: Add a CHECK constraint — only persistent_agent jobs may omit feature_id
ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_feature_id_required
    CHECK (feature_id IS NOT NULL OR job_type = 'persistent_agent');
