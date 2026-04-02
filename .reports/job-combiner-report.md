status: success
branch: feature/cli-unified-zazig-search-across-ideas-fe-f9e28f8a
merged:
  - job/ac15f7de-1a59-410a-88a1-d029ce8cd23e
conflicts_resolved: []
failure_reason:

## Notes

- Merged job/ac15f7de-1a59-410a-88a1-d029ce8cd23e cleanly with no conflicts.
- CI workflow already exists on master — skipped injection.
- Feature branch pushed to origin.
- PR created: https://github.com/zazig-team/zazigv2/pull/395

## Changes merged

- `packages/cli/src/commands/search.ts` — new unified search CLI command
- `packages/cli/src/index.ts` — registers search command
- `supabase/functions/query-search/index.ts` — edge function for search backend
- `supabase/functions/query-search/deno.json` — Deno config for edge function
- `tests/features/cli-unified-search-command.test.ts` — feature tests for CLI command
- `tests/features/cli-unified-search-edge-function.test.ts` — feature tests for edge function
