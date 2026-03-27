-- Split 'deploy' job_type into 'deploy_to_test' and 'deploy_to_prod'
-- Also add 'review' job_type for completeness

-- Update existing deploy jobs to deploy_to_prod (all existing deploy jobs are prod deploys)
UPDATE public.jobs SET job_type = 'deploy_to_prod' WHERE job_type = 'deploy';

-- Replace the constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN (
        'code', 'infra', 'design', 'research', 'docs', 'bug',
        'persistent_agent', 'verify', 'breakdown', 'combine',
        'deploy_to_test', 'deploy_to_prod', 'review'
    ));
