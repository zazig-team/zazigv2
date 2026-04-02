status: pass
summary: Broke "Expert Session Liveness: tmux as Source of Truth" into 5 jobs covering migration, ExpertSessionManager, orchestrator, CLI query, and desktop tmux liveness
jobs_created: 5
dependency_depth: 3

## Jobs

| temp index | job_id | title | complexity | depends_on |
|---|---|---|---|---|
| 0 | 0b6d5c86-7b48-4dab-b7f7-66eecfa6eb9f | DB migration: rename running/completed to run, update CHECK constraint | medium | [] |
| 1 | f6892343-093c-4049-ade9-d2dd63ae4e49 | ExpertSessionManager: write 'run' status, remove completed/completed_at writes | medium | [0] |
| 2 | 34388f56-4ce5-4304-a5bb-d7e01eddf79a | Orchestrator: replace 'running' with 'run' in ACTIVE_SPEC_SESSION_STATUSES | simple | [0] |
| 3 | 47cc0d96-8c66-4292-8ff7-cff9cf780c38 | Desktop CLI status.ts: filter expert sessions to last 2 days and valid statuses | simple | [0] |
| 4 | 60026560-3717-4ef2-8a0f-c70c628ad8a9 | Desktop poller + PipelineColumn: tmux liveness check for 'run' sessions | complex | [3] |

## Dependency Graph

```
0: DB migration
├── 1: ExpertSessionManager (status writes)
├── 2: Orchestrator (status references)
└── 3: Desktop CLI status query (2-day filter)
        └── 4: Desktop tmux liveness (poller + PipelineColumn)
```

Max dependency depth: 3 (migration → CLI query → desktop liveness)

## Notes

- Job 0 (migration) is the root — all other jobs depend on it because it defines the new `run` status
- Jobs 1, 2, 3 can execute in parallel once migration lands
- Job 4 depends on job 3 because the desktop tmux liveness build on the filtered CLI payload
- failed/cancelled sessions are excluded upstream (CLI query) — no display logic needed for them in the desktop
