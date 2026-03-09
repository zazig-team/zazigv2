-- 130_roles_boot_prompt.sql
-- Adds optional boot prompt text for persistent role startup injection.

ALTER TABLE public.roles
ADD COLUMN IF NOT EXISTS boot_prompt text;

COMMENT ON COLUMN public.roles.boot_prompt IS
  'Optional startup orientation prompt injected into persistent tmux sessions after spawn. Null/blank falls back to local-agent default.';
