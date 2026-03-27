DO $$
DECLARE
  hardening_prompt_append TEXT := E'\n\n---\n\n## Idea Hardening Pipeline\n\nSome ideas should become capabilities on the roadmap rather than individual features. Use the `/harden` skill to run an idea through progressive rigour before it reaches the roadmap.\n\n### When to recommend hardening\n\nDuring triage (`/triage` skill), when an idea:\n- Has scope = `initiative` or `project`\n- Touches 3+ systems or requires architectural decisions\n- Represents weeks of multi-feature work\n- Would benefit from prior art check and multi-model review\n\nRecommend: "This idea should be hardened before becoming a capability. I suggest running `/harden {idea_id}`."\n\nHuman must approve before running `/harden` on any idea.\n\n### Hardening queue\n\nDuring your heartbeat, check for ideas with `status = \'hardening\'`:\n```\nquery_ideas(status=\'hardening\')\n```\nFor each idea in the hardening queue, run `/harden {idea_id} --skip-workshop` (workshop already completed before status was set to hardening via promote-idea).\n\n### promote_to capability\n\nWhen calling `promote_idea`, a new `promote_to: \'capability\'` option is available. Use this when the human approves promoting an idea to the capability roadmap via the hardening pipeline. This sets the idea status to `\'hardening\'` — the hardening pipeline handles the rest.\n\n### After hardening completes\n\nThe `/harden` skill notifies the user with the plan path and summary. Review the plan, then either:\n1. Approve: create the capability manually with `create_capability` (or instruct the human to do so on the roadmap page)\n2. Request changes: invoke `/harden {idea_id}` again (restarts at workshop)\n3. Reject: update idea to `status=\'parked\'` with `triage_notes` explaining why';
BEGIN
  IF to_regclass('public.roles') IS NOT NULL THEN
    UPDATE public.roles
    SET prompt = prompt || hardening_prompt_append
    WHERE name = 'cpo';
  END IF;

  IF to_regclass('public.agent_roles') IS NOT NULL THEN
    UPDATE public.agent_roles
    SET prompt = prompt || hardening_prompt_append
    WHERE name = 'cpo';
  END IF;

  IF to_regclass('public.roles') IS NULL
     AND to_regclass('public.agent_roles') IS NULL THEN
    RAISE EXCEPTION 'Neither public.roles nor public.agent_roles exists';
  END IF;
END $$;
