-- Add request_feature_fix to CPO's MCP tools
UPDATE public.roles
SET mcp_tools = array_append(mcp_tools, 'request_feature_fix')
WHERE name = 'cpo'
  AND NOT ('request_feature_fix' = ANY(mcp_tools));
