STATUS: COMPLETE
CARD: 699d19e8
BRANCH: cpo/pai-edge-functions
FILES: supabase/functions/create-feature/index.ts (new), supabase/functions/update-feature/index.ts (new)
TESTS: Visual review — Deno edge functions, syntactically correct TypeScript
NOTES: Two new edge functions for CPO MCP tool calls — create and update features.

---

# CPO Report — PAI Edge Functions: create-feature and update-feature

## Summary
Added two new Supabase edge functions that the CPO agent calls via MCP tools to create features and update their status/metadata.

## Changes

### 1. create-feature/index.ts (new)
- POST endpoint accepting `{project_id, title, description, priority?, job_id}`
- Resolves `company_id` from `job_id` via jobs table lookup
- Inserts feature with `status: "created"` and `priority: "medium"` default
- Returns `{ feature_id }` on success
- Auth: requires Authorization header, uses service role key for DB access
- CORS headers for cross-origin MCP calls

### 2. update-feature/index.ts (new)
- POST endpoint accepting `{feature_id, title?, description?, priority?, status?}`
- **Status guard**: CPO may only set `created` or `ready_for_breakdown` — all other statuses are orchestrator-managed
- Builds dynamic update payload from provided fields
- When status changes to `ready_for_breakdown`, inserts a `feature_status_changed` event so the orchestrator's `processReadyForBreakdown` poll picks it up
- No-op response when no fields provided
- Auth + CORS same pattern as create-feature

## Design Decisions
1. **Status whitelist**: Only `created` and `ready_for_breakdown` are CPO-settable. The orchestrator owns all downstream transitions (breakdown → building → combining → verifying → etc).
2. **Event insertion on ready_for_breakdown**: The orchestrator polls for `ready_for_breakdown` features every 10s cycle. The event insertion provides an additional audit trail.
3. **company_id resolution via job_id**: Follows existing pattern where agents operate in the context of a job, not directly with company_id.

## Token Usage
- Budget: claude-ok (wrote code directly)
- Approach: Read agent-message + orchestrator patterns → write both files → commit + push
