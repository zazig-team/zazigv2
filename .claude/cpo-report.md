# CPO Report — PR #11 P0/P1 Fix

## P0 Fix: Missing RECOVERY_COOLDOWN_MS export

**Problem:** `orchestrator/index.ts` imports `RECOVERY_COOLDOWN_MS` from `@zazigv2/shared`,
but the shared shim (`supabase/functions/_shared/messages.ts`) did not export it.
This causes the Edge Function to fail to load at runtime.

**Fix:** Added `export const RECOVERY_COOLDOWN_MS = 60_000;` to the Constants section
of `_shared/messages.ts` (line 92), alongside `MACHINE_DEAD_THRESHOLD_MS`.

## P1 Fix: Cold-start limitation documented

**Problem:** The `recoveryTimestamps` Map in `orchestrator/index.ts` is in-memory.
Edge Function cold starts reset the Map, allowing dispatch to machines still in cooldown.

**Fix (Option 2 — document + warning):**
- Enhanced the existing comment block to explicitly call out the cold-start limitation
  and the worst-case behavior (one extra job dispatched before next reap cycle).
- Added a `console.log` at module init to warn on cold start that cooldown state is reset.
- Added a TODO referencing the durable DB-persisted approach for future implementation.

## Verification

- `tsc --noEmit`: PASS (no type errors)
- `npm run lint`: FAIL (pre-existing — `eslint-visitor-keys` module not found in worktree;
  same failure on base commit `5cce565` before changes)

## Token Usage

- Token budget routing: `claude-ok` (direct implementation)
- Changes: 2 files, ~15 lines added
