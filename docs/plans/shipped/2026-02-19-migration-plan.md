# Migration Plan: zazig v1 → v2 Parallel Operation

**Date:** 2026-02-19
**Status:** Approved
**Decision makers:** Tom, Chris

## Context

zazig v1 is running in production: Python/Slack exec team (CPO, CTO, VP-Eng, Supervisor) as persistent Claude Code tmux sessions. Trello is the work queue. QMD + filesystem for agent memory. State files for inter-agent communication.

zazig v2 replaces this with: TypeScript monorepo, Supabase (10-table multi-tenant schema), orchestrator as Edge Functions, local agent daemon connected via Realtime websockets.

This document defines how to run v1 and v2 in parallel during the transition, and when to cut over.

## Key Decisions

| Decision | Answer |
|----------|--------|
| Human interface | **Keep Slack** — v2 agents communicate via Slack initially. Dashboard later. |
| Trello | **Hard cutover** — v2 does not use Trello. v1 keeps Trello until v2 is fully ready, then clean switch. No sync/bridge. |
| Agent memory | **Start fresh** — no QMD migration. v2 agents build memory from scratch in `memory_chunks` table. Old QMD archived, not migrated. |

## Migration Phases

### Phase 0: Foundation (DONE)

- [x] TypeScript monorepo scaffolded (packages/shared, orchestrator, local-agent)
- [x] Shared message protocol with runtime validators
- [x] Protocol versioning + hardening (correlationId, failureReason, JobAck/StopAck)
- [x] Multi-tenant Supabase schema (10 tables) applied
- [x] Card annotation parser for orchestrator dispatch

### Phase 1: v2 Core (IN PROGRESS)

Build the v2 execution pipeline. v1 continues running all production work.

- [ ] Local agent: execute commands via tmux/CLI
- [ ] Orchestrator: poll job queue and manage slots
- [ ] Git worktree isolation for dispatched agents
- [ ] Orchestrator: machine health + dead machine recovery
- [ ] Orchestrator: card-type + complexity dispatch mapping
- [ ] Review pipeline: auto-dispatch reviewer after execution
- [ ] CPO health monitoring + 15-minute failover

**v1 status during Phase 1:** Fully operational. All execs running. Trello is source of truth. No v2 involvement in production work.

### Phase 2: Shadow Mode

v2 orchestrator runs alongside v1. It observes but does not dispatch.

**What happens:**
1. Orchestrator polls the `jobs` table (manually seeded with test jobs)
2. Local agent connects, sends heartbeats, appears in `machines` table
3. Orchestrator logs dispatch decisions: "would send job X to machine Y"
4. No actual execution — this validates the decision-making logic

**Validation criteria:**
- Orchestrator correctly selects machines based on slot availability
- Heartbeat timeout correctly marks machines offline
- Job queue ordering respects complexity/priority
- Realtime messages flow correctly between orchestrator and local agent

**v1 status during Phase 2:** Still fully operational. No production work through v2.

### Phase 3: Canary — Simple Cards on v2

Route a small number of real tasks through v2 end-to-end.

**What happens:**
1. Manually create 3-5 `simple` complexity jobs in the `jobs` table
2. Orchestrator dispatches to local agent
3. Local agent executes via tmux/codex
4. Review pipeline runs
5. CPO reviews results (via Slack — same as v1)
6. Compare quality with equivalent v1 output

**Criteria to proceed:**
- All 5 canary jobs complete successfully
- PR quality matches what v1 VP-Eng produces
- No slot leaks (jobs complete, slots release)
- Recovery works (kill an agent mid-job, verify re-queue)

**v1 status during Phase 3:** Still handling all real production work. Canary jobs are test work only.

### Phase 4: Gradual Ramp

Increase v2's share of real work.

**What happens:**
1. `simple` cards → v2 (all)
2. `medium` cards → v2 (after simple is stable for 1 week)
3. `complex` cards → v2 (after medium is stable for 1 week)
4. Persistent agents (CPO, CTO) → v2 (last, after all card types work)

**v1 status during Phase 4:** Running in parallel, handling whatever v2 isn't yet. Gradually less work.

### Phase 5: Cutover

Binary switch. One day v1 is running, next day v2 is running.

**Cutover checklist:**
- [ ] All card complexities dispatching successfully on v2
- [ ] Persistent agents (CPO, CTO) running as v2 jobs
- [ ] Machine health monitoring and dead machine recovery proven
- [ ] CPO failover (15-min threshold) tested
- [ ] Review pipeline working for all card types
- [ ] Slack integration working (human questions/answers flowing)
- [ ] Agent memory accumulating in `memory_chunks` (semantic search working)
- [ ] At least 2 weeks of stable v2 operation with no manual intervention

**Cutover steps:**
1. Stop v1 execs: kill tmux sessions (VP-Eng, Supervisor, CPO, CTO)
2. Stop v1 watchdog (launchd `com.zazig.exec`)
3. Archive Trello boards (read-only, for historical reference)
4. Archive v1 state files (`~/.local/share/zazig-*/`)
5. v2 is now the only running system

**Rollback plan:** If v2 fails post-cutover, restart v1 tmux sessions + watchdog. Trello boards are still readable. v1 state files are archived, not deleted. Recovery time: <5 minutes.

## What Gets Archived vs Deleted

| Artifact | Action | Reason |
|----------|--------|--------|
| Trello boards | **Archive** (read-only) | Historical reference for card history, decisions |
| v1 state files (`cpo-state.json`, `vpe-state.json`, etc.) | **Archive** to `~/.zazig/v1-archive/` | Forensics if needed |
| QMD memory database | **Archive** | Not migrated, but keep for reference |
| Operating manuals (`manuals/*.md`) | **Adapt** for v2 | Core role definitions stay, execution mechanics change |
| Launch scripts (`scripts/launch-*.sh`) | **Delete** after cutover | Replaced by v2 orchestrator |
| Watchdog (`supervisor-watchdog.sh`) | **Delete** after cutover | Replaced by orchestrator health monitoring |
| v1 Python code (`zazig/`) | **Keep in repo** on a `v1-archive` branch | Reference implementation |
| Agent `.claude/` directories | **Archive** | Skills and hooks may be reusable |

## Component Retirement Order

Last-in-first-out: the highest-level v1 components retire last.

```
First to retire                              Last to retire
─────────────────────────────────────────────────────────────
Watchdog → Supervisor → VP-Eng → CTO → CPO → Trello → Slack*
```

*Slack stays — it's the human interface for both v1 and v2.

## Risks

| Risk | Mitigation |
|------|------------|
| v2 orchestrator has bugs that v1 VP-Eng handled implicitly | Shadow mode (Phase 2) catches logic gaps before real work flows through |
| Slack integration in v2 is harder than expected | v2 inherits v1's Slack code (Python/slack-bolt). Same bot tokens, same channels. |
| Agent memory quality degrades with fresh start | Agents re-learn quickly from codebase + conversations. Skill files carry forward. |
| Cutover fails, need to rollback | v1 can restart in <5 minutes. Trello boards are archived, not deleted. |
| v1 and v2 accidentally run simultaneously post-cutover | Cutover checklist explicitly stops v1 first. Watchdog disabled via launchd unload. |

## Timeline

No fixed dates. Phase transitions are gated by validation criteria, not calendar.

**Estimated effort:**
- Phase 1: 2-3 weeks (complex orchestrator + local agent work)
- Phase 2: 1 week (shadow mode testing)
- Phase 3: 1 week (canary jobs)
- Phase 4: 2-3 weeks (gradual ramp with stability periods)
- Phase 5: 1 day (cutover)
