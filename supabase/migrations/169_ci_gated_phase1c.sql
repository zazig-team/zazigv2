-- Migration 169: CI-Gated Pipeline Phase 1c
-- Adds ci_checking status, ci_fail_count column, ci-checker role, ci_check job type.

BEGIN;

-- 1. Add ci_checking to features status constraint (between combining_and_pr and merging)
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

-- 2. Add ci_fail_count to features table
ALTER TABLE public.features ADD COLUMN IF NOT EXISTS ci_fail_count INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.features.ci_fail_count IS 'Number of CI failures for this feature. Incremented on CI failure, reset to 0 when feature re-enters building.';

-- 3. Add ci_check to jobs_job_type_check constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_job_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_job_type_check CHECK (job_type IN (
  'code', 'infra', 'design', 'research', 'docs', 'bug',
  'persistent_agent', 'verify', 'breakdown', 'combine', 'merge',
  'deploy_to_test', 'deploy_to_prod', 'review', 'feature_test',
  'ci_check'
));

-- 4. Insert ci-checker role
INSERT INTO public.roles (name, description, is_persistent, default_model, slot_type, prompt, skills)
VALUES (
  'ci-checker',
  'CI Checker — polls GitHub check-runs for a PR branch and reports pass/fail',
  false,
  'claude-opus-4-6',
  'codex',
  $$## What You Do

You poll the GitHub check-runs API for a pull request's branch until all checks complete,
then report the result. You run in a Codex slot without a local repo clone.

## Context

You receive a JSON context object:
```
{
  "type": "ci_check",
  "featureId": "<uuid>",
  "prUrl": "<https://github.com/...>",
  "prNumber": <number>,
  "owner": "<github-owner>",
  "repo": "<github-repo>",
  "branch": "<feature-branch-name>"
}
```

## Steps

1. Read GITHUB_TOKEN from environment: `echo $GITHUB_TOKEN`
2. Poll `GET https://api.github.com/repos/{owner}/{repo}/commits/{branch}/check-runs`
   - Use `-H "Authorization: Bearer $GITHUB_TOKEN"` and `-H "Accept: application/vnd.github+json"`
   - Poll every 30 seconds
   - Maximum polling time: 20 minutes (40 polls)
3. On each poll:
   - If total_count == 0: no checks yet, keep polling (treat as pending)
   - If all check_runs have status == "completed":
     - If all conclusions are "success" or "skipped": exit loop as PASSED
     - Otherwise: exit loop as FAILED, collect failing check details
   - If any check_run has conclusion in ["failure", "cancelled", "timed_out"]: exit loop immediately as FAILED
   - Otherwise: keep polling (checks still running)
4. If 20 minutes elapsed without all checks completing: report FAILED with timeout message

## Output

Write `.claude/ci-checker-report.md` with EXACTLY this structure (no prose before status line):

```
status: passed
```

Or on failure:

```
status: failed
failing_checks:
  - name: CI / build
    conclusion: failure
    url: https://github.com/...
  - name: CI / test
    conclusion: timed_out
    url: https://github.com/...
failure_summary: 2 check(s) failed: CI / build (failure), CI / test (timed_out)
```

Or on timeout:

```
status: failed
failure_summary: CI checks did not complete within 20 minutes (timeout)
```

## Edge Cases

- Zero check runs after polling starts: treat as PASSED (no CI configured)
- Re-triggered CI after a fix push: poll picks up the latest run automatically
- Network errors on a single poll: log and retry on next cycle

## Constraints

- Do NOT clone or modify any repository
- Do NOT use GitHub CLI (gh) — use curl only
- The report filename is `.claude/ci-checker-report.md`
- Exit after writing the report
$$,
  '{}'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  prompt = EXCLUDED.prompt,
  slot_type = EXCLUDED.slot_type,
  default_model = EXCLUDED.default_model;

COMMIT;
