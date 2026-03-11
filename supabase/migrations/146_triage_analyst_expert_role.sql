-- 146_triage_analyst_expert_role.sql
-- Triage analyst as an expert role (headless, no pipeline slot consumption)
INSERT INTO public.expert_roles (name, display_name, description, model, skills, mcp_tools)
VALUES (
  'triage-analyst',
  'Triage Analyst',
  'Autonomous idea triage — evaluates ideas against org goals, roadmap, and existing work. Routes ideas to the appropriate track: promote, develop, workshop, harden, park, or reject.',
  'claude-sonnet-4-6',
  ARRAY['triage'],
  '{"allowed": ["query_ideas", "update_idea", "query_features", "query_goals", "query_focus_areas", "query_projects", "get_pipeline_snapshot"]}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  model = EXCLUDED.model,
  skills = EXCLUDED.skills,
  mcp_tools = EXCLUDED.mcp_tools;
