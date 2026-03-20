-- Grant create_project_rule to worker roles that should capture preventable patterns.
-- fix-agent may not exist in all environments; WHERE name IN (...) keeps this safe.

UPDATE public.roles
SET mcp_tools = array_append(COALESCE(mcp_tools, '{}'::text[]), 'create_project_rule')
WHERE name IN ('senior-engineer', 'junior-engineer', 'job-combiner', 'test-engineer', 'fix-agent')
  AND NOT ('create_project_rule' = ANY(COALESCE(mcp_tools, '{}'::text[])));
