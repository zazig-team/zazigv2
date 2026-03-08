-- Add boot_prompt to roles for configurable persistent-agent boot task injection.

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS boot_prompt text;

COMMENT ON COLUMN public.roles.boot_prompt IS
  'Optional role-specific startup prompt injected when a persistent agent session boots.';
