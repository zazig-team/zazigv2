-- 070_test_deployer_query_features.sql
-- Add query_features to test-deployer so it can look up feature context.

UPDATE public.roles
SET mcp_tools = '{enable_remote,send_message,query_features}'
WHERE name = 'test-deployer';
