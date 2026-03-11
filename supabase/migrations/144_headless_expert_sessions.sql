-- 144_headless_expert_sessions.sql
-- Add headless session support columns to expert_sessions and create session items tracking table.

ALTER TABLE expert_sessions ADD COLUMN IF NOT EXISTS headless BOOLEAN DEFAULT false;
ALTER TABLE expert_sessions ADD COLUMN IF NOT EXISTS batch_id UUID;
ALTER TABLE expert_sessions ADD COLUMN IF NOT EXISTS items_processed INTEGER DEFAULT 0;
ALTER TABLE expert_sessions ADD COLUMN IF NOT EXISTS items_total INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS expert_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES expert_sessions(id) ON DELETE CASCADE,
  idea_id UUID REFERENCES ideas(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  route TEXT,
  model TEXT,
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expert_session_items_session ON expert_session_items(session_id);
CREATE INDEX IF NOT EXISTS idx_expert_session_items_idea ON expert_session_items(idea_id);

-- Unique constraint for upsert support (one item row per session+idea)
CREATE UNIQUE INDEX IF NOT EXISTS idx_expert_session_items_session_idea
  ON expert_session_items(session_id, idea_id);

-- Helper RPC to sync items_processed from actual completed count (idempotent)
CREATE OR REPLACE FUNCTION public.sync_session_items_processed(p_session_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE expert_sessions
  SET items_processed = (
    SELECT count(*)::integer
    FROM expert_session_items
    WHERE session_id = p_session_id
      AND completed_at IS NOT NULL
  )
  WHERE id = p_session_id;
$$;
