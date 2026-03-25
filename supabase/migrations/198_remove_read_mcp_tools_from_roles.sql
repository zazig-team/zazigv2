UPDATE roles
SET mcp_tools = array_remove(
  array_remove(
    array_remove(
      array_remove(
        mcp_tools,
        'get_pipeline_snapshot'
      ),
      'query_ideas'
    ),
    'query_features'
  ),
  'query_projects'
)
WHERE mcp_tools && ARRAY[
  'get_pipeline_snapshot',
  'query_ideas',
  'query_features',
  'query_projects'
];
