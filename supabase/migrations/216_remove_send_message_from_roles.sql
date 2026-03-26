-- Migration 216: remove send_message MCP tool from all roles.
-- Agents now use the zazig send-message-to-human CLI command instead.
UPDATE public.roles
SET mcp_tools = array_remove(mcp_tools, 'send_message')
WHERE mcp_tools IS NOT NULL
  AND array_position(mcp_tools, 'send_message') IS NOT NULL;
