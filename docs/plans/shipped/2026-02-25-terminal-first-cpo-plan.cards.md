# Card Catalog: Terminal-First CPO Implementation
**Source:** docs/plans/2026-02-25-terminal-first-cpo-plan.md
**Board:** zazigv2 (6995a7a3f836598005909f31)
**Generated:** 2026-02-25T12:00:00Z
**Numbering:** phase.index

## Dependency Graph
```
1.1 ──── 2.1 (backend needs table)
2.1 ──── 6.1 (local-agent calls endpoint)
3.1 ─┐
3.2 ─┤── 5.1, 5.2 (CLI commands need daemon + picker)
4.1 ─┤── 5.1 (start needs TUI)
4.2 ─┘
6.1 ─┬── 6.2 (executor needs discovery)
     └── 7.1, 7.2, 7.3, 7.4, 7.5 (cleanup after integration works)
```

---

### 1.1 -- Migration: persistent_agents table
| Field | Value |
|-------|-------|
| Type | Architecture |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699e434dccc1ce153457525f |

**What:** Create migration 048 with `persistent_agents` table (id, company_id, role, machine_id, status, prompt_stack, last_heartbeat, created_at) and RLS policies. Unique constraint on (company_id, role, machine_id).

**Why:** Persistent agents move out of the jobs table into their own table. Every machine gets its own instance per role per company.

**Files:**
- Create: `supabase/migrations/048_persistent_agents.sql`

**Gotchas:**
- machine_id is NOT NULL and part of uniqueness
- RLS policy must allow users to manage their own company's agents

**Implementation Prompt:**
> Create `supabase/migrations/048_persistent_agents.sql`. Table: persistent_agents with columns id (UUID PK), company_id (UUID NOT NULL REFERENCES companies), role (TEXT NOT NULL), machine_id (UUID NOT NULL REFERENCES machines), status (TEXT NOT NULL DEFAULT 'running' CHECK IN running/stopped/error), prompt_stack (TEXT), last_heartbeat (TIMESTAMPTZ), created_at (TIMESTAMPTZ DEFAULT now()). Add UNIQUE (company_id, role, machine_id). Enable RLS. Policy: users can manage rows where company_id matches their user_companies. Apply with `npx supabase db push --include-all`. See plan Task 1 for full SQL.

---

### 2.1 -- Edge function: company-persistent-jobs
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1.1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699e4361abb71ed1d045b2cc |

**What:** New edge function `GET /functions/v1/company-persistent-jobs?company_id=X`. Fetches persistent roles from `roles` table (where is_persistent=true), joins with `exec_personalities` for the company, assembles prompt_stack (personality + role prompt), returns array of `{ role, prompt_stack, skills, model, slot_type }`.

**Why:** The local agent needs to know which persistent agents to spawn. Backend owns this decision — dumb local agent principle.

**Files:**
- Create: `supabase/functions/company-persistent-jobs/index.ts`
- Create: `supabase/functions/company-persistent-jobs/deno.json`

**Gotchas:**
- Use SUPABASE_SERVICE_ROLE_KEY for DB access (needs to read across tables)
- Auth header required but we use service role for actual queries
- Prompt assembly order: role name header → personality → separator → role prompt

**Implementation Prompt:**
> Create `supabase/functions/company-persistent-jobs/index.ts` and `deno.json`. GET endpoint, requires Authorization header. Takes company_id query param. Queries `roles` where is_persistent=true, queries `exec_personalities` for that company with roles join. Assembles prompt_stack: `# {ROLE}\n\n{personality}\n\n---\n\n{role.prompt}`. Returns JSON array. Deploy with `npx supabase functions deploy company-persistent-jobs`. See plan Task 2 for full code.

---

### 3.1 -- Per-company daemon management
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699e436bc9fac9189494ff3e |

**What:** Update `packages/cli/src/lib/daemon.ts` with per-company PID path functions (`pidPathForCompany`, `logPathForCompany`, `readPidForCompany`, `isDaemonRunningForCompany`, `removePidFileForCompany`, `startDaemonForCompany`). Create `packages/cli/src/lib/company-picker.ts` that fetches user companies via Supabase REST and prompts for selection.

**Why:** Each company gets its own daemon process. Multiple companies = multiple `zazig start` invocations. Company picker handles multi-company users.

**Files:**
- Modify: `packages/cli/src/lib/daemon.ts`
- Create: `packages/cli/src/lib/company-picker.ts`

