-- 066_role_skill_cleanup_v3.sql
-- Align role skills with the 2026-02-25 skills distribution proposal v3.

BEGIN;

-- CTO no longer uses the legacy cto skill wrapper.
UPDATE public.roles
SET skills = '{multi-agent-review}'
WHERE name = 'cto';

-- Product manager no longer receives cardify in pipeline distribution.
UPDATE public.roles
SET skills = '{deep-research,second-opinion,repo-recon,review-plan,brainstorming}'
WHERE name = 'product_manager';

-- CPO uses idea triage + pipeline runbook + scrum ceremony skills.
UPDATE public.roles
SET skills = '{brainstorming,ideaify,drive-pipeline,scrum}'
WHERE name = 'cpo';

COMMIT;
