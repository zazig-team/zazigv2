# WebUI Phase 3 Frontend — Codex Prompt

## Context

You are adding the Decision Gateway and "Needs You" UI to the zazig WebUI. The backend is already in place:
- `decisions` table exists with RLS policies and Realtime publication
- `action_items` table exists with RLS policies and Realtime publication
- `create-decision` edge function creates decisions (CPO calls this)
- `update-decision` edge function resolves/defers decisions (WebUI calls this)
- `create-action-item` edge function creates action items

Phase 2 already added `useRealtimeTable` hook and live subscriptions for features, jobs, and machines.

**Phase 3 frontend goal:** Replace the hardcoded placeholder "Decisions Waiting" and "Needs You" sections on the Dashboard with real data, add Realtime subscriptions for both, and wire up the resolve/defer/note actions.

## Documents to Read First

1. `docs/plans/2026-03-03-webui-design.md` — Section 7 (Decision Write-Back Architecture), Section 4.1 (Dashboard data mapping)
2. `packages/webui/src/pages/Dashboard.tsx` — current implementation with hardcoded placeholders
3. `packages/webui/src/lib/queries.ts` — existing query functions and patterns
4. `packages/webui/src/hooks/useRealtimeTable.ts` — Realtime hook from Phase 2
5. `docs/mockups/founder-dashboard-v2.html` — visual reference for how decisions and action items look

## Task 1: Decision Queries in `queries.ts`

Add to `packages/webui/src/lib/queries.ts`:

```typescript
export interface DecisionOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface Decision {
  id: string;
  from_role: string;
  category: string;
  title: string;
  context: string | null;
  options: DecisionOption[];
  recommendation_rationale: string | null;
  status: string;
  resolution: Record<string, unknown> | null;
  expires_at: string | null;
  created_at: string;
}

export interface ActionItem {
  id: string;
  source_role: string | null;
  title: string;
  detail: string | null;
  cta_label: string;
  cta_type: string;
  cta_payload: Record<string, unknown> | null;
  status: string;
  created_at: string;
}
```

**Fetch functions:**

```typescript
export async function fetchDecisions(companyId: string): Promise<Decision[]> {
  const { data, error } = await supabase
    .from("decisions")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as Decision[];
}

export async function fetchActionItems(companyId: string): Promise<ActionItem[]> {
  const { data, error } = await supabase
    .from("action_items")
    .select("*")
    .eq("company_id", companyId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ActionItem[];
}
```

**Write-back functions:**

```typescript
export async function resolveDecision(params: {
  decisionId: string;
  action: "resolve" | "defer" | "add_note";
  selectedOption?: string;
  note?: string;
}): Promise<void> {
  await invokePost("update-decision", {
    decision_id: params.decisionId,
    action: params.action,
    selected_option: params.selectedOption,
    note: params.note,
  });
}

export async function resolveActionItem(actionItemId: string): Promise<void> {
  const { error } = await supabase
    .from("action_items")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", actionItemId);

  if (error) throw error;
}

export async function dismissActionItem(actionItemId: string): Promise<void> {
  const { error } = await supabase
    .from("action_items")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", actionItemId);

  if (error) throw error;
}
```

## Task 2: Replace "Needs You" Placeholder in Dashboard

In `Dashboard.tsx`, replace the hardcoded `NEEDS_YOU_PLACEHOLDER` section with real data.

1. Add state: `const [actionItems, setActionItems] = useState<ActionItem[]>([]);`
2. Fetch in `loadDashboardData`: add `fetchActionItems(activeCompany.id)` to the `Promise.all`
3. Replace the hardcoded section with a map over `actionItems`:

```tsx
<section className="fade-up d3">
  <div className="section-label">
    Needs You
    <span className="section-label-count section-label-count--caution">
      {actionItems.length} action{actionItems.length === 1 ? "" : "s"}
    </span>
  </div>
  {actionItems.length === 0 ? (
    <div className="empty-state">Nothing needs your attention right now.</div>
  ) : (
    actionItems.map((item) => (
      <article className="action-card" key={item.id}>
        <div className="action-icon">!</div>
        <div className="action-content">
          <div className="action-title">{item.title}</div>
          <div className="action-detail">{item.detail}</div>
        </div>
        <button
          className="action-cta"
          type="button"
          onClick={() => void handleResolveActionItem(item.id)}
        >
          {item.cta_label}
        </button>
      </article>
    ))
  )}
</section>
```

Add the handler:
```typescript
const handleResolveActionItem = async (id: string): Promise<void> => {
  try {
    await resolveActionItem(id);
    setActionItems((prev) => prev.filter((item) => item.id !== id));
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  }
};
```

## Task 3: Replace "Decisions Waiting" Placeholder in Dashboard

Replace the hardcoded `DECISIONS_PLACEHOLDER` section with real data.

1. Add state: `const [decisions, setDecisions] = useState<Decision[]>([]);`
2. Add state for the note input: `const [noteText, setNoteText] = useState<Record<string, string>>({});`
3. Add state for loading: `const [decidingId, setDecidingId] = useState<string | null>(null);`
4. Fetch in `loadDashboardData`: add `fetchDecisions(activeCompany.id)` to the `Promise.all`
5. Update the greeting summary to use real decision count instead of hardcoded "3"

Replace the decisions section:

