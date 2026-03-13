ALTER TABLE expert_sessions DROP CONSTRAINT IF EXISTS expert_sessions_status_check;
ALTER TABLE expert_sessions ADD CONSTRAINT expert_sessions_status_check
  CHECK (status IN ('requested', 'running', 'completed', 'cancelled', 'failed'));
