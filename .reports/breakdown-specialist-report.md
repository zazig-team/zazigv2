status: pass
summary: Broke feature e24d7bde into 1 job targeting the TerminalPane.tsx wheel event handler fix
jobs_created: 1
dependency_depth: 0

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|-----|-------|-----------|------------|
| 1 | 233995c8-aab7-4203-a661-8fe24591b4e1 | Fix terminal scroll: remove dead code and add wheel event handler | simple | — |

## Dependency Graph

```
[233995c8] Fix terminal scroll (root — no dependencies)
```

## Notes

This feature is a focused single-file fix in `packages/desktop/src/renderer/components/TerminalPane.tsx`. The solution is fully specified in the spec (remove dead mouseEvents hack, attach custom wheel event handler converting deltaY to arrow key escape sequences via `window.zazig.terminalInput()`). One job is sufficient.
