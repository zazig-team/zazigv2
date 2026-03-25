-- 140_focus_area_health.sql
-- Add an orthogonal health field to focus areas for manual assessments.

ALTER TABLE public.focus_areas
ADD COLUMN IF NOT EXISTS health text DEFAULT NULL;

-- Drop constraint first if it exists, then re-create
ALTER TABLE public.focus_areas
DROP CONSTRAINT IF EXISTS focus_areas_health_check;

ALTER TABLE public.focus_areas
ADD CONSTRAINT focus_areas_health_check
CHECK (
    health IS NULL
    OR health IN ('on_track', 'at_risk', 'off_track')
);
