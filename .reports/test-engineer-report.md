status: pass

## Test files created

- `tests/features/tui-sessionviewer-embedding.test.ts`

## Test cases written: 13

### tmux utility library (4 tests)
- exports a `switchSession` function
- exports an `embedSession` function
- `switchSession` invokes a tmux command targeting the given session name
- `embedSession` invokes a tmux command with session name and geometry

### SessionViewer component — module exports (1 test)
- exports a SessionViewer component as default or named export

### Acceptance criteria — session display and switching (4 tests)
- CPO agent selected → `embedSession` called with CPO session name
- User switches to CTO tab → `switchSession` called with CTO session name
- `switchSession` resolves cleanly with a valid session name
- `embedSession` resolves cleanly with a valid session name and geometry

### Edge cases (4 tests)
- Active session dies → component renders 'Session ended' placeholder
- No sessions running → component renders 'Waiting for agents...' placeholder
- `switchSession` rejects on empty session name
- `embedSession` rejects on empty session name

## Notes

- `package.json` (root) delegates to workspace test scripts; `tests/package.json` uses `vitest run` which discovers all `tests/features/**/*.test.ts` files recursively — no changes required.
- All tests import from `packages/tui/src/lib/tmux.js` and `packages/tui/src/components/SessionViewer.js`, which do not exist yet. Tests are expected to fail until the feature is implemented.
