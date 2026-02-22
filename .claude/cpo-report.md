# CPO Report: Replace CLI service-role auth with Supabase user auth + RLS

## Summary

Replaced the CLI's raw service-role key authentication with Supabase Auth (email/password) across the entire CLI and local-agent stack. Users now authenticate via `zazig login` with their existing web UI credentials. The service-role key is no longer stored on operator machines. All DB operations from the local-agent use the authenticated JWT, with RLS enforcing company_id scoping automatically.

## What Was Done

1. **`zazig login` now uses Supabase Auth** -- prompts for email/password, calls `signInWithPassword()`, stores session tokens
2. **`zazig join` removed entirely** -- company_id is derived from the JWT claim, not manually entered
3. **Credentials schema updated** -- `{ supabaseUrl, anonKey, refreshToken, accessToken, userId, companyId }` replaces `{ supabaseUrl, anonKey, serviceRoleKey }`
4. **All CLI commands use JWT auth** -- `status`, `personality`, `start` all use the access token instead of service-role key
5. **Local-agent uses single authenticated client** -- replaces the dual anon+service_role client pattern with one JWT-authenticated client
6. **Auto JWT refresh** -- the Supabase JS client handles token refresh; updated tokens are persisted to credentials.json
7. **machine.yaml simplified** -- `company_id` removed; derived from credentials at runtime
8. **Multi-company support** -- login prompts for company selection if user belongs to multiple companies
9. **Machine setup integrated into login** -- if no machine.yaml exists after login, prompts for machine name and slots
10. **RLS migration added** -- authenticated INSERT/UPDATE policies on machines, jobs, and events tables

## Files Changed

### CLI (`packages/cli/`)
- `src/commands/login.ts` -- rewritten: Supabase Auth flow, multi-company, machine setup
- `src/commands/join.ts` -- **deleted**
- `src/commands/start.ts` -- no longer passes `SUPABASE_SERVICE_ROLE_KEY` env var
- `src/commands/status.ts` -- uses JWT auth, companyId from credentials
- `src/commands/personality.ts` -- uses JWT auth, companyId from credentials
- `src/lib/credentials.ts` -- new schema, `decodeJwtPayload()`, `refreshSession()`, `getValidCredentials()`
- `src/lib/config.ts` -- removed `company_id` from MachineConfig
- `src/index.ts` -- removed `join` command registration
- `src/lib/credentials.test.ts` -- **new**: 10 tests for credentials operations
- `package.json` -- added `@supabase/supabase-js`, `vitest`, test scripts

### Local Agent (`packages/local-agent/`)
- `src/config.ts` -- reads credentials.json for auth, derives company_id from JWT
- `src/connection.ts` -- single authenticated client, `authenticate()` method, token refresh persistence
- `src/index.ts` -- calls `conn.authenticate()` before `conn.start()`

### Database
- `supabase/migrations/019_authenticated_write_policies.sql` -- **new**: authenticated INSERT/UPDATE on machines, UPDATE on jobs, INSERT on events

## Tests Added/Passing

- **10 new CLI tests** (credentials.test.ts): all pass
- **27 existing local-agent tests**: all pass (3 suites)
- **2 pre-existing failures**: executor.test.ts and verifier.test.ts fail due to `@zazigv2/shared` package resolution in vitest (not related to this change)

## Issues / Notes

- **014_companies_anon_rls.sql**: Wide-open anon SELECT on companies NOT removed -- pipeline dashboard still needs it
- **JWT `company_id` claim**: Requires a custom access token hook in Supabase to inject `company_id` at the JWT top level
- **Edge Functions**: Continue using service_role (server-side only, correct behavior)

## Manual Test Steps

1. `zazig login` -- enter Supabase URL, anon key, email, password
2. Verify `~/.zazigv2/credentials.json` contains `refreshToken`, `accessToken`, `companyId` (no `serviceRoleKey`)
3. `zazig start` -- daemon should authenticate and connect
4. `zazig status` -- should show machine state using JWT auth
5. Check daemon logs for "Authenticated as user" message

## Token Usage

- Token budget: claude-ok (direct implementation)
- No codex-delegate used
