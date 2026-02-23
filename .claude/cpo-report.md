STATUS: COMPLETE
CARD: 699b906c5c4cb4af3dea67c4
FILES: dashboard/index.html, supabase/functions/orchestrator/index.ts, supabase/migrations/019_add_title_to_jobs.sql

---

# CPO Report — Dashboard Card Redesign (Trello-style)

## Summary
Redesigned the pipeline dashboard from noisy data dumps to clean, Trello-style scannable cards with click-to-expand progressive disclosure. Added title generation for jobs via Claude Haiku API.

## What Was Done

### 1. Migration (019_add_title_to_jobs.sql)
- Added `title VARCHAR(120)` column to `jobs` table
- `features` table already had a `title` column from 003_multi_tenant_schema.sql — no change needed

### 2. Orchestrator Title Generation
- Added `generateTitle()` function that calls Claude Haiku (`claude-haiku-4-5-20251001`) to generate 3-8 word human-readable titles from job context
- Strips UUIDs from context before sending to LLM, limits to 500 chars
- Uses `ANTHROPIC_API_KEY` from environment (Doppler `zazig/prd`)
- Integrated at both job creation points: `triggerFeatureVerification()` and `handleFeatureRejected()`
- Graceful fallback: returns empty string if API key missing or call fails

### 3. Dashboard Redesign
**Card face (compact):**
- Shows feature title (using `feature.title` column, fallback to spec first line, then "Untitled feature")
- Job titles use `job.title` column, fallback to parsed context type, then truncated context
- Meta line shows job progress count ("3/5 done") and active job count
- No raw UUIDs or JSON visible on board view

**Progress bar:**
- ONLY shown when a job is actively in `executing` or `reviewing` status
- Hidden for queued, dispatched, waiting, complete, failed, and all other statuses
- Animated shimmer effect on active bars

**Click-to-expand detail panel:**
- Side panel (replaces old bottom sheet) with 480px width
- Feature detail view: title, status, branch, timestamps, job list, spec, acceptance tests
- Job detail view: title, status, model, progress, timestamps, context (pretty-printed JSON), raw log
- Navigation: click job in feature detail → job detail with back button
- Live polling (5s) for active jobs; frozen for terminal states

**Standalone jobs:**
- Separate query for `feature_id IS NULL` jobs
- Mapped to board columns by job status (executing→Building, reviewing→Verifying, etc.)
- Rendered as top-level cards with "standalone" badge
- Clickable to open job detail

**Kanban layout preserved:** Design → Building → Testing → Verifying → Done

## Files Changed
1. `supabase/migrations/019_add_title_to_jobs.sql` — New migration adding title column to jobs
2. `supabase/functions/orchestrator/index.ts` — Added `ANTHROPIC_API_KEY` env var, `generateTitle()` function, title generation at job creation
3. `dashboard/index.html` — Complete card redesign: compact Trello-style cards, click-to-expand side panel, standalone jobs support, progress bar only for active jobs

## Migration Number
019

## Manual Test Steps

**Before (old behavior):**
- Cards showed raw UUIDs or first 50 chars of JSON context as labels
- Job rows showed truncated `{"type":"feature_verification",...}` noise
- Everything visible at once — no progressive disclosure
- Progress bars shown for queued/dispatched jobs (not yet working)
- No standalone jobs visible

**After (new behavior):**
1. Open dashboard — cards show clean titles with job count meta ("3/5 done")
2. Progress bars ONLY appear on cards with executing/reviewing jobs (animated shimmer)
3. Queued/completed cards have NO progress bar
4. Click any feature card → side panel opens showing metadata + job list + spec
5. Click a job row in the detail panel → switches to job detail with log, context, timestamps
6. Click "← Back" to return to feature detail
7. Standalone jobs (no feature) appear in relevant columns with "standalone" badge
8. Press Escape or click backdrop to close detail panel
9. No raw UUIDs or JSON visible anywhere on the board

## Token Usage
- Token budget: claude-ok (wrote code directly)
