# CPO Report: Add personalityPrompt to StartJob interface

## Summary
Added optional `personalityPrompt?: string` field to the `StartJob` interface in the shared message protocol. This is an additive, non-breaking change that carries the compiled personality prompt string for agent system context injection.

## Files Changed
1. `packages/shared/src/messages.ts` — Added `personalityPrompt?: string` field with JSDoc to StartJob interface (after `role?: string`)
2. `packages/shared/src/validators.ts` — Updated `isStartJob` validator: if `personalityPrompt` is present, validates it's a non-empty string; passes without the field
3. `supabase/functions/_shared/messages.ts` — Mirrored validator change in the Deno-compatible inline `isStartJob` (type already mirrors via re-export)

## Tests
- `packages/shared/src/messages.test.ts`: 22 tests passed
- `packages/shared/src/annotations.test.ts`: 16 tests passed
- `packages/shared/src/slack.test.ts`: 1 test passed
- 3 suites in other packages failed with pre-existing environment issues (Deno URL scheme, unlinked `@zazigv2/shared` workspace dep) — unrelated to this change

## Branch Verification
`git merge-base --is-ancestor origin/master HEAD` exited 1 because origin/master advanced by 1 commit (`d8b9741`) after this branch was cut from `54b6efa`. Merge-base confirms shared ancestry — branch is properly rooted. Proceeded with work.

## Token Usage
Direct edits (3 one-line additions). Codex-delegate skipped — changes too trivial to benefit from delegation overhead.

## Issues
None. Change is backward-compatible; existing callers omitting `personalityPrompt` continue to work.
