-- Migration 194: project_rules schema and prompt guidance for automated learning

BEGIN;

-- ---------------------------------------------------------------------------
-- AC1: project_rules table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rule_text text NOT NULL,
  applies_to text[] NOT NULL,
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_rules_select_authenticated"
ON public.project_rules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_rules.project_id
  )
);

CREATE POLICY "project_rules_insert_authenticated"
ON public.project_rules
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = project_rules.project_id
  )
);

-- ---------------------------------------------------------------------------
-- AC8: engineer and combiner prompts must read and follow project_rules
-- ---------------------------------------------------------------------------

UPDATE public.roles
SET prompt = COALESCE(prompt, '') || $$

## Project Rules

Before starting work, read project_rules in the job context and follow every rule.
Treat project_rules as mandatory constraints for this job.
$$
WHERE name IN ('senior-engineer', 'junior-engineer', 'job-combiner');

-- ---------------------------------------------------------------------------
-- AC9: post-fix learning guidance using create_project_rule
-- ---------------------------------------------------------------------------

UPDATE public.roles
SET prompt = COALESCE(prompt, '') || $$

## Preventable Pattern Learning

After fixing an issue, consider whether it revealed a preventable pattern.
If the pattern is general enough to recur (and not a one-off specific bug),
call create_project_rule with a concise, actionable rule and explicit applies_to
job types such as code, combine, and test.
$$
WHERE name IN ('senior-engineer', 'junior-engineer', 'job-combiner', 'test-engineer', 'fix-agent');

COMMIT;
