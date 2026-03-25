# Spring Clean Reconciliation Report

**Date:** 2026-03-01
**Author:** CPO (Phase 2 of Getting a Grip)
**Scope:** All 81 files in `docs/plans/` and `docs/plans/archive/`

---

## Summary

| Category | Count |
|----------|-------|
| Design docs audited | 81 |
| Systems fully built | 24 |
| Systems partially built | 6 |
| Systems not built | 6 |
| Superseded/obsolete docs | ~15 |
| Already tracked in pipeline | 17 (9 complete + 8 failed features) |
| New idea records created (spring clean) | 6 |
| Docs that are meta/proposals (not systems) | ~30 |

---

## BUILT Systems — Matched to Pipeline Features

These systems have design docs AND corresponding pipeline features (complete or failed).

| System | Doc | Feature | Status |
|--------|-----|---------|--------|
| Ideas Inbox | `2026-02-25-ideas-pipeline-unified-design.md` | `ea21ee02` Ideas Inbox | Complete |
| Ideaify Skill | `2026-02-25-ideas-pipeline-unified-design.md` | `38a1d16e` Ideaify Skill | Complete |
| Pipeline Execution Gates | `2026-02-22-build-pipeline-execution-gates-design.md` | `3443f776` Execution Gates | Complete |
| Orchestrator Polling Gaps | (bug fix, no design doc) | `bc9e2a0f` Lifecycle Polling | Complete |
| Clean Slate Re-breakdown | (bug fix, no design doc) | `33e0b29e` Clean Slate | Complete |
| Null-context Validation | (bug fix, no design doc) | `2e9a34a6` Null-context Fix | Complete |
| Pipeline Smoke Tests | `2026-02-24-pipeline-smoke-test-spec.md` | `2e9f067c` Smoke Tests | Complete |
| Hello-Test Edge Function | (pipeline test) | `4b9c9ef6` Hello-Test | Complete |
| Goals & Focus Areas | `2026-02-27-goals-and-focus-areas-design.md` | `2a4f892c` Goals & Focus Areas | Complete |
| Telegram Ideas Bot | `2026-02-25-ideas-pipeline-unified-design.md` | `59b8d9e5` Telegram Bot | Failed (73x) |
| Skills Distribution | (no design doc) | `84e5c68a` Skills Distribution CLI | Failed (46x) |
| Idea Visualiser | `archive/2026-02-25-idea-visualiser-proposal.md` | `33f9e3c1` Idea Visualiser | Failed |
| Bootstrap Parity | (no design doc) | `d1c730fb` Bootstrap Parity | Failed |
| Terminal Notifications | (no design doc) | `d78a3b06` Terminal Notifications | Failed (53x) |
| Standalone Dispatch | `2026-02-25-contractor-dispatch-routing-plan.md` | `aacd243b` Standalone Dispatch | Failed |
| Query Idea Status | (no design doc) | `3c6b11f8` query-idea-status | Failed (45x) |
| Static Health Dashboard | (no design doc) | `1d1f2974` Health Dashboard | Failed |

---

## BUILT Systems — No Pipeline Feature (built manually by Tom)

These were shipped outside the pipeline — committed directly to master. No feature record exists.

| System | Doc(s) | Evidence |
|--------|--------|----------|
| Skill Sync & Distribution | `2026-02-28-skills-manifest.md` | `syncWorkspaceSkills()` in executor.ts, skills.ts in packages/cli |
| Pipeline Technician Role | `2026-02-25-contractor-dispatch-routing-plan.md` | `pipeline-technician` in contractor dispatch, `execute_sql` MCP tool |
| Contractor Dispatch (core) | `2026-02-25-contractor-dispatch-routing-plan.md` | `request_work` edge function, `request_standalone_work()` postgres function |
| Pipeline Snapshot Cache | `2026-02-27-pipeline-snapshot-cache-proposal.md` | `pipeline_snapshots` table, `refresh_pipeline_snapshot()`, edge function |
| Daemon Slot Reconciliation | (commit `aef4fe4`) | `reconcileSlots()` in executor.ts, 60s timer |
| Zombie Job Guards | (commit `7595703`) | Four-layer terminal feature guard in orchestrator |
| Edge Function Autodeploy | `2026-02-25-edge-function-autodeploy.md` | GitHub Actions workflow (partial — CI/CD HEAD~1 bug exists) |
| MCP Access Control | `2026-02-22-mcp-access-control-design.md` | `mcp_tools` column on roles table, tool filtering in agent-mcp-server |
| Exec Personality System | `2026-02-20-exec-personality-system-design.md` | `prompt` column on roles table, personality injection in assembleContext |
| Build Pipeline (core) | `2026-02-22-build-pipeline-design.md` | Orchestrator, daemon, job dispatch — the whole system |
| Persistent Agents | `2026-02-20-persistent-agent-bootstrap-design.md` | Workspace creation, session management in executor.ts |
| Prompt Freshness Hook | `2026-02-22-prompt-freshness-hook-design.md` | Pre-commit hook checking role prompt staleness |
| Multi-company Support | `2026-02-20-multi-company-pipeline-design.md` | `company_id` on all tables, RLS policies |

These 13 systems represent significant shipped work with no pipeline tracking. They're part of the foundation but invisible in the dashboard.

---

## PARTIALLY BUILT — Design Exists, Implementation Incomplete

