# Inbox Redesign: Typed Items + Horizon-Based Parking

**Date:** 2026-03-05
**Status:** Draft
**Author:** Tom + Claude

---

## Summary

Rename the pipeline "Ideas" column to "Inbox". Introduce four item types (idea, brief, bug, test) with visual tag chips. Replace the single parking lot with two horizon-based sub-sections within the same column. No new columns on the board.

---

## Motivation

The current "Ideas" column conflates different kinds of incoming work. A bug report, a design brief, and a speculative feature idea all look the same. Meanwhile, the single "Parked" accordion mixes things you should review next week with someday/maybe items.

**Goals:**
1. Distinguish item types visually so you can scan the inbox at a glance
2. Enable filtering by type (e.g. "show me just bugs")
3. Separate parked items by review cadence without adding board columns

---

## Design

### 1. Item Types

Four types, stored as `item_type` on the `ideas` table:

| Type | Color | Use Case | Default Priority |
|------|-------|----------|-----------------|
| `idea` | Amber (existing `--col-ideas`) | Speculative feature, raw thought | medium |
| `brief` | Blue (`--info`) | Directed ask — design asset, copy, research deliverable | medium |
| `bug` | Red (`--negative`) | Defect report | high |
| `test` | Purple (new `--col-test`) | Manual test request, verification need | medium |

**Rendering:** Small colored chip on each card showing the type label. e.g. `[bug]` in red.

**Constraints:** `item_type` defaults to `idea` (backwards-compatible with all existing rows). Check constraint: `idea | brief | bug | test`.

### 2. Horizon-Based Parking

New `horizon` column on `ideas` table:

| Horizon | Label in UI | Review Cadence |
|---------|-------------|---------------|
| `soon` | "Review Soon" | Weekly-ish |
| `later` | "Long Term" | Monthly / someday |
| `NULL` | (active inbox items) | N/A — not parked |

**Rendering:** The existing "Parked" accordion splits into two collapsible sub-sections:
- **Review Soon** (horizon = `soon`) — shown first, expanded by default when opened
- **Long Term** (horizon = `later`) — collapsed by default

Items get a horizon when their status is set to `parked`. Default: `soon`. Can be changed via update-idea.

### 3. Column Rename

Pipeline.tsx: "Ideas" column header becomes "Inbox". The `--col-ideas` CSS variable stays (internal naming doesn't matter). The header stat in the page bar changes from "Ideas" to "Inbox".

### 4. Dashboard Submission

The idea bar at the bottom of Dashboard.tsx gets a small type selector (four buttons or a dropdown) before the send button. Default: `idea`. The placeholder text changes from "Share an idea you'd love to see built..." to "Share an idea, report a bug, brief a task..." or similar.

### 5. Type Filter Tabs

Inside the Inbox column (not in the global filter bar), add small tabs: `All | Ideas | Briefs | Bugs | Tests`. These filter the inbox items by `item_type`. The global filter bar (all/mine/urgent/stale) continues to work orthogonally.

---

## Implementation Plan

### Phase 1: Data Layer

**Migration 116** — `inbox_item_type_and_horizon.sql`

```sql
-- Add item_type column with backwards-compatible default
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'idea';

-- Add horizon column for parking granularity
ALTER TABLE public.ideas ADD COLUMN IF NOT EXISTS horizon TEXT;

-- Check constraints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_item_type_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_item_type_check
      CHECK (item_type = ANY (ARRAY['idea','brief','bug','test']));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ideas_horizon_check') THEN
    ALTER TABLE public.ideas ADD CONSTRAINT ideas_horizon_check
      CHECK (horizon IS NULL OR horizon = ANY (ARRAY['soon','later']));
  END IF;
END $$;

-- Index for filtered queries
CREATE INDEX IF NOT EXISTS idx_ideas_company_item_type ON public.ideas (company_id, item_type);
```

**Estimated effort:** Small — single migration file.

### Phase 2: Edge Functions

**create-idea** — Accept `item_type` in request body, default to `'idea'` if not provided.

**update-idea** — Accept `item_type` and `horizon` in request body. When status changes to `parked` and no horizon is provided, default horizon to `'soon'`.

**query-ideas** — Accept optional `item_type` and `horizon` filters. Add `.eq()` clauses when provided.

**No new edge functions needed.**

**Estimated effort:** Small — ~5 lines per function.

### Phase 3: WebUI Queries

`packages/webui/src/lib/queries.ts`:

1. Add `item_type` and `horizon` to the `Idea` interface
2. Update `fetchIdeas` to accept optional `item_type` filter and pass it to query-ideas
3. Update `submitIdea` to accept `item_type` and pass it to create-idea

### Phase 4: Pipeline.tsx UI

1. **Column header:** "Ideas" → "Inbox"
2. **Page stat:** "Ideas" → "Inbox"
3. **Type chips:** Add colored `[type]` badge to each idea card
4. **Type filter tabs:** Add `All | Ideas | Briefs | Bugs | Tests` row below the column header
5. **Split parked section:** Replace single "Parked (N)" accordion with:
   - "Review Soon (N)" — items where status=parked, horizon=soon
   - "Long Term (N)" — items where status=parked, horizon=later
6. **Fetch parked by horizon:** Two calls (or one call with post-filter) to separate soon vs later

### Phase 5: Dashboard.tsx Submission

1. Add type selector (four small buttons: Idea / Brief / Bug / Test) to the idea bar
2. Track selected type in state, default to `'idea'`
3. Pass `item_type` to `submitIdea`
4. Update placeholder text

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/116_inbox_item_type_and_horizon.sql` | New migration |
| `supabase/functions/create-idea/index.ts` | Accept `item_type` |
| `supabase/functions/update-idea/index.ts` | Accept `item_type`, `horizon`; auto-set horizon on park |
| `supabase/functions/query-ideas/index.ts` | Accept `item_type`, `horizon` filters |
| `packages/webui/src/lib/queries.ts` | Extend `Idea` interface, update fetch/submit |
| `packages/webui/src/pages/Pipeline.tsx` | Rename column, add type chips, type tabs, split parking |
| `packages/webui/src/pages/Dashboard.tsx` | Type selector on submission bar |
| `packages/webui/src/global.css` | Type chip styles, `--col-test` token, tab styles |

---

## What This Does NOT Do

- **No new pipeline columns.** Parking stays inside the Inbox column.
- **No workflow divergence by type.** All four types follow the same triage → promote/park/reject flow. Type-specific routing (e.g. bugs skip design) is a future concern.
- **No changes to CPO/agent triage logic.** Agents can set `item_type` via create-idea/update-idea but triage behaviour is unchanged.
- **No changes to promote-idea.** Promotion is type-agnostic.

---

## Open Questions

1. **Should the Dashboard also show a mini inbox preview?** Currently it just has the submission bar. Could add a "Recent inbox items" card. (Probably a separate piece of work.)
2. **Should horizon auto-clear when an item is un-parked?** Leaning yes — if status moves back to `triaged` or `new`, set horizon to NULL.
3. **Brief sub-fields?** Briefs might eventually want structured fields (deliverable type, deadline, assignee). Park this for now — the `description` field and `tags` array handle it.
