# CPO Report — Pipeline Task 9 (P0 Security Fixes): fix-agent.ts

## Summary

Applied 3 P0 security fixes identified in code review of `fix-agent.ts` and `index.ts`. All issues resolved, tests pass, TypeScript compiles clean.

## P0 Fixes Applied

### P0-1: `featureId` unsanitized in tmux session name
- **File:** `packages/local-agent/src/fix-agent.ts`
- **Fix:** Strip non-`[a-zA-Z0-9-]` characters from `featureId` before constructing `sessionName`. Abort spawn with error log if sanitized ID is empty.

### P0-2: Prompt injection via network-supplied Slack values
- **File:** `packages/local-agent/src/fix-agent.ts`
- **Fix:** Added `sanitizeSlackField()` function that strips backticks, `$`, `\`, quotes, and newlines. Applied to `slackChannel` and `slackThreadTs` before embedding in prompt string. Capped at 200 chars.

### P0-3: Fix agent spawned with empty Slack fields
- **File:** `packages/local-agent/src/index.ts`
- **Fix:** Removed `fixAgentManager.spawn()` call from `deploy_to_test` handler. Replaced with explicit warning log and TODO comment. Fix agent spawning gated until `DeployToTest` protocol includes Slack fields (Task 10).

## Files Changed

- `packages/local-agent/src/fix-agent.ts` — featureId sanitization, slackField sanitization
- `packages/local-agent/src/fix-agent.test.ts` — 2 new tests (sanitization, empty-after-sanitize abort)
- `packages/local-agent/src/index.ts` — gated spawn, added TODO
- `.claude/cpo-report.md` — this report

## Tests

- 20/20 tests passing (10 fix-agent + 10 branches)
- 2 new tests added: sanitized session name, abort on empty featureId
- TypeScript compiles cleanly across all workspaces (`tsc --noEmit`)

## Token Usage

- Routing: claude-ok (direct implementation)
- No codex delegation used

## Issues Encountered

- None
