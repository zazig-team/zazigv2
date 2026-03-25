-- 160_expert_sessions_claimed_status.sql
-- Add 'claimed' to expert_sessions status check constraint.
-- The poll endpoint uses a CAS update (requested → claimed) to prevent double-delivery.

ALTER TABLE expert_sessions DROP CONSTRAINT IF EXISTS expert_sessions_status_check;
ALTER TABLE expert_sessions ADD CONSTRAINT expert_sessions_status_check
  CHECK (status IN ('requested', 'claimed', 'starting', 'running', 'completed', 'cancelled', 'failed'));
