-- 033: Add prompt_stack column to jobs table
-- Stores the compiled 4-layer prompt stack (personality + role + skills + task)
-- sent to the agent at dispatch time, for observability and replay.

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS prompt_stack TEXT;
