# CPO Report — PR #16 P1 Fixes

## P1 Fix

### P1-1: Slot leak in handleJobComplete
**Problem:** When the pre-completion SELECT failed in `handleJobComplete()`, the function returned early without calling `releaseSlot()`, permanently leaking the slot.
**Fix:** Added `await releaseSlot(supabase, jobId, machineId)` before the early return (line 407).

### P1-2: Persistent job stuck in failed on fetch error
**Problem:** In `handleJobFailed()`, if the job_type SELECT errored, `isPersistent` defaulted to `false`, leaving persistent jobs permanently stuck in `failed` status.
**Fix:** Added error logging and defaulted `isPersistent = true` when `fetchErr` is truthy (line 468-471). This ensures persistent jobs always re-queue even when the DB fetch fails.

### P1-3: Migration numbering
**Result:** No conflict. Only `003_multi_tenant_schema.sql` and `005_persistent_jobs_seed.sql` exist in `supabase/migrations/`. Kept `005_` as-is.

## Pre-merge Check
All checks passed (lint, tsc --noEmit).

## Token Usage
- Token budget: claude-ok
- Approach: Direct code edits (2 targeted fixes, ~5 lines changed)
