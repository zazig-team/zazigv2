status: pass
summary: Broke feature "Schema: idea pipeline foundations" into 4 migration jobs covering idea_messages table, jobs.idea_id, ideas columns/statuses, and companies.company_project_id
jobs_created: 4
dependency_depth: 1

## Jobs

| Job ID | Title | Complexity | Depends On |
|--------|-------|------------|------------|
| d60d0313-0c32-45d9-a323-abba685ec0ca | Migration: create idea_messages table | medium | — |
| 5368a4c4-63a8-480a-b829-060e559f19ca | Migration: add jobs.idea_id column | simple | — |
| f9aa53ef-3100-4d1b-9fe3-00a7251c9bc7 | Migration: ideas table additions (on_hold, type, new statuses) | medium | — |
| 55dd41ff-42fb-410c-9821-5dc4a105a74a | Migration: add companies.company_project_id column | simple | — |

## Dependency Graph

All 4 jobs are independent — they modify different tables and can run in parallel.

```
[idea_messages table]          (no deps)
[jobs.idea_id]                 (no deps)
[ideas: on_hold, type, status] (no deps)
[companies.company_project_id] (no deps)
```

## Notes

- Migration numbers 247–250 are available (current highest is 246_typing_indicators.sql)
- ideas status constraint as of migration 206 includes: new, triaging, triaged, developing, specced, workshop, hardening, parked, rejected, promoted, done, stalled — the ideas job must extend this with the 6 new pipeline statuses
- idea_messages Realtime pattern should reference 246_typing_indicators.sql
