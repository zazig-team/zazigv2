# Dynamic Roadmap — From Static Tech Tree to Pipeline-Integrated Planning Tool

**Date:** 2026-03-07
**Status:** Approved
**Authors:** Tom, Claude
**Part of:** WebUI, Pipeline, Orchestrator, MCP

## Problem

We have a static roadmap (32 hardcoded nodes in `roadmap.html` and `Roadmap.tsx`) that visualises zazig's capability areas, their statuses, and dependency chains. It looks great but it's dead data — disconnected from the pipeline, manually maintained, and specific to our instance.

Three problems to solve:

1. **Pipeline integration** — roadmap nodes represent real work but don't connect to the pipeline. You can't click a roadmap node and see its features/jobs, and pipeline features don't roll up to roadmap capabilities.
2. **Dependency tracking** — the pipeline has no concept of "X is blocked until Y ships". Without this, roadmap items are just cards with no build order.
3. **Generalisation** — for future users, the roadmap can't be 32 hardcoded zazig-specific nodes. It needs to be a dynamic tool that any team can populate with their own capability map.

---

## Decisions

| # | Decision | Answer | Reasoning |
|---|----------|--------|-----------|
| 1 | Name | **Capability** | Maps naturally to the tech tree — you ship capabilities, they unlock others. |
| 2 | Dependency model | **Capability-level only** | Coarse but sufficient. Jobs handle micro-level deps within features. Feature-level deps can be added later if needed. |
| 3 | Storage | **Dedicated `capabilities` table** | Capabilities aren't ideas — they're deliberate planning, not inbox items to triage. Separate from ideas and projects. |
| 4 | Lanes | **Configurable per-company** via `capability_lanes` table | Not a hardcoded enum. Each company defines their own lanes based on their architecture. |
| 5 | Creation/editing | **CPO-owned via MCP** | Roadmap page is read-only for humans. CPO creates, edits, reorders capabilities. Users approve/reject. Prevents humans manually shuffling strategic items the CPO is sequencing. |
| 6 | Pipeline relationship | **Capabilities don't appear on pipeline board** | Two zoom levels: roadmap for strategy, pipeline for execution. Features carry a `capability_id` badge. Roadmap detail panel shows linked features with pipeline status. |
| 7 | Visualisation | **Tech tree stays, reads from DB** | Same layout/UX, just backed by live data instead of constants. |
| 8 | WIP/focus strategy | **Archetype-driven** (design principle, not v1) | CPO personality determines focus style — conservative CPO = hard WIP limits, aggressive CPO = max parallelism. Behaviour emerges from archetype, not explicit configuration. |
| 9 | Generative roadmap | **Emergent, not onboarding** | CPO proposes capabilities when patterns crystallise from product research. Not a one-shot "generate your roadmap" wizard. |
| 10 | Accuracy maintenance | **Scheduled auditor** | Monitoring Agent or dedicated contractor scans codebase against active capabilities daily, proposes progress updates to CPO. |

---

## Schema

### New table: `capability_lanes`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| company_id | uuid | FK → companies, NOT NULL |
| name | text | "Agent Brain", "Infrastructure", etc. |
| sort_order | int | Display ordering on roadmap |
| created_at | timestamptz | default now() |

### New table: `capabilities`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| company_id | uuid | FK → companies, NOT NULL |
| lane_id | uuid | FK → capability_lanes, NOT NULL |
| title | text | "Memory P1", "Deep Heartbeat", NOT NULL |
| icon | text | Emoji, NOT NULL |
| status | text | CHECK: shipped / active / draft / locked |
| progress | int | 0-100, default 0 |
| depends_on | uuid[] | Array of capability IDs, default '{}' |
| sort_order | int | Column position within lane |
| details | text | Markdown description (shown in detail panel) |
| tooltip | text | Short summary for hover |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now(), trigger on update |

### Existing table change: `features`

| Column | Type | Notes |
|--------|------|-------|
| capability_id | uuid (nullable) | FK → capabilities. Null for features not linked to a capability. |

### RLS

- `capability_lanes`: authenticated users read own company, service_role full access
- `capabilities`: same pattern
- Realtime publication on both tables

