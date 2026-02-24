STATUS: COMPLETE
CARD: 699d19d6
BRANCH: cpo/pai-mcp-tools
FILES: packages/local-agent/src/agent-mcp-server.ts
TESTS: Typecheck clean (tsc --noEmit)
NOTES: Added 3 new MCP tools for CPO agent: create_feature, update_feature, query_projects.

---

# CPO Report — PAI MCP Tools

## Summary
Added 3 new MCP tools to `agent-mcp-server.ts` following the existing `send_message` pattern. These give the CPO agent the ability to create features, refine them, and query the project/feature pipeline.

## Changes

### packages/local-agent/src/agent-mcp-server.ts (+152 lines)

**Tool 1: `create_feature`**
- POSTs to `create-feature` edge function
- Params: `title` (required), `description`, `project_id`, `priority` (low/medium/high)
- Passes `job_id` from env for audit trail
- Returns `feature_id` on success

**Tool 2: `update_feature`**
- POSTs to `update-feature` edge function
- Params: `feature_id` (required), `title`, `description`, `priority`, `status`
- Status restricted to `created` | `ready_for_breakdown` (CPO guardrail)
- Returns success/error message

**Tool 3: `query_projects`**
- Queries Supabase REST API directly (no edge function needed)
- Params: `company_id` (optional), `include_features` (optional boolean)
- Auto-resolves `company_id` from `ZAZIG_JOB_ID` if not provided
- Supports embedded `features()` select for project+feature view
- Returns JSON array of projects

## Design Decisions
1. All tools follow the same auth pattern as `send_message` (env vars, Bearer token, `as const` content type)
2. `query_projects` uses the REST API directly rather than an edge function — reads don't need orchestrator logic
3. `update_feature` status enum is intentionally limited — CPO shouldn't push features past `ready_for_breakdown`

## Token Usage
- Budget: claude-ok (wrote code directly)
- Approach: Read existing file → add tools from spec → typecheck → commit + push
