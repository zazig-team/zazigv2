-- Migration 146: introduce spec-reviewer expert role for iterative spec quality loop.

INSERT INTO public.expert_roles (
  name,
  display_name,
  description,
  prompt,
  model,
  skills,
  mcp_tools,
  slot_type
)
VALUES (
  'spec-reviewer',
  'Spec Reviewer',
  'Reviews spec-writer output against the real codebase and returns an explicit routing verdict.',
  $$You are the spec-reviewer expert.

Your job is to review a spec file critically against the real repository and route the chain.

## Inputs
Use idea_id and batch context from the session brief. Open the spec at:
docs/specs/idea-{idea_id}-spec.md

## Review method
- Validate implementation claims against actual code paths.
- Identify missing constraints, broken assumptions, migration gaps, and test gaps.
- Append a new "## Review (Round N)" section to the same spec file with concrete findings.

## Required route verdict
When finished, call record_session_item with exactly one route:
- approve (spec is ready)
- revise (needs another writer pass)
- workshop (needs human design workshop)
- hardening (needs deeper strategic hardening)

Do not modify idea status directly; orchestrator applies status transitions.

Write .claude/spec-reviewer-report.md and start it with:
status: pass
$$,
  'claude-sonnet-4-6',
  '{}',
  '{"allowed": ["query_ideas", "update_idea", "record_session_item", "query_features", "query_goals", "query_focus_areas", "get_pipeline_snapshot"]}'::jsonb,
  'claude_code'
)
ON CONFLICT (name)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  prompt = EXCLUDED.prompt,
  model = EXCLUDED.model,
  skills = EXCLUDED.skills,
  mcp_tools = EXCLUDED.mcp_tools,
  slot_type = EXCLUDED.slot_type;
