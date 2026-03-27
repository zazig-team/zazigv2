-- Grant create_project_rule to cpo and pipeline worker roles for capturing recurring project patterns.

UPDATE public.roles
SET mcp_tools = array_append(COALESCE(mcp_tools, '{}'::text[]), 'create_project_rule')
WHERE name IN ('cpo', 'senior-engineer', 'junior-engineer', 'job-combiner', 'test-engineer', 'fix-agent')
  AND NOT ('create_project_rule' = ANY(COALESCE(mcp_tools, '{}'::text[])));
