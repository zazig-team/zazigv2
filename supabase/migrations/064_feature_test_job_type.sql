-- Add feature_test job type for interactive testing sessions
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN (
        'code', 'infra', 'design', 'research', 'docs', 'bug',
        'persistent_agent', 'verify', 'breakdown', 'combine',
        'deploy_to_test', 'deploy_to_prod', 'review', 'feature_test'
    ));