| System | Doc | What exists | What's missing |
|--------|-----|-------------|----------------|
| Triggers & Events | `2026-02-22-triggers-and-events-design.md` | Basic events table, machine heartbeat | Cron scheduler, event-driven wakeup, emergency stop |
| Product Intelligence Pipeline | `2026-02-20-product-intelligence-pipeline-design.md` | Roles in DB (migration 012) | No skills, no prompts, no dispatch — empty shells |
| Interactive Jobs / Remote Control | `2026-02-27-interactive-jobs-remote-control-design.md` | TUI mode (migration 063), wait_for_human job type | Full interactive collaboration flow |
| Slack Approval Flow | `2026-02-22-slack-integration-design.md` | Slack bot, message sending | Two P0 bugs: status mismatch + machineId null (approval has NEVER worked) |
| Edge Function Autodeploy | `2026-02-25-edge-function-autodeploy.md` | GitHub Actions workflow | HEAD~1 bug means 4/5 functions missed on multi-file commits |
| Bidirectional Messaging | `2026-02-25-ideas-pipeline-unified-design.md` | Slack sending works | No unified inbound processing, no Telegram→pipeline flow |

---

## NOT BUILT — Design Only

These have detailed design docs but no implementation. Idea records created in inbox.

| System | Doc | Idea ID | Priority |
|--------|-----|---------|----------|
| Exec Knowledge Architecture (canons/doctrines) | `2026-02-22-exec-knowledge-architecture-v5.md` | `52e47cb3` | High |
| Strategy Sim (Civ-style interface) | `2026-02-25-strategy-sim-proposal.md` | `4aa07b29` | Low |
| Product Intelligence Pipeline (full) | `2026-02-20-product-intelligence-pipeline-design.md` | `c73e2bae` | Medium |
| Triggers & Events (full system) | `2026-02-22-triggers-and-events-design.md` | `ccf3b50e` | High |
| Interactive Jobs / Remote Control | `2026-02-27-interactive-jobs-remote-control-design.md` | `8fcb1501` | Medium |
| Pi Agent Harness | `2026-02-27-pi-agent-harness-strategic-assessment.md` | `8ce640fc` | Low |

---

## Superseded / Archive-Worthy

These docs are outdated, superseded by newer designs, or describe abandoned approaches.

| Doc | Reason |
|-----|--------|
| `archive/2026-02-25-idea-visualiser-proposal.md` | Superseded by Getting a Grip proposal |
| `archive/2026-02-22-exec-knowledge-v1-v4.md` (multiple) | Superseded by v5 |
| `archive/2026-02-20-*-v1.md` (early drafts) | Superseded by final versions |
| `2026-02-24-pipeline-smoke-test-spec.md` | Feature shipped and complete |
| Various `-investigation.md` files | Research artifacts, not actionable designs |

---

## Untracked Pipeline Features (no design doc)

These features exist in the pipeline but have no corresponding design document.

| Feature | Status | Notes |
|---------|--------|-------|
| `541b36db` Graceful Daemon Shutdown | Created (unspecced) | Needs design doc before spec |
| `3486da81` Fix CI/CD autodeploy | Created (unspecced) | Bug fix, may not need full design |
| `23a2352e` Role Launch Order | Created (unspecced) | Needs design doc |
| `ee345f5d` Bidirectional Messaging | Created (unspecced) | Partial design in ideas-pipeline doc |
| `5fc009e2` Build Pipeline: Test & Ship | Created (unspecced) | The deploy/test/ship phase |
| `403c7a87` Scheduler, Hooks & Triggers | Created (unspecced) | Overlaps with triggers-and-events design |
| `f2806c36` Event Queue & Wake | Created (unspecced) | Core infra, overlaps with triggers design |
| `991a062c` Persistent Agent Identity | Created (unspecced) | Needs design doc |
| `61411262` Web UI: Pipeline Visibility | Created (unspecced) | Overlaps with Getting a Grip visualiser |
| `2249831b` Pipeline Smoke Test | Created (unspecced) | Duplicate of completed `2e9f067c`? |

---

## Key Findings

1. **13 significant systems were built outside the pipeline** with no feature tracking. This is invisible work — it doesn't show up on the dashboard, can't be measured, and the patterns that built it can't be replicated for a beta user.

2. **6 detailed designs remain unbuilt.** Of these, Exec Knowledge Architecture and Triggers & Events are the most strategically important — they underpin the "autonomous organisation" focus area.

3. **8 features have failed 45+ times each.** Telegram Bot (73x), Terminal Notifications (53x), Skills Distribution (46x), Query Idea Status (45x). These are chronic failures consuming pipeline capacity. Recommend: park or delete the ones that aren't Goal 1 critical.

4. **10 features are created but unspecced.** Several overlap with existing designs (Scheduler/Hooks ↔ Triggers & Events, Web UI ↔ Getting a Grip visualiser). Recommend: deduplicate before speccing.

5. **The archive/ directory works** — 15 files properly archived. But the main docs/plans/ has 66 files with no organisation beyond date prefixes. At current velocity this becomes unnavigable within weeks.

---

## Recommendations

1. **Chronic failures:** Park Telegram Bot, Terminal Notifications, Skills Distribution CLI, Query Idea Status. None serve Goal 1. Free up mental overhead.

2. **Duplicate features:** Merge Pipeline Smoke Test (`2249831b`) into completed `2e9f067c`. Merge Scheduler/Hooks (`403c7a87`) with Event Queue (`f2806c36`) — they're the same system. Merge Web UI (`61411262`) into Getting a Grip visualiser scope.

3. **Priority for Goal 1:** The NOT BUILT systems that matter most for April 1 are Triggers & Events (heartbeat/cron = exec autonomy) and the pipeline intake funnel (Getting a Grip Phase 5). Knowledge Architecture is important but not April 1 critical.

4. **Filing system:** See separate proposal — `docs/plans/` needs subdirectories or status-based organisation before it hits 100+ files.
