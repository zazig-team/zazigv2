-- Add query_projects to all active worker roles so they can look up project context

UPDATE public.roles
SET mcp_tools = '{query_features,batch_create_jobs,send_message,query_jobs,get_pipeline_snapshot,query_projects}'
WHERE name = 'breakdown-specialist';

UPDATE public.roles
SET mcp_tools = '{send_message,query_features,query_jobs,get_pipeline_snapshot,query_projects}'
WHERE name = 'job-combiner';

UPDATE public.roles
SET mcp_tools = '{query_features,send_message,query_jobs,get_pipeline_snapshot,query_projects}'
WHERE name = 'reviewer';

UPDATE public.roles
SET mcp_tools = '{send_message,query_features,query_jobs,get_pipeline_snapshot,query_projects}'
WHERE name = 'junior-engineer';

UPDATE public.roles
SET mcp_tools = '{query_features,send_message,query_jobs,get_pipeline_snapshot,query_projects}'
WHERE name = 'senior-engineer';

UPDATE public.roles
SET mcp_tools = '{send_message,query_features,query_jobs,get_pipeline_snapshot,query_projects}'
WHERE name = 'code-reviewer';

UPDATE public.roles
SET mcp_tools = '{query_features,query_jobs,batch_create_jobs,request_work,send_message,get_pipeline_snapshot,query_projects}'
WHERE name = 'verification-specialist';
