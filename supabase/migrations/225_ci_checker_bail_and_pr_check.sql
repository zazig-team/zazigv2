-- Harden ci-checker prompt: bail after repeated empty check runs and validate PR state before polling.

BEGIN;

UPDATE public.roles
SET prompt = REPLACE(
  REPLACE(
    REPLACE(
      REPLACE(
        prompt,
        '1. Poll check runs using the `gh` CLI (already authenticated on this machine):\n   `gh api repos/{owner}/{repo}/commits/{branch}/check-runs`\n   - Poll every 30 seconds\n   - Maximum polling time: 20 minutes (40 polls)\n2. On each poll:',
        '1. Poll check runs using the `gh` CLI (already authenticated on this machine):\n   `gh api repos/{owner}/{repo}/commits/{branch}/check-runs`\n   - Poll every 30 seconds\n   - Maximum polling time: 20 minutes (40 polls)\n1b. Before polling check runs, verify the PR is in a pollable state:\n   `gh api repos/{owner}/{repo}/pulls/{prNumber} --jq ''{mergeable: .mergeable, mergeable_state: .mergeable_state, state: .state}''`\n   - If state != "open": report FAILED — PR is closed or merged\n   - If mergeable == false or mergeable_state == "dirty": report FAILED — PR has merge conflicts, CI will not run. Include the mergeable_state in the failure_summary.\n   - If mergeable_state == "unknown": wait 10 seconds and retry once (GitHub is still computing). If still unknown after retry, proceed to polling.\n   - Otherwise: proceed to step 2\n2. On each poll:'
      ),
      '   - If total_count == 0: no checks yet, keep polling (treat as pending)',
      '   - If total_count == 0: no checks yet, keep polling. But if you get 0 check runs for 5 consecutive polls (2.5 minutes), stop polling and check the PR state (see step 1b above). If the PR has errors, report failure. If not, treat as PASSED (no CI configured).'
    ),
    'failure_type: setup | code',
    'failure_type: setup | code | pr_error'
  ),
  '- Zero check runs after polling starts: treat as PASSED (no CI configured)',
  '- Zero check runs after 5 consecutive polls: check PR state, then treat as PASSED if PR is mergeable (no CI configured)'
)
WHERE name = 'ci-checker'
  AND prompt LIKE '%If total_count == 0: no checks yet, keep polling (treat as pending)%'
  AND prompt LIKE '%1. Poll check runs using the `gh` CLI (already authenticated on this machine):%'
  AND prompt LIKE '%Zero check runs after polling starts: treat as PASSED (no CI configured)%'
  AND prompt LIKE '%failure_type: setup | code%';

COMMIT;
