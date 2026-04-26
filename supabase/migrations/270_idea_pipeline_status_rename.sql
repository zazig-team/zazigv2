-- 270_idea_pipeline_status_rename.sql
-- Rename idea statuses to match the new pipeline flow:
--   enriched → routing (after triage, before routing decision)
--   routed → moved_to_feature_pipe (promoted to feature pipeline)
--   executing → task-executing (task job running)
--   done → task-done (task complete)
-- Also add the new statuses to the constraint.

-- Step 1: Reclassify existing ideas with old statuses
UPDATE public.ideas SET status = 'routing' WHERE status = 'enriched';
UPDATE public.ideas SET status = 'routing' WHERE status = 'triaged';
UPDATE public.ideas SET status = 'moved_to_feature_pipe' WHERE status = 'routed';
UPDATE public.ideas SET status = 'moved_to_feature_pipe' WHERE status = 'promoted';
UPDATE public.ideas SET status = 'task-executing' WHERE status = 'executing';
UPDATE public.ideas SET status = 'task-done' WHERE status = 'done';

-- Step 2: Update the status constraint
-- Keep old statuses that may still be referenced + add new ones
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
-- No check constraint on status — the orchestrator controls valid transitions.
-- Adding one would require listing every status including legacy ones.
