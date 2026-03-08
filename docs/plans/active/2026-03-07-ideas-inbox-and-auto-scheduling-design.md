# Ideas Inbox & Auto-Scheduling: Unified Pipeline Feed

**Date:** 2026-03-07
**Status:** Draft
**Authors:** Tom, Claude
**Part of:** WebUI, Pipeline, Orchestrator, MCP
**Supersedes:** `archived/2026-02-25-ideas-inbox-proposal.md` (schema retained, lifecycle extended), `active/2026-03-03-auto-scheduling-design.md` (auto-greenlight obsoleted, auto-spec retained)

## Problem

Migration 111 collapsed `created`/`ready_for_breakdown`/`breakdown` into `breaking_down`. Features now auto-enter breakdown the moment they're created. This is good for throughput but removes the holding state that let humans review work before it entered the pipeline.

Three consequences:

1. **No proposal gate.** The pipeline's Proposal column is permanently empty — nothing maps to it. Features go straight to breakdown.
2. **Auto-greenlight is obsolete.** The auto-scheduling design assumed `created` existed for mechanical promotion. It doesn't anymore — features already auto-break-down.
3. **Ideas need a view.** The pipeline board has an Inbox column but it's cramped — cards are narrow, context is minimal, and the inbox mixes with the execution board in a way that makes neither great.

## Decisions

| # | Decision | Answer | Reasoning |
|---|----------|--------|-----------|
| 1 | Where is the gate? | **Idea-to-feature promotion** | Features auto-break-down. The gate moves upstream to when an idea becomes a feature. |
| 2 | Workshop status | **Add `workshop` to ideas** | Deep-dive stage before promotion. Complex items get specced thoroughly; simple items skip it. |
| 3 | Auto-greenlight | **Deleted** | Redundant — features already auto-enter breakdown. No `created` status to promote from. |
| 4 | Auto-spec | **Retained, adapted** | CPO heartbeat picks up triaged ideas, specs them, promotes when ready. The key autonomous behavior. |
| 5 | Pipeline Proposal column | **Removed from pipeline board** | Nothing maps to it. Features start at `breaking_down`. |
| 6 | Ideas visibility | **Two views: pipeline Inbox column + dedicated Ideas page** | Pipeline board keeps Inbox/Triage for end-to-end flow visibility. Ideas page gives breathing room for inbox management. Same data, two lenses. |
| 7 | Ideas page design | **Dedicated page, roadmap-inspired compact nodes** | Ideas are transient (flow through) but use the same compact node visual language as the roadmap for glanceability. |
| 8 | Node icons | **Contextual emoji icons on every node** | Same pattern as roadmap capability icons. CPO assigns during triage; untriaged ideas get a type-based default. |

---

## Lifecycle

### Ideas flow (updated)

```
new --> triaged --> workshop --> promoted (creates feature as breaking_down)
          |            |
          |            +--> promoted (skip workshop for simple items)
          |
          +--> parked --> triaged (resurfaced)
          |
          +--> rejected
```

### New status: `workshop`

| Status | Meaning | Who sets it | What happens |
|--------|---------|-------------|--------------|
| `new` | Raw input, untouched | Anyone (on create) | Appears in inbox |
| `triaged` | CPO assessed, enriched with summary/scope/priority | CPO or human | Ready for promote/workshop/park/reject |
| `workshop` | Deep-dive in progress. CPO + human (or CPO + second opinion) spec it out. | CPO or human | Visible on Ideas page workshop section. Not yet a feature. |
| `promoted` | Graduated to pipeline | CPO or human | Feature created as `breaking_down`. Idea keeps `promoted_to_feature_id` ref. |
| `parked` | Not now, maybe later | CPO or human | Periodic review pool |
| `rejected` | Explicitly not doing this | CPO or human | Terminal. Preserved for context. |

### Workshop is optional, not mandatory

CPO's self-assessment checklist (from autonomy plan) determines which path:
- High complexity / high risk / touches multiple systems --> workshop
- Low complexity / clear scope / isolated --> straight triaged --> promoted
- Bugs and quick fixes --> can skip workshop entirely

### Migration

Add `workshop` to the ideas status constraint, and add `icon` column:

