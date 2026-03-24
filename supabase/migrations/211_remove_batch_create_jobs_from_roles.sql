-- Migration 211: remove legacy batch_create_jobs MCP tool from all roles
UPDATE public.roles
SET mcp_tools = array_remove(mcp_tools, 'batch_create_jobs')
WHERE mcp_tools IS NOT NULL
  AND array_position(mcp_tools, 'batch_create_jobs') IS NOT NULL;
