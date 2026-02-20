# CPO Report: Complexity-to-Model Dispatch Mapping

## Summary

Replaced the static `modelForComplexity` helper with a full `resolveModelAndSlot` function that derives both model and slot type from job complexity. Added codex preference for simple jobs with fallback to claude_code when no codex slots are available. Added support for explicit model overrides on the job row.

## Changes

### `supabase/functions/orchestrator/index.ts`
- Added `model` field to `JobRow` interface
- Replaced `modelForComplexity(complexity)` with `resolveModelAndSlot(complexity, existingModel)` returning `{model, slotType}`
- Complexity mapping:
  - `simple` → codex / codex slot (falls back to claude-sonnet-4-6 / claude_code if no codex slots)
  - `medium` → claude-sonnet-4-6 / claude_code slot
  - `complex` → claude-opus-4-6 / claude_code slot
- If `job.model` is non-null, it overrides the complexity-derived model
- Dispatch now writes resolved `model` and `slot_type` back to the job row for observability
- Added `model` to the SELECT query for queued jobs

### `supabase/migrations/004_add_model_to_jobs.sql`
- Adds nullable `model text` column to jobs table
- NULL = orchestrator derives from complexity; non-null = explicit override

## Card-type routing
No card_type → reviewer routing existed in the dispatch path. The `cardType` field is still passed in StartJob for the local agent to determine execution agent type, but it plays no role in dispatch decisions.

## P1 Fix (PR #13 code review)

Three P1 issues from multi-agent + codex code review, fixed 2026-02-20:

### P1-1: Migration filename collision
- Renamed `004_add_model_to_jobs.sql` → `006_add_model_to_jobs.sql` to avoid collision with `004_rls_direct_writes.sql` from PR #12.

### P1-2: No allowlist validation on job.model override
- Added `CHECK (model IS NULL OR model IN ('claude-sonnet-4-6', 'claude-opus-4-6', 'codex'))` constraint to migration.
- Added `ALLOWED_MODELS` set + validation in `resolveModelAndSlot()` — rejects unknown model overrides with a warning and falls through to complexity-derived logic.

### P1-3: Simple-fallback breaks local-agent executor
- Fixed `buildCommand()` in `executor.ts` to use `slotType` as the primary routing signal instead of `complexity`.
- Previously: `slotType === "codex" || complexity === "simple"` → codex CLI. This broke when orchestrator fell back a simple job from codex to claude_code slot.
- Now: only `slotType === "codex"` triggers codex CLI. The orchestrator's `slotType` field is authoritative.

## Tests
- TypeScript compiles without errors across all packages (shared, orchestrator, local-agent)
- Pre-merge-check passed (lint + tsc)
- No test suite exists for the orchestrator yet (skipped)

## Token Usage
- Direct implementation (claude-ok budget, codex-delegate not used — changes were surgical and well-scoped)
