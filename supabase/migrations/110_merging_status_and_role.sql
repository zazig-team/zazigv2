-- Migration: Add 'merging' pipeline step and job-merger role.
-- Replaces terminal status 'merged' with 'merging' (active step) + 'complete' (terminal).

-- 1. Update features_status_check to include 'merging' and 'complete' (replacing 'merged')
ALTER TABLE public.features DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features ADD CONSTRAINT features_status_check
    CHECK (status = ANY (ARRAY[
        'created','ready_for_breakdown','breakdown','building',
        'combining','combining_and_pr','verifying','merging',
        'pr_ready','deploying_to_test','ready_to_test','deploying_to_prod',
        'complete','cancelled','failed'
    ]));

-- Migrate any existing rows with status 'merged' to 'complete'
UPDATE public.features SET status = 'complete' WHERE status = 'merged';

-- 2. Add 'merge' to jobs_job_type_check
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN (
        'code', 'infra', 'design', 'research', 'docs', 'bug',
        'persistent_agent', 'verify', 'breakdown', 'combine', 'merge',
        'deploy_to_test', 'deploy_to_prod', 'review', 'feature_test'
    ));

-- 3. Insert job-merger role
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
    'job-merger',
    'Job Merger — rebases feature branch onto master and merges via gh pr merge',
    false,
    'claude-sonnet-4-6',
    'claude_code',
    $$## What You Do

You merge a verified feature branch into master by rebasing and using gh pr merge.

## Context
You receive a context object: { type: "merge", featureId, featureBranch, prUrl }

## Steps

1. Fetch latest master: `git fetch origin master`
2. Rebase the feature branch onto master: `git rebase origin/master`
3. If conflicts arise: resolve them carefully, ensuring all intended functionality is preserved. Run tests if possible to verify.
4. Force-push the rebased branch: `git push --force-with-lease`
5. Merge the PR: `gh pr merge <featureBranch> --squash --delete-branch`
6. Write `.claude/job-merger-report.md` with:
   - `status: success` or `status: fail`
   - Summary of what was done
   - Any conflicts resolved
   - Final merge result

## Constraints
- Always rebase before merging to ensure a clean linear history
- Use `--force-with-lease` (never `--force`) to prevent overwriting others' work
- Use `--squash --delete-branch` for the merge
- If rebase or merge fails irrecoverably, write the failure details to the report and exit with a clear error$$,
    '{}'
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    prompt = EXCLUDED.prompt;
