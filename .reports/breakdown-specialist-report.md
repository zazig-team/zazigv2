status: pass
summary: Broke feature initiative-breakdown job type into 4 jobs covering DB migration, executor routing, workspace MCP grants, and tests
jobs_created: 4
dependency_depth: 3

## Jobs

1. **DB migration: project-architect role for initiative-breakdown** (medium) — `3f4b4e18`
   - deps: none
   - Creates/updates the project-architect role with the full initiative-breakdown agent prompt and MCP tool grants

2. **Executor: initiative-breakdown card type detection and routing** (medium) — `f0efbc9b`
   - deps: none
   - Adds `isInitiativeBreakdownJob` detection, role defaulting to project-architect, ideaId extraction, on_hold polling

3. **Workspace: MCP tool grants for initiative-breakdown role** (simple) — `26fe3548`
   - deps: temp:1 (executor)
   - Adds initiative-breakdown to ROLE_DEFAULT_MCP_TOOLS, ensures context JSON includes stage + company_id

4. **Tests: initiative-breakdown job type** (medium) — `3808f3d7`
   - deps: temp:0, temp:1, temp:2 (all above)
   - Executor routing tests, agent role prompt tests, orchestrator breaking_down→spawned transition tests

## Dependency graph

```
[0] DB migration          ─────────────────────────┐
[1] Executor changes      ──────────┐               │
[2] Workspace MCP grants ←─ [1]    │               │
[3] Tests                ←─ [0] [1] [2]            │
```

## Notes

- The orchestrator already has initiative-breakdown routing implemented (watchEnrichedIdeasForRouting dispatches `initiative-breakdown` for `type=initiative` ideas, watchCompletedIdeaStageJobs transitions `breaking_down→spawned`). No orchestrator code changes needed.
- project-architect may already exist in NO_CODE_CONTEXT_ROLES — the executor job should verify and add if missing.
- Child ideas must NOT have project_id set; triage assigns it. This is enforced in the role prompt (job 0) and tested in job 3.
