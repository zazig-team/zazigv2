status: success
branch: feature/fix-master-ci-failure-push-migrations-to-9f1471a2
merged:
  - job/2d20d73e-1cc0-4368-b914-c66e664ac093
conflicts_resolved: []
failure_reason:

## Notes

- Feature branch was behind master by 1 commit; synced with master before merging job branch.
- Job branch `job/2d20d73e-1cc0-4368-b914-c66e664ac093` merged cleanly (no conflicts).
- Changes: renamed migration `235_replica_identity_full.sql` → `240_replica_identity_full.sql` to fix migration numbering collision causing CI failures.
- CI workflow already exists on master — injection skipped.
- PR created: https://github.com/zazig-team/zazigv2/pull/424
