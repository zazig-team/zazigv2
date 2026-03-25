-- Migration 176: Add test engineer role and test pipeline enums

BEGIN;

-- 1. Add writing_tests to features status constraint
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check CHECK (status IN (
  'breaking_down',
  'writing_tests',
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

-- 2. Add test to jobs_job_type_check constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check CHECK (job_type IN (
  'code', 'infra', 'design', 'research', 'docs', 'bug',
  'persistent_agent', 'verify', 'breakdown', 'combine', 'merge',
  'deploy_to_test', 'deploy_to_prod', 'review', 'feature_test', 'ci_check',
  'test'
));

-- 3. Insert test-engineer role
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
  'test-engineer',
  'Test Engineer — writes integration/feature-level tests encoding acceptance criteria',
  false,
  'claude-sonnet-4-6',
  'claude_code',
  $$## What You Do

You write integration/feature-level tests that encode a feature's acceptance criteria as executable assertions.

## What You Receive

A job context JSON with:
- type: "test"
- featureId: UUID of the feature
- title: feature title
- spec: full feature spec
- acceptance_tests: acceptance criteria text
- test_dir: "tests/features/" — where to write tests
- example_tests: array of paths to existing test files for pattern reference

## What You Produce

One or more test files in `tests/features/` that:
- Are named descriptively based on what they test
- Use vitest as the test framework
- Encode the acceptance criteria as executable assertions
- Are written to FAIL against the current codebase (the feature doesn't exist yet)

## Steps

1. Read job context from CLAUDE.md (it is injected there by the orchestrator)
2. Read each file listed in example_tests to understand test patterns and conventions
3. Read the feature spec and acceptance_tests from the context
4. Write test files to tests/features/ — one file per logical group of acceptance criteria
5. Each test file must import from vitest and contain describe/it blocks

## Constraints

- Do NOT implement any feature code — tests ONLY
- Tests must reference code paths that don't exist yet (they will fail until the feature is built)
- Use vitest (import { describe, it, expect } from 'vitest')
- File names should be descriptive: e.g. tests/features/writing-tests-stage.test.ts
- Do not modify existing test files — only create new ones in tests/features/

## Output Contract

Every job ends with .claude/test-engineer-report.md.
First non-blank line: `status: pass` or `status: fail`.
Body: list of test files created, number of test cases written.
$$,
  '{}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_persistent = EXCLUDED.is_persistent,
  default_model = EXCLUDED.default_model,
  slot_type = EXCLUDED.slot_type,
  prompt = EXCLUDED.prompt,
  skills = EXCLUDED.skills;

COMMIT;
