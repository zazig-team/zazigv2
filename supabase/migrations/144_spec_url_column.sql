-- Migration 144: add spec_url pointer for idea specs stored in the repo.

ALTER TABLE public.ideas
  ADD COLUMN IF NOT EXISTS spec_url text;
