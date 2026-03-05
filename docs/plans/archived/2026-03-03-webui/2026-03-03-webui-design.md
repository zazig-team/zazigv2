# WebUI — Founder Control Panel

**Date:** 2026-03-03
**Status:** Draft
**Authors:** Tom Weaver, Claude
**Part of:** ORG MODEL — Founder Interface Layer

---

## 1. Problem

The founder currently has no unified interface to observe and interact with the zazig system. Pipeline state is visible only through a bare-bones vanilla JS dashboard (`dashboard/index.html`) or raw Supabase queries. Decisions from the CPO arrive via Slack. There's no way to manage goals, focus areas, team archetypes, or respond to human-action-required events from a single pane of glass.

The three mockups (`founder-dashboard-v2.html`, `pipeline-v2.html`, `team-v2.html`) define a complete founder experience. This doc maps every mockup section to real data, identifies gaps, and lays out the build plan.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | **Vite + React + TypeScript** | Fast builds, modern DX, tree-shaking. No SSR needed — this is a SPA behind auth. |
| Styling | **Vanilla CSS with design system variables** | The mockups define a complete token system (colors, spacing, radii, shadows). CSS modules or a single `tokens.css` file. No Tailwind — the design system is already opinionated. |
| Auth | **Supabase Auth (magic link + Google OAuth)** | Magic link already configured. Google OAuth needs Google Cloud Console setup. See Section 15. |
| Data | **Supabase JS client** | REST queries via `supabase.from('table').select()`. Edge function calls via `supabase.functions.invoke()`. |
| Realtime | **Supabase Realtime (Postgres CDC)** | Subscribe to `features`, `jobs`, `machines`, `events` table changes. No polling. |
| Hosting | **Netlify** | Static SPA deploy. `_redirects` file for SPA routing. Env vars for Supabase URL + anon key. |
| Fonts | **Plus Jakarta Sans + JetBrains Mono** | From mockups. Google Fonts. |

### Why not extend the existing dashboard?

The existing `dashboard/index.html` is a 1,400-line vanilla JS file with a different design system (DM Sans, different color palette, no component structure). It served its purpose as a pipeline viewer but lacks:
- Component architecture for maintainability
- Auth beyond anon key
- Multi-page routing
- Write-back capability
- The new design language

A clean React build is faster than retrofitting.

---

## 3. Data Audit — What Exists vs What's Missing

### 3.1 Tables That Exist and Map Directly

| Table | Used by | Status |
|-------|---------|--------|
| `companies` | Company switcher, all scoping | Ready |
| `user_companies` | Multi-company membership | Ready |
| `features` | Pipeline board cards | Ready — has title, description, status, priority, spec, acceptance_tests, branch, pr_url, error, fast_track, completed_at |
| `jobs` | Progress pips on feature cards, team slot counts | Ready — has title, status, role, job_type, complexity, depends_on, machine_id, progress |
| `machines` | Team page machines section, heartbeat | Ready — has name, slots_claude_code, slots_codex, last_heartbeat, status, enabled |
| `roles` | Team page role display | Ready — has name, description, default_model, is_persistent, slot_type, skills, mcp_tools |
| `exec_archetypes` | Archetype picker, beliefs, traits | Ready — has name, display_name, tagline, dimensions, philosophy, voice_notes, anti_patterns, productive_flaw |
| `exec_personalities` | Current archetype per exec | Ready — has company_id, role_id, archetype_id, user_overrides, evolved_state, is_frozen |
| `events` | Activity feed | Ready — has event_type, detail (jsonb), role, created_at. Not in Realtime publication (append-only). |
| `goals` | Dashboard goals section | Ready — has title, description, time_horizon, metric, target, target_date, status, position |
| `focus_areas` | Dashboard focus areas sidebar | Ready — has title, description, status (active/paused), position, domain_tags |
| `focus_area_goals` | Focus area → goal links | Ready |
| `feature_focus_areas` | Feature → focus area links | Ready |
| `ideas` | Pipeline Ideas column, idea inbox | Ready — has raw_text, title, description, status, priority, source, tags, flags |
| `company_roles` | Which roles are enabled | Ready |
| `deployments` | Shipped column (production deploys) | Ready — has git_sha, environment, status, features_included, promoted_at |
| `messages` | Inter-agent comms (potential decision source) | Ready — has from_role, to_role, content, message_type |

