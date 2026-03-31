status: pass
summary: Broke CLI machine-readable mode feature into 6 independent jobs covering companies command, agents command, and --json flags on status/start/stop/login
jobs_created: 6
dependency_depth: 1

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|-----|-------|-----------|------------|
| 1 | 3a69a941-349f-4a56-8589-bb695fb070df | Add zazig companies command | simple | — |
| 2 | 63bbba47-2253-430f-82a7-8d85cb73554a | Add zazig agents command | complex | — |
| 3 | cabedeeb-fcf1-4820-9462-a7fd5d2f03ec | Add --json flag to zazig status | medium | — |
| 4 | db6675c4-7af0-49d7-9771-fba72177f455 | Add --json and ensure --company non-interactive on zazig start | medium | — |
| 5 | 89e2eb57-ac16-4afe-84de-fbb66feaeb05 | Add --company and --json flags to zazig stop | medium | — |
| 6 | 37365491-8176-4253-a196-453bde1efae1 | Add --json flag to zazig login | medium | — |

## Dependency Graph

All 6 jobs are independent — no inter-job dependencies. All can execute in parallel.

```
[companies] [agents] [status --json] [start --json] [stop --json] [login --json]
```

## Notes

- Each job touches a distinct command file, so parallel execution is safe with no merge conflicts.
- The agents command is marked complex due to the three-way correlation (tmux + persistent_agents table + jobs table) and the orphaned/unknown status logic.
- All other jobs are medium/simple — they follow the same pattern of adding a --json flag and routing output through stderr/stdout accordingly.
- Acceptance criteria IDs map to the feature spec: AC1 (companies), AC2-3 (agents), AC4-5 (status), AC6 (start), AC7 (stop), AC8 (login), AC9-11 (cross-cutting).
