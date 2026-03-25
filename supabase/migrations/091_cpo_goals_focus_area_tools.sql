-- Add goals/focus-area MCP tools to CPO role.
-- This backfills the manual SQL step from the 2026-03-01 goals/focus-areas build.
UPDATE public.roles AS r
SET mcp_tools = COALESCE(r.mcp_tools, '{}'::text[])
  || ARRAY(
    SELECT required_tool
    FROM unnest(ARRAY[
      'create_goal',
      'query_goals',
      'update_goal',
      'create_focus_area',
      'query_focus_areas',
      'update_focus_area'
    ]::text[]) AS required(required_tool)
    WHERE NOT (required.required_tool = ANY(COALESCE(r.mcp_tools, '{}'::text[])))
  )
WHERE r.name = 'cpo';
