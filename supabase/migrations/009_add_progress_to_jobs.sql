-- 009_add_progress_to_jobs.sql
-- Add progress tracking column to jobs table.
-- progress: integer 0-100, default 0.
-- Local agent executor writes this during the poll loop.
-- Readable by dashboard directly via Supabase REST API.

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0
        CHECK (progress >= 0 AND progress <= 100);

COMMENT ON COLUMN public.jobs.progress IS
    'Execution progress estimate 0-100. Written by local-agent poll loop. Resets to 100 on completion.';
