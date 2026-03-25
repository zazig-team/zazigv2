# zazigv2

## What This Is
Cloud orchestration server + local agent daemon for zazig exec agents. Replaces VP-Eng, Supervisor, watchdog, and tmux-based agent management with a deterministic orchestrator (Supabase) that dispatches work to local machines via websockets.

## Architecture
Three-layer model:
- **Cloud (Supabase)** — orchestrator logic (Edge Functions), state (Postgres), real-time comms (Realtime websockets)
- **Local Agent** — Node daemon on each contributor's machine. Receives commands, executes tmux/CLI agents, reports results, sends heartbeats.
- **CPO** — sole persistent agent, runs on a designated local machine. All other agents are ephemeral and card-driven.

See `docs/plans/2026-02-18-orchestration-server-design.md` for the full design document.

## Tech Stack
- TypeScript (both orchestrator and local agent)
- Supabase (Postgres, Realtime, Edge Functions, Auth)
- Node.js (local agent daemon)

## Development
{dev commands, ports, etc. — fill in as project develops}

## Key Concepts
- **Slots** — concurrency is constrained by team API plan limits (Codex + Codex), configured per-machine
- **Card annotations** — CPO enriches cards with `complexity` (simple/medium/complex) and `card-type` (code/infra/design/research/docs)
- **Heartbeats** — local agents heartbeat every 30s; machines marked dead after 2 min silence
- **CPO failover** — if CPO host is offline >15 min, orchestrator migrates CPO to another machine
