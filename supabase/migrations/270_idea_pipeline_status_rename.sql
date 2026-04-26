-- 270_idea_pipeline_status_rename.sql
-- Rename idea statuses to match the new pipeline flow:
--   enriched -> routing (after triage, before routing decision)
--   routed -> moved_to_feature_pipe (promoted to feature pipeline)
--   executing -> task-executing (task job running)
--   done -> task-done (task complete)
-- Also add the new statuses to the constraint.

-- Step 1: Drop the status constraint first (new values not in old constraint)
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;

-- Step 2: Reclassify existing ideas with old statuses
UPDATE public.ideas SET status = 'routing' WHERE status = 'enriched';
UPDATE public.ideas SET status = 'routing' WHERE status = 'triaged';
UPDATE public.ideas SET status = 'moved_to_feature_pipe' WHERE status = 'routed';
UPDATE public.ideas SET status = 'moved_to_feature_pipe' WHERE status = 'promoted';
UPDATE public.ideas SET status = 'task-executing' WHERE status = 'executing';
UPDATE public.ideas SET status = 'task-done' WHERE status = 'done';

-- No check constraint on status - the orchestrator controls valid transitions.
