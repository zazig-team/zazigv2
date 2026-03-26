UPDATE public.roles
SET mcp_tools = array_remove(COALESCE(mcp_tools, '{}'::text[]), 'query_jobs')
WHERE mcp_tools IS NOT NULL
  AND array_position(mcp_tools, 'query_jobs') IS NOT NULL;
