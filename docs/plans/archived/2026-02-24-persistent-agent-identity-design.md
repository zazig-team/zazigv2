# Persistent Agent Identity & MCP Tools

**Date:** 2026-02-24
**Status:** Approved
**Context:** CPO persistent agent acts like zazig v1 — references Trello, VP-Eng, etc. The interactive TUI session receives no v2 identity, role prompt, or personality. The 4-layer context is computed but never injected.
**Updated (2026-02-24):** MCP tools are now role-scoped per worker, not one-size-fits-all. All workers (executives, employees, contractors) get workspace setup with role-specific `.mcp.json`. See `2026-02-24-idea-to-job-pipeline-design.md` Section 6 for the full tooling architecture.

## Problem

The orchestrator assembles a rich prompt stack (personality + role prompt + skills + task context) for persistent agent jobs but only writes it to the DB for debugging. The executor's `handleStartCpo` ignores this and writes a hardcoded `CPO_MESSAGING_INSTRUCTIONS` constant as the only CLAUDE.md content. The CPO has no idea what zazig v2 is.

## Design Principles

1. **Dumb local agent** — the executor is a pipe. It writes what the backend sends, spawns the session, and nothing more. All intelligence lives server-side so changes ship without local-agent re-releases.
2. **Role-agnostic executor** — `handleStartCpo` becomes `handlePersistentJob`. The same code path handles CPO, CTO, CMO, or any future persistent role. Zero executor changes when adding roles.
3. **Observability** — the assembled prompt is written to `jobs.prompt_stack` at dispatch time, overwritten each time a new instance starts. You can see exactly what the agent received.

## Architecture

### Prompt Assembly (Orchestrator)

The orchestrator already fetches from `roles` and `exec_personalities` tables. The change: concatenate everything into a single string and send it as the `context` field in StartJob.

**Assembly order** (follows U-shaped LLM attention — highest-priority first and last):

```
# {Role Name}

{personality prompt — tone, style, archetype}

---

{role prompt — responsibilities, constraints, decision framework,
  messaging instructions, MCP tool documentation}
```

The orchestrator writes this to two places:
- `context` field in the StartJob Realtime message (delivered to local agent)
- `prompt_stack` column on the jobs row (for observability)

`prompt_stack` is overwritten each time a persistent job is re-dispatched (machine failover, restart, etc.).

### Messaging Instructions in DB

The `CPO_MESSAGING_INSTRUCTIONS` constant moves from executor.ts into the CPO's `roles.prompt` column. This includes:
- How to read inbound messages (`[Message from @username, conversation:slack:T...:C...]`)
- How to reply using `send_message` MCP tool
- Documentation for all MCP tools (`create_feature`, `update_feature`, `query_projects`)

Updating messaging format or tool docs is now a DB update, not a code release.

### Executor: handlePersistentJob

Replaces `handleStartCpo`. Role-agnostic. Does exactly this:

1. Create workspace at `~/.zazigv2/{role}-workspace/`
2. Write `msg.context` as `CLAUDE.md`
3. Write `.mcp.json` (MCP server config with Supabase credentials)
4. Write `.claude/settings.json` (auto-approve all MCP tools)
5. Write `prompt_stack` to DB for observability
6. Spawn `claude --model {model}` in tmux session `{machineId}-{role}`

No assembly, no constants, no role-specific logic.

### MCP Tools

> **Note:** The design below describes the initial implementation where all tools live in one MCP server. Per the idea-to-job pipeline design, MCP tools are now **role-scoped** — each worker gets a `.mcp.json` with only the tools relevant to its function. The CPO gets `send_message`, `query_projects`, `create_feature`, `update_feature`. Other roles get different tool sets. See `2026-02-24-idea-to-job-pipeline-design.md` Section 6 for the full role-scoped tool table.

All tools currently live in the existing `agent-mcp-server.ts`. The executor generates a role-specific `.mcp.json` at workspace creation time.

| Tool | Purpose | Backend |
|------|---------|---------|
| `send_message` | Reply to Slack conversations | `POST /functions/v1/agent-message` (existing) |
| `create_feature` | Create a new feature | `POST /functions/v1/create-feature` (new) |
| `update_feature` | Update feature details/status | `POST /functions/v1/update-feature` (new) |
| `query_projects` | Look up projects and features | Supabase REST API direct query |

**Auto-approved in `.claude/settings.json`:**
```json
{
  "permissions": {
    "allow": [
      "mcp__zazig-messaging__send_message",
      "mcp__zazig-messaging__create_feature",
      "mcp__zazig-messaging__update_feature",
      "mcp__zazig-messaging__query_projects"
    ]
  }
}
```

### New Edge Functions

**`create-feature`** (POST)
- Auth: JWT from request headers
- Body: `{ project_id, title, description, priority?, job_id }`
- Looks up `company_id` from jobs table via `job_id`
- Inserts into `features` with `status: "created"`
- Returns `{ feature_id }`

**`update-feature`** (POST)
- Auth: JWT from request headers
- Body: `{ feature_id, title?, description?, priority?, status?, job_id }`
- Guards status transitions: only allows setting `created` or `ready_for_breakdown`
- Updates the feature row
- If status changes to `ready_for_breakdown`, inserts a `feature_status_changed` event so the orchestrator picks it up on next cron tick
- Returns `{ ok: true }`

`query_projects` does not need an edge function — the MCP tool queries the Supabase REST API directly with the anon key, filtered by the job's company_id.

## Feature Pipeline (CPO's Role)

The full feature status pipeline:

```
created → ready_for_breakdown → breakdown → building → combining →
verifying → deploying_to_test → ready_to_test → deploying_to_prod →
complete | cancelled
```

The CPO owns the early stages:

1. User says "I want to add dark mode" in Slack
2. CPO calls `create_feature` → status `created`
3. CPO asks clarifying questions, user refines requirements
4. CPO calls `update_feature` to enrich description as conversation progresses
5. When satisfied, CPO calls `update_feature` with `status: "ready_for_breakdown"`
6. Orchestrator picks up the status change event and decomposes the feature into jobs

Everything from `breakdown` onward is orchestrator-driven. The CPO cannot set any status beyond `ready_for_breakdown`.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/orchestrator/index.ts` | Concatenate personality + role prompt into `context`, write `prompt_stack` to jobs row |
| `packages/local-agent/src/executor.ts` | Rename `handleStartCpo` → `handlePersistentJob`, make role-agnostic, delete `CPO_MESSAGING_INSTRUCTIONS`, write `msg.context` as CLAUDE.md |
| `packages/local-agent/src/agent-mcp-server.ts` | Add `create_feature`, `update_feature`, `query_projects` tools |
| `supabase/functions/create-feature/index.ts` | New edge function |
| `supabase/functions/update-feature/index.ts` | New edge function |

## DB Changes

| Change | Method |
|--------|--------|
| Move messaging instructions + MCP tool docs into CPO `roles.prompt` | Migration or manual UPDATE |
| `prompt_stack` column | Already exists (migration 033) |

## Deleted

- `CPO_MESSAGING_INSTRUCTIONS` constant from executor.ts
- `assembleContext()` call in persistent job code path
- `handleStartCpo` method (replaced by `handlePersistentJob`)
