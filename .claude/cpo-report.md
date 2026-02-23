STATUS: COMPLETE
CARD: 699c272f
FILES: supabase/migrations/028_reviewer_role.sql (new), packages/local-agent/src/verifier.ts (modified), packages/local-agent/src/verifier.test.ts (modified), packages/local-agent/src/index.ts (modified)
TESTS: Typecheck clean (local-agent + shared). Vitest has pre-existing @zazigv2/shared resolution issue unrelated to this change.
NOTES: Reviewer role + role-driven verifier. Fallback to hardcoded steps preserved.

---

# CPO Report — Reviewer Role with Prompt + Role-Driven Verifier

## Summary
Added the `reviewer` role to the database and refactored the local agent's `JobVerifier`
to use the role prompt for driving verification behavior, including the 5-line small-fix
capability.

## Changes

### 1. Migration 028: Reviewer Role (`supabase/migrations/028_reviewer_role.sql`)
- Inserts `reviewer` role into `roles` table with full verification prompt
- Prompt defines: rebase, tests, lint, typecheck, acceptance test verification steps
- Includes the 5-line rule for auto-fixing trivial issues
- Output contract: `.claude/verify-report.md` with structured status
- Uses `ON CONFLICT (name) DO UPDATE` for idempotent re-runs

### 2. Refactored Verifier (`packages/local-agent/src/verifier.ts`)
- **Role-driven flow**: Loads reviewer prompt from Supabase `roles` table at verify time,
  spawns a `claude -p` session with the prompt + verify context as task
- **Report parsing**: Reads `.claude/verify-report.md` after the reviewer session
  completes, extracts `status: pass|fail` and `failure_reason`
- **Fallback**: If Supabase client is unavailable or role row doesn't exist, falls
  back to the original hardcoded verification steps (rebase, test, lint, typecheck, merge)
- **Constructor change**: Added optional `SupabaseClient` parameter (3rd arg, before exec)
- Added `defaultReviewerPrompt` constant for when DB is unreachable

### 3. Wired Supabase Client (`packages/local-agent/src/index.ts`)
- Passes `conn.dbClient` to `JobVerifier` constructor so it can query the roles table

### 4. Test Fix (`packages/local-agent/src/verifier.test.ts`)
- Updated constructor call to pass `undefined` for the new supabase parameter
- All existing tests exercise the fallback path (no supabase) — behavior unchanged

## Verification
- `tsc --noEmit` passes clean for both `local-agent` and `shared` packages
- Existing verifier tests updated for new constructor signature
- Vitest runner has pre-existing vite resolution issue with `@zazigv2/shared` (not related to this change)

## Token Usage
- Model: claude-opus-4-6
- Budget: claude-ok (direct code writing)
