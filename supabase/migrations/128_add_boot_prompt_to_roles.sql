-- 128_add_boot_prompt_to_roles.sql
-- Add optional boot prompt for persistent agent startup task injection.

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS boot_prompt text;

COMMENT ON COLUMN public.roles.boot_prompt IS
  'Optional role-specific startup prompt injected when a persistent agent session boots.';
