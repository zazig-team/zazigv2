status: pass

## Test files created

- `tests/features/cli-machine-readable-companies-command.test.ts` — 13 test cases
- `tests/features/cli-machine-readable-agents-command.test.ts` — 18 test cases
- `tests/features/cli-machine-readable-json-flags.test.ts` — 26 test cases

## Total test cases: 57

### cli-machine-readable-companies-command.test.ts
Covers AC1, AC9, FC1. Verifies `companies.ts` command existence and implementation:
`fetchUserCompanies()`, `getValidCredentials()`, JSON output `{ "companies": [{ "id", "name" }] }`,
error handling for unauthenticated state, CLI index registration.

### cli-machine-readable-agents-command.test.ts
Covers AC2, AC3, AC9, AC11, FC3, FC5. Verifies `agents.ts` command existence and implementation:
`discoverAgentSessions()` reuse, Supabase queries for `persistent_agents` and `jobs` tables,
`type` field with values `persistent`/`job`/`expert`, `--type` filter flag, `tmux_session` and
`status` fields, orphaned/unknown status handling, empty `{ "agents": [] }` when no agents found,
CLI index registration.

### cli-machine-readable-json-flags.test.ts
Covers AC4, AC5, AC6, AC7, AC8, AC9, AC10, AC11, FC2, FC4. Verifies `--json` flag on:
- `status.ts`: `{ "running": false }` when daemon stopped; full JSON when running
- `start.ts`: `--json` + `--company` for non-interactive mode, `{ "started": true/false }`
- `stop.ts`: `--company` flag (currently missing), `{ "stopped": true/false }`
- `login.ts`: `{ "logged_in": true/false, "email", "supabase_url" }`, progress to stderr

## Notes

- No changes to `package.json` needed — `tests/vitest.config.ts` already uses
  `include: ['features/**/*.test.ts']` which covers the new files recursively.
- All tests are written to FAIL against the current codebase: no `companies.ts` or `agents.ts`
  exist; existing `status.ts`, `start.ts`, `stop.ts`, and `login.ts` do not yet handle `--json`.
