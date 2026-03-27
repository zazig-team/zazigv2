-- Migration 216: remove legacy send_message MCP tool from all roles
UPDATE public.roles
SET mcp_tools = array_remove(mcp_tools, 'send_message')
WHERE mcp_tools IS NOT NULL
  AND array_position(mcp_tools, 'send_message') IS NOT NULL;
