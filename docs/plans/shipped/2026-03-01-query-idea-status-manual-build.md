# Query Idea Status: Manual Build Plan

**Date:** 2026-03-01
**Status:** Ready for manual build
**Context:** Feature `3c6b11f8` failed 45x in the pipeline. A complete edge function exists on the feature branch but was never merged or deployed. The ideas infrastructure (5 MCP tools, 5 edge functions, full schema) was built separately and is already on master. This feature adds one additional edge function that traces an idea's promotion chain.

**Feature branch:** `origin/feature/query-idea-status-edge-function-mcp-tool-3c6b11f8`
**Design spec:** None (straightforward query function)

---

## What was built (on the feature branch)

| Component | Status | Notes |
|-----------|--------|-------|
| Edge function: query-idea-status | Complete | 177 lines, Deno, at `supabase/functions/query-idea-status/index.ts` |
| Deno config | Complete | `supabase/functions/query-idea-status/deno.json` |
| MCP wrapper | Not on branch | Would follow existing 5-tool pattern |

## What the function does

Given an `idea_id`, traces the full promotion chain:

```
POST /functions/v1/query-idea-status
Body: { "idea_id": "uuid" }

Response: {
  "idea": { id, title, status, created_at, updated_at },
  "promoted_to": null | {
    "type": "feature" | "job" | "research",
    "id": "uuid",
    "details": { title, status, ... }
  },
  "summary": "Human-readable status string"
}
```

**Logic flow:**
1. Fetch idea from DB
2. If not promoted → return idea status directly ("idea is new/triaged/parked/...")
3. If promoted to research → show research status
4. If promoted to job → show job title + status
5. If promoted to feature → show feature + job counts + completion percentage

## What's already on master

The ideas infrastructure is complete:
- 5 edge functions: create-idea, query-ideas, update-idea, promote-idea, batch-create-ideas
- 5 MCP tools: create_idea, query_ideas, update_idea, promote_idea, batch_create_ideas
- Full ideas table schema with all columns
- CPO role has all 5 tools in mcp_tools array

This feature adds **one more function** to that set.

---

## Manual build steps

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | Copy edge function from branch | | 2 files: index.ts + deno.json |
| 2 | Deploy edge function | | `supabase functions deploy query-idea-status` |
| 3 | Add MCP wrapper (optional) | | ~40 lines in agent-mcp-server.ts |
| 4 | Update CPO role mcp_tools (optional) | | Add to array if MCP wrapper added |
| 5 | Rebuild local agent (if MCP added) | | `npm run build` |
| 6 | Test | | curl or MCP tool call |

---

## Step-by-step: What you need to run

### Step 1: Copy edge function from branch

```bash
cd ~/Documents/GitHub/zazigv2

# Checkout the edge function files from the feature branch
git checkout origin/feature/query-idea-status-edge-function-mcp-tool-3c6b11f8 -- \
  supabase/functions/query-idea-status/
```

This pulls 2 files:
- `supabase/functions/query-idea-status/index.ts` (177 lines)
- `supabase/functions/query-idea-status/deno.json`

### Step 2: Deploy edge function

```bash
cd ~/Documents/GitHub/zazigv2
supabase functions deploy query-idea-status
```

### Step 3: Add MCP wrapper (optional)

If you want the CPO to be able to call `query_idea_status` conversationally, add a tool block to `packages/local-agent/src/agent-mcp-server.ts`. Follow the same pattern as the existing 5 idea tools:

```typescript
server.tool(
  'query_idea_status',
  'Trace an idea through its full promotion chain — shows current status and what it was promoted to (feature, job, or research)',
  { idea_id: z.string().describe('The idea UUID to trace') },
  guardedHandler(async ({ idea_id }) => {
    const res = await supabaseCall('query-idea-status', { idea_id });
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  })
);
```

Insert this after the existing `batch_create_ideas` tool block.

### Step 4: Update CPO role mcp_tools (SQL Editor, if MCP added)

```sql
UPDATE roles
SET mcp_tools = array_append(mcp_tools, 'query_idea_status')
WHERE name = 'cpo';
```

### Step 5: Rebuild local agent (if MCP added)

```bash
cd ~/Documents/GitHub/zazigv2/packages/local-agent
npm run build
```

Then restart the Claude Code session to pick up the new MCP tool.

### Step 6: Test

**Via curl (no MCP):**
```bash
# Replace {PROJECT_REF} and {ANON_KEY}
curl -X POST "https://{PROJECT_REF}.supabase.co/functions/v1/query-idea-status" \
  -H "Authorization: Bearer {ANON_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"idea_id": "e78682d0-e5a0-4ac9-af5f-362f90f69840"}'
```

**Via MCP (if wrapper added):**
```
query_idea_status(idea_id: "e78682d0-e5a0-4ac9-af5f-362f90f69840")
```

Expected output: idea metadata + promotion chain (this idea was promoted to a feature).

---

## What's deferred

| Component | Status | Notes |
|-----------|--------|-------|
| MCP wrapper | Optional | CPO can already use `query_ideas` + `query_features` to trace manually |
| Batch status query | Not built | Could trace multiple ideas at once — not needed yet |
| Status webhook/notification | Not built | Could notify originator when idea is promoted |

## Estimated effort

| Step | Who | Time |
|------|-----|------|
| 1. Copy from branch | Tom | 1 min |
| 2. Deploy edge function | Tom | 2 min |
| 3. Add MCP wrapper (optional) | Tom | 5 min |
| 4. Update roles SQL (optional) | Tom | 1 min |
| 5. Rebuild + restart (optional) | Tom | 3 min |
| 6. Test | Tom | 3 min |
| **Total (with MCP)** | | **~15 min** |
| **Total (edge function only)** | | **~5 min** |
