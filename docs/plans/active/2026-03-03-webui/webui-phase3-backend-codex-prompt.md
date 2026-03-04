# WebUI Phase 3 Backend — Codex Prompt

## Context

You are building the backend plumbing for the zazig Decision Gateway. This lets the CPO (an AI exec agent) present structured decisions to the founder via the WebUI, and lets the founder resolve them — with the resolution routed back to the CPO through the orchestrator.

Two new tables (`decisions`, `action_items`) have already been created in Supabase with RLS policies and Realtime publication. You are building:
1. Two new edge functions (`create-decision`, `update-decision`)
2. One new edge function (`create-action-item`)
3. One new MCP tool (`create_decision`) in the agent MCP server
4. One new orchestrator message handler (`DecisionResolved`)

## Documents to Read First

1. `docs/plans/2026-03-03-webui-design.md` — Section 7 (Decision Write-Back Architecture), Section 10 Phase 3 checklist
2. `supabase/functions/create-feature/index.ts` — example of a POST edge function pattern
3. `supabase/functions/update-feature/index.ts` — example of a write-back edge function with event firing
4. `packages/local-agent/src/agent-mcp-server.ts` — existing MCP tool definitions (follow the `create_feature` pattern)
5. `supabase/functions/orchestrator/index.ts` — message handler pattern (see `handleFeatureApproved` for a handler that updates state and dispatches work)

## Supabase Connection

- URL: `https://jmussmwglgbwncgygzbz.supabase.co`
- Every edge function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env.get()`
- Every edge function needs its own `deno.json`:
```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

## Task 1: `create-decision` Edge Function

**Path:** `supabase/functions/create-decision/index.ts` + `supabase/functions/create-decision/deno.json`

**Purpose:** CPO (via MCP tool) creates a decision for the founder to resolve.

**Input (POST body):**
```typescript
{
  company_id: string;        // required
  from_role: string;         // required — "cpo", "cto", etc.
  category?: string;         // "routine" | "tactical" | "strategic" | "foundational" — default "tactical"
  title: string;             // required
  context?: string;          // CPO reasoning
  options: Array<{           // required, at least 2
    label: string;
    description?: string;
    recommended?: boolean;
  }>;
  recommendation_rationale?: string;
  expires_in_hours?: number; // default 24 — compute expires_at from this
}
```

**Logic:**
1. Check Authorization header (required)
2. Create service-role Supabase client
3. Validate: `company_id`, `title`, `from_role` required. `options` must have at least 2 items.
4. Compute `expires_at`: `now() + expires_in_hours` (default 24h)
5. INSERT into `decisions` table
6. INSERT into `events` table: `{ company_id, event_type: "decision_created", detail: { decision_id, from_role, title, category } }`
7. Return `{ decision_id: string }`

**Follow the exact CORS + error handling pattern from `create-feature/index.ts`.**

## Task 2: `update-decision` Edge Function

**Path:** `supabase/functions/update-decision/index.ts` + `supabase/functions/update-decision/deno.json`

**Purpose:** Founder resolves a decision from the WebUI. Then broadcasts the resolution to the orchestrator so the CPO can act on it.

**Input (POST body):**
```typescript
{
  decision_id: string;       // required
  action: string;            // "resolve" | "defer" | "add_note"
  selected_option?: string;  // label of the selected option (for "resolve")
  note?: string;             // founder's note
}
```

**Logic:**
1. Check Authorization header (required)
2. Create service-role Supabase client
3. Fetch the decision by ID — verify it exists and `status = 'pending'`
4. If `action === "resolve"`:
   - UPDATE `decisions` SET `status = 'resolved'`, `resolved_by = 'human'`, `resolution = { selected_option, note }`, `resolved_at = now()`
5. If `action === "defer"`:
   - UPDATE `decisions` SET `status = 'deferred'`, `resolved_by = 'human'`, `resolution = { note }`, `resolved_at = now()`
6. If `action === "add_note"`:
   - Don't change status. UPDATE `decisions` SET `resolution = jsonb_set(coalesce(resolution, '{}'), '{notes}', to_jsonb(array_append(coalesce(resolution->'notes', '[]')::text[], note)))`
   - Actually, simpler: just append to a notes array. Or: fetch current resolution, append note, update.
7. INSERT into `events` table: `{ company_id, event_type: "decision_resolved", detail: { decision_id, action, selected_option, note } }`
8. **Broadcast to orchestrator channel:**
```typescript
const channel = supabase.channel("orchestrator:commands");
await channel.send({
  type: "broadcast",
  event: "decision_resolved",
  payload: {
    type: "DecisionResolved",
    decisionId: decision_id,
    companyId: decision.company_id,
    fromRole: decision.from_role,
    action,
    selectedOption: selected_option ?? null,
    note: note ?? null,
  },
});
```
9. Return `{ ok: true }`

## Task 3: `create-action-item` Edge Function

**Path:** `supabase/functions/create-action-item/index.ts` + `supabase/functions/create-action-item/deno.json`

**Purpose:** System or CPO creates an action item that needs human attention.

**Input (POST body):**
```typescript
{
  company_id: string;        // required
  source_role?: string;      // "cpo", "pipeline", "system"
  source_job_id?: string;    // UUID of blocked job
  title: string;             // required
  detail?: string;
  cta_label?: string;        // default "Resolve"
  cta_type?: string;         // "acknowledge" | "provide_secret" | "approve" | "external_link"
  cta_payload?: object;      // { url?, secret_name?, etc. }
}
```

