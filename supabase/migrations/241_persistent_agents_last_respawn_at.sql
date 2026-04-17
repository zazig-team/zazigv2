-- 241_persistent_agents_last_respawn_at.sql
-- Add nullable timestamp for persistent agent respawn tracking.

ALTER TABLE public.persistent_agents
  ADD COLUMN IF NOT EXISTS last_respawn_at TIMESTAMPTZ NULL;

-- Rollback:
-- ALTER TABLE public.persistent_agents
--   DROP COLUMN IF EXISTS last_respawn_at;
