-- Migration 031: Require feature_id on all jobs
-- Backfills existing standalone jobs with a wrapper feature per company, then
-- makes feature_id NOT NULL.

-- Step 1: For each company with standalone jobs, insert a wrapper feature.
-- Uses a CTE to find distinct companies with NULL feature_id jobs, then inserts
-- one "Standalone work" feature per company.
INSERT INTO public.features (company_id, title, status, created_at)
SELECT DISTINCT
    j.company_id,
    'Standalone work' AS title,
    'complete' AS status,
    now() AS created_at
FROM public.jobs j
WHERE j.feature_id IS NULL
  AND j.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Step 2: Link orphaned jobs to their company's wrapper feature.
UPDATE public.jobs j
SET feature_id = (
    SELECT f.id FROM public.features f
    WHERE f.company_id = j.company_id
      AND f.title = 'Standalone work'
    LIMIT 1
)
WHERE j.feature_id IS NULL
  AND j.company_id IS NOT NULL;

-- Step 3: Make feature_id NOT NULL.
ALTER TABLE public.jobs
    ALTER COLUMN feature_id SET NOT NULL;
