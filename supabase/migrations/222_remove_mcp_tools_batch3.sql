UPDATE roles
SET mcp_tools = array_remove(
  array_remove(
    array_remove(
      mcp_tools,
      'request_feature_fix'
    ),
    'start_expert_session'
  ),
  'create_project_rule'
)
WHERE mcp_tools && ARRAY[
  'request_feature_fix',
  'start_expert_session',
  'create_project_rule'
];
