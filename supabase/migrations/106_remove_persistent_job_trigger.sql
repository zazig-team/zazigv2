-- 105_remove_persistent_job_trigger.sql
-- Remove the dead trigger that auto-created jobs rows for persistent agents.
-- Since migration 048, persistent agents are tracked in persistent_agents table
-- and spawned via the company-persistent-jobs edge function reading from
-- roles + company_roles directly. The jobs table is not involved.

DROP TRIGGER IF EXISTS trg_create_persistent_job ON public.company_roles;
DROP FUNCTION IF EXISTS create_persistent_job_on_role_enable();
