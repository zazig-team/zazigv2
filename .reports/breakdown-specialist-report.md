status: pass
summary: Broke Weekly Digest Email feature into 5 jobs covering Resend client, SQL data function, email template, edge function, and cron scheduling
jobs_created: 5
dependency_depth: 3

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|---|---|---|---|
| 0 | 8cd5049c-4004-4ef7-9d77-1822d588dfb4 | Resend email client shared utility | simple | — |
| 1 | 19ffcdfe-0533-4d2e-8bc1-e59f93b4adfa | Weekly digest data SQL function | medium | — |
| 2 | 6ca952e1-c0f1-4fa0-bc08-df4af853bd30 | Weekly digest HTML email template | simple | — |
| 3 | 40a85a95-db4b-4660-b7dd-4c16f5c50905 | send-weekly-digest edge function | medium | 0, 1, 2 |
| 4 | 874da901-f1fd-4f02-9bb3-fdfeacda3a2e | Weekly digest pg_cron migration | simple | 3 |

## Dependency Graph

```
[0] Resend client ─────────────┐
[1] SQL data function ─────────┤──▶ [3] send-weekly-digest edge fn ──▶ [4] pg_cron migration
[2] Email template ────────────┘
```

Max dependency chain: 0→3→4 = depth 3

## Notes

- Resend is the chosen email provider (proposals@zazig.com domain); API key to be stored in Doppler
- Job 1 (SQL function) queries auth.users for founder email — needs SECURITY DEFINER to cross schema boundary
- Job 3 (edge function) follows the orchestrator pattern for pg_net-invoked functions
- Job 4 (cron) is idempotent — deletes existing job before re-creating, matching pattern in migration 052
