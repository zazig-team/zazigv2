-- Migration 144: Add headless and batch_id columns to expert_sessions
-- Required for autonomous/headless expert session mode

ALTER TABLE expert_sessions
  ADD COLUMN IF NOT EXISTS headless boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS batch_id text;

CREATE INDEX IF NOT EXISTS idx_expert_sessions_batch_id ON expert_sessions(batch_id) WHERE batch_id IS NOT NULL;
