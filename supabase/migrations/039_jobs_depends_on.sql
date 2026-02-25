-- 039_jobs_depends_on.sql
-- Adds depends_on UUID[] column to jobs table for DAG-based parallel dispatch.
-- Replaces the integer `sequence` column semantically — sequence is kept for
-- backward compatibility and will be dropped in a future migration.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS depends_on UUID[] DEFAULT '{}';

COMMENT ON COLUMN public.jobs.depends_on IS
    'UUIDs of jobs that must complete before this job can be dispatched. '
    'Empty array means no dependencies (root node in the DAG). '
    'Replaces the integer sequence column for parallel execution support.';
