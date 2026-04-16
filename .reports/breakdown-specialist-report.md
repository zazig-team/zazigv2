status: pass
summary: Broke feature 1f627dc8 (cross-tenant job failure → zazig-dev idea) into 2 jobs
jobs_created: 2
dependency_depth: 2

## Jobs

1. **89d52786** — Migration: cross-tenant job failure → zazig-dev idea trigger
   - complexity: simple
   - depends_on: []
   - Creates `supabase/migrations/235_cross_tenant_job_failure_to_idea.sql` with partial unique index, trigger function `notify_job_failure_to_zazig()`, and trigger `jobs_failure_to_zazig`.

2. **d0b3e7de** — Tests: cross-tenant job failure → zazig-dev idea (8 scenarios)
   - complexity: medium
   - depends_on: [89d52786]
   - Creates `tests/features/cross-tenant-job-failure-to-idea.test.ts` with 8 static SQL-inspection tests covering: basic ingest, idempotency, transition-only firing, self-observation, ingestion failure isolation, NULL join handling, non-failed status guard, and dedup index.

## Dependency graph

```
89d52786 (migration) ──► d0b3e7de (tests)
```
