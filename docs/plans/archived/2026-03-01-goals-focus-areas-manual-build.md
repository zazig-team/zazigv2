# Goals & Focus Areas: Manual Build Plan

**Date:** 2026-03-01
**Status:** COMPLETE (2026-03-01)
**Context:** Feature `2a4f892c` failed 3x at test-deploy stage. All engineering jobs completed. Code exists on branch `feature/goals-focus-areas-data-model-mcp-tools-2a4f892c`. This plan extracts that work and applies it manually. All 8 steps done. Feature marked complete. First goals brainstorm session completed — 3 goals, 5 focus areas created.

**Source branch:** `origin/feature/goals-focus-areas-data-model-mcp-tools-2a4f892c`
**Design spec:** `docs/plans/2026-02-27-goals-and-focus-areas-design.md`

---

## What was built (on the branch)

| Component | Status | Notes |
|-----------|--------|-------|
| Migration: 4 tables + RLS + indexes | Complete | Numbered 069 on branch, conflicts with master's 069. Renumber to 083. |
| Edge function: create-goal | Complete | Standard pattern, company_id resolution via job_id |
| Edge function: query-goals | Complete | Single lookup + filtered list, status + time_horizon filters |
| Edge function: update-goal | Complete | Partial update, auto-sets achieved_at on status transition |
| Edge function: create-focus-area | Complete | Supports goal_ids linking at creation time |
| Edge function: query-focus-areas | Complete | include_goals option with junction table resolution |
| Edge function: update-focus-area | Complete | Manages both scalar fields AND junction table links (add/remove goals, add/remove features) |
| MCP wrappers: 6 tools | Complete | Standard guardedHandler pattern in agent-mcp-server.ts |

## Manual build progress (2026-03-01)

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | Run migration SQL in Supabase | **SKIPPED** | Tables already existed — pipeline agent applied migration during build phase before test-deploy failed |
| 2 | Save migration file to repo | **DONE** | Saved as `supabase/migrations/083_goals_and_focus_areas.sql` |
| 3 | Copy edge functions from branch | **DONE** | 6 function directories checked out from feature branch |
| 4 | Deploy edge functions to Supabase | **DONE** | All 6 deployed |
| 5 | Add MCP wrappers to agent-mcp-server.ts | **DONE** | Patch didn't apply cleanly (master diverged). CPO manually inserted 6 tool blocks before `main()` |
| 6 | Update CPO role mcp_tools | **DONE** | First attempt failed (no `company_id` on roles table). Corrected SQL: `WHERE name = 'cpo'` only |
| 7 | Rebuild local agent + restart session | **DONE** | Rebuilt and restarted |
| 8 | Verify tools work | **DONE** | All 6 tools pass: create_goal, query_goals, update_goal, create_focus_area, query_focus_areas, update_focus_area |

## What's deferred (vs the design spec)

| Component | Status | Notes |
|-----------|--------|-------|
| link_feature_to_focus_area (standalone tool) | Not needed | update-focus-area handles it via `add_feature_ids` |
| Pipeline snapshot integration | Deferred | Goals don't need to be in the snapshot yet |
| /set-goals brainstorm skill | Deferred | CPO can create goals conversationally without a dedicated skill |

---

## Step-by-step: What you need to run

### Step 1: Create migration (Supabase SQL Editor)

Run in the SQL Editor at https://supabase.com/dashboard. This is the exact migration from the branch, unchanged.

```sql
-- Migration 083: Goals and Focus Areas
-- Source: feature/goals-focus-areas-data-model-mcp-tools-2a4f892c

-- goals
CREATE TABLE public.goals (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    title        text        NOT NULL,
    description  text,
    time_horizon text        CHECK (time_horizon IN ('near', 'medium', 'long')),
    metric       text,
    target       text,
    target_date  date,
    status       text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'achieved', 'abandoned')),
    achieved_at  timestamptz,
    position     integer     NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER goals_updated_at
    BEFORE UPDATE ON public.goals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_goals_company_status ON public.goals(company_id, status);
CREATE INDEX idx_goals_created_at     ON public.goals(created_at);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.goals
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.goals
    FOR SELECT TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "authenticated_insert_own" ON public.goals
    FOR INSERT TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- focus_areas
CREATE TABLE public.focus_areas (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    title        text        NOT NULL,
    description  text,
    status       text        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'paused')),
    position     integer     NOT NULL DEFAULT 0,
    domain_tags  text[]      NOT NULL DEFAULT '{}',
    proposed_by  text,
    approved_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER focus_areas_updated_at
    BEFORE UPDATE ON public.focus_areas
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_focus_areas_company_status ON public.focus_areas(company_id, status);
CREATE INDEX idx_focus_areas_created_at     ON public.focus_areas(created_at);
CREATE INDEX idx_focus_areas_domain_tags    ON public.focus_areas USING GIN(domain_tags);

ALTER TABLE public.focus_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.focus_areas
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.focus_areas
    FOR SELECT TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);

CREATE POLICY "authenticated_insert_own" ON public.focus_areas
    FOR INSERT TO authenticated
    WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::uuid);

-- focus_area_goals (junction)
CREATE TABLE public.focus_area_goals (
    focus_area_id uuid NOT NULL REFERENCES public.focus_areas(id) ON DELETE CASCADE,
    goal_id       uuid NOT NULL REFERENCES public.goals(id)       ON DELETE CASCADE,
    PRIMARY KEY (focus_area_id, goal_id)
);

ALTER TABLE public.focus_area_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.focus_area_goals
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.focus_area_goals
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.focus_areas fa
        WHERE fa.id = focus_area_id
          AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
    ));

CREATE POLICY "authenticated_insert_own" ON public.focus_area_goals
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.focus_areas fa
        WHERE fa.id = focus_area_id
          AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
    ));

-- feature_focus_areas (junction)
CREATE TABLE public.feature_focus_areas (
    feature_id    uuid NOT NULL REFERENCES public.features(id)     ON DELETE CASCADE,
    focus_area_id uuid NOT NULL REFERENCES public.focus_areas(id)  ON DELETE CASCADE,
    PRIMARY KEY (feature_id, focus_area_id)
);

ALTER TABLE public.feature_focus_areas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.feature_focus_areas
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.feature_focus_areas
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.focus_areas fa
        WHERE fa.id = focus_area_id
          AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
    ));

CREATE POLICY "authenticated_insert_own" ON public.feature_focus_areas
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.focus_areas fa
        WHERE fa.id = focus_area_id
          AND fa.company_id = (auth.jwt() ->> 'company_id')::uuid
    ));
```

