# CPO Report — slack_installations DB Migration

## Summary
Created the `slack_installations` table migration for multi-tenant Slack integration. This table stores per-workspace Slack bot tokens that Edge Functions read to post messages.

A code review identified a P0 security finding and a P1 data quality issue — both fixed before PR creation.

## Discovery
- Read all 14 existing migrations (003–016) to understand naming and patterns
- Confirmed `companies(id)` is `UUID PRIMARY KEY` — valid FK target
- Identified RLS pattern from 003: `service_role_full_access` + `authenticated_read_own` scoped by `company_id` via JWT
- Confirmed `update_updated_at_column()` trigger function exists from 003

## Security Fix (P0)
**Problem:** Initial draft included an `authenticated_read_own` SELECT policy granting authenticated users access to the full row, including `bot_token` (Slack OAuth credential). No product requirement exists for authenticated users to read this table — only Edge Functions running as service_role need access.

**Fix:** Dropped `authenticated_read_own` policy entirely. Only `service_role_full_access` remains.

## Data Quality Fix (P1)
Added `NOT NULL` to `installed_at` and `updated_at` — these always have `DEFAULT NOW()` so NOT NULL is safe and prevents null timestamps from sneaking in via raw SQL.

## Files Changed
- `supabase/migrations/017_slack_installations.sql` — new file (final version after security fixes)

## What the Migration Contains
- `slack_installations` table with `team_id TEXT PRIMARY KEY` (Slack workspace ID)
- `company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE`
- All columns per spec: team_name, bot_token, bot_user_id, app_id, scope, authed_user_id, installed_at, updated_at
- `updated_at` trigger reusing shared `update_updated_at_column()` function
- Index on `company_id` for lookup performance
- RLS enabled with `service_role_full_access` only — no authenticated user access

## Acceptance Criteria
- [x] Migration file created at `supabase/migrations/017_slack_installations.sql`
- [x] Table has all columns as specified
- [x] `company_id` references `companies(id)` with ON DELETE CASCADE
- [x] RLS enabled — service_role only (no authenticated user exposure of bot_token)
- [x] Index on `company_id` for lookup performance
- [x] Migration file follows existing naming convention (numbered prefix)
- [x] P0 security fix: bot_token not exposed to authenticated users
- [x] P1: installed_at/updated_at are NOT NULL
