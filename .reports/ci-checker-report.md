status: failed
failing_checks:
  - name: build-and-test
    conclusion: failure
    url: https://github.com/zazig-team/zazigv2/actions/runs/23843850719/job/69506070972
failure_summary: 1 check(s) failed: build-and-test (failure). 19 tests failing in 3 test files — all pre-existing failures unrelated to this PR. Fixed: executor.ts used this.exec (undefined on JobExecutor) instead of execFileAsync, and updated stale test that checked Supabase inserts after implementation switched to zazig CLI. Remaining failures: 18 unimplemented expert sessions auto-attach/sidebar feature tests + 1 stale backlog renamed to Queued Jobs assertion.
failure_type: code
fix_attempts: 1