### 3.2 Edge Functions Available to the UI

All accept `Authorization: Bearer {accessToken}` and return JSON.

| Function | Method | Purpose | UI page |
|----------|--------|---------|---------|
| `get-pipeline-snapshot` | GET | Cached pipeline state (features + jobs + ideas grouped by status) | Pipeline |
| `query-features` | POST | Feature list with filters | Pipeline, Dashboard |
| `query-jobs` | POST | Jobs for a feature or by status | Pipeline, Team |
| `query-goals` | POST | Goals list | Dashboard |
| `query-focus-areas` | POST | Focus areas with linked goals | Dashboard |
| `query-ideas` | POST | Ideas with status/priority/search filters | Pipeline |
| `query-idea-status` | POST | Idea lifecycle trace | Pipeline detail |
| `create-idea` | POST | Submit new idea | Dashboard idea inbox |
| `update-idea` | POST | Change idea status/priority | Pipeline |
| `update-goal` | POST | Edit goal fields | Dashboard |
| `update-focus-area` | POST | Edit focus area, manage goal/feature links | Dashboard |
| `company-persistent-jobs` | GET | CPO/CTO prompt stacks and status | Team |

### 3.3 What's Missing

#### Missing Table: `decisions`

The mockup's "Decisions Waiting" section is a first-class UI concept with no backing table. Currently, the CPO communicates decisions via Slack only.

**Proposed schema:**

```sql
CREATE TABLE public.decisions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  from_role     text NOT NULL,                              -- 'cpo', 'cto'
  category      text NOT NULL DEFAULT 'tactical',           -- 'routine', 'tactical', 'strategic', 'foundational'
  title         text NOT NULL,
  context       text,                                       -- CPO-generated reasoning
  options       jsonb NOT NULL DEFAULT '[]',                -- [{label, description, recommended?}]
  recommendation_rationale text,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'resolved', 'deferred', 'expired')),
  resolved_by   text,                                       -- 'human' or role name
  resolution    jsonb,                                      -- {selected_option, note?}
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
```

**Realtime:** Yes — publish to `supabase_realtime` so the dashboard updates live when CPO creates new decisions.

**RLS:** Authenticated SELECT/UPDATE scoped by `user_in_company(company_id)`. Service role INSERT (CPO writes via edge function).

**Write-back path:** When the founder resolves a decision, the UI calls an `update-decision` edge function → updates the row → broadcasts on the orchestrator Realtime channel → CPO picks up the resolution and acts on it. This mirrors the existing `messages` pattern where `from_role = 'human'` messages are insertable by authenticated users.

#### Missing Table: `action_items`

The "Needs You" section surfaces things only the founder can physically do (provide an API key, approve a vendor, etc.). These could come from multiple sources:
- CPO identifies a blocker that needs human action
- A job is `blocked` with a human-resolvable reason
- The system detects missing configuration

**Proposed schema:**

```sql
CREATE TABLE public.action_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  source_role   text,                                       -- 'cpo', 'pipeline', 'system'
  source_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  title         text NOT NULL,
  detail        text,
  cta_label     text NOT NULL DEFAULT 'Resolve',
  cta_type      text NOT NULL DEFAULT 'acknowledge'
                CHECK (cta_type IN ('acknowledge', 'provide_secret', 'approve', 'external_link')),
  cta_payload   jsonb,                                      -- {url?, secret_name?, etc.}
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);
```

**RLS:** Same pattern as decisions — authenticated SELECT/UPDATE scoped by company. Service role INSERT.

#### Missing: Computed Dashboard Metrics

The "Pulse" sidebar shows MRR, Beta Users, Ship Rate, Runway. Of these:

