# Spec: Webhook Notifications for Pipeline Status Changes

**Idea ID:** 75c15bca-80e2-43ba-8321-faf317b6f5ff
**Status:** developing
**Complexity:** medium
**Domain:** product / integrations

---

## Overview

Allow companies to configure webhook endpoints that receive signed HTTP POST notifications whenever a pipeline feature changes status. Modelled on GitHub's webhook system — generic HTTP callbacks that enable integration with any downstream tool: Zapier, custom dashboards, CI/CD pipelines, internal tooling. This is distinct from the existing Slack integration, which is opinionated, Slack-specific, and channel-scoped; webhooks are a superset capability for arbitrary HTTP consumers.

---

## Feature Status Vocabulary

The full set of feature statuses in the pipeline (from migration 109):

```
created → ready_for_breakdown → breakdown → building →
combining / combining_and_pr → verifying → merging →
complete | cancelled | failed
```

Webhook events are emitted on **customer-visible** status transitions:

| Event name | Trigger |
|---|---|
| `feature.building` | feature transitions to `building` |
| `feature.verifying` | feature transitions to `verifying` |
| `feature.complete` | feature transitions to `complete` |
| `feature.failed` | feature transitions to `failed` |
| `feature.cancelled` | feature transitions to `cancelled` |

Early pipeline-internal statuses (`breakdown`, `combining`, `combining_and_pr`, `merging`) are intentionally excluded from v1 to keep the surface area minimal and avoid confusing consumers with intermediate steps.

---

## Architecture

### New DB Tables

#### `company_webhooks`

```sql
CREATE TABLE public.company_webhooks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  secret_hash  TEXT,          -- bcrypt or SHA-256 of the user-supplied secret; NULL if no secret
  events       TEXT[] NOT NULL DEFAULT ARRAY['feature.building','feature.verifying','feature.complete','feature.failed','feature.cancelled'],
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- `secret_hash`: the raw secret is shown once on creation and never stored. Only the hash is stored. Deliveries are signed using the raw secret (passed ephemerally from the request that creates the webhook, then discarded).
- `events`: array of event names; acts as a filter. Default is all events.
- Max 10 webhooks per company (enforced at application layer).

#### `webhook_deliveries`

```sql
CREATE TABLE public.webhook_deliveries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id   UUID NOT NULL REFERENCES public.company_webhooks(id) ON DELETE CASCADE,
  company_id   UUID NOT NULL,
  event        TEXT NOT NULL,
  payload      JSONB NOT NULL,
  attempt      INT NOT NULL DEFAULT 1,
  status_code  INT,
  response_body TEXT,
  delivered_at  TIMESTAMPTZ,
  failed_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_webhook_id_idx ON webhook_deliveries(webhook_id, created_at DESC);
