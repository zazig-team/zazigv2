# Feature Staging/Production Tracking

**Date:** 2026-03-24
**Status:** Approved
**Author:** CPO

## Problem

Features go to `complete` status and that's it. No way to tell which features are on staging only vs promoted to production. `zazig promote` runs every few days, so there's always a gap. The existing `deployments` table (migration 099) was designed for this but never wired up — dead code.

## Design

### Data Layer

**Add `promoted_version TEXT` to `features` table.** Nullable. When NULL, feature is on staging only. When set, contains the version string (e.g. `2.14.0`) that carried it to production — links logically to the `agent_versions` table.

**Drop the `deployments` table.** Never used, no code writes to it. Replaced by the simpler `promoted_version` column.

**Migration 200:** Add column + drop table in one migration.

```sql
ALTER TABLE features ADD COLUMN promoted_version TEXT;
DROP TABLE IF EXISTS deployments;
```

### Promote Flow Update

In `packages/cli/src/commands/promote.ts`, after the `agent_versions` insert (step 8, ~line 502), add:

```sql
UPDATE features
SET promoted_version = $version
WHERE status = 'complete'
  AND promoted_version IS NULL;
```

This marks all unpromoted complete features as part of this release. Runs once per promote, affects only the gap.

### WebUI Changes

**Current state:**
- "Complete" column shows features with `status=complete`, with a 24h archive toggle
- "Shipped" column shows **ideas** with `status=done` (unrelated)

**New state:**
- Rename "Complete" column → **"Shipped to Staging"** — shows features where `status=complete AND promoted_version IS NULL`
- Add **"Shipped to Production"** section — collapsible (same UX as current archive), shows features where `status=complete AND promoted_version IS NOT NULL`. Feature cards show the version badge.
- "Shipped" ideas column stays as-is (it's a different data source)

### Edge Function Update

Update `FEATURE_SELECT` in `supabase/functions/query-features/index.ts` to include `promoted_version`:

```ts
const FEATURE_SELECT = "id, title, description, spec, acceptance_tests, human_checklist, status, priority, project_id, depends_on, promoted_version";
```

### CLI

`zazig features` returns `promoted_version` in the feature payload automatically once the edge function is updated. No new command needed. Users distinguish staging-only features by `promoted_version: null`.

## What This Does NOT Include

- No rollback tracking
- No per-environment deployment history
- No staging deployment timestamp (staging = merged to master, implicit)
- No changes to the ideas "Shipped" column

## Implementation Scope

1. Migration: add column, drop table
2. `promote.ts`: add feature update after agent_versions insert
3. `query-features/index.ts`: add promoted_version to SELECT
4. `dashboard/index.html`: rename Complete column, split by promoted_version, add production archive section
