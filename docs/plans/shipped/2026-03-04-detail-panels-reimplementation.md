# Detail Panels Reimplementation Plan

**Date:** 2026-03-04
**Status:** Ready to implement
**Context:** These panels were built against a now-reverted version of `queries.ts`. They need reimplementing against Chris's current `queries.ts` (which uses direct Supabase queries, not edge functions). The component designs are solid — it's just the data layer that needs writing.

---

## Components to Reimplement

### 1. FormattedProse (utility — no data dependency)

**File:** `packages/webui/src/components/FormattedProse.tsx`
**Status:** Can be restored as-is — has zero external dependencies.
**What it does:** Renders text with basic formatting — numbered lists, bullet lists, newline preservation.

### 2. FeatureDetailPanel

**File:** `packages/webui/src/components/FeatureDetailPanel.tsx`
**Props:** `{ featureId: string; colorVar: string; onClose: () => void }`

**Data needed (add to `queries.ts`):**

```typescript
export interface FeatureDetail {
  id: string;
  title: string;
  status: string;
  priority: string;
  description: string | null;
  spec: string | null;
  acceptanceTests: string | null;
  branch: string | null;
  prUrl: string | null;
  createdBy: string | null;
  verificationType: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceIdea: {
    title: string | null;
    rawText: string;
    promotedAt: string | null;
  } | null;
  jobs: Array<{
    id: string;
    title: string;
    status: string;
    role: string;
    model: string | null;
  }>;
}

export async function fetchFeatureDetail(featureId: string): Promise<FeatureDetail> {
  // Query: supabase.from("features").select(...).eq("id", featureId).single()
  // Join: ideas table via features.source_idea_id (if column exists) or ideas.promoted_feature_id
  // Join: jobs table via jobs.feature_id
  // Map to FeatureDetail shape
}
```

**Panel sections:**
- Header: color dot, title, status badge, close button
- Metadata table: ID, priority (with colored dot), branch, created by, created/updated/completed dates, verification type
- Source Idea: title/rawText, promoted date (if linked)
- Description: rendered via FormattedProse
- Jobs list: dot (color by status), title, status badge, role tag, model tag
- Spec: preformatted text
- Acceptance Tests: preformatted text
- PR Link: external link to GitHub

**Escape key closes panel. Backdrop click closes panel.**

### 3. IdeaDetailPanel

**File:** `packages/webui/src/components/IdeaDetailPanel.tsx`
**Props:** `{ ideaId: string; colorVar: string; onClose: () => void }`

**Data needed (add to `queries.ts`):**

```typescript
export interface IdeaDetail {
  id: string;
  title: string | null;
  rawText: string;
  status: string;
  priority: string;
  description: string | null;
  originator: string | null;
  source: string | null;
  sourceRef: string | null;
  tags: string[];
  clarificationNotes: string | null;
  promotedAt: string | null;
  createdAt: string;
  updatedAt: string;
  promotedFeature: {
    id: string;
    title: string;
    status: string;
  } | null;
}

export async function fetchIdeaDetail(ideaId: string): Promise<IdeaDetail> {
  // Query: supabase.from("ideas").select(...).eq("id", ideaId).single()
  // Join: features table if idea has promoted_feature_id
  // Map to IdeaDetail shape
}
```

**Panel sections:**
- Header: color dot, title (fallback to rawText), status badge, close button
- Metadata table: ID, priority (with colored dot), originator, source (+sourceRef), created/updated dates
- Tags: rendered as tag chips
- Raw Idea: rendered via FormattedProse
- Description: rendered via FormattedProse (only if different from rawText)
- Clarification Notes: rendered via FormattedProse
- Promoted To: feature title, status badge, promoted date

### 4. DashboardDetailPanel

**File:** `packages/webui/src/components/DashboardDetailPanel.tsx`
**Props:** Union type — either `{ type: "goal"; goal: Goal; color: string; onClose }` or `{ type: "focusArea"; focusArea: FocusArea; onClose }`

**Data needed:** None new — uses existing `Goal` and `FocusArea` types already in `queries.ts`. Data is passed in as props (no fetch needed).

**Goal panel sections:**
- Header: color dot, title, close button
- Metadata: status, time horizon, progress %, target date
- Description, Metric, Measurable Target (each via FormattedProse)

**Focus Area panel sections:**
- Header: title, health badge (on_track/behind/waiting), close button
- Metadata: status, health, domain tags
- Description via FormattedProse
- Linked Goals list: dot (color by status), title, time horizon tag, target tag

---

## CSS Classes Used

All panels share these CSS classes (need to be in `global.css`):

```
.detail-backdrop       — full-screen overlay behind panel
.detail-panel          — the slide-in panel itself
.detail-loading        — loading state
.detail-error          — error state
.detail-header         — panel header row
.detail-title          — h2 title
.detail-close          — close button
.detail-body           — scrollable content area
.detail-meta-table     — key-value metadata table
.detail-meta-label     — left column (label)
.detail-meta-value     — right column (value)
.detail-section        — collapsible section wrapper
.detail-section-title  — h3 section header
.detail-prose          — text content area
.detail-prose--pre     — preformatted variant
.detail-badge          — status badge (neutral)
.detail-badge--positive — green
.detail-badge--negative — red
.detail-badge--active   — amber/active
.detail-badge--caution  — yellow/warning
.detail-priority-dot   — small colored dot for priority
.detail-tag            — tag chip
.detail-tags-list      — flex container for tags
.detail-jobs           — job list container
.detail-job-row        — single job row
.detail-job-dot        — status dot for job
.detail-job-title      — job title text
.detail-job-tags       — flex container for job badges
.detail-source-idea    — source idea card
.detail-source-idea-title — idea title
.detail-source-idea-meta  — idea metadata
.detail-pr-link        — styled link to PR
```

---

## Implementation Order

1. **FormattedProse** — drop in as-is, zero changes needed
2. **DashboardDetailPanel** — no new queries needed, just uses existing types
3. **Add `fetchFeatureDetail` + `fetchIdeaDetail` to `queries.ts`** — direct Supabase queries matching Chris's existing pattern
4. **FeatureDetailPanel** — wire up to new query
5. **IdeaDetailPanel** — wire up to new query
6. **CSS** — add detail panel classes to `global.css`
7. **Wire into pages** — add click handlers to Pipeline.tsx cards and Dashboard.tsx items to open panels

## Supabase Columns Needed

Verify these columns exist before writing queries:
- `features`: id, title, status, priority, description, spec, acceptance_tests, branch, pr_url, created_by, verification_type, created_at, updated_at, completed_at
- `ideas`: id, title, raw_text, status, priority, description, originator, source, source_ref, tags, clarification_notes, promoted_at, promoted_feature_id, created_at, updated_at
- `jobs`: id, title, status, role, model, feature_id