```sql
ALTER TABLE public.ideas DROP CONSTRAINT IF EXISTS ideas_status_check;
ALTER TABLE public.ideas ADD CONSTRAINT ideas_status_check
  CHECK (status = ANY (ARRAY['new','triaged','workshop','parked','rejected','promoted','done']));

ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS icon text;
```

The `icon` column stores a single emoji assigned by CPO during triage. Nullable — untriaged ideas use a type-based default in the UI.

---

## Auto-Scheduling (adapted)

### What's deleted: Auto-greenlight

The original auto-greenlight (`created` --> `ready_for_breakdown`) is obsolete. Features auto-enter breakdown already. No code needed.

### What's retained: Auto-spec

CPO heartbeat picks up triaged ideas and specs them autonomously. Adapted for the new lifecycle:

```
function maybeAutoSpec():
  if not company.auto_scheduling_enabled: return
  if not pipelineHealthy(): return
  if capacity.active > 1: return  -- only when pipeline is quiet

  candidates = ideas
    .where(status = 'triaged')
    .where(autonomy = 'exec-can-run')
    .where('needs-clarification' NOT IN flags)
    .where(priority IN ('high', 'medium'))
    .orderBy(priority DESC, created_at ASC)
    .limit(1)

  if no candidates: return

  -- Promote directly to feature (enters breaking_down immediately)
  promote_idea(candidate.id, promote_to = 'feature')
  notify("Auto-specced and promoted: {candidate.title}")
```

Key change from original: auto-spec now promotes directly (no intermediate `created` state). The gate is the triage assessment — if CPO marked it `exec-can-run`, it's ready.

### Safety layers (retained from original)

1. **Global toggle** — `auto_scheduling_enabled` boolean on companies table. Dashboard toggle. Default: off.
2. **Health gate** — stuck features, failed features, active progress, unmerged PRs. All must pass.
3. **Candidate filtering** — only `exec-can-run` autonomy, not flagged `needs-clarification`, medium+ priority.

### Three-category autonomy (from CPO autonomous execution plan)

| Category | Ideas behavior |
|----------|---------------|
| PROCEED | Triage simple ideas silently |
| INFORM & PROCEED | Promote workshop-complete ideas, notify human |
| PAUSE & ASK | Anything the checklist flags — wait for human |

---

## Two Views

### View 1: Pipeline board (existing, minor changes)

The pipeline board keeps its Inbox and Triage columns at the left. These show ideas in `new` and `triaged` status respectively, rendered as compact cards. This preserves the end-to-end flow feeling: something arrives in Inbox, gets triaged, gets promoted, appears as a feature in Breakdown, flows through to Complete.

**Changes:**
- Remove Proposal column from `COLUMN_DEFINITIONS` (nothing maps to it)
- Inbox/Triage columns continue working as-is (already implemented)

### View 2: Ideas page (new)

A dedicated page accessible from the nav bar. Uses compact nodes (same visual language as roadmap) in a wrapped grid layout. Glanceable — you scan by icon + accent color + title, not by reading descriptions.

**Layout:** Flow bar (lifecycle summary) at top, then four sections of compact nodes: Workshop, Triaged, Inbox (new), Parked (collapsible). Each idea has a contextual emoji icon assigned by CPO during triage.

**What it shows that the pipeline column can't:**
- All ideas at once in a scannable grid (not a single narrow column)
- Lifecycle context via the flow bar
- Workshop ideas distinguished visually (larger nodes, tags visible)
- Parked ideas dimmed and collapsible
- Type filtering across all sections

**Realtime:** Subscribe to `ideas` table changes. Live updates as CPO triages.

**Navigation:** Nav bar gets an "Ideas" link between Pipeline and Roadmap.

See full design in the "Ideas Page Design" section below.

---

## Pipeline Column Update

Remove the Proposal column. The pipeline board columns become:

```typescript
const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  // Proposal removed — nothing maps to it since migration 111
  { key: "ready", label: "Ready", colorVar: "--col-ready" },
  { key: "breaking_down", label: "Breakdown", colorVar: "--col-breakdown" },
  { key: "building", label: "Building", colorVar: "--col-building" },
  { key: "combining_and_pr", label: "Combining", colorVar: "--col-combining" },
  { key: "verifying", label: "Verifying", colorVar: "--col-verifying" },
  { key: "pr_ready", label: "PR Ready", colorVar: "--col-pr" },
  { key: "complete", label: "Complete", colorVar: "--col-complete" },
  { key: "failed", label: "Failed", colorVar: "--col-failed" },
  { key: "shipped", label: "Shipped", colorVar: "--col-shipped" },
];
```

