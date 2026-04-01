status: failed
failing_checks:
  - name: build-and-test
    conclusion: failure
    url: https://github.com/zazig-team/zazigv2/actions/runs/23843090208/job/69503453799
failure_summary: 1 check(s) failed: build-and-test (failure). TypeScript error in packages/local-agent/src/executor.ts(1548,20): Property 'exec' does not exist on type 'JobExecutor'. The handleMasterCIFailure method calls this.exec() but JobExecutor class has no exec property (only MasterCiMonitor has it). Introduced in commit 47083b5 which replaced Supabase insert with CLI call.
failure_type: code
fix_attempts: 0
