# Card Catalog: Server-Side MCP Tool Access Control
**Source:** docs/plans (inline plan, 2026-02-26)
**Board:** zazigv2 (6995a7a3f836598005909f31)
**Generated:** 2026-02-26T12:00:00Z
**Numbering:** sequential

## Dependency Graph
1 --+
2 --+-- (parallel)
3 ---- 2
4 ---- 1, 2

---

### 1 -- Migration: add mcp_tools column to roles
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699fa3a9 |

**What:** Add a `mcp_tools text[] NOT NULL DEFAULT '{}'` column to the `roles` table and seed it with the correct tool lists for each existing role.

**Why:** The DB column becomes the single source of truth for which MCP tools each role may invoke, replacing the hardcoded `ROLE_ALLOWED_TOOLS` map in workspace.ts.

**Files:**
- `supabase/migrations/056_role_mcp_tools.sql` (new file)

**Gotchas:**
- Default `'{}'` means new roles get zero MCP tools (safe by default)
- Must match the tool names exactly as registered in agent-mcp-server.ts

**Implementation Prompt:**
> Create `supabase/migrations/056_role_mcp_tools.sql` with:
> 1. `ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS mcp_tools text[] NOT NULL DEFAULT '{}';`
> 2. UPDATE statements seeding mcp_tools for each role. Use the values from ROLE_ALLOWED_TOOLS in `packages/local-agent/src/workspace.ts` lines 41-52:
>    - cpo: `'{query_projects,create_feature,update_feature}'`
>    - project-architect: `'{create_project,batch_create_features,query_projects}'`
>    - breakdown-specialist: `'{query_features,batch_create_jobs}'`
>    - senior-engineer: `'{query_features}'`
>    - reviewer: `'{query_features}'`
>    - monitoring-agent: `'{send_message}'`
>    - verification-specialist: `'{query_features,query_jobs,batch_create_jobs}'`
>    - pipeline-technician: `'{query_features,query_jobs,execute_sql}'`
> Roles not listed (job-combiner, deployer) keep the default empty array.
> AC: Migration applies cleanly; `SELECT name, mcp_tools FROM roles;` shows correct values.

---

### 2 -- Shared types: add roleMcpTools to StartJob
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699fa3b8 |

**What:** Add an optional `roleMcpTools` field to the `StartJob` interface and validate it in `isStartJob`.

**Why:** The orchestrator needs a way to tell the executor which MCP tools a role is allowed to use, so the executor can pass them to the MCP server as an env var.

**Files:**
- `packages/shared/src/messages.ts` (line ~154, after `roleSkills`)
- `packages/shared/src/validators.ts` (line ~116, before `return true` in `isStartJob`)

**Gotchas:**
- Must be optional (backward compat with old orchestrator sending no field)
- `undefined` = old orchestrator, `[]` = no MCP tools (distinct meanings)

**Implementation Prompt:**
> In `packages/shared/src/messages.ts`, after `roleSkills?: string[];` (line 154), add:
> ```typescript
> /** MCP tool names this role may invoke. Enforced server-side by agent-mcp-server. */
> roleMcpTools?: string[];
> ```
>
> In `packages/shared/src/validators.ts`, in `isStartJob` (line ~116), before `return true;`, add:
> ```typescript
> // roleMcpTools is optional; if present must be an array of non-empty strings
> if (v.roleMcpTools !== undefined) {
>   if (!Array.isArray(v.roleMcpTools)) return false;
>   if (!v.roleMcpTools.every((t: unknown) => isString(t) && (t as string).length > 0)) return false;
> }
> ```
> AC: `npm run build` in packages/shared succeeds. Existing tests pass.

---

### 3 -- Local-agent: server-side MCP tool enforcement
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 2 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699fa3ce |

**What:** Four changes in `packages/local-agent/src/`:
1. **agent-mcp-server.ts** — read `ZAZIG_ALLOWED_TOOLS` env var at startup; wrap every `server.tool()` handler with a guard that rejects disallowed tools.
2. **workspace.ts** — add `mcpTools?: string[]` to `WorkspaceConfig`; pass `ZAZIG_ALLOWED_TOOLS` env var into `.mcp.json`; update `generateAllowedTools` to accept DB tools with hardcoded fallback.
3. **executor.ts** — forward `msg.roleMcpTools` to `setupJobWorkspace()` in `handleStartJob` (~line 321) and `handlePersistentJob` (~line 578). Update `spawnPersistentAgent` param type (~line 429) to include `mcp_tools?: string[]`, forward as `roleMcpTools` in synthetic message.
4. **index.ts** — add `mcp_tools?: string[]` to the persistent job response type (~line 285).

**Why:** This is the key security change. Server-side enforcement means even if the client-side allow-list fails (as it does in TUI mode), the MCP server itself rejects unauthorized calls.

**Files:**
- `packages/local-agent/src/agent-mcp-server.ts`
- `packages/local-agent/src/workspace.ts`
- `packages/local-agent/src/executor.ts`
- `packages/local-agent/src/index.ts`

