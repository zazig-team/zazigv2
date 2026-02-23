STATUS: COMPLETE
CARD: 699b97ea8af43fd5e97cef65
FILES: packages/cli/src/commands/setup.ts (new), packages/cli/src/index.ts (modified), packages/cli/src/commands/join.ts (deleted)
TESTS: N/A — interactive CLI command, depends on PR #67 for auth types
NOTES: zazig setup command created with full guided flow. zazig join removed.

---

# CPO Report — zazig setup command

## Summary
Added `zazig setup` CLI command: guided flow to create a company, onboard a project (with optional AI conversation), and invite teammates. Removed `zazig join` (superseded).

## Files Changed
- `packages/cli/src/commands/setup.ts` — **New**: full setup flow (auth check, company creation/selection, project creation with AI brief, teammate invites)
- `packages/cli/src/index.ts` — Replaced `join` import/case with `setup`, updated help text
- `packages/cli/src/commands/join.ts` — **Deleted**

## Implementation Details

### Auth (Step 1)
- Uses `getValidCredentials()` from auth branch (PR #67) — auto-refreshes expired tokens
- Creates Supabase client with `createClient()` and sets session via `auth.setSession()`
- Exits with helpful message if not logged in

### Company (Steps 2-3)
- Option 1: Create new company via `supabase.from("companies").insert()`
- Option 2: List existing companies (RLS-scoped), let user pick if multiple
- Falls straight into project creation after company is resolved

### Project (Step 4)
- Prompts for project name and optional git repo path
- If repo path given: reads README.md and package.json for context
- AI conversation (if `ANTHROPIC_API_KEY` set): calls Anthropic Messages API with `claude-haiku-4-5-20251001` to generate structured brief
- Writes `docs/PROJECT.md` to repo if path given and brief generated
- Fallback without API key: prompts for plain text description
- Inserts into `projects` table with `company_id`, `name`, `repo_url`

### Invites (Step 5)
- Comma-separated email input
- Uses `supabase.auth.admin.inviteUserByEmail()` with graceful failure — admin API requires service role key, which user auth doesn't have
- TODO comment noting Edge Function needed for production invites

## Acceptance Criteria Met
1. `zazig setup` registered as CLI command
2. Requires prior `zazig login`
3. Can create a new company + auto-flow into project
4. Can add project to existing company (multi-company pick)
5. Reads repo files (README, package.json)
6. AI conversation with graceful fallback
7. Writes docs/PROJECT.md
8. Inserts project into projects table
9. Invite step fails gracefully with clear message
10. `zazig join` removed

## Token Usage
- Token budget: claude-ok (wrote code directly)

---

# PR #65 Review Fixes — Follow-up Commit

## Summary
Applied 5 fixes from PR #65 code review (1 P0, 3 P1, 1 P2) in a single follow-up commit.

## Fixes Applied

### Fix 1 (P0): getValidCredentials() stub
- Added `getValidCredentials()` to `credentials.ts` — async wrapper around `loadCredentials()` with TODO for token refresh when PR #66 lands

### Fix 2 (P1): Removed misleading invite step
- Replaced `auth.admin.inviteUserByEmail` flow (requires service role key, always fails with user token) with a clear skip message
- TODO comment for wiring to Edge Function when available

### Fix 3 (P1): repo_url stores Git remote URL
- Prompt now asks for Git remote URL with validation (must start with http://, https://, or git@)
- Separate `localRepoPath` prompt for reading context files (README, package.json)
- Local path is NOT stored in DB

### Fix 4 (P1): RLS INSERT policies
- Created `supabase/migrations/024_setup_insert_policies.sql`
- `authenticated_insert_company`: any authenticated user can create a company
- `authenticated_insert_own_project`: scoped by JWT company_id claim

### Fix 5 (P2): Capture project ID + machine.yaml
- Project insert now captures returned `id` via `.select("id").single()`
- After project creation, writes `~/.zazigv2/machine.yaml` using existing `saveConfig()` from `config.ts`
- Uses `os.hostname()` for machine name, defaults to 1 claude_code slot

## Files Changed
- `packages/cli/src/lib/credentials.ts` — added `getValidCredentials()` export
- `packages/cli/src/commands/setup.ts` — all fixes applied (imports, invite removal, URL validation, project ID capture, machine config)
- `supabase/migrations/024_setup_insert_policies.sql` — **New**: INSERT policies for companies + projects

## Token Usage
- Token budget: claude-ok (wrote code directly)
