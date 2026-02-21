# Orchestration Server — Design Document

**Date:** 2026-02-18
**Status:** proposed
**Authors:** Chris (owner), CPO (agent)

---

## Problem

The current zazig exec architecture relies on a chain of persistent agents (CPO → VP-Eng → Supervisor → implementation agents) where VP-Eng makes dispatch decisions and the Supervisor keeps VP-Eng alive. This has several issues:

- VP-Eng is an expensive always-on Sonnet session that spends most of its time idle
- Dispatch logic lives in a prompt (fragile, non-deterministic)
- Supervisor is a workaround for VP-Eng reliability, not a real orchestration layer
- No structured way to match card complexity to model tier
- Agent lifecycle management is spread across launch scripts, watchdog, and Supervisor
- Card assignment (`assigned-tom`, `assigned-chris`) adds friction to a shared pipeline
- All execution is tied to one machine — no distributed work

## Solution

Replace VP-Eng and Supervisor with a deterministic orchestration server in the cloud, backed by Supabase. Local machines run a thin agent daemon that receives commands from the orchestrator and executes them (tmux sessions, CLI tools). CPO remains the sole persistent conversational agent — the human interface. Everything else is card-driven and ephemeral.

---

## Architecture

### Three-Layer Model

```
┌─────────────────────────────────────────────────────────┐
│                    CLOUD (Supabase)                      │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │ Orchestrator │────▶│   Postgres   │                  │
│  │   (server)   │     │  (state, Q)  │                  │
│  └──────┬───────┘     └──────────────┘                  │
│         │                                                │
│         │ Supabase Realtime (websocket)                  │
└─────────┼────────────────────────────────────────────────┘
          │
    ┌─────┴──────────────────────┐
    │                            │
    ▼                            ▼
┌──────────────────┐   ┌──────────────────┐
│  Tom's Machine   │   │  Chris's Machine │
│  Local Agent     │   │  Local Agent     │
│  ─────────────── │   │  ─────────────── │
│  2 Claude Code   │   │  1 Claude Code   │
│  1 Codex         │   │  1 Codex         │
│  tmux / CLI      │   │  tmux / CLI      │
│  CPO (persistent)│   │                  │
└──────────────────┘   └──────────────────┘
```

### Agent Tiers

| Tier | Agent | Lifecycle | Purpose |
|------|-------|-----------|---------|
| **Persistent** | CPO | Always-on, orchestrator ensures uptime via local agent | Human interface: standups, planning, reviews, card enrichment |
| **Ephemeral** | All others | Orchestrator dispatches to local agents per card | Execution, review, architecture — started and stopped per task |

---

## Cloud Layer (Supabase)

### Why Supabase

- **Realtime** — websocket channels for orchestrator ↔ local agent communication, out of the box
- **Postgres** — orchestrator state, job queue, slot tracking in a real database (not JSON files)
- **Edge Functions** — orchestrator logic can run as serverless functions
- **Auth** — machine registration and API keys for local agents

### Orchestrator Responsibilities

The orchestrator is **deterministic — no LLM**. It:

1. Polls Trello for cards in Up Next
2. Parses card annotations (complexity + card-type)
3. Checks available slots across all connected machines
4. Dispatches work to local agents via Supabase Realtime
5. Tracks job progress (executing → reviewing → done)
6. Moves cards through Trello columns
7. Monitors CPO health via local agent heartbeats
8. Recovers from machine disconnects (re-queue cards)

---

## Local Agent

A thin daemon running on each contributor's machine. It:

1. **Connects** — subscribes to a Supabase Realtime channel on startup
2. **Heartbeats** — sends periodic heartbeats so the orchestrator knows it's alive
3. **Receives commands** — orchestrator sends "start agent" messages with card context
4. **Executes locally** — spins up tmux sessions, CLI processes (Claude Code, Codex)
5. **Reports back** — streams status updates and results to the orchestrator via the channel
6. **Manages CPO** — keeps the persistent CPO session alive (if this machine hosts CPO)
7. **Reports slot availability** — tells the orchestrator how many slots are free

### Machine Availability & Recovery

The local agent sends heartbeats every **30 seconds** over the websocket. If the orchestrator doesn't receive a heartbeat for **2 minutes**:

