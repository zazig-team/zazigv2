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

## Tests
- TypeScript compiles without errors across all packages (shared, orchestrator, local-agent)
- Pre-merge-check passed (lint + tsc)
- No test suite exists for the orchestrator yet (skipped)

## Token Usage
- Direct implementation (codex-delegate not used — changes were surgical and well-scoped)