The Inbox and Triage columns (which render ideas, not features) stay as-is on the pipeline board.

---

## Ideas Page Design

Design principle: **glanceable, not text-heavy.** Uses the same compact node visual language as the roadmap — you should be able to scan 30+ ideas without feeling overwhelmed. Each idea is a small tile you recognise by its icon and accent color, not a card you have to read.

Mockup: `packages/webui/public/ideas-mockup.html`

### Page header

Same pattern as Roadmap and Pipeline pages:
- Title: "Ideas"
- Stats: New (count), Triaged (count), Workshop (count), Parked (count)
- Type tabs: All / Ideas / Briefs / Bugs / Tests

### Flow bar

Horizontal lifecycle summary at top of page, showing the pipeline stages with counts:

```
Inbox 18 > Triaged 11 > Workshop 0 > Pipeline    Parked 8
```

Clickable stages for filtering. Dimmed stages when count is 0. Parked floats right, separated from the main flow.

### Node anatomy

Every idea renders as a compact node (roadmap-inspired):

**Standard node** (200x56px):
- 3px left accent strip (amber=idea, blue=brief, red=bug, purple=test)
- Contextual emoji icon (assigned by CPO during triage, or type-based default)
- Title (single line, truncated with ellipsis)
- Meta row: type chip, priority dot, source label, age

**Workshop node** (260x72px) — slightly larger:
- Same anatomy plus tags as tiny chips below meta
- Title can wrap to 2 lines

**Parked node** (180x46px) — smaller, dimmed (55% opacity):
- Same anatomy, reduced font sizes
- Fades up on hover

### Icon assignment

CPO assigns a contextual emoji icon during triage, choosing something that captures the idea's domain at a glance (same pattern as roadmap capability icons). Default icons for untriaged ideas:

| item_type | Default icon |
|-----------|-------------|
| idea | lightbulb |
| brief | clipboard |
| bug | bug |
| test | flask |

### Sections

Nodes flow as a wrapped grid within each section:

1. **Workshop** — `workshop` status ideas. Larger nodes with tags visible.
2. **Triaged** — `triaged` status ideas. Standard nodes.
3. **Inbox** — `new` status ideas. Standard nodes.
4. **Parked** (collapsible) — `parked` status ideas, split by horizon:
   - Review Soon (horizon = 'soon')
   - Long Term (horizon = 'later')
   - Dimmed, smaller nodes

### Detail panel

Clicking any node opens the existing `IdeaDetailPanel` (already built). Node gets a highlight border while panel is open.

---

## Nav Update

Add "Ideas" to the nav bar between Pipeline and Roadmap:

```
Dashboard | Pipeline | Ideas | Roadmap | Team
```

---

## Implementation Phases

### Phase 1: Ideas page + pipeline cleanup

1. Migration: add `workshop` to ideas status constraint, add `icon` column
2. Create `Ideas.tsx` page with compact node grid (workshop/triaged/inbox/parked sections)
3. Add flow bar (lifecycle summary) and type filter tabs
4. Add route and nav link
5. Remove Proposal column from pipeline `COLUMN_DEFINITIONS`
6. Realtime subscription on ideas table

### Phase 2: Auto-scheduling toggle

1. Add `auto_scheduling_enabled` to companies table
2. Dashboard toggle UI
3. Health check function in orchestrator
4. Auto-spec in CPO heartbeat (requires heartbeat system)

### Phase 3: Workshop flow

1. MCP tool: `workshop_idea` (moves triaged --> workshop)
2. CPO workshop behavior (deep-dive on workshop ideas, produce spec draft)
3. Promote from workshop creates feature with pre-written spec

---

## Companion Docs

- Ideas inbox (original): `docs/plans/archived/2026-02-25-ideas-inbox-proposal.md`
- Auto-scheduling (original): `docs/plans/active/2026-03-03-auto-scheduling-design.md`
- CPO autonomy: `docs/plans/archived/2026-02-26-cpo-autonomous-execution-plan.md`
- Dynamic roadmap: `docs/plans/active/2026-03-07-dynamic-roadmap-design.md`
- Pipeline design: `docs/plans/active/2026-02-24-idea-to-job-pipeline-design.md`
