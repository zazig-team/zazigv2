INSERT INTO public.roles (
  name,
  description,
  is_persistent,
  default_model,
  slot_type,
  prompt,
  skills,
  mcp_tools,
  interactive
)
SELECT
  'junior-engineer-cc',
  description,
  is_persistent,
  'claude-sonnet-4-6',
  'claude_code',
  prompt,
  skills,
  mcp_tools,
  interactive
FROM public.roles
WHERE name = 'junior-engineer'
  AND NOT EXISTS (
    SELECT 1
    FROM public.roles
    WHERE name = 'junior-engineer-cc'
  );
