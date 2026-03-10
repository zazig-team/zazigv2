# Auto-Triage Orchestrator Hook

**Date:** 2026-03-10
**Status:** Ready to implement
**Prerequisite:** Phase 2c (Rejected tab, Restore, Batch Triage) — shipped PR #225
**Depends on:** Background triage E2E flow (shipped), orchestrator tick loop

---

## What

Add an auto-triage step to the orchestrator's 10-second tick loop. When `auto_triage` is enabled for a company, the orchestrator automatically dispatches triage jobs for any `status: new` ideas — the same flow the "Triage All" button triggers manually.

## Why

The manual triage flow (WebUI button → request-work → orchestrator → daemon → triage-analyst) is proven E2E. The only missing piece is a periodic trigger so ideas get triaged without a human clicking a button.

## How

### Migration 135: `auto_triage` column

```sql
ALTER TABLE public.companies
ADD COLUMN auto_triage boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.auto_triage IS
  'When true, the orchestrator automatically dispatches triage jobs for status=new ideas on each tick.';
```

### Orchestrator: new step `autoTriageNewIdeas(supabase)`

Insert between step 4 (dispatch queued jobs) and step 5 (refresh cache):

```typescript
// 4b. Auto-triage: dispatch triage jobs for new ideas in companies with auto_triage enabled.
await autoTriageNewIdeas(supabase);
```

Implementation:

```typescript
const AUTO_TRIAGE_BATCH_LIMIT = 3; // max ideas to triage per tick per company
const AUTO_TRIAGE_COOLDOWN_MS = 5 * 60 * 1000; // 5 min between sweeps per company
const autoTriageLastRun = new Map<string, number>();

async function autoTriageNewIdeas(supabase: SupabaseClient): Promise<void> {
  // 1. Get companies with auto_triage enabled
  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .eq("auto_triage", true)
    .eq("status", "active");

  if (!companies?.length) return;

  for (const company of companies) {
    // 2. Cooldown check — don't sweep every 10s, just every 5 min
    const lastRun = autoTriageLastRun.get(company.id) ?? 0;
    if (Date.now() - lastRun < AUTO_TRIAGE_COOLDOWN_MS) continue;

    // 3. Find new ideas (not triaging, not already queued)
    const { data: newIdeas } = await supabase
      .from("ideas")
      .select("id")
      .eq("company_id", company.id)
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(AUTO_TRIAGE_BATCH_LIMIT);

    if (!newIdeas?.length) continue;

    // 4. Get a project_id for the triage job (first active project)
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("company_id", company.id)
      .eq("status", "active")
      .limit(1);

    const projectId = projects?.[0]?.id;
    if (!projectId) {
      console.log(`[orchestrator] auto-triage: no active project for company ${company.id}, skipping`);
      continue;
    }

    // 5. Dispatch triage jobs
    for (const idea of newIdeas) {
      // Mark as triaging first (prevents re-dispatch on next tick)
      await supabase.from("ideas").update({ status: "triaging" }).eq("id", idea.id);

      // Create the job via the same RPC the WebUI uses
      const { error } = await supabase.rpc("request_standalone_work", {
        p_company_id: company.id,
        p_project_id: projectId,
        p_feature_id: null,
        p_role: "triage-analyst",
        p_context: idea.id,
      });

      if (error) {
        console.error(`[orchestrator] auto-triage: failed to queue triage for idea ${idea.id}:`, error.message);
        // Revert status on failure
        await supabase.from("ideas").update({ status: "new" }).eq("id", idea.id);
      } else {
        console.log(`[orchestrator] auto-triage: queued triage for idea ${idea.id}`);
      }
    }

    autoTriageLastRun.set(company.id, Date.now());
  }
}
```

Key design decisions:
- **Cooldown (5 min)**: The orchestrator ticks every 10s but we don't need to sweep the inbox that often. 5 min is responsive enough.
- **Batch limit (3)**: Prevents flooding the pipeline with triage jobs. Oldest ideas first.
- **Set `triaging` before dispatching**: Prevents the same idea being dispatched twice on consecutive ticks.
- **Revert on failure**: If the RPC fails, set status back to `new` so it gets picked up next sweep.

### WebUI: Toggle on Ideas page

Add a small toggle in the Ideas page header:

```
Ideas                                    [Auto-triage: OFF]
```

Clicking toggles `auto_triage` on the company via a simple Supabase update. The toggle reflects current state via a query on mount.

Needs:
- `fetchAutoTriageSetting(companyId)` — reads `companies.auto_triage`
- `setAutoTriageSetting(companyId, enabled)` — updates `companies.auto_triage`
- Small toggle component in the Ideas header

### Edge function deployment

The orchestrator change deploys automatically when merged to master via the deploy-edge-functions workflow. No manual deployment needed.

---

## Files to change

| File | Change |
|------|--------|
| `supabase/migrations/135_auto_triage.sql` | Add `auto_triage` column to `companies` |
| `supabase/functions/orchestrator/index.ts` | Add `autoTriageNewIdeas()` function + call in main loop |
| `packages/webui/src/pages/Ideas.tsx` | Add toggle in header |
| `packages/webui/src/lib/queries.ts` | Add fetch/set functions for the toggle |
| `packages/webui/src/global.css` | Toggle styling |

## Testing

1. Run migration locally or via Supabase Management API
2. Set `auto_triage = true` for zazig-dev company
3. Create a test idea with `status: new`
4. Wait for orchestrator tick (10s) + cooldown logic
5. Verify idea moves to `triaging` → `triaged` (via Realtime in WebUI)
6. Verify the WebUI toggle reflects and controls the setting

## Not in scope (next phases)

- `auto_intake` toggle (intake-processor role)
- `auto_push` toggle (auto-promotion with goal alignment)
- `pipeline_hold` kill switch
- Goal-alignment criteria
- Audit trail for auto-promoted ideas
