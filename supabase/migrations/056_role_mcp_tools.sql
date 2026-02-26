-- Migration 056: Add mcp_tools column to roles table
-- Replaces the hardcoded ROLE_ALLOWED_TOOLS map in workspace.ts with
-- a DB-driven source of truth. Default '{}' = safe (no MCP tools).

ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS mcp_tools text[] NOT NULL DEFAULT '{}';

-- Seed correct tool lists from ROLE_ALLOWED_TOOLS (workspace.ts lines 41-52)
UPDATE public.roles SET mcp_tools = '{query_projects,create_feature,update_feature,commission_contractor}' WHERE name = 'cpo';
UPDATE public.roles SET mcp_tools = '{create_project,batch_create_features,query_projects}'               WHERE name = 'project-architect';
UPDATE public.roles SET mcp_tools = '{query_features,batch_create_jobs}'                                  WHERE name = 'breakdown-specialist';
UPDATE public.roles SET mcp_tools = '{query_features}'                                                    WHERE name = 'senior-engineer';
UPDATE public.roles SET mcp_tools = '{query_features}'                                                    WHERE name = 'reviewer';
UPDATE public.roles SET mcp_tools = '{send_message}'                                                      WHERE name = 'monitoring-agent';
UPDATE public.roles SET mcp_tools = '{query_features,query_jobs,batch_create_jobs,commission_contractor}'  WHERE name = 'verification-specialist';
UPDATE public.roles SET mcp_tools = '{query_features,query_jobs,execute_sql}'                             WHERE name = 'pipeline-technician';
-- job-combiner and deployer intentionally keep the default empty array
