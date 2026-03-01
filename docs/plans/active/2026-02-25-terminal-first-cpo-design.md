# Terminal-First CPO Design

**Date:** 2026-02-25
**Status:** Approved
**Authors:** Chris + Claude (brainstorming session)
**Supersedes:** Slack-based CPO messaging, persistent agent entries in jobs table, `send_message` MCP tool for CPO

---

## Problem

The Slack-based CPO interface gives zero visibility into what the agent is doing. When the CPO invokes skills, explores the codebase, or brainstorms, the user stares at Slack with no feedback for minutes. The terminal (tmux session) shows everything — tool calls, thinking, task lists — but attaching directly to tmux has UX risks (Ctrl+C kills the agent, keybinding confusion).

## Design Principles

1. **Local-first** — every machine that runs `zazig start` gets its own CPO instance. No waiting for orchestrator dispatch.
2. **Terminal is the interface** — a split-screen TUI gives full visibility into the CPO's work with safe input handling.
3. **Backend owns identity** — the local agent asks the backend what to run and receives complete workspace definitions. Dumb pipe.
4. **Persistent agents are not jobs** — they live in their own table, separate from the ephemeral job pipeline.

## Architecture

### Split-Screen TUI

```
┌──────────────────────────────────────────────┐
│  Claude Code v2.1.50                         │
│  Opus 4.6 · Claude Max                       │
│  ~/.zazigv2/{companyId}-cpo-workspace        │
│                                              │
│  ● Using brainstorming skill to explore...   │
│                                              │
│  Explore(Explore project context)            │
│    L  Waiting.../packages/cli/src/           │
│       +27 more tool uses (ctrl+o)            │
│                                              │
│  ● Exploring project context... (2m 22s)     │
│    L  ■ Explore project context              │
│       □ Ask clarifying questions             │
│       □ Propose 2-3 approaches               │
│                                              │
├──────────────────────────────────────────────┤
│  Acme Corp · [CPO] CTO          Tab: switch │
│  > I want to add dark mode to the app_       │
└──────────────────────────────────────────────┘
```

**Layout:**
- Output region: full terminal height minus 3 lines. Read-only stream of active agent's tmux session. Polls `tmux capture-pane` every 300ms. Auto-scrolls. Resizes with terminal.
- Status bar (1 line): company name, agent tabs (active agent bold), Tab to switch hint.
- Input line (1 line): `> ` prompt. Enter sends via `tmux send-keys`. Standard line editing.

**Key bindings:**
- Enter: send message to active agent
- Tab: cycle between persistent agents
- Ctrl+C: graceful shutdown — stops daemon, tears down all persistent agent sessions, exits TUI

**Tech:** Node.js with `blessed`. File: `packages/cli/src/commands/chat.ts`.

### Data Flow

- **Input:** User types in bottom panel → `tmux send-keys` into active agent's tmux session
- **Output:** TUI polls `tmux capture-pane -t {sessionName} -p` → renders in top panel
- **Agent actions:** MCP tools → Supabase (create features, commission contractors, etc.)
- **No Slack, no gateway, no `send_message` tool**

### Lifecycle & Commands

**`zazig start`:**
1. If user belongs to multiple companies → picker: "Which company?"
2. Daemon starts for that company (PID file per-company: `~/.zazigv2/{companyId}.pid`)
3. Calls `GET /functions/v1/company-persistent-jobs?company_id=X` to discover persistent roles
4. Spawns all persistent agents in separate tmux sessions with full workspace
5. Opens split TUI showing first agent. Tab switches between agents.
6. `--no-tui` flag for headless mode (CI, remote machines)

**`zazig chat`:**
- Reconnects to the TUI. If multiple companies running, picker. If only one, auto-connects.
- Tab switches between persistent agents within that company.

**`zazig stop`:**
- If multiple companies running → picker. Stops that company's daemon + all persistent sessions.

**`Ctrl+C`:** Graceful shutdown of everything — daemon, agents, TUI.

**Multi-company:** Run `zazig start` multiple times in separate terminals, pick a different company each time. Each is an independent daemon process.

### Persistent Agents Table

Persistent agents move out of the jobs table into their own table.

