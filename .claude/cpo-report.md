# CPO Report — slack-oauth Edge Function

## Summary
Created the `slack-oauth` Edge Function that handles the Slack OAuth callback. Exchanges the authorization code for a bot token and upserts the installation into `slack_installations`.

## Discovery
- Read plan doc Section 2: `slack-oauth` receives `code` + `state` (company_id UUID), exchanges via `oauth.v2.access`, upserts into `slack_installations`
- Read existing `orchestrator` Edge Function for patterns: `Deno.serve()`, `Deno.env.get()`, `createClient` with service_role, `deno.json` import map
- Read `017_slack_installations.sql` for table schema: `team_id` PK, all columns match spec, RLS service_role only

## Files Changed
- `supabase/functions/slack-oauth/deno.json` — new file (import map matching orchestrator pattern)
- `supabase/functions/slack-oauth/index.ts` — new file (OAuth callback handler)

## Implementation Details
- GET handler validates `code` and `state` query params
- Exchanges code via POST to `https://slack.com/api/oauth.v2.access` with `client_id`, `client_secret`, `code`
- Parses response: `team.id`, `team.name`, `access_token`, `bot_user_id`, `app_id`, `scope`, `authed_user.id`
- Upserts into `slack_installations` with `ON CONFLICT team_id` (handled by Supabase `.upsert()` with `onConflict: "team_id"`)
- Uses service_role Supabase client for the upsert (bypasses RLS)
- Returns success HTML on success, error responses on failure
- Deploy annotation: `--no-verify-jwt` (Slack doesn't send JWTs)

## Acceptance Criteria
- [x] Edge Function created at `supabase/functions/slack-oauth/index.ts`
- [x] `supabase/functions/slack-oauth/deno.json` created (matching existing pattern)
- [x] Receives GET request with `code` and `state` query params
- [x] `state` param contains `company_id` UUID
- [x] Exchanges code via POST to `https://slack.com/api/oauth.v2.access`
- [x] Parses response: `team.id`, `team.name`, `access_token`, `bot_user_id`, `app_id`, `scope`, `authed_user.id`
- [x] Upserts into `slack_installations` (ON CONFLICT team_id DO UPDATE)
- [x] Uses service_role Supabase client for the upsert
- [x] Returns success HTML page on success
- [x] Returns error response if code exchange fails
- [x] Deploy annotation: `--no-verify-jwt`

## Token Usage
- Token budget: claude-ok
- Wrote code directly (no codex-delegate)
