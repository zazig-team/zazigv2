-- Migration: clean up feature status lifecycle
-- Replaces 11-value messy constraint with 11-status pipeline.
-- Also renames tech-lead → feature-breakdown-expert, adds job-combiner + deployer roles.

-- 1. Drop old constraint (allows UPDATE without violating it)
ALTER TABLE public.features
    DROP CONSTRAINT IF EXISTS features_status_check;

-- 2. Migrate existing rows to new status values
UPDATE public.features
    SET status = CASE
        WHEN status IN ('proposed', 'approved', 'designing', 'in_progress', 'design') THEN 'ready_for_breakdown'
        WHEN status IN ('done', 'complete') THEN 'complete'
        ELSE status  -- building, verifying, cancelled stay
    END;

-- Fix testing→ready_to_test separately
UPDATE public.features SET status = 'ready_to_test' WHERE status = 'testing';

-- 3. Add clean constraint
ALTER TABLE public.features
    ADD CONSTRAINT features_status_check
    CHECK (status IN (
        'created',
        'ready_for_breakdown',
        'breakdown',
        'building',
        'combining',
        'verifying',
        'deploying_to_test',
        'ready_to_test',
        'deploying_to_prod',
        'complete',
        'cancelled'
    ));

-- 4. Update jobs_job_type_check: add 'combine' and 'deploy' job types
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN (
        'code', 'infra', 'design', 'research', 'docs', 'bug',
        'persistent_agent', 'verify', 'breakdown', 'combine', 'deploy'
    ));

-- 5. Rename tech-lead role to feature-breakdown-expert
UPDATE public.roles
    SET name        = 'feature-breakdown-expert',
        description = 'Feature Breakdown Expert — breaks approved features into executable jobs'
    WHERE name = 'tech-lead';

-- 6. Update CPO role prompt: use ready_for_breakdown instead of approved
UPDATE public.roles
    SET prompt = replace(prompt, 'status = ''approved''', 'status = ''ready_for_breakdown''')
    WHERE name = 'cpo';

-- 7. Insert job-combiner role
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
    'job-combiner',
    'Job Combiner — merges all completed job branches into the feature branch, resolves conflicts',
    false,
    'claude-sonnet-4-6',
    'claude_code',
    $$## What You Do

You merge all completed implementation job branches into a unified feature branch.

## Context
You receive a context object: { type: "combine", featureId, featureBranch, jobBranches[] }

## Steps

1. Check out the feature branch (or create it from master if it does not exist)
2. For each job branch in jobBranches:
   a. Attempt `git merge --no-ff {jobBranch}`
   b. If conflicts: resolve them, keeping all intended functionality
   c. Commit the merge
3. Push the feature branch
4. Write `.claude/combine-report.md`: what was merged, any conflicts resolved, final branch state
5. The orchestrator will then create a verify job automatically

## Constraints
- Do not delete job branches
- Do not modify individual job commits — only merge them
- If a job branch has already been merged, skip it (check with `git branch --merged`)
- If merge is impossible to resolve: write the conflict summary to combine-report.md and exit with a clear error message$$,
    '{}'
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    prompt = EXCLUDED.prompt;

-- 8. Insert deployer role
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
    'deployer',
    'Deployer — deploys feature branches to test and production environments',
    false,
    'claude-sonnet-4-6',
    'claude_code',
    $$## What You Do

You deploy feature branches to test or production environments using zazig.test.yaml or
zazig.deploy.yaml configuration.

## Context
You receive context: { type: "deploy", target: "test"|"prod", featureId, featureBranch, repoPath, projectId }

## Steps for test deploy (target: "test"):
1. Read zazig.test.yaml from the repository
2. Run the deploy command specified (vercel deploy or custom script)
3. Run healthcheck until green or timeout
4. Report back: deploy URL or failure reason
5. Write `.claude/deploy-report.md` with result

## Steps for prod deploy (target: "prod"):
1. Confirm the feature branch has been approved (context.approved = true)
2. Read zazig.deploy.yaml (or zazig.test.yaml prod section) from the repository
3. Run the production deploy command
4. Report back: production URL or failure reason
5. Write `.claude/deploy-report.md` with result

## Constraints
- Never deploy to prod without target: "prod" explicitly set in context
- If zazig.test.yaml / zazig.deploy.yaml is missing: report failure, do not guess$$,
    '{}'
)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    prompt = EXCLUDED.prompt;
