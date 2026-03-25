# WebUI Phase 2: Realtime + Interactive — Codex Prompt

## Context

You are continuing work on the zazig WebUI, a React + TypeScript SPA deployed on Netlify at `https://zazig-webui.netlify.app`. Phase 1 is complete — auth, landing, login, and three read-only pages (Dashboard, Pipeline, Team) are live and connected to a Supabase backend.

**Phase 2 goal:** Add Supabase Realtime subscriptions so the UI updates live without manual refresh, make the archetype picker functional (write-back), wire up idea submission, add goal progress and focus area health indicators, and persist theme choice.

## Documents to Read First

1. `docs/plans/2026-03-03-webui-design.md` — canonical design doc. Phase 2 is in Section 10. Realtime strategy is Section 6. Security model is Section 5.
2. `docs/plans/webui-codex-prompt.md` — Phase 1 prompt (for context on design system tokens, project structure, and conventions already established).
3. `packages/webui/src/lib/queries.ts` — all existing query functions.
4. `packages/webui/src/hooks/` — existing hooks: `useAuth.tsx`, `useCompany.tsx`, `usePipelineSnapshot.ts`.
5. `packages/webui/src/pages/Dashboard.tsx`, `Pipeline.tsx`, `Team.tsx` — current page implementations.
6. `packages/webui/src/lib/supabase.ts` — Supabase client initialization.

## Supabase Connection

The Supabase client is already initialized in `packages/webui/src/lib/supabase.ts`:
```typescript
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from "@zazigv2/shared";
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true }
});
```

Supabase URL: `https://jmussmwglgbwncgygzbz.supabase.co`

The `@supabase/supabase-js` package is already installed.

## Phase 2 Tasks

### 1. Create `useRealtimeTable` hook

Create `packages/webui/src/hooks/useRealtimeTable.ts` — a generic hook that subscribes to Supabase Realtime Postgres CDC changes for a given table.

```typescript
import { useEffect } from "react";
import { supabase } from "../lib/supabase";

interface UseRealtimeTableOptions {
  table: string;
  filter?: string; // e.g. "company_id=eq.{id}"
  onInsert?: (payload: Record<string, unknown>) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onDelete?: (payload: Record<string, unknown>) => void;
  enabled?: boolean;
}

export function useRealtimeTable(options: UseRealtimeTableOptions): void {
  // Subscribe to postgres_changes on the given table
  // Use supabase.channel(`realtime:${table}`)
  //   .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter }, callback)
  //   .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter }, callback)
  //   .subscribe()
  // Clean up on unmount with channel.unsubscribe()
  // Only subscribe when enabled !== false
}
```

### 2. Wire Realtime into Pipeline page

In `Pipeline.tsx`, use `useRealtimeTable` to subscribe to:
- `features` table (filter by `company_id`) — on INSERT or UPDATE, call `refresh()` to re-fetch the pipeline snapshot
- `jobs` table (filter by `company_id`) — on INSERT or UPDATE, call `refresh()` to re-fetch

This means the pipeline board updates automatically when features change status or jobs complete. Use a debounce/throttle (300ms) so rapid changes don't cause excessive re-fetches.

### 3. Wire Realtime into Dashboard page

In `Dashboard.tsx`, subscribe to:
- `features` table — refresh pulse metrics on change
- `jobs` table — refresh pulse metrics and team sidebar on change
- `machines` table — refresh team sidebar heartbeat display on change

Same debounce approach. The existing `loadDashboardData` function already fetches everything — you can call it again, or create more granular refresh functions for specific sections.

### 4. Wire Realtime into Team page

In `Team.tsx`, subscribe to:
- `machines` table — update heartbeat times and status dots live
- `jobs` table — update engineer sidebar (active ephemeral jobs) live

### 5. Make the Archetype Picker functional (write-back)

In `Team.tsx`, the archetype picker currently shows "Archetype options will be writable in Phase 2." Replace this with:

1. List all archetype options for the exec's role (data already fetched in `data.archetypeOptionsByRoleId[roleId]`)
2. Each option is a clickable card showing name + tagline
3. On click, call:
```typescript
await supabase
  .from("exec_personalities")
  .update({ archetype_id: selectedArchetypeId })
  .eq("id", execPersonalityId);
```
4. After successful update, refresh the team data

Add a new query function in `queries.ts`:
```typescript
export async function updateExecArchetype(personalityId: string, archetypeId: string): Promise<void> {
  const { error } = await supabase
    .from("exec_personalities")
    .update({ archetype_id: archetypeId })
    .eq("id", personalityId);
  if (error) throw error;
}
```

**Note:** This requires an RLS policy for UPDATE on `exec_personalities`. The policy may not exist yet — if the update fails with a permission error, that's expected and will be fixed separately via a migration. Add a try/catch and show a user-friendly error like "Permission denied — RLS policy needed" rather than crashing.

### 6. Idea submission from Dashboard

The idea submission bar already exists and calls `submitIdea` in `queries.ts` which invokes the `create-idea` edge function. **This is already working.** Verify it works end-to-end:
- Type text in the idea bar
- Click "Send idea"
- Should show "Idea sent to inbox" confirmation
- The idea should appear on the Pipeline page's Ideas column on next refresh

If the `create-idea` edge function returns an error about RLS on the `ideas` table, catch it gracefully and show the error to the user.

