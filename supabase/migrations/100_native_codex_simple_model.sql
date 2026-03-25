-- 100_native_codex_simple_model.sql
-- Date: 2026-03-02
-- Purpose: Update junior-engineer role default_model from placeholder 'codex' to
--          'gpt-5.3-codex-spark', the actual Codex model used for native execution.
--          simple complexity → junior-engineer role → gpt-5.3-codex-spark (slot_type: codex)

UPDATE public.roles
SET default_model = 'gpt-5.3-codex-spark'
WHERE name = 'junior-engineer';
