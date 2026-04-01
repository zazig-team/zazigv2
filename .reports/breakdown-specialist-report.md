status: pass
summary: Broke feature "Desktop: scroll up shows terminal buffer instead of conversation scroll" into 2 jobs
jobs_created: 2
dependency_depth: 2

## Jobs

### Job 1 (root): Fix: use xterm viewport scroll for persistent agent
- ID: a35253d1-47c9-4a0c-be18-8e5629ddba07
- Complexity: medium
- depends_on: []
- Root cause: `attachCustomWheelEventHandler` in `TerminalPane.tsx` sends `\x1b[A`/`\x1b[B` escape sequences to the PTY for all scroll events. For persistent agent (CPO) sessions this causes tmux to reveal its terminal history buffer instead of scrolling xterm.js's conversation scrollback.
- Fix: Add `scrollMode: 'pty' | 'viewport'` prop to `TerminalPane`; when `viewport`, call `terminal.scrollLines(n)` instead of sending to the PTY. Pass `scrollMode='viewport'` for the CPO session in `App.tsx`.

### Job 2 (depends on Job 1): Test: acceptance tests for persistent agent scroll behavior
- ID: 85ac533f-c7cc-4956-afb7-d69b6cb8e3fa
- Complexity: simple
- depends_on: [a35253d1-47c9-4a0c-be18-8e5629ddba07]
- Create `tests/features/desktop-persistent-agent-scroll.test.ts` with static-analysis assertions verifying the scrollMode prop, conditional wheel handler, and App.tsx integration.

## Dependency Graph

```
a35253d1 (Fix: viewport scroll)
    └── 85ac533f (Test: acceptance tests)
```
