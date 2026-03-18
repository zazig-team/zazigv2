-- Add create_project_rule to engineering and test roles that can identify reusable project guardrails.
UPDATE public.roles
SET mcp_tools = array_append(mcp_tools, 'create_project_rule')
WHERE name IN ('senior-engineer', 'junior-engineer', 'job-combiner', 'test-engineer')
  AND NOT ('create_project_rule' = ANY(mcp_tools));