```

- Retain delivery records for 90 days (Postgres TTL or background cleanup job).
- The UI shows the most recent 10 deliveries per webhook.

### New Edge Function: `dispatch-webhook`

Located at `supabase/functions/dispatch-webhook/index.ts`.

**Called by:** a shared helper `dispatchWebhooksForFeature(supabase, featureId, event)` invoked at each status transition (see Integration Points below).

**Responsibilities:**
1. Look up all enabled `company_webhooks` for the feature's `company_id` that include `event` in their `events` array.
2. For each webhook, build the signed payload.
3. POST to the webhook URL with retry logic (up to 3 attempts, exponential backoff: 1s, 5s, 25s).
4. Insert a `webhook_deliveries` row for each attempt.

Because the raw secret is never persisted, signing must happen inline at dispatch time using the secret passed as a parameter (for new webhooks) or re-derived by the caller. In practice: the `dispatch-webhook` function reads the `secret_hash` column and uses it as the signing key — or the company stores the plaintext secret in a separate Supabase Vault secret referenced by `secret_key_ref`. **Decision needed (human checklist item):** plaintext in Vault vs hash-only.

**Payload schema:**

```json
{
  "event": "feature.complete",
  "timestamp": "2026-03-13T12:00:00.000Z",
  "data": {
    "feature_id": "abc-123",
    "feature_title": "Add dark mode",
    "status": "complete",
    "company_id": "xyz-456",
    "project_id": "proj-789"
  }
}
```

**Signing:**
```
X-Zazig-Signature-256: sha256=<HMAC-SHA256(raw_secret, JSON.stringify(payload))>
```
Signature absent when no secret configured. Algorithm matches GitHub's convention.

**Retry logic:**
- 3 total attempts max.
- Retry on: HTTP 5xx, network timeout (10s), connection error.
- Do NOT retry on: HTTP 2xx, 3xx, 4xx (except 429 which may retry with 1 extra attempt).
- Each attempt logged in `webhook_deliveries`.
- A webhook that fails all 3 attempts is logged as `failed` but does NOT block the pipeline (fire-and-forget semantics with logging).

### Integration Points

Status transitions happen in two places:

1. **`supabase/functions/_shared/pipeline-utils.ts`** — `triggerCombining`, `triggerFeatureVerification`, `triggerMerging` set feature statuses.
2. **`supabase/functions/orchestrator/index.ts`** — direct `.update({ status: 'building' })` and `.update({ status: 'failed' })` calls.
3. **`supabase/functions/update-feature/index.ts`** — CPO sets `complete` and `breaking_down`.

Add a shared helper in `_shared/dispatch-webhooks.ts`:

```typescript
export async function dispatchWebhooksForFeature(
  supabase: SupabaseClient,
  featureId: string,
  event: 'feature.building' | 'feature.verifying' | 'feature.complete' | 'feature.failed' | 'feature.cancelled',
): Promise<void>
```

This helper:
1. Fetches the feature's `company_id`, `project_id`, `title`.
2. Looks up `company_webhooks` for that company with the event in scope.
3. For each webhook, calls the `dispatch-webhook` edge function via `supabase.functions.invoke()` — or directly POSTs inline (preferred to avoid function cold-start latency on hot path).
4. **Fire-and-forget**: errors are logged but not thrown — must not interrupt the pipeline status transition.

### Settings UI (webui)

New section in `packages/webui/src/pages/Settings.tsx`:

- **Webhooks** card below existing triage/spec settings sections.
- **Add webhook** form: URL input + optional secret input (shown once, not re-displayed).
- **Event filter** checkboxes (default: all).
- **Webhook list**: each row shows URL, enabled toggle, event count, last delivery status.
- **Delivery log** drawer/modal: last 10 deliveries for a webhook — timestamp, event, HTTP status, response snippet.
- **Delete webhook** with confirmation.

The secret is transmitted to the backend on creation only and never returned. The UI shows a one-time copy prompt.

### API (REST/RPC)

No new dedicated REST endpoints needed beyond invoking existing Supabase RLS-protected table access:

- `company_webhooks`: company-scoped RLS (user can only see/modify their own company's webhooks).
- `webhook_deliveries`: read-only for authenticated company members.
- Create/update/delete via direct Supabase client calls from the webui (with RLS enforcement).

---

## Migration

New migration: `160_company_webhooks.sql`

```sql
-- company_webhooks and webhook_deliveries tables as above
-- RLS policies:
--   company_webhooks: SELECT/INSERT/UPDATE/DELETE for authenticated users matching company_id
--   webhook_deliveries: SELECT for authenticated users matching company_id; INSERT via service_role only
```

---

## Non-Goals (v1)

- Webhook secret rotation UI (operator can update via DB; UI rotation is v2).
- Custom payload templates.
- `feature.building` sub-status events (breakdown, combining, etc.).
- Webhook testing ("Send test event") button — v2.
- Webhook pausing/rate-limit auto-disable (v2 reliability feature).

---

## Affected Files

| File | Change |
|---|---|
| `supabase/migrations/160_company_webhooks.sql` | New — create tables + RLS |
| `supabase/functions/dispatch-webhook/index.ts` | New edge function |
| `supabase/functions/_shared/dispatch-webhooks.ts` | New helper |
| `supabase/functions/_shared/pipeline-utils.ts` | Call dispatchWebhooksForFeature at verifying/merging transitions |
| `supabase/functions/orchestrator/index.ts` | Call dispatchWebhooksForFeature at building/failed transitions |
| `supabase/functions/update-feature/index.ts` | Call dispatchWebhooksForFeature at complete/cancelled transitions |
| `packages/webui/src/pages/Settings.tsx` | Add Webhooks section |
| `packages/webui/src/components/WebhookCard.tsx` | New component (webhook list + form) |
| `packages/webui/src/components/DeliveryLog.tsx` | New component (delivery history drawer) |

---

## Acceptance Criteria

1. Configure a webhook via Settings UI — URL stored, secret never returned after creation.
2. `feature.building` event delivered within 30s of feature transitioning to `building`.
3. `feature.complete`, `feature.failed`, `feature.cancelled` events delivered on respective transitions.
4. `X-Zazig-Signature-256` header present and verifiable when secret configured; absent when no secret.
5. HTTP 5xx response triggers retry; up to 3 attempts, each logged in `webhook_deliveries`.
6. Disabled webhook receives no deliveries.
7. Event filter respected — webhook subscribed to `['feature.complete']` does not receive `feature.building`.
8. A slow/timing-out/failing webhook does not delay or break the pipeline status transition.
9. Delivery log (last 10 per webhook) visible in Settings UI with timestamp and HTTP status.
10. Deleting a webhook stops future deliveries and cascades to delete delivery records.

---

## Human Checklist

- [ ] Confirm signing header name `X-Zazig-Signature-256` aligns with any existing API docs or partner expectations.
- [ ] Decide secret storage strategy: plaintext in Supabase Vault (referenced by `secret_key_ref`) vs hash-only (hash-only means we can verify but cannot re-sign; Vault is preferred for HMAC signing).
- [ ] Confirm delivery log retention period (90 days assumed).
- [ ] Approve Settings page nav label ("Webhooks") and confirm whether section shares the Settings page or gets its own route.
- [ ] Decide: secret rotation via UI in v1 or DB-level update only?
- [ ] Manual E2E test with requestbin/webhook.site: trigger feature status change, verify signed POST received with correct payload.
- [ ] Manual retry test: endpoint returning 500, verify 3 attempts logged, final failure recorded in UI.
- [ ] Confirm 10-webhook-per-company limit is sufficient or needs adjustment.

---

## Complexity Estimate

**Medium** — multi-file (new edge function, shared helper, 3 integration points, migration, 2 new UI components). Core logic is well-understood (HTTP POST + HMAC signing). Main unknowns are secret storage strategy and ensuring fire-and-forget dispatching genuinely doesn't affect pipeline latency.
