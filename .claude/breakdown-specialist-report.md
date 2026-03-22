status: pass
summary: Broke CLI Stage 1 read-only commands feature into 5 jobs (4 command implementations + 1 router registration)
jobs_created: 5
dependency_depth: 2

## Jobs

1. f72f9f0a — Implement zazig snapshot command (simple, no deps)
2. f912e355 — Implement zazig ideas command (simple, no deps)
3. 2b733cc6 — Implement zazig features command (simple, no deps)
4. ecdb84ae — Implement zazig projects command (simple, no deps)
5. 8e5b312f — Register all 4 commands in CLI router (simple, depends on jobs 1-4)

## Dependency Graph

```
snapshot.ts ─┐
ideas.ts    ─┤
features.ts ─┼─→ Register in CLI router
projects.ts ─┘
```

Jobs 1-4 are fully independent and can run in parallel. Job 5 waits for all four.