**Logic:**
1. Auth check, service-role client
2. Validate `company_id` and `title`
3. INSERT into `action_items`
4. INSERT into `events`: `{ company_id, event_type: "action_item_created", detail: { action_item_id, title, source_role } }`
5. Return `{ action_item_id: string }`

## Task 4: `create_decision` MCP Tool

**File to edit:** `packages/local-agent/src/agent-mcp-server.ts`

**Add a new tool after the existing `commission_contractor` tool definition.** Follow the exact same pattern as `create_feature`.

```typescript
server.tool(
  "create_decision",
  "Present a structured decision to the founder for resolution. Use this when the founder needs to choose between options, approve a direction, or provide input on a tactical or strategic question.",
  {
    title: z.string().describe("Clear, concise decision title as a question"),
    context: z.string().optional().describe("Your reasoning and analysis that led to this decision point"),
    options: z.array(z.object({
      label: z.string().describe("Short option name"),
      description: z.string().optional().describe("What this option means"),
      recommended: z.boolean().optional().describe("Whether you recommend this option"),
    })).min(2).describe("Available options (at least 2)"),
    category: z.enum(["routine", "tactical", "strategic", "foundational"]).optional()
      .describe("Decision category — routine (low impact), tactical (near-term), strategic (direction-setting), foundational (architectural)"),
    recommendation_rationale: z.string().optional()
      .describe("Why you recommend the option(s) marked as recommended"),
    expires_in_hours: z.number().optional().describe("Hours before this decision expires (default: 24)"),
  },
  guardedHandler("create_decision", async ({ title, context, options, category, recommendation_rationale, expires_in_hours }) => {
    // Same pattern as create_feature:
    // 1. Get SUPABASE_URL, SUPABASE_ANON_KEY, ZAZIG_COMPANY_ID from env
    // 2. Fetch to create-decision edge function
    // 3. Return MCP response
  }),
);
```

**Also add `"create_decision"` to the CPO's allowed tools list.** Find where role → tool mappings are defined and add it for the `cpo` role.

## Task 5: `DecisionResolved` Orchestrator Handler

**File to edit:** `supabase/functions/orchestrator/index.ts`

**Add:**

1. A type guard:
```typescript
interface DecisionResolved {
  type: "DecisionResolved";
  decisionId: string;
  companyId: string;
  fromRole: string;
  action: string;
  selectedOption: string | null;
  note: string | null;
}

function isDecisionResolved(msg: unknown): msg is DecisionResolved {
  return !!msg && typeof msg === "object" && (msg as Record<string, unknown>).type === "DecisionResolved";
}
```

2. A handler:
```typescript
async function handleDecisionResolved(supabase: SupabaseClient, msg: DecisionResolved): Promise<void> {
  const { decisionId, companyId, fromRole, action, selectedOption, note } = msg;

  console.log(`[orchestrator] Decision ${decisionId} resolved: action=${action}, option=${selectedOption}`);

  // Notify the originating role (e.g. CPO) via their Realtime channel
  // Find the persistent job for fromRole
  const { data: persistentJob } = await supabase
    .from("jobs")
    .select("id, machine_id")
    .eq("company_id", companyId)
    .eq("role", fromRole)
    .eq("status", "executing")
    .limit(1)
    .single();

  if (persistentJob?.machine_id) {
    // Send via the agent's Realtime channel
    const agentChannel = supabase.channel(`agent:${persistentJob.machine_id}:${companyId}`);
    await agentChannel.send({
      type: "broadcast",
      event: "decision_resolved",
      payload: {
        type: "DecisionResolved",
        decisionId,
        action,
        selectedOption,
        note,
        jobId: persistentJob.id,
      },
    });
    console.log(`[orchestrator] Forwarded decision resolution to ${fromRole} on machine ${persistentJob.machine_id}`);
  } else {
    console.warn(`[orchestrator] No active persistent job for role ${fromRole} in company ${companyId} — decision resolution not forwarded`);
  }
}
```

3. Add to the message routing in `listenForAgentMessages()`:
```typescript
} else if (isDecisionResolved(msg)) {
  await handleDecisionResolved(supabase, msg);
}
```
Add this **before** the `else { console.warn("Unknown...") }` fallback.

## Technical Rules

1. **Every edge function needs its own `deno.json`** with the `@supabase/supabase-js` import map (see Task 1).
2. **Follow existing CORS pattern** — copy the `corsHeaders` object from `create-feature/index.ts`.
3. **Service-role client for all DB writes** in edge functions — `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`.
4. **No `any` types** in TypeScript. Use explicit types.
5. **MCP tool pattern**: wrap edge function call, don't write to DB directly from the MCP server.
6. **Build must pass**: `npm run typecheck --workspace=@zazigv2/local-agent` (or whichever workspace the MCP server is in) and the edge functions should be syntactically valid Deno TypeScript.

## File Structure

```
supabase/functions/
├── create-decision/
│   ├── index.ts         ← NEW
│   └── deno.json        ← NEW
├── update-decision/
│   ├── index.ts         ← NEW
│   └── deno.json        ← NEW
├── create-action-item/
│   ├── index.ts         ← NEW
│   └── deno.json        ← NEW
└── orchestrator/
    └── index.ts         ← EDIT (add DecisionResolved handler)

packages/local-agent/src/
└── agent-mcp-server.ts  ← EDIT (add create_decision tool)
```

## Verification

1. Edge functions: each should be valid Deno TypeScript (no import errors, proper typing)
2. MCP tool: `npm run build --workspace=packages/local-agent` passes
3. Orchestrator: no TypeScript errors in the modified file
4. The `update-decision` edge function must broadcast on `orchestrator:commands` channel — this is the critical path for the decision loop to close
