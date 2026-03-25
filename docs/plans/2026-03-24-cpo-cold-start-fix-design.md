# CPO Cold Start Fix

**Date:** 2026-03-24
**Author:** CPO
**Status:** Approved

## Problem

CPO cold start takes 15+ tool calls and 2+ minutes due to:
1. **Standup skill references blocked MCP tools** — the version loaded into CPO sessions still calls `query_features`, `query_ideas`, `query_jobs` which are all access-denied for CPO role
2. **No standup-shaped CLI command** — `zazig snapshot` returns 40KB of raw JSON (218 completed features with full metadata). CPO must parse, classify, and format this itself, leading to repeated JSON parsing failures
3. **Snapshot missing `promoted_version`** — completed features don't include their shipped version, forcing a separate query

## Solution

Three changes, shipped as one feature:

### Change 1: `zazig standup` CLI command

New CLI command that calls the existing snapshot edge function and formats the response into a standup-ready summary.

**Default output (text):**
```
Standup — 2026-03-24

Inbox: 0 new ideas
Pipeline: 1 active | 0 backlog | 3 failed | 218 complete
Capacity: 3 machines online, 0 active jobs

Active work:
  Remove write MCP tools — combining_and_pr (2/3 jobs done)

Failed:
  Fix assembleContext skill resolution — high — failed 2026-03-22
  Fix slack_installations — high — failed 2026-03-21
  WebUI remove duplicate animation — low — failed 2026-03-20

Recently completed:
  WebUI Nav reorder — v0.43.0 — 2026-03-24
  Fix CLI projects command — v0.42.0 — 2026-03-24

Stuck: none
```

**`--json` flag** returns structured data for programmatic use:
```json
{
  "date": "2026-03-24",
  "inbox": { "new": 0, "total": 179 },
  "pipeline": { "active": 1, "backlog": 0, "failed": 3, "complete": 218 },
  "capacity": { "machines": 3, "active_jobs": 0, "codex_slots": 12, "cc_slots": 20 },
  "active": [{ "title": "...", "status": "combining_and_pr", "jobs_done": 2, "jobs_total": 3 }],
  "failed": [{ "title": "...", "priority": "high", "updated_at": "..." }],
  "completed": [{ "title": "...", "promoted_version": "0.42.0", "updated_at": "..." }],
  "stuck": [],
  "recommendations": ["Failed features are accumulating — recommend /scrum"]
}
```

**Implementation:**

File: `packages/cli/src/commands/standup.ts`

Logic:
1. Call `GET /functions/v1/get-pipeline-snapshot?company_id={id}` (same as `zazig snapshot`)
2. Classify `features_by_status` into buckets:
   - **backlog**: status `created`
   - **active**: all other non-terminal statuses (`breaking_down`, `building`, `combining_and_pr`, `testing`, `reviewing`, etc.)
   - **failed**: status `failed`
3. Detect stuck: active features where `updated_at` is older than 2 hours
4. Format completed from `completed_features` (top 5)
5. Compute recommendations from thresholds:
   - `inbox.new > 0` → "Triage the inbox?"
   - `failed > 3` → "Failed accumulating, run /scrum"
   - `backlog > 5 AND active < 2` → "Pipeline has capacity"
   - `stuck > 0` → "Investigate stuck features?"
6. Output text or JSON based on `--json` flag

Register in `packages/cli/src/index.ts`:
```typescript
case "standup":
  await standup(args);
  break;
```

**Size:** ~120 lines. No new edge function, no migration, no deploy dependency.

### Change 2: Rewrite standup skill

Replace the current `projects/skills/standup.md` with a minimal version that delegates to the CLI.

**New skill content:**

```markdown
# /standup

**Role:** CPO
**Type:** Operational
**Target:** < 10 seconds, < 30 lines output

## Execution

Run: `zazig standup --company <company_id> --json`

Parse the JSON response. Present the text summary to the human.

Check recommendations array and append the most relevant 1-2 to the output.

## Rules

- If the CLI fails, report the error and suggest checking CLI auth
- No IDs, no UUIDs in output — human-readable titles only
- If this is session start, present as part of greeting
- After standup, yield to the human
```

### Change 3: Add `promoted_version` to snapshot refresh

Small migration to join `promoted_version` into the `completed_features` array in `refresh_pipeline_snapshot`.

File: `supabase/migrations/XXX_snapshot_promoted_version.sql`

Change in the `completed_features` subquery (lines 59-71 of migration 196):

```sql
'completed_features', COALESCE((
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', f.id,
      'title', f.title,
      'updated_at', f.updated_at,
      'promoted_version', f.promoted_version
    ) ORDER BY f.updated_at DESC
  )
  FROM public.features f
  WHERE f.company_id = p_company_id
    AND f.status = 'complete'
  LIMIT 10
), '[]'::jsonb),
```

This is a `CREATE OR REPLACE FUNCTION` — safe to re-run, no table changes.

## Build Sequence

All three changes go in one feature with three jobs:

1. **Migration** (Change 3) — add `promoted_version` to snapshot refresh. No code dependency.
2. **CLI command** (Change 1) — `standup.ts` + register in `index.ts`. Depends on migration being deployed so snapshot data includes `promoted_version`.
3. **Skill rewrite** (Change 2) — update `projects/skills/standup.md`. Can ship with the CLI change.

Jobs 2 and 3 can be a single job (both are in the same repo, same PR).

## Verification

After deploy to staging:
1. `zazig standup --company 00000000-0000-0000-0000-000000000001` outputs clean text summary
2. `zazig standup --company 00000000-0000-0000-0000-000000000001 --json` outputs valid JSON
3. Completed features in output include `promoted_version`
4. Restart CPO — cold start uses `zazig standup`, completes in under 10 seconds
5. No MCP query tools called during cold start

## What This Doesn't Fix

- **Stale skill version loaded into CPO sessions** — the skill resolution bug (feature `610bd562`) is a separate issue. Even with the old skill version, CPO's napkin now documents the CLI-first approach. Once `610bd562` ships, the updated skill will load correctly.
- **CLI `2>&1` footer issue** — the footer already goes to stderr. The parsing failures were from `2>&1` merging streams and from oversized responses. `zazig standup` eliminates both problems by returning right-sized, pre-formatted output.
