-- Normalize expert session statuses to the new run-state model.
-- Idempotent-safe for reruns and mixed prior environments.

ALTER TABLE expert_sessions
  DROP CONSTRAINT IF EXISTS expert_sessions_status_check;

UPDATE expert_sessions
SET status = 'run'
WHERE status = 'running';

UPDATE expert_sessions
SET status = 'run'
WHERE status = 'completed';

ALTER TABLE expert_sessions
  ADD CONSTRAINT expert_sessions_status_check
  CHECK (status IN ('requested', 'claimed', 'starting', 'run', 'failed', 'cancelled'));

ALTER TABLE expert_sessions
  DROP COLUMN IF EXISTS completed_at;
