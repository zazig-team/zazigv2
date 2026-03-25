# Goal Progress Auto-Updating

**Date:** 2026-03-10
**Type:** Internal Proposal
**Authors:** Tom Weaver, Claude

---

## Problem

**Today:** Goals on the dashboard all show 0% progress because there is no `progress` column on the `goals` table. The dashboard falls back to `goal.progress ?? 0` — a hardcoded zero. The only way to update a goal's progress would be manual DB writes, which nobody does.

**Which is a problem, because:** The entire strategic layer of the dashboard is decorative. Goals exist, they have titles and horizons and targets, but there's no signal about whether any of them are actually advancing. A human looking at the dashboard sees eight goals at 0% and learns nothing. The goal layer is supposed to answer "are we making progress on what matters?" — right now it can't.

**What if?:** Goal progress updated automatically based on the work flowing through the pipeline. When features linked to a focus area complete, the goals tied to that focus area tick upward. The dashboard becomes a live readout of strategic progress without anyone manually entering percentages.

---

## Hypothesis

Goal progress can be reliably derived from feature completion rates across linked focus areas. The chain Goal → Focus Area → Feature already exists in the schema (via `focus_area_goals` and `feature_focus_areas` junction tables). If we compute the ratio of completed features to total features for each goal's linked focus areas, that ratio is a meaningful — if imperfect — proxy for goal progress.

---

## Therefore

Add a computed `progress` field to goals, derived from the completion state of features linked through focus areas, recalculated whenever the pipeline snapshot refreshes.

---

## How this would work

### Data model

The relationship chain already exists:

```
Goal ←[focus_area_goals]→ Focus Area ←[feature_focus_areas]→ Feature
```

A goal can link to multiple focus areas, and each focus area can link to multiple features. The progress formula for a single goal:

```
progress = (completed features across all linked focus areas) / (total features across all linked focus areas) × 100
```

Where:
- **Completed** = feature status `complete`
- **Total** = all features linked via the junction tables (excluding `cancelled`)

If a goal has zero linked features, progress = 0.

### Computation approach: Snapshot-time aggregation (recommended)

Rather than adding a mutable `progress` column to the `goals` table, compute progress inside `refresh_pipeline_snapshot()`. This keeps goals as a clean strategic layer with no derived state to go stale.

**Changes to `refresh_pipeline_snapshot()`:**

Add a `goal_progress` key to the snapshot JSONB:

```sql
'goal_progress', COALESCE((
  SELECT jsonb_object_agg(g.id, jsonb_build_object(
    'progress', CASE
      WHEN counts.total = 0 THEN 0
      ELSE ROUND((counts.completed::numeric / counts.total) * 100)
    END,
    'completed', counts.completed,
    'total', counts.total
  ))
  FROM public.goals g
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE f.status = 'complete') AS completed,
      COUNT(*) FILTER (WHERE f.status != 'cancelled') AS total
    FROM public.focus_area_goals fag
    JOIN public.feature_focus_areas ffa ON ffa.focus_area_id = fag.focus_area_id
    JOIN public.features f ON f.id = ffa.feature_id
    WHERE fag.goal_id = g.id
  ) counts ON true
  WHERE g.company_id = p_company_id
    AND g.status = 'active'
), '{}'::jsonb)
```

**WebUI changes:**

- `queries.ts` — parse `goal_progress` from snapshot, merge into goal objects
- `Dashboard.tsx` — progress bars now reflect real data (no code change needed, already reads `goal.progress`)
- `DashboardDetailPanel.tsx` — show "3 of 7 features complete" breakdown

### Why not a DB column?

- A `progress` column requires a trigger or cron to keep it fresh
- It creates a second source of truth that can drift
- The snapshot already refreshes on every orchestrator heartbeat (~30s)
- Computing at snapshot time means the dashboard always shows current state

### Edge cases

- **Goal with no focus areas:** progress = 0 (correct — no work linked)
- **Focus area with no features:** doesn't inflate or deflate the ratio (zero contribution)
- **All features cancelled:** total = 0, progress = 0
- **Goal marked `achieved` manually:** exclude from computation (already done via `WHERE g.status = 'active'`)

### Future refinement (not in this proposal)

- Weighted progress (focus areas contribute unevenly to goals)
- Metric-based progress (goals with specific KPI targets, not feature counts)
- CPO-driven qualitative overrides ("this is 80% despite only 3/10 features because the core ones shipped")

---

## We propose

Extend `refresh_pipeline_snapshot()` to compute goal progress from the existing Goal → Focus Area → Feature chain, and surface the computed progress in the dashboard snapshot. No new tables, no new columns, no new edge functions — just a SQL aggregation in the snapshot function and a frontend read from the snapshot payload.
