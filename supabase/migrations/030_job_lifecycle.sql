-- Migration 027: Clean up job status lifecycle
-- Cuts from 14 statuses to 8. Adds blocked_reason column for the blocked flow.
-- Adds code-reviewer role and 'review' job_type.

-- ============================================================
-- 1. Drop old constraint
-- ============================================================

ALTER TABLE public.jobs
    DROP CONSTRAINT IF EXISTS jobs_status_check;

-- ============================================================
-- 2. Migrate existing rows to new status values
-- ============================================================

UPDATE public.jobs SET status = 'queued'    WHERE status IN ('design', 'verify_failed');
UPDATE public.jobs SET status = 'complete'  WHERE status IN ('done', 'approved', 'testing', 'verifying');
UPDATE public.jobs SET status = 'failed'    WHERE status = 'rejected';
UPDATE public.jobs SET status = 'blocked'   WHERE status = 'waiting_on_human';
-- queued, dispatched, executing, reviewing, complete, failed, cancelled → unchanged

-- ============================================================
-- 3. Add new constraint (8 statuses)
-- ============================================================

ALTER TABLE public.jobs
    ADD CONSTRAINT jobs_status_check
    CHECK (status IN (
        'queued',
        'dispatched',
        'executing',
        'blocked',
        'reviewing',
        'complete',
        'failed',
        'cancelled'
    ));

-- ============================================================
-- 4. Add blocked_reason column — stores the question/reason the agent is blocked on
-- ============================================================

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- ============================================================
-- 5. Add blocked_slack_thread_ts — links to the Slack thread where the question was posted
-- ============================================================

ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS blocked_slack_thread_ts TEXT;

-- ============================================================
-- 6. Index for blocked jobs (orchestrator polls for them to post to Slack)
-- ============================================================

CREATE INDEX IF NOT EXISTS jobs_blocked_idx ON public.jobs(status)
    WHERE status = 'blocked';

-- ============================================================
-- 7. Update all_feature_jobs_complete to use new terminal statuses
-- ============================================================

CREATE OR REPLACE FUNCTION public.all_feature_jobs_complete(p_feature_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE feature_id = p_feature_id
      AND status NOT IN ('complete', 'failed', 'cancelled')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;

-- ============================================================
-- 8. Code reviewer role: multi-agent code review on single job diffs
-- ============================================================

INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
    'code-reviewer',
    'Code Reviewer — runs multi-agent review (security, performance, architecture, simplicity) on a job diff',
    false,
    'claude-sonnet-4-6',
    'claude_code',
    $$## What You Do

You perform a thorough code review on a single job's diff. You look for P0/P1/P2/P3 issues.

## Context
You receive: { type: "job_code_review", originalJobId, jobBranch }

## Review Dimensions
Run 4 parallel review perspectives:
1. Security — injection, auth bypass, data exposure, input validation
2. Performance — N+1 queries, blocking operations, unnecessary allocations
3. Architecture — coupling, naming, responsibility violations, abstraction leaks
4. Simplicity — dead code, over-engineering, confusing logic

## Severity Levels
- P0: Must fix before merge (security hole, data loss risk, crash bug)
- P1: Should fix before merge (correctness issue, significant perf problem)
- P2: Consider fixing (style, minor perf, naming)
- P3: Optional suggestion

## Output
Write `.claude/review-report.md`:
```
# Code Review Report
job: {originalJobId}
branch: {jobBranch}
verdict: clean | p0_found | p1_found
findings:
  - severity: P0|P1|P2|P3
    dimension: security|performance|architecture|simplicity
    description: ...
    location: file:line
```

If any P0 found, verdict is p0_found. Report all findings.$$,
    '{brainstorming}'
)
ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description, prompt = EXCLUDED.prompt;

-- ============================================================
-- 9. Add 'review', 'combine', 'deploy' to jobs_job_type_check
-- ============================================================

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check
    CHECK (job_type IN (
        'code', 'infra', 'design', 'research', 'docs', 'bug',
        'persistent_agent', 'verify', 'breakdown', 'combine', 'deploy', 'review'
    ));