1. Mark that machine's slots as **unavailable**
2. Any In Progress cards dispatched to that machine → **back to Up Next**
3. Orchestrator re-dispatches those cards to other available machines
4. When the machine reconnects, its slots re-enter the pool automatically

This handles: lid closes, sleep, crashes, network drops, restarts — all the same recovery path.

---

## Resource Model

Concurrency is constrained by the team's combined API plan limits, tracked per-machine. Configured via YAML (or Supabase table):

```yaml
machines:
  toms-macbook:
    slots:
      claude_code: 2    # Max Plan seats
      codex: 1          # Codex Pro
    hosts_cpo: true      # CPO runs on this machine
  chris-macbook:
    slots:
      claude_code: 1
      codex: 1
    hosts_cpo: false
```

**Totals:** 3 Claude Code slots + 2 Codex slots across the pool.

### Slot Dispatch Rules

- `simple` cards → prefer Codex slots (cheapest)
- `medium` cards → use a Claude Code slot (Sonnet)
- `complex` cards → use a Claude Code slot (Opus)
- If all slots of the needed type are occupied → card queues until a slot frees
- Orchestrator prefers the machine with the most available slots (load balancing)

Slot counts are updated manually in config when team plans change.

---

## Card Annotation

CPO enriches cards before they enter the pipeline. Two annotations:

### Complexity

Determines which slot type and model tier the orchestrator assigns.

| Value | Slot Type | Model Tier | Use Case |
|-------|----------|-----------|----------|
| `simple` | Codex | Codex | Mechanical changes, boilerplate, straightforward fixes |
| `medium` | Claude Code | Sonnet | Multi-file changes, moderate reasoning required |
| `complex` | Claude Code | Opus | Architecture decisions, deep investigation, multi-step reasoning |

### Card Type

Determines which execution agent and reviewer the orchestrator selects.

| Card Type | Execution Agent | Reviewer | Complex Override |
|-----------|----------------|----------|-----------------|
| `code` | Implementation agent | Code reviewer | CTO review |
| `infra` | CTO agent | CTO review | — |
| `design` | Design agent | CPO review (at standup) | — |
| `research` | Research agent | CPO review (at standup) | — |
| `docs` | Docs agent | Automated (lint/spell) | — |

Card types are extensible — new types can be added by updating the orchestrator's type-to-agent mapping config. Defined in a config file:

```yaml
card_types:
  code:
    execution_agent: implementation
    reviewer: code-reviewer
    reviewer_override:
      complex: cto          # complex code gets CTO architecture review
  infra:
    execution_agent: cto
    reviewer: cto
  design:
    execution_agent: design
    reviewer: cpo
  research:
    execution_agent: research
    reviewer: cpo
  docs:
    execution_agent: docs
    reviewer: automated
```

### Annotation Format

Stored in the Trello card description as a structured block:

```
<!-- orchestrator -->
complexity: simple
card-type: code
<!-- /orchestrator -->
```

CPO writes these annotations when grooming/prioritizing cards. The orchestrator parses them when pulling cards from Up Next.

---

## Orchestrator Pipeline

```
┌─────────┐     ┌──────────────┐     ┌───────────────┐     ┌───────────┐     ┌──────────┐     ┌────────┐
│ Up Next │────▶│ Orchestrator │────▶│ Local Agent   │────▶│  Execute  │────▶│  Review  │────▶│ Review │
│ (Trello)│     │  (cloud)     │     │ (websocket)   │     │  (local)  │     │  (local) │     │(Trello)│
└─────────┘     └──────────────┘     └───────────────┘     └───────────┘     └──────────┘     └────────┘
                       │                     │                    │                 │
                  Parse annotations    Pick machine         Spin up agent     Spin up reviewer
                  Check slot pool      Send command         matched to         matched to
                  Reserve slot         via Realtime         card-type +        card-type
                                                            complexity
```

### Step-by-step

1. **Poll** — Orchestrator watches Up Next list for cards (shared pipeline — no assignment labels)
2. **Parse** — Read `<!-- orchestrator -->` block from card description
3. **Check slots** — Is a slot of the required type available on any connected machine?
   - Yes → reserve slot on the best available machine, proceed
   - No → card queues, check next card or wait
4. **Dispatch** — Send command to local agent via Supabase Realtime:
   - Card context (ID, description, repo, branch info)
   - Agent type (matched from `card-type`)
   - Model tier (matched from `complexity`)
