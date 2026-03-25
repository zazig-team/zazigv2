-- Add query_features and query_jobs to CPO role's mcp_tools
UPDATE public.roles
SET mcp_tools = array_cat(
  COALESCE(mcp_tools, '{}'::text[]),
  '{query_features,query_jobs}'::text[]
)
WHERE name = 'cpo';
