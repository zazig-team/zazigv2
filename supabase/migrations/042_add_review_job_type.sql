-- Migration: add 'review' to jobs_job_type_check constraint
-- Aligns DB constraint with batch-create-jobs edge function validation.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN (
        'code', 'infra', 'design', 'research', 'docs', 'bug',
        'persistent_agent', 'verify', 'breakdown', 'combine', 'deploy', 'review'
    ));
