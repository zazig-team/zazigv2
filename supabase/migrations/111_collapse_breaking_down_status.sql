-- Migration: Collapse created/ready_for_breakdown/breakdown → breaking_down
--
-- Three pre-build statuses (created, ready_for_breakdown, breakdown) all mean
-- the same thing. This migration:
--   1. Adds breaking_down to the constraint (unblocks current errors immediately)
--   2. Migrates existing data
--   3. Drops old statuses from the constraint

-- Phase 1: Add breaking_down to constraint (unblocks current errors)
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status = ANY (ARRAY[
    'created','ready_for_breakdown','breakdown','breaking_down','building',
    'combining','combining_and_pr','verifying','merging',
    'pr_ready','deploying_to_test','ready_to_test','deploying_to_prod',
    'complete','cancelled','failed'
]));

-- Phase 2: Migrate data — features with spec → breaking_down, without spec → failed
UPDATE public.features SET status = 'breaking_down'
WHERE status IN ('created', 'ready_for_breakdown', 'breakdown') AND spec IS NOT NULL AND spec != '';

UPDATE public.features SET status = 'failed'
WHERE status IN ('created', 'ready_for_breakdown', 'breakdown');

-- Phase 3: Drop old statuses from constraint, set default to breaking_down
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status = ANY (ARRAY[
    'breaking_down','building',
    'combining','combining_and_pr','verifying','merging',
    'pr_ready','deploying_to_test','ready_to_test','deploying_to_prod',
    'complete','cancelled','failed'
]));

ALTER TABLE public.features ALTER COLUMN status SET DEFAULT 'breaking_down';
