-- Rename feature_branch → branch on features table
-- Rename job_branch → branch on jobs table
-- Simplifies naming — each table just has "branch"

ALTER TABLE public.features RENAME COLUMN feature_branch TO branch;
ALTER TABLE public.jobs RENAME COLUMN job_branch TO branch;