5. **Local execution** — Local agent spins up tmux session / CLI process
   - Move card to In Progress
6. **Execute** — Agent works the card, produces output (PR, report, docs, etc.)
7. **Report** — Local agent sends result back to orchestrator via Realtime
8. **Review** — Orchestrator dispatches a reviewer to a local agent (same or different machine):
   - `code` (simple/medium) → code-reviewer agent
   - `code` (complex) → CTO agent (architecture review)
   - `infra` → CTO agent in review mode
   - `design` / `research` → skip automated review, surface to CPO
   - `docs` → automated lint/spell check only
9. **Surface** — Card moves to Review column for CPO/human sign-off at standup
10. **Release slot** — Slot returned to machine's pool
11. **Failure path** — If reviewer rejects, feedback attached to card, orchestrator re-dispatches

### Simple Card Fast Path

For `simple` complexity cards, the orchestrator may skip the reviewer step if:
- CI passes (lint, typecheck, tests)
- The change is below a diff-size threshold

This keeps simple cards flowing without bottlenecking on review agents.

---

## CPO Responsibilities (Updated)

With the orchestrator handling execution, CPO's role sharpens:

| Responsibility | How |
|---------------|-----|
| **Card enrichment** | Annotate cards with complexity + card-type before they reach Up Next |
| **Standups** | Read orchestrator state (Supabase) + Trello, synthesize for owners |
| **Planning** | Brainstorming, design docs, roadmap updates |
| **Review sign-off** | Review cards in Review column, approve or send back |
| **Human interface** | All human conversations go through CPO |

CPO no longer:
- Writes directives to VP-Eng (no VP-Eng)
- Manages token budgets (complexity replaces this)
- Coordinates with Supervisor (no Supervisor)
- Assigns cards to individuals (shared pipeline)

CPO runs on a designated local machine (`hosts_cpo: true`). The orchestrator monitors CPO health via that machine's local agent heartbeats and restarts CPO if it dies.

### CPO Failover

If the CPO host machine goes offline:
- **Under 15 minutes** — orchestrator waits. Handles brief sleep, restarts, network blips.
- **Over 15 minutes** — orchestrator spins CPO up on another available machine. The new host gets `hosts_cpo: true`, the old one gets it cleared. When the original machine comes back, CPO stays on the new host (no ping-pong).

---

## What This Replaces

| Current | Replaced By |
|---------|------------|
| VP-Eng (persistent Sonnet) | Orchestrator (deterministic, no LLM) |
| Supervisor (persistent Sonnet) | Orchestrator health checks + local agent heartbeats |
| Token budget labels (`codex-first`, `claude-ok`, `team-ok`) | Complexity annotation (`simple`, `medium`, `complex`) |
| VP-Eng dispatch logic (in prompt) | Orchestrator card-type → agent mapping (in config) |
| Launch scripts + watchdog | Local agent daemon + orchestrator lifecycle management |
| `cpo-directives.json` | Direct card annotation (orchestrator reads Trello) |
| `assigned-{name}` card labels | Shared pipeline — no assignment needed |
| Single-machine execution | Distributed across contributor machines via local agents |
| JSON state files (`vpe-state.json`, etc.) | Supabase Postgres |
| `cpo-events.log` | Supabase event log table |

---

## Orchestrator State (Supabase Postgres)

State moves from local JSON files to Supabase tables. CPO and the web dashboard query the same source.

### Core Tables

**machines**
```
id | name | slots_claude_code | slots_codex | hosts_cpo | last_heartbeat | status
```

**jobs**
```
id | card_id | card_type | complexity | slot_type | machine_id | status | started_at | completed_at | result
```
Status: `queued` → `dispatched` → `executing` → `reviewing` → `complete` | `failed`

**events**
```
id | timestamp | event_type | card_id | machine_id | detail
```

### API View (for CPO / dashboard)

