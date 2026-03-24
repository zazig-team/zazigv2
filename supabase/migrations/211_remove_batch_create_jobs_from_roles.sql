UPDATE roles
SET mcp_tools = array_remove(mcp_tools, 'batch_create_jobs')
WHERE mcp_tools && ARRAY['batch_create_jobs'];
