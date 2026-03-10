-- Add boot_prompt column to roles
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS boot_prompt TEXT;

-- Seed default boot prompt for all persistent roles
UPDATE public.roles
SET boot_prompt = 'Read your state files. If .claude/{role}-report.md exists, review it for continuity. Check for pending work via your MCP tools. Orient yourself and begin.'
WHERE is_persistent = true
  AND boot_prompt IS NULL;
