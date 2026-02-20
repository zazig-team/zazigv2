-- Add model column to jobs table
-- Allows pre-setting a model override on a job (e.g., by CPO or admin).
-- When present, the orchestrator uses this value instead of deriving from complexity.
-- When NULL, the orchestrator derives the model from job.complexity at dispatch time.

ALTER TABLE public.jobs
    ADD COLUMN model text;

COMMENT ON COLUMN public.jobs.model IS
    'Model identifier for this job. NULL = orchestrator derives from complexity at dispatch. '
    'Non-null = explicit override (takes precedence over complexity-derived model). '
    'Set by the orchestrator on dispatch to record the actual model used.';
