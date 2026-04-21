-- Migration 256: add task-executor role for idea task execution.

INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
  'task-executor',
  'Task executor - completes routed task ideas and records output paths.',
  false,
  'claude-opus-4-6',
  'claude_code',
  '[Placeholder - see task-executor role prompt job]',
  '{}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_persistent = EXCLUDED.is_persistent,
  default_model = EXCLUDED.default_model,
  slot_type = EXCLUDED.slot_type,
  prompt = EXCLUDED.prompt,
  skills = EXCLUDED.skills;
