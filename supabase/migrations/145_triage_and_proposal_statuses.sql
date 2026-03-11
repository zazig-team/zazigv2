-- 145_triage_and_proposal_statuses.sql
-- Extend idea status machine with developing and specced stages
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY[
    'new', 'triaging', 'triaged',
    'developing', 'specced',
    'workshop', 'hardening',
    'parked', 'rejected', 'promoted', 'done'
  ]));

-- Triage routing decision
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS triage_route TEXT;
COMMENT ON COLUMN public.ideas.triage_route IS 'Triage routing decision: promote, develop, workshop, harden, park, reject, founder-review';

-- Spec fields (written by spec expert during developing stage)
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS spec TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS acceptance_tests TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS human_checklist TEXT;
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS complexity TEXT;
COMMENT ON COLUMN public.ideas.complexity IS 'Estimated complexity: simple, medium, complex';
