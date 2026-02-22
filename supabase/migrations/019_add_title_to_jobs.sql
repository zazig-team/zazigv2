-- 019: Add title column to jobs table for human-readable card labels
-- Features table already has a title column (from 003_multi_tenant_schema.sql)
-- Jobs need one so the dashboard can show readable names instead of raw context JSON

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS title VARCHAR(120);
