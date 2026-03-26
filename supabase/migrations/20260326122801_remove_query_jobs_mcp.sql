UPDATE roles SET mcp_tools = array_remove(mcp_tools, 'query_jobs') WHERE mcp_tools @> ARRAY['query_jobs'];
