# Review: Exec Heartbeat & Cache-TTL Design
Reviewed: 2026-03-09
Source: `docs/plans/active/2026-03-09-exec-heartbeat-and-cache-ttl-design.md`
Prior reviews: Gemini (gemini-cli), Codex (gpt-5.3-codex) — findings incorporated
This review: Gap-focused walkthrough against adjacent plans

## Verdict

**Ready to execute with the incorporated fixes.** The design is architecturally sound, well-hardened after the Gemini/Codex review, and Phase 1 is implementable without cloud dependencies. Six gaps were found during this walkthrough — three have been fixed in the doc, three are documented as open questions.

The most important insight from this review: the design is implementing behaviors already assumed by other plans (auto-scheduling, prompt freshness) without those plans knowing. Cross-references have been added.

## One-Way Doors

| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| `.claude/memory/` as agent-managed files | HEARTBEAT.md | HARD TO REVERSE | Once agents start writing memory files in this format, migrating to the formal Memory System (memory_chunks table) requires a data migration. Mitigated: explicitly called out as Phase 1 bridging, not permanent architecture. |
| heartbeat-state.json format | Heartbeat State | Moderate | Task IDs in this file ("morning-standup", "inbox-triage") become a contract. If HEARTBEAT.md task names change, the state file's keys don't match. Need naming convention or task-ID stability policy. |
| cache_ttl_minutes on roles table | Database | Low | Easy to change. NULL means no cache-TTL. Reversible by setting to NULL and removing daemon logic. |

## Dependency Map

| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| Persistent Identity (stable workspaces, role prompts) | Persistent Agent Identity design | Substantially shipped |
| SessionStart hooks in .claude/settings.json | Workspace assembly (workspace.ts) | Shipped |
| tmux process management | Executor (executor.ts) | Shipped |
| send_message MCP tool (for alerts) | Agent MCP server | Shipped |
| query_features / query_ideas MCP tools (for heartbeat tasks) | Agent MCP server | Shipped for CPO, **verify for CTO** |
| Memory System P1 (for graduating memory files) | Memory System Design v5.1 | Not started (20% designed) |
| Triggers & Events Scheduler (for Mode 2) | T&E Design V2.2 | Not built |
| Triggers & Events Wake Service (for Mode 3) | T&E Design V2.2 | Not built |

## Key Trade-offs

- **Agent-managed memory vs orchestrator-assembled**: Chose agent-managed `.claude/memory/` files for Phase 1 pragmatism. Violates Memory System Design principle P2. Gains: ships immediately, no dependency on unbuilt memory infrastructure. Loses: no orchestrator control, no decay/importance scoring, no tombstoning.

- **30-min cache-TTL vs longer intervals**: Chose 30 min for CPO (frequent freshness). Gains: context never degrades significantly, prompt freshness always current. Loses: ~48 Opus API calls/day ($5-12/day), higher token cost than necessary if most wake cycles find nothing actionable.

- **Exec workspace only vs shared repo skills**: Chose workspace-only for Phase 1 (reviewer recommendation). Gains: no context leakage, no privilege escalation. Loses: cross-session side-loading doesn't work until Phase 2. Expert sessions can't load `/as-cpo` in Phase 1.

## Gaps Found and Addressed

| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 1 | Human-attached session killed on cache-TTL reset | High | **FIXED** — added `suspend_when_attached` config + `tmux list-clients` detection |
| 2 | Memory files collide with formal Memory System Design (P2 principle) | High | **FIXED** — documented as Phase 1 bridging, added relationship table entry |
| 3 | Auto-scheduling design assumes CPO heartbeat but neither doc cross-references | Medium | **FIXED** — added relationship table entry |
| 4 | Prompt freshness gap (from PI reconciliation) resolved but not credited | Low | **FIXED** — added relationship table entry |
| 5 | Heartbeat cost model undocumented (~$8-18/day for CPO+CTO) | Medium | **DOCUMENTED** — added as Open Question #5 |
| 6 | CTO MCP tool access unverified for heartbeat tasks | Medium | **DOCUMENTED** — added as Open Question #6 |

## Open Questions (carried from doc)

1. DB vs filesystem for HEARTBEAT.md — recommendation: DB (already decided)
2. Reset notifications — recommendation: only on circuit breaker trip or first wake of day
3. Memory persistence format — recommendation: markdown (agent-native), JSON for heartbeat-state only
4. Inter-exec heartbeat coordination — recommendation: stagger by 5 min offset in daemon config
5. Cost model — recommendation: monitor for 1 week, adjust cache-TTL if >$15/day combined
6. CTO MCP tools — recommendation: verify before CTO heartbeat goes live

## Suggested Revisions

All revisions have been applied to the design doc during this review. No remaining revisions needed before implementation.

---

Ready to proceed to implementation. The design has been reviewed by three models (Gemini, Codex, Claude) and gap-checked against four adjacent plans (Memory System, Persistent Identity, Ideas Inbox, T&E Reconciliation).
