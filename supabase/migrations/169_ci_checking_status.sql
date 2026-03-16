-- Add ci_checking feature status, ci_fail_count tracking, and ci-checker role.

ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'breaking_down',
  'building',
  'combining',
  'combining_and_pr',
  'ci_checking',
  'merging',
  'pr_ready',
  'deploying_to_test',
  'ready_to_test',
  'deploying_to_prod',
  'complete',
  'cancelled',
  'failed'
));

ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS ci_fail_count INTEGER NOT NULL DEFAULT 0;

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
VALUES (
  'ci-checker',
  'CI Checker - polls GitHub CI status for pull requests',
  false,
  'gpt-5.3-codex-spark',
  'codex',
  'Poll GitHub CI status for the given PR. Report PASSED if all checks succeed. Report FAILED with details if any check fails or if checks do not complete within 20 minutes.',
  '{}',
  '{}',
  false
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_persistent = EXCLUDED.is_persistent,
  default_model = EXCLUDED.default_model,
  slot_type = EXCLUDED.slot_type,
  prompt = EXCLUDED.prompt,
  skills = EXCLUDED.skills,
  mcp_tools = EXCLUDED.mcp_tools,
  interactive = EXCLUDED.interactive;
