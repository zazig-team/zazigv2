# Dashboard Intake Pipeline Extension

**Date:** 2026-03-01
**Status:** Implemented (2026-03-01)
**Author:** CPO
**Pipeline:** idea:522bafcc (Getting a Grip)
**Focus Area:** Visibility, The Full Loop
**Parent:** `active/2026-03-01-getting-a-grip-proposal.md` (Phase 4)

---

## Problem

**Today:** The pipeline dashboard (`dashboard/index.html`) shows 8 columns covering the build pipeline — Ready through Complete/Failed. It fetches from the `features` table only. The entire intake funnel (ideas → triage → spec writing) is invisible. A solopreneur submitting an idea has no way to see what's happening with it until it hits Ready.

**Which is a problem, because:** The "holy shit moment" for Goal 1 is "I told my CPO about a problem and my team built it." If the user can't see anything happening between "I said something" and "it appeared in Ready," the loop feels broken. They're blind to 50% of the pipeline — the part where their input becomes a plan.

**What if?** The dashboard showed the full lifecycle from raw idea through to shipped feature. A solopreneur opens the dashboard and sees their idea in TRIAGE with a CPO recommendation, watches it move to PROPOSAL as the spec gets written, and then into the build pipeline. The whole loop is visible.

## Hypothesis

Extending the existing dashboard with three intake columns (IDEAS, TRIAGE, PROPOSAL) and a PARKED section will close the visibility gap that makes the product feel like a black box. The architecture already supports this — ideas and features live in Supabase, the dashboard already queries Supabase REST, and the rendering pattern (columns → cards → detail panel) scales to new data types.

## Therefore

Add intake pipeline visibility to the existing dashboard: three new columns for the pre-pipeline stages, a collapsed parking lot section, and a visual divider separating intake from build.

---

## How This Would Work

### Architecture: What Stays, What Changes

The existing dashboard is a single 1,442-line vanilla HTML/CSS/JS file. No framework, no build step, no dependencies beyond `@supabase/supabase-js` from CDN. Deployed on Vercel.

**What stays unchanged:**
- All 8 existing pipeline columns (Ready → Complete/Failed)
- Feature card rendering, detail panel, job drill-down
- Company switcher, 30-second polling, responsive layout
- Supabase anonymous JWT auth pattern

**What gets added:**
- 3 new columns to the left of Ready
- 1 new data fetch (`ideas` table)
- 1 new card renderer (idea cards, different shape from feature cards)
- 1 new detail view (idea detail, parallel to feature detail)
- 1 collapsed PARKED section below the board
- Visual divider between intake and pipeline sections
- New CSS variables for intake column colours

### Column Definitions

The `COLUMNS` array (currently line 793 of `index.html`) gets prepended with intake stages. A new `INTAKE_COLUMNS` array keeps them structurally separate:

```javascript
// Intake funnel: ideas → triage → proposal (pre-pipeline)
const INTAKE_COLUMNS = [
  { key: 'new',      label: 'Ideas',    color: '#64748b', source: 'ideas'   },
  { key: 'triaged',  label: 'Triage',   color: '#f59e0b', source: 'ideas'   },
  { key: 'created',  label: 'Proposal', color: '#a855f7', source: 'features'},
];

// Build pipeline: ready → complete (existing, unchanged)
const PIPELINE_COLUMNS = [
  { key: 'ready_for_breakdown', label: 'Ready',     color: '#9b59b6' },
  { key: 'breakdown',           label: 'Breakdown', color: '#8e44ad' },
  { key: 'building',            label: 'Building',  color: '#e8a838' },
  { key: 'combining',           label: 'Combining', color: '#e67e22' },
  { key: 'verifying',           label: 'Verifying', color: '#28b5d4' },
  { key: 'pr_ready',            label: 'PR Ready',  color: '#2980b9' },
  { key: 'complete',            label: 'Complete',  color: '#3cbf6e' },
  { key: 'failed',              label: 'Failed',    color: '#e74c3c' },
];
```

The `source` field on intake columns tells the renderer which dataset to pull from — `ideas` or `features`. PROPOSAL uses the `features` table (status `created` means promoted but not yet specced/ready).

### Colour Rationale

