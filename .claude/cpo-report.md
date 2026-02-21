# CPO Report — slack_installations DB Migration

## Summary
Created the `slack_installations` table migration for multi-tenant Slack integration. This table stores per-workspace Slack bot tokens that Edge Functions read to post messages.

## Discovery
- Read all 14 existing migrations (003–016) to understand naming and patterns
- Confirmed `companies(id)` is `UUID PRIMARY KEY` — valid FK target
- Identified RLS pattern from 003: `service_role_full_access` + `authenticated_read_own` scoped by `company_id` via JWT
- Confirmed `update_updated_at_column()` trigger function exists from 003

## Files Changed
- `supabase/migrations/017_slack_installations.sql` — new file

## What the Migration Contains
- `slack_installations` table with `team_id TEXT PRIMARY KEY` (Slack workspace ID)
- `company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE`
- All columns per spec: team_name, bot_token, bot_user_id, app_id, scope, authed_user_id, installed_at, updated_at
- `updated_at` trigger reusing shared `update_updated_at_column()` function
- Index on `company_id` for lookup performance
- RLS enabled with `service_role_full_access` and `authenticated_read_own` policies (matching 003 patterns)

## Acceptance Criteria
- [x] Migration file created at `supabase/migrations/017_slack_installations.sql`
- [x] Table has all columns as specified
- [x] `company_id` references `companies(id)` with ON DELETE CASCADE
- [x] RLS enabled with appropriate policies (follows 003/004 patterns)
- [x] Index on `company_id` for lookup performance
- [x] Migration file follows existing naming convention (numbered prefix)

## Token Usage
- Routing: codex-first
- Implementation delegated to Codex (gpt-5.3-codex, xhigh reasoning, 3,712 tokens)
- Claude used for discovery, prompt engineering, verification, and commit
