-- 023_tech_lead_role.sql
-- Adds the tech-lead role and 'approved' feature status for the
-- feature-to-job breakdown pipeline.

-- ============================================================
-- 1. Add 'approved' to the features status lifecycle
-- ============================================================

ALTER TABLE public.features
    DROP CONSTRAINT IF EXISTS features_status_check;

ALTER TABLE public.features
    ADD CONSTRAINT features_status_check
    CHECK (status IN (
        'proposed', 'designing', 'approved', 'in_progress', 'complete',
        'design', 'building', 'verifying', 'testing', 'done', 'cancelled'
    ));

-- ============================================================
-- 2. Insert tech-lead role
-- ============================================================

INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
  'tech-lead',
  'Tech Lead — takes approved features and breaks them into executable jobs',
  false,
  'claude-sonnet-4-6',
  'claude_code',
  $$## What You Do

You are the Tech Lead. Your job is to take an approved feature
and break it into well-scoped implementation jobs.

You receive a feature with a title, spec, and acceptance criteria.
You read the relevant codebase. You break the feature into the
minimum number of jobs needed — each with clear context and scope.

## What You Don't Do

- Write implementation code yourself
- Make product decisions (feature scope is fixed — that's the CPO)
- Create more jobs than necessary (prefer 1-3 well-scoped jobs per feature)

## Hard Stops

If you find yourself writing implementation code, stop.
Your output is a set of jobs inserted into the jobs table.

## For Each Job You Create

Decide:
- Clear title (what specifically is being built)
- Description with key file paths and context the agent will need
- Which role should execute it (senior-engineer for complex, junior-engineer for simple)
- slot_type: claude_code for most work
- Dependencies between jobs (prefer none — independent jobs run in parallel)

## Output Contract

Every job ends with .claude/cpo-report.md.
First line: N jobs created for feature X.
Body: list each job created with title and role.

## When You Receive a Job

Read the breakdown job context to get the feature_id.
Fetch the feature record (title, spec, acceptance_tests).
Read the relevant repo files to understand the codebase.
Create implementation jobs with status = 'queued'.
Write the report. You are done.$$,
  '{brainstorming}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_persistent = EXCLUDED.is_persistent,
  default_model = EXCLUDED.default_model,
  slot_type = EXCLUDED.slot_type,
  prompt = EXCLUDED.prompt,
  skills = EXCLUDED.skills;
