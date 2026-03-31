status: pass
summary: Broke Electron Desktop App v1.0 into 6 jobs covering scaffolding, IPC/polling, pipeline UI, terminal pane, session switching, and CLI command
jobs_created: 6
dependency_depth: 4

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|-----|-------|------------|------------|
| 0 | 6e769141 | packages/desktop scaffolding + esbuild build config | simple | — |
| 1 | 30d5d4b6 | Electron main process: IPC channels + CLI data polling | medium | 0 |
| 2 | 9fa23bf1 | Pipeline column React component | medium | 1 |
| 3 | c18aa956 | Terminal pane: xterm.js + node-pty IPC bridge | complex | 1 |
| 4 | cb55e659 | Session switching: job click interactions | medium | 2, 3 |
| 5 | 0870982c | zazig desktop CLI command | simple | 0 |

## Dependency Graph

```
0 (scaffolding)
├── 1 (main process IPC + polling)
│   ├── 2 (pipeline column UI)
│   │   └── 4 (session switching) ←─┐
│   └── 3 (terminal pane)  ─────────┘
└── 5 (zazig desktop CLI command)
```

Max chain: 0 → 1 → 2/3 → 4 (depth 4)

## Parallelism

- Jobs 2 and 3 can run in parallel after job 1 completes.
- Job 5 can run in parallel with job 1 after job 0 completes.
- Job 4 gates on both 2 and 3 and is the final integration job.