**Gotchas:**
- PID files go to `~/.zazigv2/{companyId}.pid`
- Logs go to `~/.zazigv2/logs/{companyId}.log`
- Keep existing non-company daemon functions for backward compat during transition
- Company picker auto-selects if only 1 company

**Implementation Prompt:**
> 1) Add per-company PID management functions to `packages/cli/src/lib/daemon.ts`. Pattern: `pidPathForCompany(companyId)` returns `~/.zazigv2/{companyId}.pid`. Same for log, read, isRunning, remove, start variants. Keep existing functions. 2) Create `packages/cli/src/lib/company-picker.ts` with `fetchUserCompanies(supabaseUrl, anonKey, accessToken)` that queries `user_companies?select=company_id,companies(id,name)` and `pickCompany(companies)` that prompts with readline if >1. See plan Tasks 3-4 for full code.

---

### 4.1 -- Split-screen TUI with blessed
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | High |
| Model | Opus 4.6 |
| Labels | claude-ok |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699e43829b4e89c958a34e9e |

**What:** Install `blessed` + `@types/blessed` in packages/cli. Create `packages/cli/src/commands/chat.ts` with split-screen TUI: output region (full height minus 3 lines, polls `tmux capture-pane` every 300ms), status bar (1 line: company name, agent tabs, Tab hint), input line (3 lines with border). Key bindings: Enter sends via `tmux send-keys`, Tab cycles agents, Ctrl+C graceful shutdown.

**Why:** The terminal IS the interface. Full visibility into agent work. Safe input handling — no accidental Ctrl+C kills on the agent.

**Files:**
- Modify: `packages/cli/package.json` (add blessed)
- Create: `packages/cli/src/commands/chat.ts`

**Gotchas:**
- `tmux capture-pane -t {session} -p -S -200` for last 200 lines
- Escape single quotes in `tmux send-keys`
- Screen needs `smartCSR: true`
- outputBox must auto-scroll to bottom after each capture

**Implementation Prompt:**
> 1) `cd packages/cli && npm install blessed @types/blessed`. 2) Create `packages/cli/src/commands/chat.ts`. Export `launchTui(options: { companyName, agents: Array<{role, sessionName}>, onShutdown: () => void })`. Use blessed: screen with smartCSR, box for output (top: 0, height: 100%-3, scrollable), box for status bar (bottom: 2, height: 1, bg: blue), textbox for input (bottom: 0, height: 3, border). Poll `tmux capture-pane -t {sessionName} -p -S -200` every 300ms into output box. Tab cycles activeIndex. Enter sends input via `tmux send-keys -t {sessionName} '{escaped}' Enter`. Ctrl+C calls onShutdown. Also export `chat()` function for reconnect flow. See plan Tasks 5-6 for full code.

---

### 5.1 -- Rewrite start.ts + stop.ts + register chat
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | High |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 3.1, 4.1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699e438b7b256483d8c8be45 |

**What:** Rewrite `start.ts`: add company picker, pass ZAZIG_COMPANY_ID/NAME in daemon env, discover tmux sessions after startup, launch TUI (unless --no-tui). Rewrite `stop.ts`: add company picker, per-company PID teardown. Register `chat` command in `index.ts`.

**Why:** `zazig start` is the entry point. It needs to know which company, start the daemon, and open the TUI. `zazig stop` needs matching company picker. `zazig chat` reconnects to existing daemon.

**Files:**
- Modify: `packages/cli/src/commands/start.ts`
- Modify: `packages/cli/src/commands/stop.ts`
- Modify: `packages/cli/src/index.ts`

**Gotchas:**
- `start.ts` needs `discoverAgentSessions(machineId)` helper that parses `tmux list-sessions`
- Wait 3s after daemon spawn for agents to come up before TUI
- Pass `--company` flag for non-interactive use
- `--no-tui` for headless mode

**Implementation Prompt:**
> 1) Rewrite `packages/cli/src/commands/start.ts`: import company-picker + per-company daemon funcs + launchTui. After creds, call fetchUserCompanies → pickCompany. Build env with ZAZIG_COMPANY_ID, ZAZIG_COMPANY_NAME. Call startDaemonForCompany. Wait 3s. discoverAgentSessions (parse tmux list-sessions, filter by machineId prefix). If --no-tui print headless msg, else launchTui with onShutdown that kills daemon. 2) Rewrite stop.ts with company picker + per-company PID. 3) Add `chat` case to index.ts switch. See plan Tasks 7-9 for full code.

