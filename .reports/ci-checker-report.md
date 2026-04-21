status: failed
failing_checks:
  - name: build-and-test
    conclusion: failure
    url: https://github.com/zazig-team/zazigv2/actions/runs/24736933298/job/72366183294
failure_summary: 1 check(s) failed: build-and-test (failure)
failure_type: code
fix_attempts: 0

## Failure Details

3 test assertions failed in `tests/features/initiative-breakdown-job-type-agent-role.test.ts`:

1. **`update_idea status enum includes 'spawned'`** (line 188)
   - The `update_idea` MCP tool in `packages/local-agent/src/agent-mcp-server.ts` (line 875) has a status enum that does not include `'spawned'`.
   - Current enum: `["new", "triaging", "triaged", "enriched", "awaiting_response", "developing", "specced", "workshop", "hardening", "parked", "rejected", "done"]`
   - Fix: add `"spawned"` to this enum.

2. **`update_idea status enum includes 'breaking_down'`** (line 197)
   - Same `update_idea` status enum is also missing `'breaking_down'`.
   - Fix: add `"breaking_down"` to this enum.

3. **`initiative-breakdown context references 'parent:' tag convention for child ideas`** (line 282)
   - Neither `packages/local-agent/src/workspace.ts` nor `packages/local-agent/src/agent-mcp-server.ts` mentions the `parent:` tag convention (pattern: `/parent:.*idea|parent.*tag|tag.*parent/i`).
   - Fix: add a reference to the `parent:<idea-id>` tag convention in either the `create_idea` tool description (tags field) or in the initiative-breakdown workspace context in `workspace.ts`.
