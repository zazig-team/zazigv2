-- Add description column to projects table
-- Used by Project Architect when creating projects via create-project edge function

ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS description text;
