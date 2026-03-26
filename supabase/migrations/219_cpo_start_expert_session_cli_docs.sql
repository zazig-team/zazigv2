-- Add start-expert-session CLI documentation to CPO role prompt
-- This replaces the removed start_expert_session MCP tool with CLI usage docs.

UPDATE roles
SET system_prompt = system_prompt || E'\n\n## Expert Session CLI\n\nUse the zazig start-expert-session command to launch expert sessions:\n\n```\nzazig start-expert-session --role-name <role> --brief "<task description>"\n```\n\n### Flags\n- `--role-name <role>` — the expert role to start (e.g. "hotfix-engineer", "feature-builder")\n- `--brief "<text>"` — a short description of the task for the expert\n'
WHERE slug = 'cpo';
