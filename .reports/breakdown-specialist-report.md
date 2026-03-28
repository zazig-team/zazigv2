status: pass
summary: Broke "Persistent agent memory system with idle-triggered sync" into 3 jobs
jobs_created: 3
dependency_depth: 2
failure_reason:

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|-----|-------|-----------|------------|
| 0 | 2b36c517-2a55-4d23-a622-8914d3d3c8f0 | Create .memory/ directory in setupJobWorkspace() | simple | — |
| 1 | 2cfbe114-dd89-4514-974d-e4e18719f9bb | Add memory instructions to boot prompt and persistent agent CLAUDE.md | simple | — |
| 2 | 3a0ba3c3-adbb-455e-b43a-fa3c0b73bb0a | Idle-triggered memory sync nudge in persistent agent heartbeat | medium | 0, 1 |

## Dependency Graph

```
Job 0 (workspace .memory/ setup) ──┐
                                    ├──► Job 2 (idle sync nudge)
Job 1 (boot prompt + CLAUDE.md) ───┘
```

## Notes

- Jobs 0 and 1 are independent and can run in parallel.
- Job 2 depends on both because the idle nudge references `.memory/` (set up by Job 0) and the CLAUDE.md instructions (Job 1) should be in place before testing the full flow end-to-end.
- The existing `.claude/memory/` heartbeat system is intentionally left untouched — Jobs 0 and 1 are additive only.
- All jobs are scoped to `packages/local-agent/src/`: `workspace.ts` (Job 0, part of Job 1) and `executor.ts` (Job 1 DEFAULT_BOOT_PROMPT, Job 2 heartbeat loop).