```sql
CREATE TABLE persistent_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  role TEXT NOT NULL,
  machine_id UUID NOT NULL REFERENCES machines(id),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'stopped', 'error')),
  prompt_stack TEXT,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, role, machine_id)
);
```

Every machine gets its own instance of each persistent role. The unique constraint is `(company_id, role, machine_id)`. The local agent upserts on spawn and updates `last_heartbeat` periodically.

### Backend: company-persistent-jobs Endpoint

`GET /functions/v1/company-persistent-jobs?company_id=X`

- Auth: JWT from request headers
- Queries `roles` table for roles where `is_persistent = true`
- For each role: assembles prompt stack (personality + role prompt)
- Returns: `[{ role, prompt_stack, skills, model }]`
- The local agent receives complete workspace definitions — no local assembly

### CPO Workspace

**Directory:** `~/.zazigv2/{companyId}-cpo-workspace/`

Uses `companyId` so multiple companies don't collide.

**CLAUDE.md:** Written from `prompt_stack` returned by the backend. Contains:
- Personality prompt (archetype)
- Role prompt with pipeline routing decision tree (3-layer knowledge architecture)
- Direct terminal conversation instructions (no gateway/messaging format)

**MCP tools (4):**
- `query_projects` — look up company projects and features
- `create_feature` — create a new feature
- `update_feature` — update feature details, advance status to `ready_for_breakdown`
- `commission_contractor` — spawn Project Architect or other ephemeral contractors

**Skills (loaded on demand):**
- `/plan-capability` — scope assessment, multi-round planning
- `/reconcile-docs` — doc gap analysis
- `/spec-feature` — feature spec writing
- `/standalone-job` — quick-fix standalone jobs

**.claude/settings.json:** Auto-approves all 4 MCP tools.

### Shared Data, Independent Sessions

- Features, projects, and company data sync via Supabase — portable across machines
- Conversation history is local to each machine's session
- CPO reads project state from the DB on startup (via `query_projects`) so it has context regardless of which machine

### Future: iOS App

The architecture supports a future iOS client via Supabase Realtime. The local agent would publish `capture-pane` snapshots to a Realtime channel and subscribe for inbound messages. The iOS app connects to the same channel. No changes to the CPO or local agent core needed — the capture/inject interface is cleanly separated.

## Compatibility with Pipeline Design

This design is fully compatible with the idea-to-job pipeline (`2026-02-24-idea-to-job-pipeline-design.md`):

- The pipeline doc explicitly names terminal as the first delivery channel
- The 3-layer knowledge architecture (routing prompt + stage skills + doctrines) works unchanged
- MCP tools match the pipeline's role-scoped tool matrix (minus `send_message`)
- Entry Point A becomes: user types in terminal → CPO assesses scope → invokes skills → commissions contractors → sets features to `ready_for_breakdown` → orchestrator takes over
- All pipeline infrastructure after `ready_for_breakdown` is unchanged and tested

## Changes Summary

**New:**
- `persistent_agents` DB table with unique `(company_id, role, machine_id)`
- `company-persistent-jobs` edge function
- `packages/cli/src/commands/chat.ts` — Node TUI with blessed
- Migration to create table + clean up jobs table

**Modified:**
- `start.ts` — company picker, calls backend, spawns agents, launches TUI
- `stop.ts` — company picker, tears down agents + daemon
- `executor.ts` — `handlePersistentJob` upserts into `persistent_agents`, heartbeats against it
- `agent-mcp-server.ts` — remove `send_message` tool
- `orchestrator/index.ts` — remove persistent agent dispatch and requeue logic
- CPO `roles.prompt` — replace messaging instructions with terminal conversation instructions

**Removed:**
- `persistent_agent` from jobs table job_type enum
- Orchestrator persistent agent dispatch/requeue path
- `send_message` MCP tool (for CPO)
- Slack message routing for CPO
- `&job_type=neq.persistent_agent` filter in `zazig status`

**Unchanged:**
- Ephemeral job pipeline (breakdown, execution, verification)
- MCP tools: `query_projects`, `create_feature`, `update_feature`, `commission_contractor`
- Skills system
- Supabase data (features, projects, companies)
