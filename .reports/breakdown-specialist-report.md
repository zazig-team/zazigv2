status: pass
summary: Broke TUI Phase 1c SessionViewer embedding feature into 3 jobs covering tmux utilities, core embedding, and edge cases
jobs_created: 3
dependency_depth: 3

## Jobs

1. **785593f9** — Add tmux utility functions to packages/tui/src/lib/tmux.ts
   - complexity: simple
   - depends_on: []

2. **afa711a4** — Implement SessionViewer component with tmux pane embedding and tab switching
   - complexity: complex
   - depends_on: [785593f9]

3. **29c99c50** — Add edge case handling to SessionViewer (session ended, no sessions)
   - complexity: medium
   - depends_on: [afa711a4]

## Dependency Graph

```
785593f9 (tmux utils)
    └── afa711a4 (SessionViewer core embedding)
            └── 29c99c50 (edge case handling)
```

Max chain length: 3 (linear pipeline)
