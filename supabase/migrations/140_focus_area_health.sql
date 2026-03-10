-- 140_focus_area_health.sql
-- Add an orthogonal health field to focus areas for manual assessments.

ALTER TABLE public.focus_areas
ADD COLUMN health text DEFAULT NULL;

ALTER TABLE public.focus_areas
ADD CONSTRAINT focus_areas_health_check
CHECK (
    health IS NULL
    OR health IN ('on_track', 'at_risk', 'off_track')
);
