status: pass
summary: Broke task-execute job type feature into 4 jobs covering orchestrator dispatch, role prompt, local agent routing, and feature tests
jobs_created: 4
dependency_depth: 2

## Jobs

| # | ID | Title | Complexity | Depends On |
|---|-----|-------|------------|------------|
| 0 | 91f4c621-f91b-4cc0-9003-4b47a8326c84 | Orchestrator dispatch for task-execute jobs | medium | — |
| 1 | 0a1158fb-dbbd-4449-a46e-8ec52c1739a3 | task-executor role prompt | complex | — |
| 2 | 02d92c42-e8e2-4821-b785-5045bdb397a0 | Local agent routing and workspace for task-execute | medium | — |
| 3 | ce13c3dd-b87c-4d85-bc47-e7ee7474f06b | Feature tests for task-execute job type | medium | 0, 1, 2 |

## Dependency Graph

```
Job 0 (orchestrator dispatch) ──┐
Job 1 (role prompt)             ├──► Job 3 (feature tests)
Job 2 (local agent routing)  ───┘
```

Jobs 0, 1, and 2 are independent and can run in parallel. Job 3 depends on all three.

## Acceptance Criteria Coverage

- `task-execute job picks up ideas with status='executing'` → Job 0 (orchestrator dispatch to executing), Job 2 (local agent accepts cardType)
- `Agent reads enriched idea content and conversation history` → Job 1 (role prompt context-reading instructions)
- `Presentations are generated as HTML and committed to company repo` → Job 1 (role prompt output logic)
- `Documents are generated and committed to company repo` → Job 1 (role prompt output logic)
- `Research reports are generated and committed to company repo` → Job 1 (role prompt output logic)
- `Output is committed to the correct directory in the company repo` → Job 1 (directory routing in prompt)
- `Commit message references the idea` → Job 1 (commit message format)
- `ask_user works during task execution for clarifications` → Job 1 (prompt), Job 2 (MCP tools include ask_user)
- `Idea gets a link/path to the output after completion` → Job 1 (update_idea after commit)
- `Orchestrator sets idea to 'done' when job completes` → Job 0 (watchCompletedIdeaStageJobs)

All 10 acceptance criteria are covered across the 4 jobs.