```json
{
  "status": "running",
  "cpo": {
    "alive": true,
    "machine": "toms-macbook",
    "lastHealthCheck": "2026-02-18T10:00:00Z"
  },
  "machines": [
    {
      "name": "toms-macbook",
      "status": "online",
      "slots": {
        "claude_code": { "total": 2, "in_use": 1, "available": 1 },
        "codex": { "total": 1, "in_use": 0, "available": 1 }
      }
    },
    {
      "name": "chris-macbook",
      "status": "online",
      "slots": {
        "claude_code": { "total": 1, "in_use": 0, "available": 1 },
        "codex": { "total": 1, "in_use": 1, "available": 0 }
      }
    }
  ],
  "activeJobs": [
    {
      "cardId": "abc123",
      "cardType": "code",
      "complexity": "medium",
      "machine": "toms-macbook",
      "model": "sonnet",
      "startedAt": "2026-02-18T10:05:00Z",
      "status": "executing"
    }
  ],
  "queue": {
    "waiting": 2
  },
  "pipeline": {
    "upNextCount": 3,
    "inProgressCount": 1,
    "reviewCount": 2
  }
}
```

---

## Open Questions

1. ~~**Concurrency limit**~~ — Resolved: per-machine slot pools, configured via YAML/Supabase.
2. ~~**Agent runtime**~~ — Resolved: local agents execute tmux/CLI on contributor machines, orchestrated from the cloud.
3. ~~**Tech stack**~~ — Resolved: TypeScript for both orchestrator (Supabase Edge Functions) and local agent (Node daemon). Supabase JS client for first-class Realtime support. Zazig Python package stays for Slack bot / Agent SDK layer.
4. ~~**Card type extensibility**~~ — Resolved: config file from day one. YAML mapping of card types to execution agents and reviewers.
5. ~~**CPO annotation UX**~~ — Resolved: both. Auto-annotate during `/scrum` (batch), and on-demand for individual cards created mid-sprint.
6. ~~**CTO role**~~ — Resolved: CTO spins up for `infra` cards AND as reviewer for `complex` `code` cards (via `reviewer_override` in card type config).
7. **CMO** — Parked. Revisit when marketing workstreams are active.
8. ~~**Heartbeat interval**~~ — Resolved: 30s heartbeat, machine marked dead after 2 minutes of silence. In Progress cards re-queued.
11. **Cron job scheduler** — The orchestrator currently only supports card-driven (poll-based) job dispatch. Scheduled jobs (market researcher daily scan, nightly done-archiver, nightly bug-scan) need a cron trigger that creates jobs on a schedule. Proposed: `cron_jobs` table with schedule expressions, orchestrator runs a scheduler loop alongside the polling loop. Jobs created by cron are standard jobs dispatched to available machines.
12. **Heartbeat depth and scheduling split** — Current heartbeats are machine-level ("alive" or "offline"). Problem: a machine can be online but an agent session stuck at a permission prompt (v1 antipattern — "tmux has-session as sole health check"). Proposed split (leaning B): Cloud (orchestrator) owns scheduling and machine-level health. Local agent reports per-job health in heartbeats: last activity timestamp, agent status (executing/idle/stuck), last tool call age. Orchestrator makes dispatch and restart decisions based on richer data. This also determines where cron triggers live — cloud cron creates the job, local agent executes it.
13. ~~**CPO runtime**~~ — Resolved: CPO is a **Claude Code session** with Slack MCP for human interaction (not Agent SDK). Runs locally on a host machine. Anyone in the company can chat to it via Slack. This preserves the full Claude Code toolchain (skills, hooks, MCP servers) which the exec design relies on heavily. The Zazig Python package stays as the Slack bot / Socket Mode layer only — it is NOT the exec runtime. Decision confirmed by Chris 2026-02-20.
9. ~~**CPO failover**~~ — Resolved: yes, failover. If the CPO host machine is offline for 15 minutes, the orchestrator spins CPO up on another available machine. Under 15 minutes, it waits (handles brief sleep/restarts without unnecessary migration).
10. ~~**Supabase project**~~ — Resolved: new dedicated Supabase project for the orchestrator.

---

## Next Steps

1. Finalise open questions (owner decision)
2. Create backlog cards on the Orchestration Server board
3. Build Phase 1: local agent daemon (connect to Supabase, heartbeat, receive commands, execute tmux)
4. Build Phase 2: orchestrator core (poll Trello, parse annotations, dispatch to local agents, move cards)
5. Build Phase 3: CPO health monitoring + restart via local agent
6. Retire VP-Eng, Supervisor, watchdog, and launch scripts
