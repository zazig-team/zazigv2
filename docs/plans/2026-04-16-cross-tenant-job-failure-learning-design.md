# Cross-tenant job failure → bug idea in zazig-dev

**Status:** design approved, ready for spec & build
**Source idea:** `c0b520e0-ae7f-459b-81dc-6abc5e44ebea`
**Date:** 2026-04-16
**Author:** cpo (founder brainstorm)

## Problem

When a job fails in any company/project hosted on zazig, that failure signal is currently isolated to that tenant. It does not surface back to zazig-dev where we could learn from it and improve the platform.

Because zazig's agents write all of our tenants' code, every failed job is a signal about a zazig-product weakness: a bad prompt, a flaky executor, a missing tool, an ambiguous spec, a runtime race, a model choice issue. We should be capturing that signal.

The existing `MasterCiMonitor` captures one narrow slice (zazig-dev's own master branch CI failures). This design extends the same pattern across every company on the platform, with a deliberately lighter-touch ingestion than `MasterCiMonitor` (ideas, not auto-features).

## Goals

- Every job that lands on terminal `status = 'failed'` in any company produces exactly one idea in the zazig-dev inbox.
- Zero-latency signal (Postgres trigger, no polling, no edge function).
- Idempotent — re-triggering or status bouncing does not create duplicates.
- Does not block the job status update if ingestion fails.

## Non-goals (v1)

- Clustering / dedup across different jobs sharing a failure signature. Ship per-job firehose; iterate to clustering if volume warrants.
- Redaction of tenant job logs. All data is already in one Supabase instance — no trust boundary crossed on ingest. Redaction, if ever needed, belongs at the triage/promote step.
- Classification of "zazig-platform bug" vs "tenant-code bug". Every failure is a platform signal because zazig authored the code.
- Rate limiting / volume caps.
- Auto-promotion to feature. These ideas land at `status = 'new'` with `item_type = 'bug'` and flow through normal triage.

## Architecture

Single Postgres trigger on `public.jobs`. Fires after UPDATE when `status` transitions into `'failed'`. INSERTs a row into `public.ideas` scoped to the zazig-dev company with `item_type = 'bug'`.

```
tenant job: failed_retrying → retries → status = 'failed'
                                              │
                           trigger fires ─────┘
                                    │
                                    ▼
              INSERT INTO public.ideas (
                company_id = '00000000-0000-0000-0000-000000000001',   -- zazig-dev
                project_id = '3c405cbc-dbb0-44c5-a27d-de48fb573b13',   -- zazigv2
                item_type  = 'bug',
                source     = 'monitoring',
                originator = 'job-failure-monitor',
                source_ref = <failing job uuid>,
                raw_text   = <structured snippet>,
                status     = 'new'
              )
              ON CONFLICT DO NOTHING
```

No new edge functions. No CLI changes. No daemon changes. One migration.

## Why this is safe despite being cross-tenant

The zazig platform runs on a single Supabase instance. Multi-tenancy is via `company_id` on every table and RLS policies. zazig-dev is just another row in the `companies` table (`00000000-0000-0000-0000-000000000001`). Writing an idea row with `company_id = zazig-dev` while reading from a job row with `company_id = <tenant>` is an ordinary SQL operation — no webhook, no cross-DB, no auth handoff.

## Trigger specification

```sql
CREATE OR REPLACE FUNCTION notify_job_failure_to_zazig()
RETURNS TRIGGER AS $$
DECLARE
  v_feature_title TEXT;
  v_commit_sha    TEXT;
  v_company_name  TEXT;
  v_raw_text      TEXT;
BEGIN
  -- Only fire on transition INTO 'failed' (not within 'failed', and not from 'failed' itself)
  IF NEW.status <> 'failed' OR OLD.status IS NOT DISTINCT FROM 'failed' THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Gather context via joins (all in one DB)
    SELECT f.title, f.commit_sha, c.name
      INTO v_feature_title, v_commit_sha, v_company_name
      FROM features f
      LEFT JOIN companies c ON c.id = NEW.company_id
      WHERE f.id = NEW.feature_id;

    v_raw_text := format(
      'Job %s failed after retries.\nCompany: %s (%s)\nRole: %s  Model: %s\nResult: %s\nFeature: %s (%s)\nCommit: %s\n\nerror_analysis:\n%s',
      NEW.id,
      COALESCE(v_company_name, '<unknown>'),
      NEW.company_id,
      COALESCE(NEW.role, '<unknown>'),
      COALESCE(NEW.model, '<unknown>'),
      COALESCE(NEW.result, '<none>'),
      COALESCE(v_feature_title, '<unknown>'),
      NEW.feature_id,
      COALESCE(v_commit_sha, '<none>'),
      COALESCE(LEFT(NEW.error_analysis::text, 2000), '<no error_analysis>')
    );

    INSERT INTO public.ideas (
      company_id,
      project_id,
      item_type,
      source,
      originator,
      source_ref,
      raw_text,
      status,
      priority
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      '3c405cbc-dbb0-44c5-a27d-de48fb573b13',
      'bug',
      'monitoring',
      'job-failure-monitor',
      NEW.id::text,
      v_raw_text,
      'new',
      'medium'
    )
    ON CONFLICT DO NOTHING;

  EXCEPTION WHEN OTHERS THEN
    -- Never block the job status update
    RAISE WARNING 'notify_job_failure_to_zazig failed for job %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_failure_to_zazig
  AFTER UPDATE OF status ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION notify_job_failure_to_zazig();
```

### Dedup

Partial unique index to make ON CONFLICT work:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS ideas_job_failure_source_ref_uniq
  ON public.ideas (source_ref)
  WHERE source = 'monitoring' AND originator = 'job-failure-monitor';
```

Re-firing the trigger (status bouncing, manual re-queue) results in `ON CONFLICT DO NOTHING` and no duplicate idea.

### Exception isolation

The `BEGIN...EXCEPTION WHEN OTHERS` block guarantees a failure in ingestion never blocks the `jobs.status` update. If ingestion fails, a WARNING lands in Postgres logs and the job completes its state transition cleanly. Observability is via scanning Postgres warnings, not via pipeline alerts.

## raw_text format

```
Job {job_id} failed after retries.
Company: {company_name} ({company_id})
Role: {role}  Model: {model}
Result: {result}
Feature: {feature_title} ({feature_id})
Commit: {commit_sha}

error_analysis:
{error_analysis truncated to 2000 chars}
```

Rationale for including `company_id` + `company_name`: lets the triager spot cross-tenant patterns (same failure across N companies) without a JOIN.

## Testing

`tests/features/cross-tenant-job-failure-to-idea.test.ts` covers:

1. **Basic ingest.** Insert a test company + project + feature + job. Update job to `failed`. Assert exactly one idea exists in zazig-dev with `item_type='bug'`, `source='monitoring'`, `source_ref=<job_id>`, and raw_text containing the company name, role, and error_analysis snippet.
2. **Idempotency on re-update.** Update the same job `failed → failed` again (triggering the AFTER UPDATE again). Assert still only one idea.
3. **Transition-only firing.** Update a job directly to `failed` from `pending` (no prior `failed_retrying`). Assert one idea. Update from `failed → retrying → failed` again. Assert still only one idea (dedup).
4. **Self-observation.** Force a zazig-dev job to fail. Assert an idea is created in the zazig-dev inbox. We want to self-observe.
5. **Ingestion failure doesn't block status update.** Temporarily break the insert (e.g. revoke insert perm or force the unique constraint to error on a second path). Update a job to `failed`. Assert the job's status update succeeded, and a WARNING is emitted.
6. **No feature present.** Insert a job with `feature_id = NULL` or pointing to a missing feature. Update to `failed`. Assert the idea is created with `<unknown>` in the feature slot and no JOIN error.
7. **Only `failed` triggers.** Transition to `failed_retrying`, `complete`, `cancelled`. Assert no ideas are created.
8. **Per-type automation.** If the company opts out of auto_triage_types for `'bug'`, the idea stays at `status='new'`. If opted in, automation flows pick it up. (Just verify the bug item_type lets the existing per-type automation decide.)

## Rollout

1. Land migration to staging via normal pipeline.
2. Observe `ideas` inbox in zazig-staging for 24h under normal traffic.
3. Manually fail a test job and verify ingestion.
4. `zazig promote` to production.

## Follow-ups (not in v1 scope)

These will become their own ideas once volume or patterns justify them:

- **Clustering by failure signature** (hash of error class + stack top-frame + role). See inbox idea `f3297e55` (auto-split failed features) for a related but distinct loop.
- **Scheduled weekly rollup** into one "this week in platform failures" idea (see Q2 option C in the brainstorm).
- **Redaction pass** at the triage/promote step — only needed when this content starts flowing into public artefacts (PR descriptions, committed specs).
- **Severity filter** — if the inbox drowns, filter by `result` / `error_analysis.category` to only ingest infra-grade failures.

## Related work

- `packages/local-agent/src/master-ci-monitor.js` — existing narrow-scope learning loop for zazig-dev CI failures (different shape: auto-creates features, not ideas).
- Inbox idea `724ce319` (CI monitor dedup) — now a feature, fixes duplicate fix-feature creation in the existing `MasterCiMonitor`. Orthogonal to this design (that loop creates features, this one creates ideas).
- Inbox idea `f3297e55` (auto-split failed features) — post-retry-exhaustion split strategy. Different axis: that's what to do with a failed FEATURE; this is what to do with a failed JOB.
