-- Migration 135: Add auto_triage toggle to companies table
-- When true, the orchestrator automatically dispatches triage jobs for status=new ideas on each tick.

ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS auto_triage boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.auto_triage IS
  'When true, the orchestrator automatically dispatches triage jobs for status=new ideas on each tick.';

-- Allow authenticated users to update their own company (needed for WebUI toggle)
DROP POLICY IF EXISTS authenticated_update_own ON public.companies;
CREATE POLICY authenticated_update_own ON public.companies
  FOR UPDATE TO authenticated
  USING (user_in_company(id))
  WITH CHECK (user_in_company(id));