### 7. Goal Progress Bars

Currently `Dashboard.tsx` uses `fallbackGoalProgress(index)` which returns hardcoded values `[35, 12, 5]`.

The `goals` table may or may not have a `progress` column yet (it's a pending migration). Update the code to:
1. Check if the goal object has a `progress` field
2. If it does, use that value (0-100)
3. If it doesn't, fall back to 0 (not the fake values)

Update the `Goal` interface in `queries.ts`:
```typescript
export interface Goal {
  // ... existing fields
  progress: number | null; // 0-100, may not exist yet
}
```

In the goal card rendering, use `goal.progress ?? 0` instead of `fallbackGoalProgress(index)`.

### 8. Focus Area Health Badges

Currently focus areas show their `status` (active/paused) as a badge. The design doc proposes a `health` column with values: `on_track`, `healthy`, `behind`, `waiting`, `later`.

Update the code to:
1. Check if the focus area has a `health` field
2. If it does, display the health badge instead of the status badge
3. Map health values to colors:
   - `on_track` / `healthy` → `badge--positive` (green)
   - `behind` → `badge--negative` (red)
   - `waiting` → `badge--caution` (amber)
   - `later` → `badge--neutral` (gray)
4. If no `health` field, continue showing `status` as before

Update the `FocusArea` interface:
```typescript
export interface FocusArea {
  // ... existing fields
  health: string | null; // on_track, healthy, behind, waiting, later
}
```

### 9. Theme Persistence

There's already a `ThemeToggle.tsx` component. Currently the theme resets on page reload.

Update it to:
1. On mount, read `localStorage.getItem("zazig-theme")` and apply it
2. On toggle, save to `localStorage.setItem("zazig-theme", newTheme)`
3. The theme is applied via a `data-theme` attribute on `<html>` or `<body>` — check how the current toggle works and ensure it persists

### 10. Pipeline "Mine" Filter Logic

The "Mine" filter currently checks `feature.assignee` which maps to `owner_id` on the feature. This is rarely set. Improve the logic:

1. Get the current user's email from auth
2. "Mine" should match features where:
   - `assignee` contains the user's email prefix (existing logic), OR
   - The feature has jobs assigned to a machine owned by the user (requires knowing the user's machine — can skip this for now)
3. For now, keep the existing logic but also match on `feature.assignee === user.id` (the UUID)

## Technical Rules

1. **Do NOT create new files** unless specified above (`useRealtimeTable.ts` is the only new file). Edit existing files.
2. **Do NOT change the design system** — no changes to `tokens.css` or `global.css` unless strictly needed for new elements.
3. **Do NOT add new npm dependencies** — `@supabase/supabase-js` already supports Realtime.
4. **TypeScript strict mode** — no `any` types, no `@ts-ignore`.
5. **Existing patterns** — follow the same patterns used in Phase 1:
   - Query functions in `queries.ts` with explicit return types
   - Error handling with try/catch and user-facing error messages
   - Loading states with `useState<boolean>`
6. **Build must pass** — `npm run typecheck --workspace=@zazig/webui` and `npm run build --workspace=@zazig/webui` must both succeed.
7. **No console.log in committed code** — use error boundaries or inline feedback for debugging.

## Build Order

1. `useRealtimeTable` hook (foundation for everything else)
2. Realtime in Pipeline (most visible impact — board updates live)
3. Realtime in Dashboard (pulse metrics, team sidebar)
4. Realtime in Team (machines, engineers)
5. Archetype picker write-back
6. Goal progress / focus area health updates
7. Theme persistence
8. Mine filter improvement

## File Structure Reference

```
packages/webui/src/
├── hooks/
│   ├── useAuth.tsx          ← existing
│   ├── useCompany.tsx       ← existing
│   ├── usePipelineSnapshot.ts ← existing
│   └── useRealtimeTable.ts  ← NEW
├── lib/
│   ├── supabase.ts          ← existing (Supabase client)
│   ├── auth.ts              ← existing
│   └── queries.ts           ← EDIT (add updateExecArchetype, update interfaces)
├── components/
│   ├── Nav.tsx              ← existing
│   ├── CompanySwitcher.tsx  ← existing
│   └── ThemeToggle.tsx      ← EDIT (theme persistence)
├── pages/
│   ├── Dashboard.tsx        ← EDIT (realtime, goal progress, focus health)
│   ├── Pipeline.tsx         ← EDIT (realtime subscriptions)
│   ├── Team.tsx             ← EDIT (realtime, archetype picker)
│   ├── Landing.tsx          ← no changes
│   └── Login.tsx            ← no changes
├── tokens.css               ← no changes
├── global.css               ← no changes (maybe minor additions for picker styles)
└── main.tsx                 ← no changes
```

## Verification

After completing all tasks:
1. `npm run typecheck --workspace=@zazig/webui` passes
2. `npm run build --workspace=@zazig/webui` passes
3. Pipeline page receives live updates when feature statuses change
4. Dashboard pulse metrics update without manual refresh
5. Team page machine heartbeats update live
6. Archetype picker shows options and attempts write-back (may fail with RLS error — that's OK, handle gracefully)
7. Theme toggle persists across page reloads
8. Goal cards show `progress ?? 0` instead of hardcoded fake values
9. Focus area badges show `health` field when available
