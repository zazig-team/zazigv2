-- Grant create_project_rule to cpo for capturing recurring project patterns.

UPDATE public.roles
SET mcp_tools = array_append(COALESCE(mcp_tools, '{}'::text[]), 'create_project_rule')
WHERE name = 'cpo'
  AND NOT ('create_project_rule' = ANY(COALESCE(mcp_tools, '{}'::text[])));