| Metric | Source | Buildable? |
|--------|--------|-----------|
| **Ship Rate** | `COUNT(features WHERE status='merged') / COUNT(features WHERE status NOT IN ('created','cancelled'))` over a time window | **Yes — computed from existing data** |
| **Active jobs** | `COUNT(jobs WHERE status IN ('queued','dispatched','executing'))` | **Yes** |
| **Features shipped (24h)** | `COUNT(features WHERE status='merged' AND completed_at >= now() - interval '24h')` | **Yes** |
| **Features failed (24h)** | `COUNT(features WHERE status='failed' AND updated_at >= now() - interval '24h')` | **Yes** |
| **MRR / Runway / Burn** | External financial data | **No — needs manual entry or Stripe integration** |
| **Beta Users** | External user tracking | **No — needs a users/customers concept** |

**Recommendation:** For v1, show only computable pipeline metrics (ship rate, active count, shipped/failed 24h). Add a `company_kpis` table later for manually-entered business metrics (MRR, runway, etc.) or integrate with Stripe.

#### Missing: Goal Progress

The `goals` table has `metric` and `target` text fields but no numeric `progress` column. Progress bars in the mockup need a 0-100 value.

**Fix:** Add `progress integer DEFAULT 0 CHECK (progress >= 0 AND progress <= 100)` to `goals`. One migration, one edge function update.

#### Missing: Focus Area Health Status

The `focus_areas` table has `status` as `active/paused`, but the mockup shows health indicators: On track, Healthy, Behind, Waiting, Later.

**Options:**
1. Add a `health` column: `CHECK (health IN ('on_track', 'healthy', 'behind', 'waiting', 'later'))` — simple, explicit
2. Compute health from linked features/goals progress — complex, fragile

**Recommendation:** Option 1 — explicit `health` column. The CPO or founder sets it. One migration.

---

## 4. Page-by-Page Data Mapping

### 4.1 Dashboard

| Section | Data source | Query | Write-back |
|---------|-------------|-------|------------|
| **Greeting** | `auth.users` (name), computed stats | Features shipped count, decisions pending count | None |
| **Goals** (3 cards) | `goals` table | `query-goals` with `company_id`, ordered by `position` | "Re-plan" → creates a message to CPO |
| **Needs You** | `action_items` table (new) | Direct Supabase query, `status = 'pending'` | CTA click → `UPDATE action_items SET status = 'resolved'` |
| **Decisions** | `decisions` table (new) | Direct query, `status = 'pending'`, ordered by `created_at` | Accept/Defer/Note → `update-decision` edge function |
| **Activity Feed** | `events` table | Direct query, ordered by `created_at DESC`, limit 20 | "Show yesterday" → paginate with offset |
| **Idea Inbox** | `ideas` table | None (write-only from dashboard) | `create-idea` edge function |
| **Pulse sidebar** | Computed from `features`, `jobs` | Aggregate queries | None |
| **Focus Areas sidebar** | `focus_areas` + `focus_area_goals` + `goals` | `query-focus-areas` | "Review" → message to CPO |
| **Team sidebar** | `jobs` + `machines` + `roles` | Active jobs grouped by role, machine heartbeats | None |

### 4.2 Pipeline

| Section | Data source | Query | Write-back |
|---------|-------------|-------|------------|
| **Metrics bar** | `features` aggregate | Count by status, filtered to last 24h where relevant | None |
| **Filter buttons** | Client state | Re-query with filters applied | None |
| **Kanban columns** | `features` + `ideas` + `jobs` | `get-pipeline-snapshot` edge function (already exists, returns features grouped by status with job counts) | None (v1) |
| **Feature cards** | `features` + `jobs` (progress pips) | Included in pipeline snapshot | Card click → detail view (v2) |
| **Ideas column** | `ideas` table | `query-ideas` with `status` filter | None |
| **Parked section** | `ideas` WHERE `status = 'parked'` | `query-ideas` with `status = 'parked'` | None |
| **Older sections** | `features` WHERE `completed_at < now() - 24h` | Time-filtered query | None |

#### Pipeline Column ↔ DB Status Mapping

After migration 098 simplified feature statuses:

| Visual Column | Data Source | Query |
|---------------|-------------|-------|
| **Ideas** | `ideas` table, `status IN ('new', 'triaged')` | `query-ideas` |
| **Created** | `features.status = 'created'` | Pipeline snapshot |
| **Breaking Down** | `features.status = 'breaking_down'` | Pipeline snapshot |
| **Building** | `features.status = 'building'` | Pipeline snapshot |
| **Combining & PR** | `features.status = 'combining_and_pr'` | Pipeline snapshot |
| **Verifying** | `features.status = 'verifying'` | Pipeline snapshot |
| **Merged** | `features.status = 'merged'` | Pipeline snapshot |
| **Failed** | `features.status IN ('failed', 'cancelled')` | Pipeline snapshot |

