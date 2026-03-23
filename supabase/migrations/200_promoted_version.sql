-- 200_promoted_version.sql
-- Add promoted_version tracking on features and remove obsolete deployments table.

ALTER TABLE public.features
ADD COLUMN IF NOT EXISTS promoted_version TEXT;

DROP TABLE IF EXISTS public.deployments;
