status: success
branch: feature/fix-master-ci-failure-run-npm-run-test-0b229904
merged:
  - job/d9087929-ae6e-4120-8631-010796a1b814 (already merged — skipped)
  - job/1531c4a9-86dd-48d6-bcea-d94cbc58bff6 (via cherry-pick from master)
conflicts_resolved: []
failure_reason:

---

## Notes

Cherry-picked file locking implementation from master commit 74cef9b2 (PR #413)
into feature branch to fix failing `file-locking-credentials-json.test.ts` tests.

Files changed:
- `packages/cli/src/lib/credentials.ts` — added file locking via credentials.lock
- `packages/local-agent/src/connection.ts` — added file locking via credentials.lock
