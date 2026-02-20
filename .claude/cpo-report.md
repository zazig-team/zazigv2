# CPO Report — Pipeline Task 9: Fix Agent Spawning for Testing Phase

## Summary

Implemented the `FixAgentManager` class that manages ephemeral Claude Code sessions during the testing phase. When a feature enters testing, the orchestrator sends a `DeployToTest` message, which triggers spawning a fix agent on the feature branch in a tmux session. The fix agent receives issues from Slack and makes minimal fixes, committing and pushing after each.

## Files Changed

- `packages/local-agent/src/fix-agent.ts` — FixAgentManager class with `spawn()`, `cleanup()`, `isActive()` methods
- `packages/local-agent/src/fix-agent.test.ts` — 8 vitest tests covering spawn, idempotency, cleanup, and isActive
- `packages/local-agent/src/index.ts` — Import FixAgentManager, instantiate it, wire `deploy_to_test` message to `fixAgentManager.spawn()`
- `.claude/cpo-report.md` — this report

## Tests

- 8 new tests in `fix-agent.test.ts` (spawn, idempotency, cleanup, isActive)
- 18/18 tests passing across local-agent package
- TypeScript compiles cleanly (`tsc --noEmit`)

## Token Usage

- Routing: claude-ok (direct implementation)
- No codex delegation used

## Notes

- The `DeployToTest` message type does not currently carry Slack channel/thread fields. A TODO was left in `index.ts` for when the protocol is extended.
- `FixAgentManager.cleanup()` is implemented and tested but not yet wired to an orchestrator message. Cleanup will be triggered when `FeatureApproved`/`FeatureRejected` handling is added (Task 10).
- Shell escaping follows the same pattern as `executor.ts` for consistency.
- `CLAUDECODE` env var is unset in the tmux session to prevent nested session detection.

## Issues Encountered

- None
