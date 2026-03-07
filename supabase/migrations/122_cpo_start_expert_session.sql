-- Add start_expert_session to CPO's MCP tools
UPDATE public.roles
SET mcp_tools = array_append(mcp_tools, 'start_expert_session')
WHERE name = 'cpo'
  AND NOT ('start_expert_session' = ANY(mcp_tools));
