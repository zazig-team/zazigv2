# Dynamic Roadmap — From Static Tech Tree to Pipeline-Integrated Planning Tool

**Date:** 2026-03-07
**Status:** Draft — needs review
**Authors:** Tom, Claude
**Part of:** WebUI, Pipeline, Orchestrator

## Problem

We have a static roadmap (32 hardcoded nodes in `roadmap.html` and `Roadmap.tsx`) that visualises zazig's capability areas, their statuses, and dependency chains. It looks great but it's dead data — disconnected from the pipeline, manually maintained, and specific to our instance.

Three problems to solve:

1. **Pipeline integration** — roadmap nodes represent real work but don't connect to the pipeline. You can't click a roadmap node and see its features/jobs, and pipeline features don't roll up to roadmap capabilities.
2. **Dependency tracking** — the pipeline has no concept of "X is blocked until Y ships". Jobs have `depends_on` but features don't. Without this, roadmap items in the pipeline are just cards with no build order.
3. **Generalisation** — for future users, the roadmap can't be 32 hardcoded zazig-specific nodes. It needs to be a dynamic tool that any team can populate with their own capability map.

## Context

### What exists today

| Layer | What | Dependency support |
|-------|------|-------------------|
| Projects | `projects` table — 2 rows (zazigv2, Test Co Website) | None |
| Features | `features` table — pipeline statuses, jobs roll up | None |
| Jobs | `jobs` table — individual work units | `depends_on` UUID array, DAG dispatch |
| Ideas | `ideas` table — inbox items (idea/brief/bug/test) | None |
| Roadmap | Static HTML/React — 32 hardcoded nodes | Hardcoded `deps`/`unlocks` arrays |

### Why not projects?

Initial instinct was to map roadmap nodes 1:1 to projects. But our two existing projects are "zazigv2" and "Test Co Website" — these are *products*, not capabilities. All 32 roadmap nodes live *inside* zazigv2. Projects are the wrong granularity.

### Proposed direction: new idea type

Roadmap nodes enter the system as a new idea type alongside idea/brief/bug/test. Working name: **"initiative"** or **"capability"**. They flow through the same inbox/triage process but carry dependency metadata and decompose into multiple features over time.

This keeps a single entry point (inbox) and a single pipeline, but adds a higher-order grouping that features can belong to.

---

## Open Questions — Need to Resolve Together

### Q1: Dependency model for features

Jobs already have `depends_on` UUID arrays with DAG dispatch. Do we:

- **A) Add `depends_on` to features too?** Same pattern as jobs. Orchestrator checks feature deps before allowing breakdown. Simple, consistent.
- **B) Inherit deps from the parent initiative?** Initiative X depends on Initiative Y, so all features in X are implicitly blocked until Y is shipped. Simpler for users but coarser.
- **C) Both?** Initiative-level deps for the big picture, feature-level deps for fine-grained ordering within an initiative.

**Implications:** If features have `depends_on`, the orchestrator needs to check feature deps before promoting to `ready_for_breakdown`. The pipeline board may need to visualise blocked features differently (greyed out? locked icon?).

### Q2: Accuracy of current roadmap

The 32 nodes were written by Claude based on codebase analysis. Before we push any of these into the pipeline, we need to validate:

| Node | Status | Progress | Accurate? | Notes |
|------|--------|----------|-----------|-------|
| Personality | shipped | 85% | ? | |
| Memory P1 | active | 35% | ? | |
| Doctrines | draft | 15% | ? | |
| Memory P2 | locked | 0% | ? | |
| Canons | locked | 0% | ? | |
| Auto-Spec | locked | 0% | ? | |
| Roles & Prompts | shipped | 100% | ? | |
| Persistent Identity | active | 60% | ? | |
| Bootstrap Parity | locked | 0% | ? | |
| Future Roles | locked | 0% | ? | |
| Data Model | shipped | 100% | ? | |
| Orchestrator | shipped | 100% | ? | |
| Deep Heartbeat | active | 45% | ? | |
| Triggers & Events | active | 25% | ? | |
| Auto-Greenlight | locked | 0% | ? | |
| Pipeline Engine | shipped | 100% | ? | |
| Contractors | shipped | 100% | ? | |
| Verification | shipped | 80% | ? | |
| Monitoring Agent | locked | 0% | ? | |
| Product Intelligence | locked | 0% | ? | |
| CLI & Agent | shipped | 100% | ? | |
| Terminal CPO | shipped | 90% | ? | |
| Gateway (Slack) | active | 40% | ? | |
| Interactive Jobs | draft | 5% | ? | |
| Multi-Channel | locked | 0% | ? | |
| WebUI | active | 55% | ? | |
| Model Flexibility | draft | 10% | ? | |
| Roles Marketplace | locked | 0% | ? | |
| Local Models | locked | 0% | ? | |
| Goals & Focus | shipped | 70% | ? | |
| Health Scoring | draft | 10% | ? | |
| Strategy Sim | locked | 0% | ? | |

Questions per node:
- Is the status right? (shipped/active/draft/locked)
- Is the progress % roughly right?
- Are the dependencies correct? (what blocks what)
- Should any nodes be split, merged, or removed?
- Are there missing nodes?

### Q3: Phasing — what's actually next?

The "Build Next" section currently shows items whose deps are all shipped/active. But "technically unblocked" != "strategically next". We need to confirm:

- What are the actual next 3-5 priorities?
- Does the dependency graph reflect real build order, or are some deps soft (nice-to-have, not hard blockers)?
- Are there nodes that are unblocked but deliberately parked?

### Q4: How this becomes generative for future users

For zazig's own roadmap, we can seed the 32 nodes manually. But for a future user signing up to zazig.com, they need to be able to:

1. **Describe what they're building** — product pitch, existing codebase, goals
2. **Get a generated roadmap** — CPO analyses the input and proposes capability nodes with dependencies
3. **Refine interactively** — add/remove/reorder nodes, adjust deps
4. **Push to pipeline** — approved nodes become initiatives in the inbox, flow through triage

This is the "Strategy Sim" endgame node on the current roadmap. But the intermediate step is simpler:

- **Manual creation** — user adds initiative-type items to inbox with deps (v1)
- **CPO-assisted** — CPO proposes initiatives from a product brief (v2)
- **Fully generative** — CPO maintains and updates the roadmap as work ships (v3)

### Q5: Visualisation

When initiatives live in the pipeline:

- Does the roadmap page read from the DB and render dynamically?
- Does the pipeline board show initiatives differently from regular features? (different card style? separate swim lane? collapsible group headers?)
- Can you toggle between "roadmap view" (tech tree) and "pipeline view" (kanban) of the same data?

---

## Decisions Needed

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | New idea type name | initiative, capability, milestone, epic | TBD |
| 2 | Feature dependency model | A (feature-level), B (initiative-level), C (both) | TBD |
| 3 | Roadmap data source | DB-driven, hardcoded, hybrid | DB-driven (v2) |
| 4 | Roadmap ↔ pipeline view | Separate pages, toggle, unified | TBD |
| 5 | Generative roadmap timeline | v1 manual, v2 CPO-assisted, v3 auto | Incremental |

## Next Steps

1. Tom reviews the 32-node accuracy table above
2. Discuss dependency model and naming
3. Design schema changes (initiative type, feature depends_on)
4. Implement DB-driven roadmap (replace hardcoded nodes)
5. Build generative roadmap flow for new users