**Gotchas:**
- `ZAZIG_ALLOWED_TOOLS` unset (null) = backward compat, allow all tools + log warning
- `ZAZIG_ALLOWED_TOOLS=""` (empty string) = empty Set = all tools rejected (safe default for roles with `mcp_tools = '{}'`)
- Must wrap ALL 10 `server.tool()` registrations in agent-mcp-server.ts
- `generateAllowedTools` must still work with hardcoded fallback when `mcpTools` param is undefined (old orchestrators)

**Implementation Prompt:**
> **agent-mcp-server.ts** — After the `const server = new McpServer(...)` block (line 22), add:
> ```typescript
> const ALLOWED_TOOLS_ENV = process.env.ZAZIG_ALLOWED_TOOLS;
> const allowedTools: Set<string> | null = ALLOWED_TOOLS_ENV !== undefined
>   ? new Set(ALLOWED_TOOLS_ENV.split(",").filter(Boolean))
>   : null;
> if (allowedTools === null) {
>   console.warn("[zazig-agent-mcp] ZAZIG_ALLOWED_TOOLS not set — all tools allowed (backward compat)");
> }
> ```
> Define a guardedHandler wrapper function:
> ```typescript
> type ToolHandler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
> function guardedHandler(toolName: string, handler: ToolHandler): ToolHandler {
>   return async (args) => {
>     if (allowedTools !== null && !allowedTools.has(toolName)) {
>       return {
>         content: [{ type: "text", text: `Access denied: tool "${toolName}" is not allowed for this role.` }],
>         isError: true,
>       };
>     }
>     return handler(args);
>   };
> }
> ```
> Wrap every `server.tool()` handler — replace the last argument (the async function) with `guardedHandler("tool_name", originalHandler)`. There are 10 tool registrations: send_message, create_feature, update_feature, query_projects, query_features, create_project, batch_create_features, query_jobs, batch_create_jobs, execute_sql.
>
> **workspace.ts** —
> 1. Add `mcpTools?: string[]` to `WorkspaceConfig` (line ~29, after `skills`)
> 2. Update `generateMcpConfig` signature to accept `allowedTools?: string[]` in the env param, and add to the env block:
>    `...(env.allowedTools ? { ZAZIG_ALLOWED_TOOLS: env.allowedTools.join(",") } : {})`
> 3. Update `generateAllowedTools` to accept optional DB tools:
>    `export function generateAllowedTools(role: string, mcpTools?: string[]): string[]`
>    Use `mcpTools ?? ROLE_ALLOWED_TOOLS[role] ?? []` as the source.
> 4. In `setupJobWorkspace`, pass `config.mcpTools` through both functions:
>    - To `generateMcpConfig`: add `allowedTools: config.mcpTools ?? ROLE_ALLOWED_TOOLS[config.role]` in the env param
>    - To `generateAllowedTools`: pass `config.mcpTools` as second arg
>
> **executor.ts** —
> - In `handleStartJob` (~line 321): add `mcpTools: msg.roleMcpTools` to the `setupJobWorkspace()` call
> - In `handlePersistentJob` (~line 578): add `mcpTools: msg.roleMcpTools` to the `setupJobWorkspace()` call
> - In `spawnPersistentAgent` (~line 429): update param type to include `mcp_tools?: string[]`, add `roleMcpTools: job.mcp_tools?.length ? job.mcp_tools : undefined` to syntheticMsg
>
> **index.ts** (~line 285) — Add `mcp_tools?: string[]` to the response type assertion.
>
> AC: `npm run build` in packages/local-agent succeeds. Starting MCP server without ZAZIG_ALLOWED_TOOLS logs backward-compat warning. Starting with `ZAZIG_ALLOWED_TOOLS=query_projects` rejects calls to other tools.

---

### 4 -- Edge functions: forward mcp_tools from DB
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | 1, 2 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699fa3ea |

**What:** Update the orchestrator and company-persistent-jobs edge functions to read `mcp_tools` from the roles table and include it in their outputs.

**Why:** Without this, the executor never receives the DB-driven tool list and falls back to the hardcoded map — defeating the purpose of the migration.

**Files:**
- `supabase/functions/orchestrator/index.ts` (~lines 684, 688-690, 728)
- `supabase/functions/company-persistent-jobs/index.ts` (~lines 73, 112-118)

**Gotchas:**
- `roleRow.mcp_tools` may be null in tests if migration hasn't been applied yet — use `?? undefined`
- company-persistent-jobs must also include mcp_tools so persistent agents get enforcement

**Implementation Prompt:**
> **orchestrator/index.ts** —
> 1. Line 684: expand SELECT from `"id, prompt, skills"` to `"id, prompt, skills, mcp_tools"`
> 2. Line 688: update typed cast to include `mcp_tools: string[] | null`
> 3. After line 690, add: `const roleMcpTools = typed.mcp_tools ?? undefined;`
> 4. In the StartJob payload (~line 728), add: `...(roleMcpTools !== undefined ? { roleMcpTools } : {}),`
>
> **company-persistent-jobs/index.ts** —
> 1. Line 73: expand SELECT from `"name, prompt, skills, default_model, slot_type, company_roles!inner(company_id)"` to include `mcp_tools`
> 2. In the result map (~line 112-118), add: `mcp_tools: role.mcp_tools ?? []`
>
> AC: Deploy edge functions. Orchestrator StartJob payloads include `roleMcpTools` matching DB values. company-persistent-jobs response includes `mcp_tools` array per role.