The mockup's 12-column layout (Ideas, Triage, Proposal, Ready, Breakdown, Building, Combining, Verifying, PR Ready, Complete, Failed, Shipped) predates migration 098. The real build should use the 8 columns above, matching actual DB statuses. "Shipped" is now "Merged" (the deploy step was removed). Ideas come from the `ideas` table, not features.

### 4.3 Team

| Section | Data source | Query | Write-back |
|---------|-------------|-------|------------|
| **Header stats** | `company_roles` + `machines` + `jobs` | Count persistent roles, machines, active slots | None |
| **Exec cards** | `exec_personalities` + `exec_archetypes` + `roles` + `jobs` | Join personality → archetype for beliefs/traits. Active jobs for current task display. | Archetype change → `UPDATE exec_personalities SET archetype_id` |
| **Archetype picker** | `exec_archetypes` WHERE `role_id = X` | All archetypes for a role | Select → update `exec_personalities` |
| **Core beliefs** | `exec_archetypes.philosophy` | From joined archetype data | None |
| **Engineers sidebar** | `jobs` WHERE `status IN ('dispatched','executing')` AND non-persistent roles | Active ephemeral jobs | None |
| **Machines sidebar** | `machines` table | Direct query, all machines for company | None |
| **Contractors sidebar** | `roles` WHERE contractor-type | `roles` query filtered by slot_type or a contractor flag | None |

---

## 5. Security Model

### 5.1 Auth Flow

Two sign-in methods supported. Both land in the same post-auth flow.

**Magic Link (primary):**
```
Login page → user enters email → "Continue with magic link"
  → supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: origin + '/dashboard' } })
  → Show "Check your email" confirmation state
  → User clicks link in email → redirected to /dashboard with tokens in URL fragment
  → supabase.auth.onAuthStateChange('SIGNED_IN') fires → store session
  → Render dashboard
```

**Google OAuth (secondary):**
```
Login page → "Continue with Google"
  → supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: origin + '/dashboard' } })
  → Browser redirects to Google consent screen
  → Google redirects to Supabase callback → Supabase redirects to /dashboard with tokens
  → Same onAuthStateChange flow as magic link
```

**Session persistence:**
```
Returning visit → supabase.auth.getSession()
  → Valid session? → Render app
  → No session / expired? → Redirect to /login
```

### 5.2 RLS Coverage

| Table | anon | authenticated | Notes |
|-------|------|---------------|-------|
| `companies` | SELECT | SELECT (own) | OK for UI |
| `user_companies` | — | SELECT (own user_id) | OK — drives company switcher |
| `features` | SELECT | SELECT (own company) | OK — pipeline reads |
| `jobs` | SELECT | SELECT (own company) | OK — job progress |
| `machines` | — | SELECT (own company) | OK — team page |
| `roles` | — | SELECT (all) | Global table, no scoping needed |
| `exec_archetypes` | — | SELECT (all) | Global table |
| `exec_personalities` | — | SELECT (own company) | OK — archetype display |
| `events` | — | SELECT (own company) | OK — activity feed |
| `goals` | — | SELECT (own company) | OK |
| `focus_areas` | — | SELECT (own company) | OK |
| `ideas` | — | **service_role only** | **GAP — needs authenticated SELECT policy** |
| `messages` | — | SELECT (own company), INSERT (from_role='human') | OK |
| `deployments` | — | SELECT (own company) | OK |
| `decisions` (new) | — | needs policies | New table |
| `action_items` (new) | — | needs policies | New table |

### 5.3 RLS Gaps to Fix

1. **`ideas` table** — currently service_role only. Needs: `CREATE POLICY "Users can view own company ideas" ON ideas FOR SELECT USING (user_in_company(company_id))`.
2. **`exec_personalities` UPDATE** — archetype picker needs: `CREATE POLICY "Users can update own company personalities" ON exec_personalities FOR UPDATE USING (user_in_company(company_id))`.
3. **`events` table** is not in Realtime publication — activity feed needs either polling or adding to publication.

