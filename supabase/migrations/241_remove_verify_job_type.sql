BEGIN;
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check CHECK (job_type IN (
  'code', 'infra', 'design', 'research', 'docs', 'bug',
  'persistent_agent', 'breakdown', 'combine', 'merge',
  'deploy_to_test', 'deploy_to_prod', 'review', 'feature_test', 'ci_check', 'test'
));
COMMIT;
