-- 047_feature_verification_type.sql
-- Adds verification_type column to features table.
-- 'passive' (default) = existing reviewer path (code review + rebase + tests)
-- 'active' = Verification Specialist exercises the system against ACs

ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS verification_type text NOT NULL DEFAULT 'passive'
  CHECK (verification_type IN ('passive', 'active'));