---

## MCP Tools (CPO-scoped)

| Tool | Purpose |
|------|---------|
| `create_capability` | Create a new capability (with lane, deps, details) |
| `update_capability` | Update status, progress, details, deps, sort_order |
| `delete_capability` | Remove a capability |
| `create_capability_lane` | Create a new lane |
| `update_capability_lane` | Rename or reorder a lane |
| `query_capabilities` | Read capabilities with feature counts per status |

CLI gets the same tools via the existing MCP server. WebUI is view-only.

---

## Roadmap Page (DB-driven)

### Data flow

1. Page loads → fetch `capability_lanes` (ordered by `sort_order`) and `capabilities` (with feature counts) for the active company
2. Compute layout from lane/sort_order (replaces hardcoded `lane`/`col` positions)
3. Compute "Build Next" from `depends_on` + status (same logic, just from DB)
4. SVG connections, hover highlighting, detail panel — all unchanged, just reading from DB instead of constants

### Detail panel upgrade

Currently shows hardcoded markdown. DB-driven version shows `details` markdown **plus** a live "Features" section listing linked features with their pipeline status. Click a feature → opens the feature detail panel (same one the pipeline board uses).

### Pipeline feature cards

Features with a `capability_id` show a small capability badge (icon + short title) on their pipeline card. Allows tracing from execution back to strategy.

### Realtime

Subscribe to `capabilities` and `capability_lanes` — changes from CPO appear live on the roadmap page.

---

## Audited Capability Map (2026-03-07)

7 subagents audited all 32 nodes against the codebase, migrations, and design docs. Tom approved the findings.

### Agent Brain

| Node | Status | Progress | Key Finding |
|------|--------|----------|-------------|
| Personality | shipped | 90% | Full injection pipeline works. Evolution algorithm unbuilt but minor. |
| Memory P1 | active | 20% | `memories` table NOT deployed. Design doc complete, zero implementation. |
| Doctrines | draft | 5% | Design doc approved, zero implementation. |
| Memory P2 | locked | 0% | Accurate. Blocked by Memory P1. |
| Canons | locked | 0% | Accurate. Blocked by Doctrines. |
| Auto-Spec | locked | 0% | Accurate. Blocked by Canons + Auto-Greenlight. |

### Agent Identity

| Node | Status | Progress | Key Finding |
|------|--------|----------|-------------|
| Roles & Prompts | shipped | 95% | All 7 roles with prompts, skills, MCP tools. |
| Persistent Identity | active | 75% | Role-agnostic executor works. subAgentPrompt gap. |
| Bootstrap Parity | parked | 5% | Feature branch exists, never merged. Proposal archived. |
| Future Roles | locked | 0% | Accurate. Blocked by Bootstrap Parity. |

### Infrastructure

| Node | Status | Progress | Key Finding |
|------|--------|----------|-------------|
| Data Model | shipped | 95% | 119 migrations, 17+ tables. No scheduled_jobs table. |
| Orchestrator | shipped | 85% | DAG dispatch works. Advanced features (ESTOP, hooks) only designed. Dispatch fencing (from retired Deep Heartbeat) folded in. |
| ~~Deep Heartbeat~~ | **retired** | — | Retired 2026-03-09. Local health hardening → Exec Autonomy. Dispatch fencing → Orchestrator. See `2026-03-09-deep-heartbeat-retirement.md`. |
| Triggers & Events | active | 15% | Events table exists. 7 subsystems designed, almost none built. |
| Auto-Greenlight | locked | 0% | Accurate. Only a proposal, not designed. |

### Pipeline

| Node | Status | Progress | Key Finding |
|------|--------|----------|-------------|
| Pipeline Engine | shipped | 95% | 8/8 tests pass. CPO context assembly not wired. |
| Contractors | shipped | 90% | Core pattern works. Market research contractor not deployed. |
| Verification | shipped | 75% | Active AC testing works. Entry Point C automation missing. |
| Monitoring Agent | locked | 5% | Role stub in DB, design complete. Blocked by triggers. |
| Product Intelligence | locked | 10% | Ideas table + inbox concept partially there. |

### Interface

