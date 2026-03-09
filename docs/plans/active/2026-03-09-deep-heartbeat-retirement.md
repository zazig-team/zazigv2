# Deep Heartbeat — Capability Retirement

**Date:** 2026-03-09
**Decision:** Retire "Deep Heartbeat" as a standalone capability
**Authors:** Tom Weaver, Claude

---

## What Deep Heartbeat Was

Section 1 of the Triggers & Events design (V2.2). A cloud-side per-job health reporting system:

- Local daemon collects `JobHealth` per active job (stuck detection, permission blocking, output stall, context health)
- Sends enriched heartbeat payload to a `heartbeat` Edge Function
- Cloud stores payload in `machines.heartbeat_payload` JSONB
- Orchestrator reads health data and makes decisions (requeue stuck jobs, notify on permission prompts, auto-restart CPO on compaction)

Required: `stuck_count` + `last_stuck_at` + `dispatch_attempt_id` on jobs, `stuck_threshold` on roles, `heartbeat_payload` on machines, new Edge Function.

## Why It's Being Retired

The architecture evolved past the original design. Two developments made most of Deep Heartbeat redundant:

### 1. Exec Cache-TTL (shipped 2026-03-09) already does local health detection

The daemon's 30s heartbeat loop for persistent agents already:
- Captures tmux output and hashes it for change detection
- Tracks `lastActivityAt` and `lastOutputHash` per agent
- Detects idle sessions and triggers cache-TTL resets
- Checks `tmux has-session` for session liveness
- Detects human attachment via `tmux list-clients`

This is the same tmux capture primitive Deep Heartbeat would use — just applied locally instead of reported to the cloud. Extending it with compaction detection and permission prompt scanning is ~50 lines of daemon code, not a capability.

### 2. The daemon can act on its own health data

The original design assumed the cloud (orchestrator) needed to make health decisions. But for the current setup (1-2 machines), the daemon is better positioned:

| Health Signal | Cloud Decision (Deep HB) | Local Decision (Current) |
|---|---|---|
| Job stuck | Orchestrator reads payload → increments stuck_count → requeues | Daemon detects locally → kills session → reports failure → orchestrator requeues via existing path |
| Permission blocked | Edge Function → Slack notification | Daemon scans tmux → sends Slack directly via MCP |
| tmux session dead | Edge Function → mark job failed | Daemon already detects this → reports failure |
| CPO context degraded | Edge Function → auto-restart | Cache-TTL already resets on idle; compaction detection is a local enhancement |

The cloud adds value only for **multi-machine visibility** (admin dashboard showing job health across machines) and **cross-machine decisions** (failover). Neither is needed at current scale.

## Where the Pieces Go

### Folded into Exec Autonomy (Phase 2)

Local health hardening — daemon-side enhancements to the existing 30s heartbeat loop:

- **Compaction detection**: Scan tmux output for Claude Code's compaction markers. Trigger reset on compaction rather than waiting for idle timeout.
- **Permission prompt detection**: Scan for "Allow?", "Do you want to" patterns. Send Slack alert to human via MCP.
- **Session-alive hardening**: More robust `tmux has-session` checks with process verification.
- **Smart reset triggers**: Reset on compaction + idle, not just idle alone.

All daemon-local. No cloud changes. No new tables or Edge Functions.

### Folded into Orchestrator

Dispatch attempt fencing — a job dispatch safety feature:

- Add `dispatch_attempt_id` UUID column to jobs table
- Orchestrator sets it on each dispatch
- Local agent includes it in completion/failure reports
- Orchestrator validates on state transitions (compare-and-set)

This prevents stale agents (from a previous dispatch) from corrupting requeued jobs. It's a correctness feature for job dispatch, not a heartbeat feature. Build when job requeue becomes a real operational flow.

### Deferred indefinitely

- `heartbeat_payload` JSONB on machines — diagnostic convenience for multi-machine dashboard. Build if/when needed.
- `heartbeat` Edge Function — cloud-side processor. Not needed while daemon acts locally.
- `stuck_count` / `last_stuck_at` on jobs — cloud-side stuck tracking. Daemon handles this locally.
- `stuck_threshold` on roles — per-role stuck tolerance. Daemon uses `cache_ttl_minutes` / `hard_ttl_minutes` instead.

## What Still References Deep Heartbeat

Updated docs (2026-03-09):

| Document | Change |
|---|---|
| `ROADMAP.md` | Removed "deep heartbeat" from T&E subsystem list, updated CPO health monitoring line |
| `dynamic-roadmap-design.md` | Deep Heartbeat row marked retired, Orchestrator row updated, build priorities updated |
| `exec-heartbeat-and-cache-ttl-design.md` | Phase 2 no longer says "needs Deep Heartbeat", capability placement updated |
| `triggers-and-events-reconciliation.md` | Priority #4 (extended heartbeat) marked retired with rationale |

## Decision Criteria for Revival

Bring back cloud-side health reporting if any of these become true:

1. **3+ machines** running agents simultaneously — local-only decisions can't see cross-machine health
2. **Admin dashboard** needs real-time per-job health visibility across the fleet
3. **Automated cross-machine failover** — not just "machine is dead" (existing heartbeat covers that) but "job X on machine Y is stuck, move it to machine Z"

Until then, the daemon handles health locally and reports outcomes through the existing job completion/failure path.
