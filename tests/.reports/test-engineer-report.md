status: pass

## Test Files Created

### 1. `tests/features/idea-triage-job-type-agent-role.test.ts`
Tests for the agent role setup, MCP tool surface, and idea update capabilities.

Test cases covering:
- `idea-triage` role in `ROLE_DEFAULT_MCP_TOOLS` (workspace.ts) with `ask_user` and `update_idea` tools
- `update_idea` MCP tool accepting `type` field for classification (bug/feature/task/initiative)
- `update_idea` status enum including `enriched`, `awaiting_response`, `triaging`
- `update-idea` edge function accepting `type` field and writing it to DB
- `update-idea` edge function not blocking `enriched` status transitions
- `STATUS_EVENT_MAP` including `enriched` -> `idea_enriched` event
- `ask_user` tool setting idea status to `awaiting_response` on 10-min timeout

### 2. `tests/features/idea-triage-job-type-local-agent.test.ts`
Tests for the local agent executor handling idea-triage jobs.

Test cases covering:
- Executor recognizes `idea-triage` card type and has a handler path
- `ZAZIG_IDEA_ID` env var passed to triage agent from job's `idea_id`
- `on_hold` polling for idea-triage jobs with clean exit on detection
- Triage agent role context includes research instructions and idea type classification
- Capacity slot allocation for idea-triage jobs
- ask_user timeout handling (idea -> `awaiting_response`)
- Role prompt instructs agent to be opinionated and not over-ask for clear ideas

## Test Run Results

- 2 test files, 36 total test cases
- 28 failing (feature not yet implemented — expected)
- 8 passing (checks against already-existing code)

## Notes

- `package.json` test script uses `vitest run` which discovers recursively — no changes needed
