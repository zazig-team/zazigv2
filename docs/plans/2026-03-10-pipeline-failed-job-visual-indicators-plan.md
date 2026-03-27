# Pipeline Failed-Job Visual Indicators

**Date:** 2026-03-10
**Type:** Implementation Plan
**Authors:** Tom Weaver, Claude

---

## Goal

Features with failed jobs should be visually distinct in the pipeline — red left border on the card, visible at a glance without clicking. The data already exists: migration 119 added `has_failed_jobs` boolean to each feature object in the pipeline snapshot.

## Current State

- `refresh_pipeline_snapshot()` already computes `has_failed_jobs` per feature (EXISTS subquery on jobs table)
- Pipeline snapshot includes `failed_jobs_recent` array (last 24h, up to 20)
- Pipeline detail panel already has "Diagnose & Retry" section for failed features
- Feature cards in pipeline columns have no visual distinction for failure state

## Implementation

### 1. Pipeline card CSS (global.css)

Add a modifier class for failed features:

```css
.pipeline-card--failed {
  border-left: 3px solid var(--negative);
}
```

That's it. The `--negative` token already exists in `tokens.css` and maps to the red used for error states.

### 2. Pipeline column rendering (Pipeline.tsx)

When mapping features to cards, check `has_failed_jobs` and add the modifier class:

```tsx
className={`pipeline-card ${feature.has_failed_jobs ? 'pipeline-card--failed' : ''}`}
```

### 3. Dashboard pulse (optional, low priority)

If `failed_jobs_recent` has items, show a count badge in the dashboard pulse section. This is a nice-to-have — the pipeline page is the primary surface.

## Migration

None. The `has_failed_jobs` flag is already in the snapshot (migration 119). This is a frontend-only change.

## Files to modify

1. `packages/webui/src/global.css` — add `.pipeline-card--failed` class
2. `packages/webui/src/pages/Pipeline.tsx` — conditionally apply class based on `has_failed_jobs`

## Testing

- Verify a feature with a failed job shows red left border
- Verify a feature without failed jobs shows no border change
- Verify clicking a failed feature still opens the detail panel with Diagnose & Retry
