-- Add 'stalled' to ideas status constraint.
-- Used when the orchestrator (or WebUI stale cleanup) detects an idea stuck in
-- 'triaging' with no active session or job — instead of silently reverting to
-- 'new', the idea is marked 'stalled' so it's visible on the card with a retry
-- affordance.

ALTER TABLE ideas
  DROP CONSTRAINT ideas_status_check,
  ADD CONSTRAINT ideas_status_check
    CHECK (status IN (
      'new', 'triaging', 'triaged', 'developing', 'specced',
      'workshop', 'hardening', 'parked', 'rejected', 'promoted',
      'done', 'stalled'
    ));
