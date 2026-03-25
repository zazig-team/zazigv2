-- 068_request_work_tool_cleanup.sql
-- Deliverable 1 cleanup: replace legacy commission_contractor with request_work.

BEGIN;

-- Remove stale commission_contractor references for every role.
UPDATE public.roles
SET mcp_tools = array_remove(COALESCE(mcp_tools, '{}'::text[]), 'commission_contractor');

-- Grant request_work to the approved callers.
UPDATE public.roles
SET mcp_tools = array_append(COALESCE(mcp_tools, '{}'::text[]), 'request_work')
WHERE name IN ('cpo', 'cto', 'verification-specialist')
  AND NOT ('request_work' = ANY(COALESCE(mcp_tools, '{}'::text[])));

COMMIT;
