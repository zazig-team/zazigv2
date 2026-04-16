status: failed
failing_checks:
  - name: build-and-test
    conclusion: failure
    url: https://github.com/zazig-team/zazigv2/actions/runs/24487023381/job/71564088039
failure_summary: 1 check(s) failed: build-and-test (failure) — 18 tests in features/file-locking-credentials-json.test.ts fail because packages/cli/src/lib/credentials.ts and packages/local-agent/src/connection.ts do not implement file locking. The tests are TDD-style acceptance tests that check source code for lock imports and lock acquire/release patterns around credentials.json reads and writes. The implementation is missing.
failure_type: code
fix_attempts: 0
