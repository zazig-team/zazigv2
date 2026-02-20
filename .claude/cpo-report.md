# Pipeline Task 2 — P0/P1 Security & Correctness Fixes

**Task:** Fix SECURITY DEFINER vulnerabilities and correctness bugs in migration 004
**Branch:** zazig/pipeline-task2-schema
**Migration:** `supabase/migrations/004_pipeline_schema_v2.sql`
**Date:** 2026-02-20

## Fixes Applied

### P0-1 + P0-2: Restrict EXECUTE on SECURITY DEFINER functions
Added REVOKE/GRANT statements to restrict `release_slot` and `all_feature_jobs_complete`
to `service_role` only, preventing unauthenticated callers from invoking them.

### P0-3: Pin search_path on SECURITY DEFINER functions
Added `SET search_path = public, pg_catalog` to both functions to prevent malicious
schema shadowing attacks.

### P1-1: Fix release_slot to branch on slot_type
Rewrote `release_slot` to look up `slot_type` from the job row (with `FOR UPDATE`
locking) and increment the correct counter (`slots_codex` or `slots_claude_code`).

### P1-2: Fix all_feature_jobs_complete for legacy 'complete' status
Added `'complete'` to the `NOT IN` clause so jobs with the legacy terminal status
are not treated as incomplete indefinitely.

### P1-3: Document status enum overlap
Added a comment block at the top of the migration explaining legacy/new status
equivalences and the backward-compatibility strategy.

## Files Changed
- `supabase/migrations/004_pipeline_schema_v2.sql`

## Pre-merge Check
All checks passed (lint, tsc).

## Issues Encountered
None.

## Token Usage
- **Claude (claude-ok)**: Direct code edits, no codex-delegate needed for this task
