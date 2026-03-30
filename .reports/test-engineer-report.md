status: pass

## Test Files Created

- `tests/features/tui-topbar-agent-tabs.test.ts` — 26 test cases

## Summary

Written 26 test cases across 6 describe blocks covering all acceptance criteria
for the "TUI Phase 1b: Top bar with live agent tabs from tmux" feature.

### Test Groups

1. **AC1** — listAgentSessions() discovers zazig tmux sessions (6 tests)
2. **AC2** — useTmuxSessions hook polls every 5 seconds (7 tests)
3. **AC3** — TopBar renders agent tabs from session list (7 tests)
4. **AC4** — Keyboard shortcuts (Tab, 1–9) switch selected session (3 tests)
5. **AC5** — Expert sessions appear/disappear within 5 seconds via polling (3 tests)
6. **AC6** — App.tsx wires useTmuxSessions and lifts selectedSession state (4 tests)

### Notes

- All tests perform static analysis of source files in `packages/tui/src/`
- All tests written to FAIL against current codebase (packages/tui does not exist yet)
- `tests/vitest.config.ts` uses `features/**/*.test.ts` — no `package.json` changes needed
