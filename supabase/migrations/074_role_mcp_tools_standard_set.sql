-- Give standard pipeline-visible tools to active worker roles
-- Standard set: send_message, query_features, query_jobs, get_pipeline_snapshot
-- Plus role-specific tools they already had

-- breakdown-specialist: add send_message, query_jobs, get_pipeline_snapshot
UPDATE public.roles
SET mcp_tools = '{query_features,batch_create_jobs,send_message,query_jobs,get_pipeline_snapshot}'
WHERE name = 'breakdown-specialist';

-- job-combiner: add standard set
UPDATE public.roles
SET mcp_tools = '{send_message,query_features,query_jobs,get_pipeline_snapshot}'
WHERE name = 'job-combiner';

-- reviewer (verifier): add send_message, query_jobs, get_pipeline_snapshot
UPDATE public.roles
SET mcp_tools = '{query_features,send_message,query_jobs,get_pipeline_snapshot}'
WHERE name = 'reviewer';

-- junior-engineer: add standard set
UPDATE public.roles
SET mcp_tools = '{send_message,query_features,query_jobs,get_pipeline_snapshot}'
WHERE name = 'junior-engineer';

-- senior-engineer: add send_message, query_jobs, get_pipeline_snapshot
UPDATE public.roles
SET mcp_tools = '{query_features,send_message,query_jobs,get_pipeline_snapshot}'
WHERE name = 'senior-engineer';

-- code-reviewer: add standard set
UPDATE public.roles
SET mcp_tools = '{send_message,query_features,query_jobs,get_pipeline_snapshot}'
WHERE name = 'code-reviewer';

-- verification-specialist: add send_message, get_pipeline_snapshot (already has query_features, query_jobs)
UPDATE public.roles
SET mcp_tools = '{query_features,query_jobs,batch_create_jobs,request_work,send_message,get_pipeline_snapshot}'
WHERE name = 'verification-specialist';
