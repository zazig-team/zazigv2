# Plan: Triage All — UX Flow & Reliability Hardening

**Date:** 2026-03-18
**Author:** CPO
**Status:** Proposed

---

## Problem

Clicking "Triage All" on the Ideas page gives zero feedback. Ideas move to `triaging` optimistically, batches dispatch to the backend via Realtime broadcast, and failures silently revert. The user sees nothing — no progress, no errors, no confirmation. Batches timeout after 5s and fail silently, leaving partial triage state.

Discovered 2026-03-18: clicked "Triage All (15)", only 2-3 ideas actually dispatched. Rest silently reverted.

---

## Proposed UX Flow

### What the user should see

**1. Click "Triage All (15)"**
- Button immediately changes to a progress state: **"Triaging... 0/15"** with a spinner
- Button becomes non-clickable (prevents double-dispatch)
- A subtle progress bar appears below the button or at the top of the Inbox section

**2. Each batch dispatches (batches of 5)**
- As each batch is sent, the counter updates: "Triaging... 5/15", "Triaging... 10/15"
- Individual idea cards in the batch get a visual state change:
  - Subtle pulse/shimmer animation on the card
  - Status chip changes from "new" to "triaging" with a spinner icon
  - Card slightly dims to indicate it's being processed

**3. Batch succeeds**
- Counter increments
- Cards in that batch keep their "triaging" visual state (spinner on chip)
- No toast needed for success — the visual state is the feedback

**4. Batch fails**
- Failed cards revert visually (pulse stops, status chip goes back to "new")
- Toast notification appears: **"3 ideas failed to dispatch — retrying..."**
- Automatic retry once (see Hardening below)
- If retry also fails: toast with **"3 ideas couldn't be triaged. Try again or triage individually."** with a "Retry" action button in the toast

**5. All batches complete**
- Button returns to normal: **"Triage All (0)"** or disappears if inbox is empty
- Summary toast: **"15 ideas sent to triage"** (or "12 of 15 sent, 3 failed")
- Cards remain in Inbox with "triaging" spinner until the triage-analyst completes
- As each idea gets triaged (status → triaged), the card smoothly animates out of Inbox

**6. Triage-analyst completes (async, seconds to minutes later)**
- Individual cards transition: spinner stops, card fades/slides out of Inbox
- Inbox count decrements in real-time
- Triaged tab count increments
- If user is watching, they see cards gradually moving from Inbox → Triaged

### Individual idea triage button
Same pattern but simpler:
- Click "Triage" on a single card → button becomes spinner → card shows triaging state
- Success: card animates to triaging state
- Failure: toast with error, button returns to normal

---

## Reliability Hardening

### 1. Automatic retry with backoff
```
Batch fails → wait 2s → retry once → if still fails, surface to user
```
- Single retry covers transient Realtime hiccups
- Don't retry more than once — if the daemon is down, retrying won't help

### 2. Increase broadcast timeout
- Current: 5 seconds
- Proposed: 10 seconds for batch operations, 5s for single
- The daemon may be mid-heartbeat when the broadcast arrives — 5s is tight

### 3. Error surfacing
- Replace `console.error` with visible toast notifications
- Include actionable information: "Triage dispatch failed — daemon may be offline" vs "Triage dispatch timed out — retrying"
- Add a subtle error badge on ideas that failed to dispatch

### 4. Prevent orphaned `triaging` state
- If dispatch fails AND status revert fails (double failure), the idea is stuck in `triaging` forever
- Add a client-side check: on Ideas page load, find ideas in `triaging` status older than 10 minutes with no associated expert session → revert to `new` with a warning toast
- This is a safety net, not the primary fix

### 5. Batch dispatch progress tracking
- Track batch results in component state: `{ total, dispatched, failed, retrying }`
- Drive the progress UI from this state
- Persist batch state across re-renders (useRef or useState)

### 6. Realtime subscription for triage completion
- Subscribe to ideas table changes where `status` transitions from `triaging` to `triaged`
- Trigger card animation and count updates in real-time
- This already partially exists (the page polls) but should be reactive for better UX

---

## Files to Modify

| File | Change |
|------|--------|
| `packages/webui/src/pages/Ideas.tsx` | Batch triage handler: add progress state, retry logic, toast notifications, card animations |
| `packages/webui/src/pages/Ideas.tsx` | Individual triage button: same pattern (spinner, error toast) |
| `packages/webui/src/lib/queries.ts` | `requestHeadlessTriage`: return structured result instead of throw, include batch-level success/fail |
| `supabase/functions/start-expert-session/index.ts` | Increase broadcast timeout for batch operations (optional query param) |
| `packages/webui/src/pages/Ideas.tsx` | Stale triaging cleanup: check for stuck ideas on page load |

---

## Out of Scope

- Changing the batch size (5 is fine)
- Changing how the daemon receives broadcasts (Realtime channel is fine for now)
- Adding a queue system for triage dispatch (over-engineering for current scale)
- Triage-analyst speed improvements (separate concern)

---

## Implementation Sequence

1. **Progress state + button UI** — add useState for batch tracking, update button text/spinner
2. **Toast notifications** — replace console.error with visible toasts for failures
3. **Auto-retry** — single retry with 2s delay on batch failure
4. **Card visual states** — shimmer/pulse for triaging, fade-out on completion
5. **Stale triaging cleanup** — safety net on page load
6. **Realtime subscription** — reactive card transitions (nice-to-have, can ship without)