| Node | Status | Progress | Key Finding |
|------|--------|----------|-------------|
| CLI & Agent | shipped | 95% | Core v1 complete. |
| Terminal CPO | shipped | 85% | Works. Slack inbound (Socket Mode) missing. |
| Gateway (Slack) | active | 50% | Outbound works. Socket Mode inbound missing. |
| Interactive Jobs | active | 35% | Executor + MCP foundation done. Orchestrator dispatch missing. |
| Multi-Channel | active | 10% | Telegram bot exists and is deployed. Discord absent. |

### Platform

| Node | Status | Progress | Key Finding |
|------|--------|----------|-------------|
| WebUI | active | 65% | Auth, pipeline, team, realtime, roadmap all working. |
| Model Flexibility | draft | 5% | Comprehensive design doc, zero implementation. |
| Roles Marketplace | locked | 0% | Accurate. |
| Local Models | locked | 0% | Accurate. |

### Strategy

| Node | Status | Progress | Key Finding |
|------|--------|----------|-------------|
| Goals & Focus | shipped | 65% | Tables + MCP tools + UI working. `health` column missing. |
| Health Scoring | draft | 25% | Manual v1 done, design solid. Missing `health` column blocker. |
| Strategy Sim | locked | 5% | Decisions table + edge function exist. |

### Current priorities (build order)

1. **Personality** — finish last 10%
2. **Exec Autonomy** — Phase 1 shipped (cache-TTL, HEARTBEAT.md, exec skills). Phase 2: local health hardening (compaction/permission detection). Absorbs retired Deep Heartbeat's local pieces.
3. **Memory P1** — deploy schema, bulletin injection, write path
4. **Persistent Identity** — merge Bootstrap Parity branch, wire subAgentPrompt
5. **Health Scoring** — add `health` column, automate v2

---

## Phased Implementation

### Phase 1 — DB-driven roadmap (read-only)

- Migrate `capability_lanes` + `capabilities` tables
- Add `capability_id` to features
- Seed current 32 nodes (with corrected progress from audit)
- Roadmap page reads from DB instead of hardcoded data
- Capability badge on pipeline feature cards
- Realtime subscriptions on both tables

### Phase 2 — CPO management via MCP

- MCP tools: `create_capability`, `update_capability`, `delete_capability`, `create_capability_lane`, `query_capabilities`
- CLI surface for same tools
- CPO proposes new capabilities, updates progress, reorders
- Human approves/rejects via WebUI or Slack

### Phase 3 — Automated accuracy

- Scheduled auditor (daily or on-demand) scans codebase against active capabilities
- Proposes progress updates to CPO
- CPO commits or adjusts
- Roadmap stays accurate without human maintenance

### Phase 4 — Generative roadmap for new users

- CPO proposes lanes + capabilities as product understanding emerges from research
- Human approves batches
- Chat-on-roadmap page (talk to CPO about strategic sequencing)
- WIP/focus behaviour driven by CPO archetype

---

## Design Principles

- **CPO owns the roadmap.** Humans view and approve. No direct editing.
- **MCP-first.** Every mutation goes through MCP tools. CLI and WebUI are surfaces, not sources of truth.
- **Capabilities are emergent.** They crystallise from product research, not from an onboarding wizard.
- **Two zoom levels.** Roadmap = strategy (capabilities). Pipeline = execution (features/jobs). Same data, different views.
- **Archetype-driven focus.** WIP limits, parallelism tolerance, and priority weighting emerge from CPO personality, not explicit configuration.
- **Accuracy is automated.** Agents audit the roadmap against reality. Humans validate, not maintain.

---

## Companion Docs

- Pipeline design: `docs/plans/active/2026-02-24-idea-to-job-pipeline-design.md`
- Personality system: `docs/plans/shipped/2026-02-20-exec-personality-system-design.md`
- Memory system: `docs/plans/active/2026-03-03-memory-system-design.md`
- Model flexibility: `docs/plans/active/2026-03-06-model-flexibility-design.md`
- Triggers & events: `docs/plans/active/2026-02-22-triggers-and-events-design.md`
- Knowledge architecture: `docs/plans/active/2026-02-22-exec-knowledge-architecture-v5.md`