### 5.4 Netlify Security

- Supabase anon key is safe to embed client-side (RLS protects data)
- No service role key in the browser — ever
- Magic link emails restricted to allowed domains (configure in Supabase Auth settings)
- CORS already configured on edge functions

---

## 6. Realtime Strategy

| Subscription | Table | Trigger | UI Update |
|--------------|-------|---------|-----------|
| `features` | Postgres CDC (UPDATE) | Status changes, new features | Pipeline board card moves, dashboard stats |
| `jobs` | Postgres CDC (INSERT, UPDATE) | Job dispatched, completed, failed | Progress pips on cards, team slot counts |
| `machines` | Postgres CDC (UPDATE) | Heartbeat, status change | Team page heartbeat timer, status dots |
| `decisions` (new) | Postgres CDC (INSERT) | CPO creates decision | Dashboard decision counter, new card in queue |
| `action_items` (new) | Postgres CDC (INSERT) | System creates action item | Dashboard "Needs You" badge |

**Not using Realtime for:**
- `events` — append-only, high volume. Use polling (30s) or paginated fetch on scroll.
- `exec_archetypes` — rarely changes. Fetch on page load.
- `goals`, `focus_areas` — low-change-frequency. Fetch on page load, refresh on focus.

**Existing Realtime channels to avoid:**
- `agent:{machineId}:{companyId}` — internal agent protocol
- `orchestrator:commands` — internal orchestrator protocol

---

## 7. Decision Write-Back Architecture

The key question: "if a decision comes up, is it possible to feed that information back in somewhere?"

**Yes, with this flow:**

```
CPO creates decision
  → INSERT INTO decisions (via edge function or orchestrator)
  → Realtime fires → WebUI shows decision card

Founder resolves decision
  → WebUI calls update-decision edge function
  → UPDATE decisions SET status='resolved', resolution={...}
  → Edge function broadcasts on orchestrator:commands channel:
      { type: "DecisionResolved", decisionId, resolution }
  → Orchestrator receives broadcast → routes to CPO's Realtime channel
  → CPO picks up resolution → acts on it

This works WITHOUT the gateway. The gateway (when built) will formalize
this pattern, but the plumbing already exists:
  - Authenticated users can INSERT into messages (from_role='human')
  - Orchestrator already listens on Realtime broadcast channel
  - CPO already receives Realtime messages from orchestrator
```

**What needs building:**
1. `decisions` table + migration
2. `create-decision` edge function (for CPO to call via MCP)
3. `update-decision` edge function (for WebUI to call)
4. MCP tool `create_decision` added to agent-mcp-server
5. CPO skill update to use `create_decision` instead of Slack for binary/multiple-choice decisions
6. Orchestrator handler for `DecisionResolved` message type

**What does NOT need building:**
- The Realtime broadcast infrastructure (exists)
- The auth and RLS patterns (exist)
- The CPO message reception (exists)

---

## 8. What the Exec Chat Would Need (Future — Not in v1)

Tom flagged this as "a layer above the existing tech." For reference, it would require:

1. **Conversation model** — a `conversations` table (id, company_id, participants, created_at) with messages not scoped to a job
2. **Persistent agent message intake** — CPO/CTO need to listen for human messages on a dedicated channel, not just job-scoped orchestrator commands
3. **Streaming responses** — the current message model is fire-and-forget. Chat needs streaming (SSE or WebSocket)
4. **Context window management** — persistent agents accumulate context. Chat messages need to be injected into the agent's running context or trigger a new turn

