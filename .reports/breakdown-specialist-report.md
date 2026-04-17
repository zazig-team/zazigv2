status: pass
summary: Broke persistent agent resilience feature into 5 jobs covering DB migration, type extension, liveness detection, post-spawn health check, and auto-respawn with circuit breaker
jobs_created: 5
dependency_depth: 3

## Job List

| # | Job ID | Title | Complexity | Depends On |
|---|--------|-------|------------|------------|
| 0 | 7373f5f6-7525-44f2-8b1b-cf95583ea8da | DB migration: add last_respawn_at to persistent_agents | simple | — |
| 1 | d4c3783f-86a6-4c94-bcdb-4ffa0d59999a | Extend PersistentAgent interface with respawn state fields | simple | — |
| 2 | 42daf38d-a424-4597-9db4-ae7c130deceb | Gap 1: Liveness check in persistent agent heartbeat | medium | temp:1 |
| 3 | 38bd8a35-15e0-44cb-8f4d-706314743b81 | Gap 2: Post-spawn health check after spawnTmuxSession | medium | temp:1 |
| 4 | df037129-5295-46f0-8eeb-f0bb481f2df9 | Gap 3: Auto-respawn method with circuit breaker | complex | temp:0, temp:1, temp:2, temp:3 |

## Dependency Graph

```
[Job 0: DB migration]          [Job 1: PersistentAgent types]
        \                              /        \
         \                           /          \
          \              [Job 2: Gap 1]    [Job 3: Gap 2]
           \                  |                 |
            +---------------[Job 4: Gap 3]------+
```

Max chain: Job 1 → Job 2 → Job 4 (depth 3)

## Notes

- Jobs 0 and 1 are independent roots and can be executed in parallel.
- Jobs 2 and 3 both depend on Job 1 (type shape) and can be executed in parallel after it.
- Job 4 (auto-respawn) is the terminal node that wires everything together — it depends on all prior jobs.
- The sequencing matches the spec's recommended build order: detection first (Gap 1), visibility second (Gap 2), action last (Gap 3).
- No new features or product decisions were made — all scope and sequencing follows the approved CPO spec exactly.