---

### 6.1 -- Local agent: persistent agent discovery + executor upserts
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | High |
| Model | Opus 4.6 |
| Labels | claude-ok |
| Depends on | 2.1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699e43a2a994133995b92e65 |

**What:** When daemon starts with ZAZIG_COMPANY_ID env, call `company-persistent-jobs` endpoint and spawn each role via `handlePersistentJob`. Update executor: workspace path becomes `~/.zazigv2/{companyId}-{role}-workspace`, upsert into `persistent_agents` table on spawn, heartbeat updates, set status=stopped on shutdown.

**Why:** Local agent discovers its persistent roles from backend on startup. Upserts into persistent_agents table for observability and multi-machine tracking.

**Files:**
- Modify: `packages/local-agent/src/connection.ts` or startup flow
- Modify: `packages/local-agent/src/executor.ts`

**Gotchas:**
- Upsert uses onConflict: "company_id,role,machine_id"
- Heartbeat piggybacks on existing heartbeat interval
- On shutdown, update all rows for this machine to status=stopped
- Workspace path includes companyId to avoid collisions

**Implementation Prompt:**
> 1) Add `discoverAndSpawnPersistentAgents()` to startup flow. When ZAZIG_COMPANY_ID is set, fetch `{supabaseUrl}/functions/v1/company-persistent-jobs?company_id={companyId}` with auth header. For each job, call executor.spawnPersistentAgent(job). 2) In executor.ts handlePersistentJob: change workspace to `~/.zazigv2/{companyId}-{role}-workspace`. Add supabase upsert to persistent_agents (company_id, role, machine_id, status=running, prompt_stack, last_heartbeat). Add heartbeat updates. On shutdown set status=stopped. See plan Tasks 10-11 for full code.

---

### 7.1 -- Cleanup: remove orchestrator dispatch, update prompts, clean jobs table
| Field | Value |
|-------|-------|
| Type | Architecture |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok, tech-review |
| Depends on | 6.1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699e43b1f987302d1334acf8 |

**What:** 5 cleanup tasks: (1) Remove send_message from CPO auto-approved tools in executor. (2) Remove persistent_agent dispatch path from orchestrator, deploy. (3) Migration 049: update CPO role prompt — replace Slack messaging instructions with terminal conversation instructions. (4) Migration 050: delete persistent_agent jobs, remove from job_type CHECK constraint, remove from shared types. (5) Update status.ts to query persistent_agents table instead of jobs.

**Why:** With persistent agents running locally via company-persistent-jobs endpoint, the old orchestrator dispatch path, Slack messaging, and jobs table entries are dead code.

**Files:**
- Modify: `packages/local-agent/src/executor.ts` (remove send_message from CPO permissions)
- Modify: `supabase/functions/orchestrator/index.ts` (remove persistent_agent dispatch)
- Create: `supabase/migrations/049_cpo_terminal_prompt.sql`
- Create: `supabase/migrations/050_remove_persistent_agent_jobs.sql`
- Modify: `packages/shared/src/messages.ts` (remove persistent_agent from CardType)
- Modify: `packages/cli/src/commands/status.ts` (query persistent_agents table)

**Gotchas:**
- Migration 049 uses regexp_replace with 's' flag (dot-matches-newline) to replace the messaging section
- Migration 050 must delete jobs BEFORE altering the CHECK constraint
- Don't remove send_message from MCP server entirely — other roles may use it
- Status.ts needs to handle the case where persistent_agents table doesn't exist yet (migration not applied)

**Implementation Prompt:**
> 5 sub-tasks: (1) In executor.ts handlePersistentJob, remove `mcp__zazig-messaging__send_message` from CPO's settings.json permissions. (2) In orchestrator/index.ts, delete the persistent_agent dispatch path in dispatchQueuedJobs and the auto-requeue logic. Deploy with `npx supabase functions deploy orchestrator`. (3) Create migration 049: UPDATE roles SET prompt = regexp_replace(prompt, '## Handling Inbound Messages.*$', '## Conversation\n\nYou are talking directly to a human in a terminal...', 's') WHERE name='cpo'. (4) Create migration 050: DELETE FROM jobs WHERE job_type='persistent_agent', then drop and recreate jobs_job_type_check without persistent_agent. Update messages.ts CardType. (5) Update status.ts to query persistent_agents table. Apply migrations, build, verify. See plan Tasks 12-16 for full code.
