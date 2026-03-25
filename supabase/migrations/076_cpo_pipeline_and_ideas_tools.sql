-- Add get_pipeline_snapshot and query_ideas to CPO role's mcp_tools
-- CPO needs these for standup pipeline health checks and ideas inbox triage

UPDATE public.roles
SET mcp_tools = array_cat(
  COALESCE(mcp_tools, '{}'::text[]),
  '{get_pipeline_snapshot,query_ideas}'::text[]
)
WHERE name = 'cpo';
