status: pass
summary: Broke feature 330b7293 (Desktop: Fix Terminal Scroll Behavior) into 2 sequential jobs
jobs_created: 2
dependency_depth: 2

## Jobs

1. **Remove custom wheel handler from TerminalPane** (simple)
   - ID: 4f4da5a3-74ab-431e-9cf3-9e26dcc89696
   - depends_on: []
   - Removes `attachCustomWheelEventHandler` from TerminalPane.tsx so xterm.js handles scroll natively

2. **Clear scrollback buffer on session switch in TerminalPane** (simple)
   - ID: d57db4c9-cd40-4865-9c6e-1b74e942e9e0
   - depends_on: [4f4da5a3-74ab-431e-9cf3-9e26dcc89696]
   - Adds `terminal.reset()` after `terminal.clear()` on session detach to fully purge scrollback

## Dependency Graph

```
[4f4da5a3] Remove wheel handler
      ↓
[d57db4c9] Clear scrollback on session switch
```

## Notes

Both jobs target TerminalPane.tsx. Sequential dependency prevents merge conflicts. Each job is a small, focused change completable in a single agent session.
