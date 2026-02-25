# zazigv2

Cloud orchestration platform that dispatches AI coding agents (Claude Code, Codex) to contributor machines via Supabase Realtime. Replaces manual agent management with a deterministic job pipeline.

## Architecture

```
                          ┌─────────────────────────────────┐
                          │         Cloud (Supabase)         │
                          │                                  │
                          │  ┌────────────┐  ┌───────────┐  │
  Slack ◄────────────────►│  │ Edge Funcs  │  │ Postgres  │  │
  (approve/reject/chat)   │  │             │  │           │  │
                          │  │ orchestrator│  │ features  │  │
                          │  │ slack-events│  │ jobs      │  │
                          │  │ agent-msg   │  │ machines  │  │
                          │  │ slack-oauth │  │ roles     │  │
                          │  └──────┬──────┘  └───────────┘  │
                          │         │   Realtime websockets   │
                          └─────────┼─────────────────────────┘
                                    │
                     ┌──────────────┼──────────────┐
                     │              │              │
                     ▼              ▼              ▼
              ┌────────────┐ ┌────────────┐ ┌────────────┐
              │ Machine A  │ │ Machine B  │ │ Machine C  │
              │ local-agent│ │ local-agent│ │ local-agent│
              │            │ │            │ │            │
              │ tmux agents│ │ tmux agents│ │ tmux agents│
              │ (Claude /  │ │ (Claude /  │ │ (Claude /  │
              │  Codex)    │ │  Codex)    │ │  Codex)    │
              └────────────┘ └────────────┘ └────────────┘
```

**Three layers:**
- **Cloud (Supabase)** — orchestrator logic (Edge Functions), state (Postgres), real-time comms (Realtime websockets)
- **Local Agent** — Node.js daemon on each contributor's machine. Receives job commands, executes tmux/CLI agents, reports results, sends heartbeats every 30s
- **CLI** — `zazig` command for contributors to login, join a company, and start/stop the local agent

## Prerequisites

