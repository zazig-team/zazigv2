-- 069_interactive_role_mcp_tools.sql
-- Grant enable_remote and send_message MCP tools to interactive roles.
-- These are needed so Claude Code auto-allows the tools without prompting.

UPDATE public.roles
SET mcp_tools = '{enable_remote,send_message}'
WHERE name IN ('test-deployer', 'tester');
