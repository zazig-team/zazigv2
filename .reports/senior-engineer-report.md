status: fail
summary: Replaced the cross-tenant feature test with an 8-scenario static SQL inspection suite that validates migration 235 for ingest, guard logic, isolation, null-safety, and dedup index semantics.
files_changed:
  - tests/features/cross-tenant-job-failure-to-idea.test.ts
  - .reports/senior-engineer-report.md
failure_reason: Could not commit because the sandbox denies writes to the shared Git object/ref store (Operation not permitted on .git/objects and .git/refs), so git add/commit cannot succeed in this environment.
