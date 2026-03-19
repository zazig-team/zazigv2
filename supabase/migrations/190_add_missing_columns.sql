-- Add features.depends_on for feature-level dependency ordering.
ALTER TABLE public.features
ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}';

-- Add company spec-recovery config columns used by the orchestrator.
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS spec_timeout_minutes INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS max_spec_retries INTEGER DEFAULT 3;

-- Add waiting_on_deps and writing_tests to features status constraint.
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'breaking_down',
  'waiting_on_deps',
  'writing_tests',
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