- Node.js >= 20
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Doppler CLI](https://docs.doppler.com/docs/install-cli) (secrets management)

## Quickstart

```bash
# Install dependencies
npm install

# Build all packages (required after every git pull)
npm run build

# Start zazig (picks company, spawns daemon + persistent agents, opens TUI)
npx tsx packages/cli/src/index.ts start
```

## Running Zazig

### Start
```bash
npx tsx packages/cli/src/index.ts start
```
This will:
1. Prompt you to pick a company (if you belong to more than one)
2. Spawn a background daemon (detached — you can close the terminal)
3. Discover persistent agents (CPO, etc.) from the backend
4. Launch them as tmux sessions
5. Open a split-screen TUI showing the active agent

### Reconnect to TUI
If you close the terminal but the daemon is still running:
```bash
npx tsx packages/cli/src/index.ts chat
```

### Stop
```bash
npx tsx packages/cli/src/index.ts stop
```

### After pulling new code
The daemon runs compiled JS, not TypeScript. After `git pull`:
```bash
npx tsx packages/cli/src/index.ts stop   # stop current daemon
npm run build                             # rebuild dist/
npx tsx packages/cli/src/index.ts start   # restart
```

### Logs
- Per-company: `~/.zazigv2/logs/<company-id>.log`
- Agent workspaces: `~/.zazigv2/<company-id>-<role>-workspace/`

## Project Structure

```
zazigv2/
├── packages/
│   ├── shared/           @zazigv2/shared — protocol types, message guards, constants
│   ├── orchestrator/     @zazigv2/orchestrator — Supabase Edge Function logic
│   ├── local-agent/      @zazigv2/local-agent — Node.js daemon + MCP server
│   └── cli/              @zazig/cli — contributor CLI (zazig login/join/start/stop)
├── supabase/
│   ├── migrations/       Postgres migrations (feature lifecycle, job lifecycle, etc.)
│   └── functions/        Supabase Edge Functions (Deno runtime)
│       ├── orchestrator/   Cron-driven dispatch loop
│       ├── slack-events/   Inbound Slack webhook handler
│       ├── agent-message/  Outbound agent → Slack relay
│       ├── slack-oauth/    Slack OAuth callback
│       └── _shared/        Shared utilities
└── package.json          Workspace root (npm workspaces)
```

## Feature Lifecycle

Features progress through an 11-status pipeline from creation to production:

```
created
  │
  ▼
ready_for_breakdown ──► breakdown ──► building ──► combining ──► verifying
                                                                    │
                                                                    ▼
                                                           deploying_to_test
                                                                    │
                                                                    ▼
                                                             ready_to_test
                                                              │         │
                                                     approve  │         │  reject (big)
                                                              ▼         ▼
                                                     deploying_to_prod  building (retry)
                                                              │
                                                              ▼
                                                           complete

                                                           cancelled (any stage)
```

| Status | What happens |
|---|---|
| `created` | Feature proposed |
| `ready_for_breakdown` | CPO approved for development |
| `breakdown` | Feature-breakdown-expert splitting into jobs |
| `building` | Implementation jobs executing in parallel |
| `combining` | Job-combiner merging job branches into feature branch |
| `verifying` | Automated verification (lint, typecheck, tests) |
| `deploying_to_test` | Deployer agent pushing to test environment |
| `ready_to_test` | Human testing — Slack thread open for approve/reject |
| `deploying_to_prod` | Human approved — deployer pushing to production |
| `complete` | Shipped and verified |
| `cancelled` | Cancelled at any stage |

## Job Lifecycle

Each job follows an 8-status pipeline:

```
queued ──► dispatched ──► executing ──► reviewing ──► complete
                             │                           │
                             ▼                           ▼
                          blocked                      failed
                             │
                             ▼
                        (unblocked → executing)

                          cancelled (any stage)
```

| Status | What happens |
|---|---|
| `queued` | Waiting for a machine with available slots |
| `dispatched` | Assigned to a machine, StartJob sent via Realtime |
| `executing` | Agent running in tmux session |
| `blocked` | Agent needs human input — question posted to Slack thread |
| `reviewing` | Code review job dispatched (4-perspective: security, perf, arch, simplicity) |
| `complete` | Done and verified |
| `failed` | Terminal failure (CI failure, timeout) |
| `cancelled` | Cancelled |

## How Dispatch Works

The orchestrator runs on a 10-second cron schedule. Each invocation:

1. **Listen** (4s) — drains pending agent messages from the Realtime channel (heartbeats, job completions, failures)
2. **Reap** — marks machines with no heartbeat for 2+ minutes as offline, re-queues their jobs
3. **Breakdown** — finds `ready_for_breakdown` features and creates breakdown jobs
4. **Dispatch** — matches `queued` jobs to online machines with available slots:
   - Routes by complexity: `simple` → Codex, `medium` → Sonnet, `complex` → Opus
   - Falls back from Codex to Claude Code slots if no Codex capacity
   - Uses CAS (compare-and-swap) guards to prevent double-booking under concurrency
   - Persistent agent jobs (CPO) auto-requeue on completion or crash

## Edge Functions

| Function | Purpose | Auth |
|---|---|---|
| `orchestrator` | Cron-driven dispatch loop: reap dead machines, dispatch jobs, process feature transitions | `service_role` key |
| `slack-events` | Inbound Slack webhook: routes DMs to CPO, parses approve/reject in testing threads, unblocks jobs from thread replies | Slack signing secret |
| `agent-message` | Outbound relay: agents call this (via MCP tool) to send messages to Slack | Supabase JWT |
| `slack-oauth` | OAuth callback: exchanges auth code for bot token, stores in `slack_installations` | None (public redirect) |

## Configuration

**Machine config** (`~/.zazigv2/machine.yaml`):
```yaml
name: my-macbook
company_id: <uuid>
slots:
  claude_code: 3
  codex: 2
supabase:
  url: https://xxx.supabase.co
```

**Secrets** (via Doppler, project `zazig`, config `prd`):
- `SUPABASE_ANON_KEY` — client-side Supabase key
- `SUPABASE_SERVICE_ROLE_KEY` — server-side admin key
- `ANTHROPIC_API_KEY` — for title generation (Haiku)
- `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` — Slack app OAuth
- `SLACK_SIGNING_SECRET` — Slack webhook verification

## Development

```bash
# Build all packages
npm run build

# Typecheck
npm run typecheck

# Lint
npm run lint

# Run tests (shared + local-agent)
npm test

# Deploy migrations
supabase db push

# Deploy edge functions
supabase functions deploy orchestrator
supabase functions deploy slack-events --no-verify-jwt
supabase functions deploy agent-message
supabase functions deploy slack-oauth --no-verify-jwt
```
