-- Remove request_work from CPO; CPO now uses start_expert_session.

UPDATE public.roles
SET mcp_tools = array_remove(COALESCE(mcp_tools, '{}'::text[]), 'request_work')
WHERE name = 'cpo';

DO $$
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    UPDATE public.roles
    SET prompt = replace(
      replace(
        prompt,
        E'### Standalone Dispatch\nCommission contractors via `request_work`: pipeline-technician,\nmonitoring-agent, verification-specialist, project-architect.',
        E'### Standalone Dispatch\nUse `start_expert_session` to launch an interactive expert in a dedicated tmux window when specialized support is needed.'
      ),
      E'Dispatch contractor via `request_work` for Step 7 (DB writes + dedup).',
      E'If Step 7 needs specialist execution, use `start_expert_session` and drive the work interactively.'
    )
    WHERE name = 'cpo';
  END IF;

  IF to_regclass('public.agent_roles') IS NOT NULL THEN
    UPDATE public.agent_roles
    SET prompt = replace(
      replace(
        prompt,
        E'### Standalone Dispatch\nCommission contractors via `request_work`: pipeline-technician,\nmonitoring-agent, verification-specialist, project-architect.',
        E'### Standalone Dispatch\nUse `start_expert_session` to launch an interactive expert in a dedicated tmux window when specialized support is needed.'
      ),
      E'Dispatch contractor via `request_work` for Step 7 (DB writes + dedup).',
      E'If Step 7 needs specialist execution, use `start_expert_session` and drive the work interactively.'
    )
    WHERE name = 'cpo';
  END IF;
END $$;
