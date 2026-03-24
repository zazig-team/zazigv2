-- Migration 211: remove legacy batch_create_jobs MCP tool from breakdown-specialist
UPDATE public.roles
SET mcp_tools = array_remove(mcp_tools, 'batch_create_jobs')
WHERE name = 'breakdown-specialist'
  AND mcp_tools IS NOT NULL
  AND array_position(mcp_tools, 'batch_create_jobs') IS NOT NULL;