This is architecturally distinct from the decision queue (which is structured, async, and doesn't require streaming). Parking for a separate design doc.

---

## 9. Project Structure

```
packages/webui/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── netlify.toml                    # Build + redirects
├── public/
│   └── _redirects                  # SPA fallback: /* /index.html 200
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Router + auth guard
│   ├── tokens.css                  # Design system variables (from mockups)
│   ├── global.css                  # Reset + base styles
│   ├── lib/
│   │   ├── supabase.ts            # Client init (URL + anon key from env)
│   │   ├── auth.ts                # signInWithOtp, onAuthStateChange, signOut
│   │   ├── realtime.ts            # Channel subscriptions
│   │   └── queries.ts             # Typed query functions wrapping edge function calls
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useCompany.ts          # Active company state + switcher
│   │   ├── useRealtimeTable.ts    # Generic CDC subscription hook
│   │   └── usePipelineSnapshot.ts
│   ├── components/
│   │   ├── Nav.tsx                 # Shared nav with company switcher + theme toggle
│   │   ├── CompanySwitcher.tsx
│   │   ├── ThemeToggle.tsx
│   │   └── ... (page-specific components)
│   └── pages/
│       ├── Landing.tsx              # Public landing page (zazig.com)
│       ├── Login.tsx                # Magic link + Google OAuth
│       ├── Dashboard.tsx
│       ├── Pipeline.tsx
│       └── Team.tsx
```

---

## 10. Implementation Plan

### Phase 1: Scaffold + Auth + Read-Only Dashboard

**New tables/migrations:** None
**Goal:** Login, see real data, navigate three pages.

- [ ] Scaffold Vite + React + TypeScript in `packages/webui/`
- [ ] Port design system tokens from mockups to `tokens.css`
- [ ] Build landing page (from `landing.html` mockup)
- [ ] Build login page with magic link + Google OAuth (from `login.html` mockup)
- [ ] Configure Google OAuth provider in Supabase (see Section 15.2)
- [ ] Implement auth guard (redirect unauthenticated users to /login)
- [ ] Build `Nav` component with company switcher (data from `user_companies` + `companies`)
- [ ] Build Dashboard page:
  - Greeting (user name from auth, time-based greeting)
  - Goals section (from `query-goals`)
  - Focus Areas sidebar (from `query-focus-areas`)
  - Activity Feed (from `events` table, polling)
  - Pulse sidebar (computed metrics from `features` + `jobs` aggregate queries)
  - Team sidebar (from `jobs` + `machines` active state)
- [ ] Build Pipeline page:
  - Kanban columns mapped to feature statuses
  - Feature cards with job progress pips
  - Ideas column from `query-ideas`
  - Metrics bar (computed counts)
  - Filter buttons (client-side filtering)
  - Collapsible "Older" sections
- [ ] Build Team page:
  - Exec cards (from `exec_personalities` + `exec_archetypes` join)
  - Archetype display (beliefs, traits from archetype data)
  - Machines sidebar (from `machines` table)
  - Engineers sidebar (from active ephemeral `jobs`)
  - Contractors list (from `roles` where contractor type)
- [ ] Deploy to Netlify
- [ ] Add RLS policy for `ideas` table (authenticated SELECT)

### Phase 2: Realtime + Interactive

**New tables/migrations:** `goals.progress` column, `focus_areas.health` column
**Goal:** Live updates, write-back for non-decision interactions.

- [ ] Add Supabase Realtime subscriptions:
  - `features` CDC → pipeline board updates
  - `jobs` CDC → progress pip updates
  - `machines` CDC → heartbeat timer updates
- [ ] Archetype picker (write-back: `UPDATE exec_personalities`)
- [ ] Add RLS policy for `exec_personalities` UPDATE
- [ ] Idea submission from dashboard (calls `create-idea`)
- [ ] Goal progress bars (migration: add `progress` column)
- [ ] Focus area health badges (migration: add `health` column)
- [ ] Theme persistence (localStorage)
- [ ] Pipeline filter logic (Mine requires mapping user → machine → jobs → features)

### Phase 3: Decision Gateway

**New tables/migrations:** `decisions` table, `action_items` table
**Goal:** CPO can present decisions via WebUI, founder can respond.

- [ ] Create `decisions` table (migration)
- [ ] Create `action_items` table (migration)
- [ ] Build `create-decision` edge function
- [ ] Build `update-decision` edge function
- [ ] Build `create-action-item` edge function
- [ ] Add `create_decision` MCP tool to agent-mcp-server
- [ ] Add `DecisionResolved` handler to orchestrator
- [ ] Update CPO skill to write decisions to DB (dual-write: Slack + decisions table)
- [ ] Build Decisions queue UI (carousel with pagination, accept/defer/note actions)
- [ ] Build "Needs You" UI (action cards with CTA buttons)
- [ ] Realtime subscriptions for `decisions` and `action_items`

### Phase 4: Polish + Future

- [ ] Feature detail view (click card → expanded view with jobs, spec, AC)
- [ ] Pipeline drag-and-drop (manual status override for founder)
- [ ] Mobile-responsive layout
- [ ] Keyboard shortcuts
- [ ] Notification badges (unread decisions count in nav)
- [ ] Export/share pipeline snapshot
- [ ] Exec chat (separate design doc)
- [ ] Business metrics entry (MRR, runway — manual or Stripe integration)

---

## 11. Existing Dashboard Disposition

The current `dashboard/index.html` (Vercel-deployed) should remain running during WebUI development. Once WebUI Phase 1 is deployed and validated:

1. Update Vercel deployment to redirect to Netlify URL
2. Archive `dashboard/` directory
3. Remove Vercel config

No rush — both can coexist.

---

## 12. Open Questions

1. **Pipeline columns** — The mockup has 12 columns but post-migration-098 there are only 8 feature statuses. Should the UI show the simplified 8-column view, or should we re-introduce visual-only columns (Ideas from `ideas` table, split Failed/Cancelled)?

2. **"Mine" filter** — What does "mine" mean for a founder? Features they created? Features in focus areas they care about? Features on their machine? Need to define the filter semantics.

3. **Goal progress** — Should progress be manually set by the founder, computed by the CPO, or derived from linked feature completion rates?

4. **Action item sources** — Beyond CPO-created items, should the system auto-generate action items from blocked jobs? E.g., if a job is blocked with reason "needs API key", auto-create an action item?

5. **Auth allowlist** — Should magic link auth be restricted to specific email domains, or open to anyone with the link? For a "little bit protected" deployment, domain restriction + the magic link itself provides adequate security.

6. **Event feed formatting** — The `events` table stores structured `event_type` + `detail` (jsonb). The mockup shows human-readable prose ("CPO reviewed feature specs and approved 2 for breakdown"). Need a formatting/template layer to convert raw events into readable feed items.

7. **Exec chat timeline** — When should the exec chat design doc be written? After Phase 2 (once the interactive foundation is solid) or in parallel?

---

## 13. Dependencies

| Dependency | Required by | Status |
|------------|-------------|--------|
| Supabase Auth (magic link) | Phase 1 | Configured |
| Supabase Auth (Google OAuth) | Phase 1 | **Needs Google Cloud Console setup — see Section 15.2** |
| `user_companies` RLS | Phase 1 | Deployed |
| `ideas` table RLS for authenticated | Phase 1 | **Needs migration** |
| `goals.progress` column | Phase 2 | **Needs migration** |
| `focus_areas.health` column | Phase 2 | **Needs migration** |
| `exec_personalities` UPDATE RLS | Phase 2 | **Needs migration** |
| `decisions` table | Phase 3 | **Needs migration + edge functions** |
| `action_items` table | Phase 3 | **Needs migration + edge function** |
| CPO `create_decision` MCP tool | Phase 3 | **Needs agent-mcp-server update** |
| Orchestrator `DecisionResolved` handler | Phase 3 | **Needs orchestrator update** |

---

## 14. Design System Reference

The complete token system is defined in the mockup files and should be ported verbatim to `tokens.css`:

**Colors (light):** `--paper: #F7F6F2`, `--white: #FFFFFF`, `--chalk: #E9E6DE`, `--chalk-light: #F0EEE9`, `--dust: #B5B0A2`, `--stone: #7C7868`, `--graphite: #52504A`, `--ink: #1C1B17`, `--ember: #C54B2A`

**Colors (dark):** `--paper: #0C0D10`, `--white: #16181D`, `--chalk: #252830`, `--chalk-light: #1D2026`, `--dust: #505660`, `--stone: #868C98`, `--graphite: #B0B6C3`, `--ink: #EAECF1`, `--ember: #E8553A`

**Status colors:** `--positive`, `--caution`, `--negative`, `--info` (each with `--*-dim` variant)

**Typography:** Plus Jakarta Sans (400–800), JetBrains Mono (400–500)

**Spacing:** 4px base scale (`--sp-1` through `--sp-8`)

**Radii:** `--radius-sm: 6px`, `--radius-md: 10px`, `--radius-lg: 14px`

**Animation:** `fadeUp` (0.5s ease-out, staggered with `.d1`–`.d9` delay classes), `breathe` (4s pulse for status dots)

---

## 15. Auth Setup — Supabase Magic Link + Google OAuth

### 15.1 Magic Link (already working)

Supabase Auth magic link is already configured for the project. Implementation:

```typescript
// Sign in
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    emailRedirectTo: `${window.location.origin}/dashboard`
  }
});

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    // User is authenticated — session.access_token is the JWT
    // session.user.email, session.user.id available
  }
});

// Sign out
await supabase.auth.signOut();
```

### 15.2 Google OAuth (needs setup)

**Step 1: Google Cloud Console**
1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add Authorized JavaScript origins: `https://your-app.netlify.app` (and `http://localhost:5173` for dev)
4. Add Authorized redirect URI: `https://jmussmwglgbwncgygzbz.supabase.co/auth/v1/callback`
5. Copy the **Client ID** and **Client Secret**

**Step 2: Supabase Dashboard**
1. Go to Supabase Dashboard → Authentication → Providers → Google
2. Enable Google provider
3. Paste Client ID and Client Secret from step 1
4. Save

**Step 3: Implementation**
```typescript
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/dashboard`
  }
});
// Browser redirects to Google → back to Supabase callback → back to app
```

### 15.3 Post-Auth: Company Resolution

After sign-in, the app needs to determine which company to show:

```typescript
// 1. Get user's companies
const { data: memberships } = await supabase
  .from('user_companies')
  .select('company_id, companies(id, name)')
  .eq('user_id', session.user.id);