```tsx
<section className="fade-up d4">
  <div className="section-label">
    Decisions Waiting
    <span className="section-label-count section-label-count--ember">
      {decisions.length} pending
    </span>
  </div>
  {decisions.length === 0 ? (
    <div className="empty-state">No decisions waiting.</div>
  ) : (
    decisions.map((decision) => {
      const recommended = decision.options.find((o) => o.recommended);
      const expiresIn = decision.expires_at
        ? formatExpiresIn(decision.expires_at)
        : null;

      return (
        <article className="decision-card" key={decision.id}>
          <div className="decision-header">
            <span className="decision-from">
              {decision.from_role.toUpperCase()} · {decision.category}
            </span>
            {expiresIn ? (
              <span className="decision-urgency">{expiresIn}</span>
            ) : null}
          </div>
          <div className="decision-title">{decision.title}</div>
          {decision.context ? (
            <div className="decision-context">{decision.context}</div>
          ) : null}
          <div className="decision-options">
            {decision.options.map((option, index) => (
              <span
                key={option.label}
                className={`decision-option${option.recommended ? " decision-option--recommended" : ""}`}
              >
                {option.label}
              </span>
            ))}
          </div>
          {decision.recommendation_rationale ? (
            <div className="decision-rec">{decision.recommendation_rationale}</div>
          ) : null}
          <div className="decision-footer">
            {recommended ? (
              <button
                className="decision-action"
                type="button"
                disabled={decidingId === decision.id}
                onClick={() => void handleDecision(decision.id, "resolve", recommended.label)}
              >
                Accept recommendation
              </button>
            ) : null}
            <button
              className="decision-action"
              type="button"
              disabled={decidingId === decision.id}
              onClick={() => void handleDecision(decision.id, "add_note", undefined, noteText[decision.id])}
            >
              Add a note
            </button>
            <button
              className="decision-action"
              type="button"
              disabled={decidingId === decision.id}
              onClick={() => void handleDecision(decision.id, "defer")}
            >
              Defer
            </button>
          </div>
        </article>
      );
    })
  )}
</section>
```

Add the handler:
```typescript
const handleDecision = async (
  decisionId: string,
  action: "resolve" | "defer" | "add_note",
  selectedOption?: string,
  note?: string,
): Promise<void> => {
  setDecidingId(decisionId);
  try {
    await resolveDecision({ decisionId, action, selectedOption, note });
    if (action !== "add_note") {
      // Remove from local state — it's resolved/deferred
      setDecisions((prev) => prev.filter((d) => d.id !== decisionId));
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : String(err));
  } finally {
    setDecidingId(null);
  }
};
```

Add a helper:
```typescript
function formatExpiresIn(expiresAt: string): string {
  const delta = Date.parse(expiresAt) - Date.now();
  if (delta <= 0) return "Expired";
  const hours = Math.floor(delta / 3_600_000);
  if (hours < 1) return "Expires soon";
  if (hours < 24) return `Expires in ${hours}h`;
  return `Expires in ${Math.floor(hours / 24)}d`;
}
```

## Task 4: Realtime Subscriptions for Decisions and Action Items

In `Dashboard.tsx`, add `useRealtimeTable` subscriptions (same pattern as Phase 2 features/jobs):

```typescript
// Realtime: decisions
useRealtimeTable({
  table: "decisions",
  filter: activeCompany?.id ? `company_id=eq.${activeCompany.id}` : undefined,
  onInsert: () => void refreshDecisions(),
  onUpdate: () => void refreshDecisions(),
  enabled: !!activeCompany?.id,
});

// Realtime: action_items
useRealtimeTable({
  table: "action_items",
  filter: activeCompany?.id ? `company_id=eq.${activeCompany.id}` : undefined,
  onInsert: () => void refreshActionItems(),
  onUpdate: () => void refreshActionItems(),
  enabled: !!activeCompany?.id,
});
```

Create granular refresh functions so Realtime doesn't re-fetch everything:

```typescript
const refreshDecisions = async (): Promise<void> => {
  if (!activeCompany?.id) return;
  try {
    const data = await fetchDecisions(activeCompany.id);
    setDecisions(data);
  } catch {}
};

const refreshActionItems = async (): Promise<void> => {
  if (!activeCompany?.id) return;
  try {
    const data = await fetchActionItems(activeCompany.id);
    setActionItems(data);
  } catch {}
};
```

## Task 5: Remove All Placeholder Constants

Delete these from `Dashboard.tsx`:
- `NEEDS_YOU_PLACEHOLDER` object
- `DECISIONS_PLACEHOLDER` object
- `DecisionPlaceholder` interface
- The hardcoded `"CPO has 3 decisions waiting for you."` in `greetingSummary` — replace `3` with `decisions.length`

## Task 6: Empty States

Add a CSS class for empty states in `global.css` if one doesn't exist:

```css
.empty-state {
  padding: var(--sp-4) var(--sp-5);
  color: var(--stone);
  font-size: 14px;
  background: var(--white);
  border-radius: var(--radius-md);
  border: 1px solid var(--chalk);
}
```

## Technical Rules

1. **No new npm dependencies.**
2. **No changes to `tokens.css`.**
3. **TypeScript strict** — no `any`, no `@ts-ignore`.
4. **Follow existing patterns** from Phase 1 and Phase 2 — same query function style, same error handling, same loading state management.
5. **Build must pass:** `npm run typecheck --workspace=@zazig/webui` and `npm run build --workspace=@zazig/webui`.
6. **Graceful fallback** — if the `decisions` or `action_items` tables don't exist yet (e.g. migration hasn't run), the fetch should fail silently with an empty array, not crash the page. Wrap fetches in try/catch.

## Verification

1. Build passes (typecheck + build)
2. Dashboard loads without errors when `decisions` and `action_items` tables are empty
3. No hardcoded placeholder data remains in Dashboard.tsx
4. Decision cards show real data from the `decisions` table
5. "Accept recommendation" calls `update-decision` edge function with `action: "resolve"`
6. "Defer" calls with `action: "defer"`
7. Action items show real data from the `action_items` table
8. Resolving an action item removes it from the list
9. Realtime: new decisions appear without page refresh
10. Greeting summary uses real `decisions.length` count
