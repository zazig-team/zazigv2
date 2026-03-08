-- Adds configurable startup orientation prompt for persistent agent roles.
ALTER TABLE public.roles
ADD COLUMN IF NOT EXISTS boot_prompt text;