// 2. If no memberships → show "No workspace" or "Join a workspace" page
// 3. If one company → auto-select it
// 4. If multiple → show company switcher, remember last-used in localStorage
```

### 15.4 New User Flow

A new user who signs in via magic link or Google won't be in `user_companies` yet. Options:

1. **Invite-only (recommended for v1):** Use the existing `invites` table. New users see pending invites via `get_my_pending_invites()` and accept to join a company.
2. **Open registration:** Auto-create a company on first sign-in. More complex, not needed yet.

The `invites` table, `accept_invite()`, and `decline_invite()` functions already exist and are deployed.

---

## 16. Mockup Reference

All mockups are in `docs/mockups/` and serve as the definitive visual spec.

| Page | File | Description |
|------|------|-------------|
| **Landing** | `landing.html` | Public landing page for zazig.com. Dark, minimal — hero logo with breathing dot, single tagline ("Your engineering team builds while you sleep."), CTA to sign in. Nav: About, Docs, Sign in. |
| **Login** | `login.html` | Auth gate. Magic link email input (primary) + Google OAuth button (secondary). Shows "Check your email" confirmation state after magic link send. Back link to landing. "Request access" for new users. |
| **Dashboard** | `founder-dashboard-v2.html` | Founder control panel. Greeting with stats, goals, action items, decision queue, activity feed, idea inbox. Sidebar: pulse metrics, focus areas, team summary. |
| **Pipeline** | `pipeline-v2.html` | Kanban board. Feature cards across status columns. Metrics bar, filters (All/Mine/Urgent/Stale), collapsible older sections, ideas column with parked section. |
| **Team** | `team-v2.html` | Exec cards with archetype picker and core beliefs. Sidebar: engineers, machines with slot bars and heartbeat, contractors. |

### Shared design elements across all mockups:
- **Nav:** zazig wordmark with breathing green dot, page links, company switcher dropdown, theme toggle, user avatar
- **Design system:** See Section 14 for full token reference
- **Default theme:** Dark mode
- **Fonts:** Plus Jakarta Sans (body/display), JetBrains Mono (labels/mono)

### URL Structure

```
zazig.com/              → Landing page (public, no auth)
zazig.com/login         → Login page (public, no auth)
zazig.com/dashboard     → Founder dashboard (auth required)
zazig.com/pipeline      → Pipeline board (auth required)
zazig.com/team          → Team management (auth required)
```

All authenticated routes redirect to `/login` if no session. Login redirects to `/dashboard` on success.
