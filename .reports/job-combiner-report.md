status: fail
branch: feature/fix-master-ci-failure-push-migrations-to-f484646f
merged:
conflicts_resolved:
failure_reason: Job branch job/00ec8c00-2e51-4adf-ba77-e487da177d81 has no unique commits vs master (both at 1567a223). The code job produced no output. PR creation failed — GitHub requires at least one commit difference between branches.

---

## Details

### Feature
fix-master-ci-failure-push-migrations-to-f484646f (f484646f-fc8a-4572-9a96-2fa4355b89cc)

### CI Failure Root Cause (from run 24523386747)
Step `push-staging-migrations` failed with:
```
ERROR: duplicate key value violates unique constraint "schema_migrations_pkey" (SQLSTATE 23505)
Key (version)=(235) already exists.
```
The `supabase db push --include-all` command attempted to insert migration 235 into the staging
`schema_migrations` table, but it already existed there.

### Job Branch Status
- Branch: `job/00ec8c00-2e51-4adf-ba77-e487da177d81`
- Remote tip: `1567a223` (same as master)
- Unique commits vs master: **0**
- Conclusion: The code job agent did not commit or push any fix to the job branch.

### Actions Taken
1. Fetched job branch from origin — confirmed at same SHA as master
2. Feature branch created from master (also at `1567a223`)
3. Skipped merge — job branch has no unique commits vs master
4. Confirmed `ci.yml` exists on master — CI injection skipped
5. Pushed feature branch to origin (identical to master)
6. PR creation failed — GitHub requires at least one unique commit between branches

### Next Steps for Orchestrator
The code job `job/00ec8c00-2e51-4adf-ba77-e487da177d81` needs to be re-run. The fix should
modify the staging migrations workflow to handle the case where a migration already exists.

To reproduce the original failure:
```
gh run view 24523386747 --repo zazig-team/zazigv2 --log-failed
```