### Step 2: Save migration file to repo

Save the SQL above as `supabase/migrations/083_goals_and_focus_areas.sql` on master so the repo stays in sync with the DB.

### Step 3: Copy edge functions from branch to master

```bash
cd ~/Documents/GitHub/zazigv2

# Checkout the 6 edge function directories from the feature branch
git checkout origin/feature/goals-focus-areas-data-model-mcp-tools-2a4f892c -- \
  supabase/functions/create-goal/ \
  supabase/functions/query-goals/ \
  supabase/functions/update-goal/ \
  supabase/functions/create-focus-area/ \
  supabase/functions/query-focus-areas/ \
  supabase/functions/update-focus-area/
```

### Step 4: Deploy edge functions to Supabase

```bash
cd ~/Documents/GitHub/zazigv2

supabase functions deploy create-goal
supabase functions deploy query-goals
supabase functions deploy update-goal
supabase functions deploy create-focus-area
supabase functions deploy query-focus-areas
supabase functions deploy update-focus-area
```

### Step 5: Add MCP wrappers to agent-mcp-server.ts

The branch adds 286 lines to `packages/local-agent/src/agent-mcp-server.ts` — 6 tool definitions using the existing `guardedHandler` pattern.

```bash
cd ~/Documents/GitHub/zazigv2

# Cherry-pick the MCP additions (this is the cleanest approach)
# The diff is isolated to one file addition block
git diff origin/master...origin/feature/goals-focus-areas-data-model-mcp-tools-2a4f892c -- packages/local-agent/src/agent-mcp-server.ts > /tmp/goals-mcp.patch
git apply /tmp/goals-mcp.patch
```

If the patch doesn't apply cleanly (likely due to master changes since branch point), manually copy the 6 `server.tool(...)` blocks from the branch. They are self-contained — each is ~45 lines, same pattern as existing tools.

### Step 6: Update CPO role mcp_tools (SQL Editor)

```sql
-- Add goals/focus-area tools to CPO
-- Note: roles table has no company_id column — filter by name only
UPDATE roles
SET mcp_tools = array_cat(mcp_tools, ARRAY[
    'create_goal',
    'query_goals',
    'update_goal',
    'create_focus_area',
    'query_focus_areas',
    'update_focus_area'
])
WHERE name = 'cpo';
```

### Step 7: Rebuild local agent and restart Claude Code session

```bash
cd ~/Documents/GitHub/zazigv2/packages/local-agent
npm run build
```

Then restart the Claude Code session so the MCP server picks up the new tools.

### Step 8: Verify

After restart, the CPO should have access to:
- `create_goal` / `query_goals` / `update_goal`
- `create_focus_area` / `query_focus_areas` / `update_focus_area`

Quick smoke test:
```
create_goal with title "Launch for YC testers" and time_horizon "near"
query_goals to see it returned
```

---

## After build: First goals brainstorm

Once the tools are live, run a guided goal-setting session:

1. **Create 2-3 goals** — What are we trying to achieve in 3 months? 6 months? 1 year?
2. **Create 3-5 focus areas** — What needs the most attention right now?
3. **Link focus areas to goals** — Which focus areas serve which goals?
4. **Link existing features to focus areas** — Which of the 10 created + 9 failed features matter?

This is Phase 0 of the design spec. Everything else (coverage maps, strategic questions, exec alignment) builds on these base objects existing.

---

## Estimated effort

| Step | Who | Time |
|------|-----|------|
| 1. Run migration SQL | Tom | 2 min |
| 2. Save migration file | Tom | 1 min |
| 3. Copy edge functions | Tom | 2 min |
| 4. Deploy edge functions | Tom | 5 min |
| 5. Apply MCP patch | Tom | 5-15 min |
| 6. Update roles SQL | Tom | 1 min |
| 7. Rebuild + restart | Tom | 3 min |
| 8. Verify | Tom + CPO | 5 min |
| **Total** | | **~30 min** |
