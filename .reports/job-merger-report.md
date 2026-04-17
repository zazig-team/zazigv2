status: pass
summary: Merged feature/weekly-digest-email-4140c138 into master via squash after rebasing and resolving migration numbering conflicts.
merge_method: squash
conflicts_resolved: yes

## Conflicts resolved

### Git rebase conflicts (content conflicts in report files)
- `.reports/test-engineer-report.md` — kept both persistent-agent-resilience and weekly-digest-email sections
- `.reports/senior-engineer-report.md` — kept both sections from HEAD and branch
- `.reports/junior-engineer-report.md` — kept both sections (conflict appeared twice across commits)
- `.reports/job-combiner-report.md` — kept both sections

### Migration numbering collisions
Master had added migrations 241 (`241_user_preferences_quiet_hours.sql`) and 242 (`242_persistent_agents_last_respawn_at.sql`) after the feature branch diverged. Renamed feature migrations:
- `241_weekly_digest_data_fn.sql` → `243_weekly_digest_data_fn.sql`
- `242_weekly_digest_cron.sql` → `244_weekly_digest_cron.sql`
- `243_weekly_digest_cron.sql` → `245_weekly_digest_cron.sql`

### CI test collision fix
The `243_weekly_digest_data_fn.sql` migration used a CTE named `completed_features` that caused the existing `zazig-standup-skill-and-migration.test.ts` to pick it up (that test searches for migrations containing both `completed_features` and `promoted_version`). Renamed the CTE to `shipped_this_week` to avoid the collision.
