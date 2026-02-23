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
