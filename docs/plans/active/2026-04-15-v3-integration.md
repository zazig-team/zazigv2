# zazigv3 (iOS) ↔ zazigv2 Integration

Date: 2026-04-15
Status: contracts ready, needs migrations 232–233 applied
Authors: hotfix-engineer

Wires the SwiftUI iOS chat app at `~/Documents/GitHub/zazigv3/` into v2's pipeline.
An idea typed in v3 lands in `ideas`, gets auto-triaged, gets auto-spec'd, and v3
receives lifecycle updates via Supabase Realtime. No outbound webhooks.

## What's already in v2 (no work needed)

- **Auto-triage**: `companies.auto_triage` (bool) and `auto_triage_types` (text[])
  drive orchestrator-side dispatch of the `triage-analyst` role on ideas with
  `status='new'`. Migrations 135, 148, 229.
- **Auto-spec**: `companies.auto_spec` / `auto_spec_types` gate the `spec-writer`
  expert session after triage routes an idea to `develop`. Migrations 143, 147,
  156, 165, 209, 210, 229. The spec-writer writes structured spec to
  `ideas.spec` and `ideas.acceptance_tests`, idempotent per idea.
- **create-idea edge function** (`supabase/functions/create-idea/index.ts`)
  accepts `raw_text`, `company_id`, `originator`, `source`, plus optional fields.
  CORS `*`. Bearer auth. Inserts the idea and emits `idea_created` in `events`.
- **user_companies** join table (migration 027) + `public.user_in_company(cid)`
  SECURITY DEFINER helper (028) is the canonical auth model. RLS policies on
  `features`, `events`, `jobs`, etc. all use `user_in_company(company_id)`.

## What this change adds (migrations 232–233)

### Migration 232 — sidebar columns
`companies.short_name TEXT`, `companies.color_seed REAL`. Both nullable.
Backfilled: first two letters of `name` (A–Z only) for `short_name`, hashed
0.0–1.0 float for `color_seed`. v3 falls back to client-side defaults if NULL.

### Migration 233 — Realtime + RLS + source
- Asserts `public.ideas`, `public.features`, `public.events` are in the
  `supabase_realtime` publication (idempotent DO block).
- Reasserts `authenticated_read_own` SELECT policy on `ideas` scoped by
  `user_in_company(company_id)`. Webui already depends on this; migration makes
  it durable.
- Widens `ideas_source_check` to include `'mobile'` and `'ios'`.

## Apply the migrations

```bash
SUPABASE_ACCESS_TOKEN=<token> \
  curl -X POST \
  https://api.supabase.com/v1/projects/jmussmwglgbwncgygzbz/database/query \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  --data @- <<'JSON'
{"query": "$(cat supabase/migrations/232_v3_sidebar_columns.sql | jq -Rsa .)"}
JSON
```

(Run same for 233. Both are idempotent — safe to re-run.)

## Auth model for v3

**Recommendation: Supabase Auth magic-link.** v3 uses
`supabase.auth.signInWithOtp({ email })` → user clicks the link → app receives
a session with an access-token JWT. JWTs emitted by Supabase Auth carry
`sub = user_id`. They do **not** carry `company_id` — the user → company
resolution happens via `user_companies`:

```sql
SELECT company_id FROM public.user_companies WHERE user_id = auth.uid();
```

v3 should:
1. Sign in via magic link.
2. Query `user_companies` with the user JWT. RLS on that table (mig 027) only
   returns the signed-in user's memberships.
3. Query `companies` for each `company_id` — RLS scopes results via
   `user_in_company(id)`.
4. Cache the `company_id` for subsequent writes.

**Do not ship the service-role key.** v3 uses the anon key + user JWT only.

## v3 configuration

| Env var            | Value                                              |
|--------------------|----------------------------------------------------|
| `SUPABASE_URL`     | `https://jmussmwglgbwncgygzbz.supabase.co`         |
| `SUPABASE_ANON_KEY`| See `packages/shared/src/index.ts:130` (public key)|

Magic-link redirect: configure Supabase Auth URL allow-list to include the
iOS scheme (e.g. `zazigv3://auth/callback`).

## End-to-end smoke test (curl)

Given a user JWT for a user whose `user_companies` row maps them to
`<company_uuid>`:

```bash
curl -X POST \
  https://jmussmwglgbwncgygzbz.supabase.co/functions/v1/create-idea \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "raw_text": "Let users schedule Zazigs to pause on weekends",
    "company_id": "<company_uuid>",
    "originator": "ios:zazigv3",
    "source": "mobile",
    "priority": "medium",
    "item_type": "idea"
  }'
```

Returns `{"idea_id": "<uuid>"}`. With `auto_triage_types` and `auto_spec_types`
both containing `'idea'` on the target company, you should observe (via
Realtime subscription to `ideas` filtered by `company_id=eq.<uuid>`):

1. `INSERT` row with `status='new'`.
2. `UPDATE` to `status='triaging'` then `status='triaged'`,
   `triage_route='develop'`, `triage_notes=…`, `project_id` set.
3. `UPDATE` setting `spec`, `acceptance_tests`, then
   `status='specced'`.

And matching rows in `events` (`idea_created`, `idea_triaged`, etc.) and
eventually a `features` row when CPO promotes.

## Realtime subscription template (Swift)

```swift
let channel = client.channel("public:ideas:company=\(companyId)")
    .on(.postgresChanges(
        event: .all,
        schema: "public",
        table: "ideas",
        filter: "company_id=eq.\(companyId)"
    )) { message in /* handle */ }
    .subscribe()
```

Subscribe to `features` and `events` the same way. Each will deliver inserts,
updates, deletes scoped by `company_id` filter (Supabase RLS + filter both
apply — RLS is authoritative).

**events schema caveat:** the `events` table has no `idea_id` column. The idea
reference lives in the `detail` jsonb: `{idea_id, originator, source, ...}`.
When filtering client-side, read `row.detail.idea_id`. The `create-idea`
function was deployed 2026-04-15 with this fix — prior to that, idea event
rows silently failed to write.

## Don'ts

- Don't break existing intake (webui + Telegram bot) — the only surface changes
  are additive columns and a widened source CHECK.
- Don't add outbound webhooks.
- Don't ship the service-role key in v3.
- Don't assume the JWT carries `company_id` — resolve via `user_companies`.

## Open questions for v3

- Magic-link redirect scheme to register with Supabase Auth URL allow-list.
- Whether v3 should allow the user to pick between companies (if they have
  multiple memberships) or auto-select the first.
