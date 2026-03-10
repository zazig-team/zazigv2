-- Migration 135: Add auto_triage toggle to companies table
-- When true, the orchestrator automatically dispatches triage jobs for status=new ideas on each tick.

ALTER TABLE public.companies
ADD COLUMN auto_triage boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.auto_triage IS
  'When true, the orchestrator automatically dispatches triage jobs for status=new ideas on each tick.';
