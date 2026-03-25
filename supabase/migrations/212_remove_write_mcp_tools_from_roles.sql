UPDATE roles
SET mcp_tools = array_remove(
  array_remove(
    array_remove(
      array_remove(
        array_remove(
          mcp_tools,
          'create_feature'
        ),
        'update_feature'
      ),
      'create_idea'
    ),
    'update_idea'
  ),
  'promote_idea'
)
WHERE mcp_tools && ARRAY[
  'create_feature',
  'update_feature',
  'create_idea',
  'update_idea',
  'promote_idea'
];
