-- 098_simplified_pipeline_statuses.sql
-- Simplify feature pipeline statuses:
--   Remove: ready_for_breakdown, breakdown, pr_ready, deploying_to_test,
--           ready_to_test, deploying_to_prod
--   Add: breaking_down, combining_and_pr, merged
--   Keep: created, building, combining (will migrate to combining_and_pr),
--          verifying, complete, cancelled, failed

BEGIN;

-- Step 1: Drop old constraint so data migration can use new values
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;

-- Step 2: Migrate existing features to new status values
UPDATE public.features SET status = 'breaking_down' WHERE status IN ('ready_for_breakdown', 'breakdown');
UPDATE public.features SET status = 'combining_and_pr' WHERE status = 'combining';
UPDATE public.features SET status = 'merged' WHERE status IN ('pr_ready', 'deploying_to_test', 'ready_to_test', 'deploying_to_prod', 'complete');

-- Step 3: Add new constraint
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'created',
  'breaking_down',
  'building',
  'combining_and_pr',
  'verifying',
  'merged',
  'cancelled',
  'failed'
));

COMMIT;
