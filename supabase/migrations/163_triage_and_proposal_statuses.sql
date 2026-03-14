-- 145_triage_and_proposal_statuses.sql
-- Extend idea statuses for triage & proposal pipeline, add spec/triage columns.

ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY[
    'new', 'triaging', 'triaged',
    'developing', 'specced',
    'workshop', 'hardening',
    'parked', 'rejected', 'promoted', 'done'
  ]));

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS triage_route TEXT;
COMMENT ON COLUMN ideas.triage_route IS 'Triage routing: promote, develop, workshop, harden, park, reject, founder-review';

ALTER TABLE ideas ADD COLUMN IF NOT EXISTS spec TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS acceptance_tests TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS human_checklist TEXT;
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS complexity TEXT;
COMMENT ON COLUMN ideas.complexity IS 'Estimated complexity: simple, medium, complex';
