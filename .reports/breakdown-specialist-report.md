status: pass
summary: Broke idea-triage job type feature into 3 jobs covering role prompt migration, local agent tooling, and orchestrator resume flow
jobs_created: 3
dependency_depth: 2

## Jobs

### Job 1: DB migration — triage-analyst role prompt for enrichment pipeline
**ID**: f73c8fb0-4e62-4c74-9352-da7d638f46e4
**Complexity**: complex
**Depends on**: (none — root job)

Rewrites `roles.prompt` for `triage-analyst` to implement the 6-step enrichment workflow:
classify type (bug/feature/task/initiative) → assess completeness → research/enrich → assign project_id → ask questions if needed → set status=enriched. Replaces old-style triage routing (triaged/workshop/etc). Includes on_hold check after each step.

---

### Job 2: Local agent — triage-analyst tool allowlist and idea-triage job support
**ID**: 8ce1680c-5bf4-455c-baf0-a848310c4be1
**Complexity**: medium
**Depends on**: (none — root job)

Adds `triage-analyst` to `MCP_TOOLS_BY_ROLE` in `workspace.ts` with tools: `ask_user`, `execute_sql`, `update_idea`, `query_projects`, `query_features`. Verifies idea-triage jobs skip code review in executor. Without this, the triage agent has no MCP tool access.

---

### Job 3: Orchestrator — resume idea-triage for awaiting_response ideas
**ID**: 581d6916-0fd3-44fa-ae6b-c14d9617269a
**Complexity**: medium
**Depends on**: f73c8fb0 (Job 1), 8ce1680c (Job 2)

Updates `resumeAwaitingResponseIdeas` in the orchestrator to create `idea-triage` resume jobs (not generic `code` jobs) when pipeline ideas get a user reply after ask_user timeout. Includes conversation history in the resume job context so the agent continues from where it left off.

---

## Dependency graph

```
Job 1 (role prompt) ─────┐
                          ├──► Job 3 (resume flow)
Job 2 (local agent) ─────┘
```

## Notes

- The orchestrator dispatch mechanism (`watchNewIdeasForDispatch`, `dispatchIdeaStageJob`) was already completed in the prior feature (31f97497) and requires no changes.
- The `ask_user` edge function and MCP tool implementation are already in place — Job 2 just enables them for the triage-analyst role.
- The `expert_roles` table has a separate `triage-analyst` entry (for legacy expert sessions) — Job 1 targets the `roles` table only, leaving `expert_roles` unchanged.
