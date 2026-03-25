-- 050: Remove persistent_agent from jobs table
-- Persistent agents now live in the persistent_agents table.

-- Delete any existing persistent_agent jobs
DELETE FROM public.jobs WHERE job_type = 'persistent_agent';

-- Update the job_type CHECK constraint to remove persistent_agent
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_job_type_check;

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_job_type_check
  CHECK (job_type IN (
    'code', 'infra', 'design', 'research', 'docs', 'bug',
    'verify', 'breakdown', 'combine', 'deploy', 'review'
  ));
