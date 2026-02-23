STATUS: COMPLETE
CARD: 699b83b94cd74c3ecb461d83
FILES: packages/cli/src/commands/login.ts, packages/cli/src/lib/credentials.ts, packages/cli/src/index.ts, packages/cli/src/commands/start.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/personality.ts, packages/local-agent/src/config.ts, packages/local-agent/src/connection.ts
DELETED: packages/cli/src/commands/join.ts
TESTS: typecheck clean (all 4 workspaces)
NOTES: Browser-based OAuth login replaces CLI password prompts. Local HTTP callback server captures Supabase auth tokens. getValidCredentials() auto-refreshes expired tokens. local-agent uses authenticated JWT for DB writes instead of service-role key. zazig join command removed.

---

# CPO Report — Replace CLI Auth with Browser-Based OAuth Login

## Summary
Replaced the CLI's manual credential entry (URL + anon key + service-role key) with browser-based OAuth login, matching the `gh auth login` / `vercel login` pattern.

## Files Changed

### packages/cli/src/commands/login.ts — Rewritten
- Opens browser to Supabase hosted auth UI
- Starts local HTTP server on an available port (prefers 54321, falls back to random)
- Serves callback page that reads hash-fragment tokens and POSTs them to local `/token` endpoint
- Decodes JWT to extract email and company_id
- Saves credentials to ~/.zazigv2/credentials.json
- 5-minute timeout on login flow
- No passwords or service-role keys handled

### packages/cli/src/lib/credentials.ts — Updated schema + added getValidCredentials()
- New `Credentials` interface: `{ accessToken, refreshToken, email?, companyId?, supabaseUrl }`
- `getValidCredentials()` checks JWT exp claim (with 60s buffer), refreshes via Supabase `/auth/v1/token` endpoint if expired
- Auto-saves refreshed credentials

### packages/cli/src/commands/start.ts — Updated
- Uses `getValidCredentials()` (async, auto-refreshes)
- Passes `SUPABASE_ACCESS_TOKEN` env var to daemon (replaces `SUPABASE_SERVICE_ROLE_KEY`)

### packages/cli/src/commands/status.ts — Updated
- Uses `getValidCredentials()` and `creds.accessToken` for Bearer auth
- Gets anon key from `SUPABASE_ANON_KEY` env var

### packages/cli/src/commands/personality.ts — Updated
- Same pattern as status.ts

### packages/cli/src/index.ts — Updated
- Removed `join` command import and case
- Updated help text

### packages/cli/src/commands/join.ts — Deleted

### packages/local-agent/src/config.ts — Updated
- Added `access_token?: string` to `SupabaseConfig` interface
- Reads from `SUPABASE_ACCESS_TOKEN` env var

### packages/local-agent/src/connection.ts — Updated
- Prefers authenticated JWT for dbClient (respects RLS)
- Falls back to service_role key, then anon client
- Creates dbClient with `Authorization: Bearer ${access_token}` header

## Acceptance Criteria
1. `zazig login` opens browser to Supabase auth UI
2. CLI captures tokens via local HTTP callback server
3. No passwords or service-role keys handled in CLI
4. `getValidCredentials()` exported — auto-refreshes expired tokens
5. Refresh token stored in credentials.json
6. `zazig join` removed
7. local-agent connection.ts uses authenticated JWT (not service-role)

## Build
- `npm run typecheck` — all 4 workspaces pass clean

## Notes
- company_id JWT claim requires Supabase JWT hook (separate infra task)
- CLI commands that make REST API calls (status, personality) need `SUPABASE_ANON_KEY` env var for the apikey header
- service_role key path preserved as fallback in connection.ts for backward compatibility

## Token Usage
- Token budget: claude-ok (wrote code directly)
