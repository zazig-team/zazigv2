# Job Detail Inline Expand

**Date:** 2026-03-13
**Status:** Approved
**Origin:** Idea 6da93a30 (session conversation)

## Problem

Clicking into a feature's detail panel shows jobs as minimal rows: dot, title, status/role/model. There's no way to see what machine a job is running on, how far along it is, or what the agent is actually doing. All the data exists in the DB — it's just not surfaced.

## Solution

Inline-expandable job rows in FeatureDetailPanel. Click a job → row expands to show a status card and a log viewer. Click again to collapse. One job expanded at a time.

## Interaction

- Click job row → expands below with status card + log viewer
- Click again or chevron → collapses
- Only one job expanded at a time (clicking another collapses the previous)

## Status Card

Compact key-value layout showing:

| Field | Source | Notes |
|-------|--------|-------|
| Machine | `jobs.machine_id` → `machines.name` | e.g. "toms-macbook" |
| Slot type | `jobs.slot_type` | "claude_code" or "codex" |
| Model | `jobs.model` | e.g. "claude-sonnet-4-6" |
| Progress | `jobs.progress` | 0-100 bar, only for active jobs |
| Elapsed | `jobs.started_at` | Calculate from now, or total if completed |
| Branch | `jobs.branch` | Link to GitHub if present |
| Status | `jobs.status` | Badge, same style as feature status badges |
| Blocked | `jobs.blocked_reason` | Only shown if non-null |

For completed/failed jobs, also show:
- `completed_at` (total duration = completed_at - started_at)
- `result` summary (first ~200 chars, expandable)

## Log Viewer

Two-stream tab toggle below the status card:

- **Lifecycle** (default) — key events: dispatched, started, reviewing, blocked, complete/failed
- **Tmux** — raw agent output from tmux pipe-pane capture

Behaviour:
- Show last ~100 lines, scrollable, newest at bottom
- For active jobs (`executing`, `running`, `in_progress`): poll every 5 seconds for new log content
- For completed/failed jobs: single fetch, no polling
- Stop polling when row is collapsed
- Monospace font, dark background, pre-formatted text

## Backend Changes

### 1. New edge function: `query-job-detail`

**Path:** `supabase/functions/query-job-detail/index.ts`

**Input:** `{ job_id: string }`

**Query:**
```sql
SELECT
  j.id, j.title, j.status, j.role, j.model, j.job_type,
  j.slot_type, j.progress, j.started_at, j.completed_at,
  j.branch, j.blocked_reason, j.result, j.machine_id,
  m.name AS machine_name
FROM jobs j
LEFT JOIN machines m ON m.id = j.machine_id
WHERE j.id = $1
  AND j.company_id = $2
```

**Returns:** Single job object with machine name joined.

### 2. New edge function: `query-job-logs`

**Path:** `supabase/functions/query-job-logs/index.ts`

**Input:** `{ job_id: string, type: 'lifecycle' | 'tmux' }`

**Query:**
```sql
SELECT content, updated_at
FROM job_logs
WHERE job_id = $1 AND type = $2
```

**Returns:** `{ content: string, updated_at: string }`

Content is the full appended log text. Frontend truncates to last ~100 lines for display.

## Frontend Changes

### 1. `FeatureDetailPanel.tsx`

- Add `expandedJobId` state (string | null)
- Make job rows clickable — toggle expandedJobId
- Render `<JobDetailExpand>` below the expanded row

### 2. New component: `JobDetailExpand.tsx`

Props: `{ jobId: string, onCollapse: () => void }`

Sections:
- Status card (key-value table, same styling as feature detail meta table)
- Progress bar (only for active jobs)
- Log viewer with tab toggle

### 3. New query functions in `queries.ts`

```typescript
async function fetchJobDetail(jobId: string): Promise<JobDetail>
async function fetchJobLogs(jobId: string, type: 'lifecycle' | 'tmux'): Promise<{ content: string; updatedAt: string }>
```

### 4. Log viewer styling

- Monospace, `font-size: 0.75rem`
- Dark background (`var(--surface-sunken)` or similar)
- Max height ~200px with overflow scroll
- Auto-scroll to bottom on new content (only if already scrolled to bottom)

## Realtime / Polling

- Active jobs: poll `query-job-detail` every 10s (progress, status), poll `query-job-logs` every 5s
- Completed/failed: single fetch on expand, no polling
- Collapse → clear all intervals

## Scope Boundaries

**In scope:**
- Inline expand with status card + log viewer
- Two new edge functions
- New frontend component + queries

**Out of scope (future):**
- Dependency graph visualization
- Prompt stack viewer
- Acceptance criteria display
- Realtime subscriptions (polling is sufficient for now)

## Acceptance Tests

1. Click a completed job → expands showing machine name, model, elapsed time, green progress bar at 100%, result summary
2. Click an executing job → expands showing machine, model, live progress bar, lifecycle log updating every 5s
3. Toggle between Lifecycle and Tmux log tabs → correct content shown
4. Click same job again → collapses
5. Click a different job while one is expanded → previous collapses, new one expands
6. Blocked job shows blocked_reason field
7. Failed job shows result/error summary
8. Log viewer auto-scrolls on new content when already at bottom
9. Polling stops when job row is collapsed