- **Ideas (#64748b, slate):** Raw, unprocessed. Muted to signal "waiting."
- **Triage (#f59e0b, amber):** Needs human attention. Warm = action required.
- **Proposal (#a855f7, violet):** Being worked on. Purple bridges to Ready's existing purple.
- **Existing pipeline:** Untouched.

### Data Fetching

**New fetch — ideas:**

```
GET /rest/v1/ideas
  ?select=id,title,description,status,priority,tags,triage_notes,
          suggested_exec,clarification_notes,originator,flags,
          created_at,updated_at
  &status=in.(new,triaged,parked)
  &company_id=eq.{companyId}
  &order=priority.desc,created_at.desc
```

This returns all non-terminal ideas. The response gets split client-side:
- `status = 'new'` → IDEAS column
- `status = 'triaged'` → TRIAGE column
- `status = 'parked'` → PARKED section

**Modified fetch — features:**

The existing features fetch already returns `status = 'created'` features, but they currently get dropped (no column matches). No fetch change needed — just route `created` status features into the PROPOSAL column instead of discarding them.

**Polling:** Same 30-second interval. Both fetches run in parallel on each tick.

### Card Rendering: Idea Cards

Idea cards are visually distinct from feature cards. Smaller, simpler — no progress bar, no job counts.

```
┌─────────────────────────┐
│▌ Cache-TTL for agents   │  ← title
│  🔴 high · 2d ago       │  ← priority badge + age
│  promote                 │  ← recommendation tag (triage only)
└─────────────────────────┘
```

**Priority badges:**
- `urgent` → red dot
- `high` → orange dot
- `medium` → yellow dot (or omit — it's the default)
- `low` → grey dot

**Recommendation tag (TRIAGE column only):**
Shown in `triage_notes` or derived from the idea's state. Three values: `promote`, `park`, `reject`. Colour-coded: green, grey, red.

**Age display:**
Relative time from `created_at`. "2h ago", "3d ago", "2w ago". Stale items (>7 days in IDEAS) get a subtle warning highlight.

### Card Rendering: Proposal Cards

PROPOSAL cards use the existing `renderCard()` function. Features with `status = 'created'` render exactly like other feature cards, but with a "speccing" badge where the job count would normally be.

### Detail Panel: Idea View

Clicking an idea card opens the detail panel (reusing the existing overlay). New content renderer for ideas:

**Metadata block:**
- ID, Originator, Priority, Suggested exec
- Created, Updated
- Tags (as inline badges)

**Description block:**
- Full description text

**Triage block** (if status = triaged):
- Triage notes (CPO recommendation + rationale)
- Clarification notes (if any)

**Flags block** (if flags present):
- Flag list

**No action buttons in v1.** Approval actions (Promote/Park/Reject) are a future addition requiring edge function calls from the browser. For now, the dashboard is read-only for ideas — actions happen through the CPO conversation.

### PARKED Section

Below the main board, a collapsible section:

```
┌─────────────────────────────────────────────────────────┐
│ ▸ Parked (12)                                           │  ← collapsed default
└─────────────────────────────────────────────────────────┘
```

Click to expand:

```
┌─────────────────────────────────────────────────────────┐
│ ▾ Parked (12)                                           │
│                                                         │
│ This week (3)                                           │
│ ┌───────┐ ┌───────┐ ┌───────┐                          │
│ │ card  │ │ card  │ │ card  │                          │
│ └───────┘ └───────┘ └───────┘                          │
│                                                         │
│ This month (5)                                          │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐    │
│ │ card  │ │ card  │ │ card  │ │ card  │ │ card  │    │
│ └───────┘ └───────┘ └───────┘ └───────┘ └───────┘    │
│                                                         │
│ ⚠ Stale — over 90 days (4)                              │
│ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐               │
│ │ card  │ │ card  │ │ card  │ │ card  │               │
│ └───────┘ └───────┘ └───────┘ └───────┘               │
└─────────────────────────────────────────────────────────┘
```

Parked cards are displayed horizontally (flex-wrap) rather than vertically like pipeline columns. They use the same idea card renderer. Stale items (>90 days since `updated_at`) get a red left border.

### Visual Divider

Between the PROPOSAL column and the READY column, a vertical separator:

```css
.intake-divider {
  width: 2px;
  background: var(--border);
  margin: 0 4px;
  position: relative;
}
.intake-divider::after {
  content: '›';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--text-dim);
  font-size: 1.2rem;
}
```

This visually communicates "intake feeds into pipeline" without being heavy-handed.

### Board Layout Change

The `renderBoard()` function (currently line 1054) needs restructuring:

1. Render intake columns (from `INTAKE_COLUMNS`, using ideas + created features)
2. Render divider
3. Render pipeline columns (from `PIPELINE_COLUMNS`, using features — existing logic)
4. Render PARKED section below the board

### Responsive Behaviour

On mobile (<900px), intake columns stack above pipeline columns. The divider becomes a horizontal rule. PARKED section stays at the bottom.

### Strategy Tab (Stretch — Not in v1)

A future addition. A separate tab/view showing:
- 3 goals, ordered by time horizon (near/medium/long)
- 5 focus areas, linked to goals
- Coverage map: which focus areas have active features vs gaps
- Stale items flagged

Data sources: `goals` and `focus_areas` tables via Supabase REST. Both already have edge functions deployed. This is Phase 4.5 — spec separately when the columns are working.

---

## Scope Summary

**In scope (v1):**
- 3 new intake columns: IDEAS, TRIAGE, PROPOSAL
- Ideas data fetch from Supabase REST
- Idea card renderer (priority badge, age, recommendation tag)
- Idea detail panel (metadata, description, triage notes)
- PROPOSAL column routing `created` features
- PARKED collapsed section with age grouping and staleness highlighting
- Visual divider between intake and pipeline
- CSS variables for new column colours

**Out of scope (future):**
- Approval action buttons (Promote/Park/Reject)
- Strategy tab (goals, focus areas, coverage map)
- Simplified "founder view" (Thinking → Building → Done)
- Real-time Supabase subscriptions (currently polling)
- Notification badges / toast alerts

## Estimated Effort

This is ~200-300 lines of additions to a well-structured 1,442-line file. The patterns are established — new columns follow the same `renderColumn` / `renderCard` structure. The main new work is the idea card renderer and idea detail panel.

A senior engineer should ship this in one session. Complexity: **medium**.

---

## We Propose

Extend `dashboard/index.html` with three intake columns (IDEAS, TRIAGE, PROPOSAL), a collapsed PARKED section, and a visual divider — making the full idea-to-shipped lifecycle visible on a single board. Read-only in v1; approval actions come later.

---

## Implementation Complete Report (2026-03-01)

### Outcome

The dashboard intake extension has been implemented in `dashboard/index.html` and wired into the current ideas/feature lifecycle described in the parent proposal (`active/2026-03-01-getting-a-grip-proposal.md`).

### What Was Shipped

- Added intake stage model with separate `INTAKE_COLUMNS` and `PIPELINE_COLUMNS`.
- Added intake-to-pipeline visual divider and responsive mobile behavior.
- Added idea card renderer with:
  - priority dot (`urgent/high/medium/low`)
  - relative age (`m/h/d/w/mo ago`)
  - triage recommendation badge (`promote/park/reject`) in TRIAGE
  - stale highlight for IDEAS items older than 7 days
- Routed `features.status = created` into PROPOSAL and rendered proposal cards with a `speccing` badge.
- Added PARKED section below the main board:
  - collapsed by default
  - grouped into `This week`, `This month`, `Older`, and `⚠ Stale — over 90 days`
  - stale parked ideas receive strong red-left-border styling
- Added idea detail panel view (read-only, no actions):
  - metadata (ID, originator, priority, suggested exec, created/updated, tags)
  - description
  - triage notes + clarification notes when triaged
  - flags block
- Preserved existing build pipeline columns and feature/job detail behavior.

### Important Implementation Adjustment

The original v1 spec assumed direct `GET /rest/v1/ideas` reads. In the current codebase/runtime model, ideas access is function-mediated for reliable multi-tenant visibility.

Implemented approach:

- Dashboard now fetches ideas via `POST /functions/v1/query-ideas` (status-scoped calls for `new`, `triaged`, `parked`), then merges and sorts client-side by priority and recency.
- `query-ideas` was updated to support:
  - `company_id` filtering
  - optional `statuses` array
  - deterministic `created_at desc` ordering

This aligns dashboard behavior with the actual idea intake flow used by CPO tools (`create_idea`, `query_ideas`, `update_idea`, `promote_idea`) and the master proposal’s IDEAS→TRIAGE→PROPOSAL lifecycle.

### Files Changed

- `dashboard/index.html`
- `supabase/functions/query-ideas/index.ts`

### Verification Performed

- JavaScript syntax check on dashboard inline script (`node --check`) passed.
- Type/runtime check for edge function (`deno check supabase/functions/query-ideas/index.ts`) passed.

### Remaining Operational Step

- Deploy updated `query-ideas` edge function so `company_id` + `statuses` filtering is active in the hosted environment.

### Scope Confirmation

Delivered in v1 scope:

- IDEAS, TRIAGE, PROPOSAL columns
- PARKED collapsed section with staleness grouping
- read-only idea detail view
- visual divider between intake and build pipeline

Still out of scope (unchanged from spec):

- Promote/Park/Reject action buttons in dashboard
- Strategy tab
- founder simplified mode
- realtime subscriptions
- notification toasts/badges
