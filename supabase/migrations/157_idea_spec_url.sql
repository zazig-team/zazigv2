-- 156_idea_spec_url.sql
-- Add spec_url column to ideas for storing the path to the spec document in the repository.

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS spec_url TEXT;
