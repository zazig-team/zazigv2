-- Fix expert_sessions status check constraint to include 'starting' and 'failed'
-- Daemon sets 'starting' at launch and 'failed' on error conditions, but these
-- were missing from the original constraint.

ALTER TABLE expert_sessions DROP CONSTRAINT expert_sessions_status_check;

-- Migrate existing 'completed' rows — sessions that ended are treated as cancelled
UPDATE expert_sessions SET status = 'cancelled' WHERE status = 'completed';

ALTER TABLE expert_sessions ADD CONSTRAINT expert_sessions_status_check
  CHECK (status = ANY (ARRAY['requested'::text, 'starting'::text, 'running'::text, 'cancelled'::text, 'failed'::text]));
