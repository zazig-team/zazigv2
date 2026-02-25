STATUS: COMPLETE — TFC 7.1 cleanup: remove orchestrator dispatch, update prompts, clean jobs table

## Summary

Completed all 5 sub-tasks for the terminal-first CPO cleanup (Tasks 12-16):

1. **workspace.ts**: Removed `send_message` from CPO auto-approved MCP tools in `ROLE_ALLOWED_TOOLS`
2. **orchestrator/index.ts**: Removed persistent_agent dispatch path (context assembly, auto-requeue in handleJobComplete, isPersistent checks in handleJobFailed, stale feature-creation guard)
3. **Migration 049**: Updates CPO role prompt — replaces Slack messaging instructions with direct terminal conversation guidance
4. **Migration 050**: Deletes persistent_agent jobs, removes `persistent_agent` from jobs.job_type CHECK constraint
5. **status.ts**: Queries `persistent_agents` table instead of jobs with `job_type=eq.persistent_agent`; removed `job_type=neq.persistent_agent` filter from active jobs query

Also fixed:
- **executor.ts**: Removed `cardType === "persistent_agent"` check (now routes by `role === "cpo"` only)
- **executor.ts**: Updated `spawnPersistentAgent` synthetic message to use `"code"` CardType instead of removed `"persistent_agent"`
- **messages.ts**: Removed `persistent_agent` from `CardType` union

## Typechecks

- `packages/shared` — clean
- `packages/local-agent` — clean
- `packages/cli` — clean (pre-existing constants.ts module resolution error only)

## Branch

`cpo/tfc-cleanup` — pushed to origin (2 commits).

## Token Usage

Direct implementation, no codex delegation or subagents. Moderate token usage.
