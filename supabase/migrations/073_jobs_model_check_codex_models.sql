-- Add Codex model names to jobs_model_check constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_model_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_model_check
  CHECK (model IS NULL OR model IN (
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'codex',
    'gpt-5.3-codex xhigh',
    'gpt-5.3-codex-spark'
  ));
