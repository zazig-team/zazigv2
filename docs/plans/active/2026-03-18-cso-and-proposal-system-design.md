# CSO Role & Proposal System Design

**Date:** 2026-03-18
**Status:** Draft
**Authors:** Tom Weaver, Claude
**Part of:** Org Model, Sales Infrastructure

## 1. Problem

Zazig needs to sell its managed service offering. There is no sales exec in the org model, no system for creating and delivering client proposals, and no way to track engagement with those proposals. The first client opportunity (Live Beyond) has a hard deadline of May 30, 2026.

Three things need to exist:
1. A Chief Sales Officer exec role with personality archetypes
2. A proposal delivery system (auth-gated, branded pages on zazig.com)
3. An actual proposal for Live Beyond

## 2. Architecture

### Track 1 — CSO Exec Role

New persistent exec role following the CPO/CTO pattern.

**Role definition:**

| Field | Value |
|-------|-------|
| name | `cso` |
| is_persistent | `true` |
| default_model | `opus` |
| slot_type | `claude_code` |
| skills | `brainstorming`, `internal-proposal`, `review-plan`, `deep-research`, `x-scan` |
| mcp_tools | Scoped to proposals + CRM reads (not pipeline tools) |

**3 Personality Archetypes:**

#### Relationship Builder (default for zazig-dev)

Consultative, trust-first, long-game selling. Listens deeply, builds partnerships not transactions.

| Dimension | Default | Bounds |
|-----------|---------|--------|
| verbosity | 65 | [40, 85] |
| technicality | 30 | [15, 50] |
| formality | 60 | [35, 80] |
| proactivity | 55 | [30, 75] |
| directness | 45 | [25, 65] |
| risk_tolerance | 40 | [20, 60] |
| autonomy | 45 | [25, 65] |
| analysis_depth | 70 | [45, 90] |
| speed_bias | 40 | [20, 60] |

**Philosophy:**
- Trust before transaction
- Listen twice, pitch once
- Long-term value > quick close
- Understand their world before presenting yours
- Proposals should feel like partnership invitations, not sales pitches

**Anti-patterns:**
- Pushing for a close before the client is ready
- Leading with price instead of value
- Generic proposals that don't reflect the client's language and priorities

**Voice:** Warm, professional, unhurried. Uses the client's own words back to them. Frames everything as "we" not "us and you."

#### Closer

Direct, metrics-driven, urgency-focused. Every conversation ends with a next step.

| Dimension | Default | Bounds |
|-----------|---------|--------|
| verbosity | 25 | [10, 45] |
| technicality | 40 | [20, 60] |
| formality | 45 | [25, 65] |
| proactivity | 85 | [65, 100] |
| directness | 90 | [70, 100] |
| risk_tolerance | 70 | [50, 90] |
| autonomy | 70 | [50, 90] |
| analysis_depth | 30 | [15, 55] |
| speed_bias | 85 | [65, 100] |

**Philosophy:**
- Pipeline is oxygen
- Every conversation ends with a next step
- Price anchoring is honesty — show the alternative cost first
- Objections are buying signals
- Speed of follow-up = speed of close

**Anti-patterns:**
- Leaving a meeting without a defined next action
- Discounting without getting something in return
- Talking past the close

**Voice:** Terse, confident, numbers-forward. Uses concrete timelines and specific figures. Never vague.

#### Evangelist

Vision-selling, storytelling, thought-leadership-driven. Makes the client feel the future.

| Dimension | Default | Bounds |
|-----------|---------|--------|
| verbosity | 70 | [45, 90] |
| technicality | 25 | [10, 45] |
| formality | 35 | [15, 55] |
| proactivity | 75 | [55, 95] |
| directness | 60 | [35, 80] |
| risk_tolerance | 65 | [40, 85] |
| autonomy | 60 | [35, 80] |
| analysis_depth | 50 | [30, 70] |
| speed_bias | 65 | [40, 85] |

**Philosophy:**
- Sell the vision, not the product
- Stories > specs
- Make them feel the future
- Content is the top of the funnel
- The best close is when the client sells themselves

**Anti-patterns:**
- Getting lost in vision without grounding in deliverables
- Overselling capabilities that don't exist yet
- Confusing enthusiasm with commitment

**Voice:** Energetic, narrative-driven, paints pictures. Uses analogies and "imagine..." framing. Balances inspiration with credibility.

**Root constraints (same 6 as CPO/CTO):**
1. Never fabricate capabilities or commitments
2. Never share internal pricing models or cost structures with clients
3. Never commit to timelines without engineering validation
4. Always escalate legal/contractual questions to Tom
5. Never disparage competitors
6. Always get explicit approval before sending proposals

### Track 2 — Proposal System

#### Data Model

**`proposals` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Used in URL: `/proposals/{id}` |
| `company_id` | uuid (FK) | Multi-tenant, RLS via `user_in_company()` |
| `title` | text | e.g. "Zazig × Live Beyond — Managed Service Proposal" |
| `status` | text | `draft`, `sent`, `viewed`, `accepted`, `declined`, `expired` |
| `content` | jsonb | `{ sections: [{ key, title, body_md, order }] }` |
| `client_name` | text | "Live Beyond" |
| `client_logo_url` | text | nullable |
| `client_brand_color` | text | nullable, hex colour for accent theming |
| `prepared_by` | text | Display name for gate page |
| `allowed_emails` | text[] | Google OAuth allowlist |
| `pricing` | jsonb | `{ phases: [{ name, monthly, duration_months, deliverables }], total_year1, loan_note_terms }` |
| `valid_until` | timestamptz | Proposal expiry |
| `viewed_at` | timestamptz | First view timestamp |
| `created_by` | uuid (FK) | auth.users |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

CHECK constraint on status: `draft`, `sent`, `viewed`, `accepted`, `declined`, `expired`.

**`proposal_views` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | |
| `proposal_id` | uuid (FK) | |
| `viewer_email` | text | |
| `viewed_at` | timestamptz | |
| `duration_seconds` | integer | nullable |

Tracks every view for engagement analytics.

#### RLS

**Internal access (authenticated + company member):** Full CRUD on `proposals` via `user_in_company(company_id)`.

**Proposal viewer access:**

```sql
CREATE FUNCTION public.user_can_view_proposal(pid UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.proposals
    WHERE id = pid
    AND (
      -- zazig team always has access
      (auth.jwt() ->> 'email') LIKE '%@zazig.com'
      -- or email is in the allowlist
      OR (auth.jwt() ->> 'email') = ANY(allowed_emails)
    )
  )
$$ LANGUAGE sql SECURITY DEFINER;
```

Proposal viewers get SELECT on limited columns (no internal pricing, no `created_by`).

#### Auth Flow

1. Recipient gets invitation email via Resend: "You've been invited to view a proposal"
2. Clicks link → `zazig.com/proposals/{uuid}`
3. Already has session (e.g. `@zazig.com` team member) → straight to content
4. No session → co-branded gate page:
   - `[Zazig logo] × [Client logo]`
   - "A proposal prepared exclusively for {client_name}"
   - "Sign in with Google →"
   - Prepared by {prepared_by}, {date}
5. Signed in, email not authorized → premium "Request Access" page
6. Signed in + authorized → full proposal renders

**Gate page data:** `view-proposal` returns a lightweight public payload (title, client_name, client_logo_url, client_brand_color, prepared_by, date) without auth. Full content requires auth + email check.

#### Edge Functions

- **`create-proposal`** — creates proposal, triggers Resend invitation email
- **`view-proposal`** — returns public gate data (no auth) or full content (auth + email check)
- **`request-proposal-access`** — logs request, notifies proposal owner via Resend

#### Resend Integration

- API key in Doppler: `RESEND_API_KEY` (zazig/prd)
- Send from: `proposals@zazig.com` (requires domain verification in Resend)
- Templates: invitation email, access request notification

#### WebUI Route

`/proposals/:id` — standalone page, outside dashboard layout. Own layout component with no sidebar/nav. Renders proposal content from jsonb sections as markdown.

### Track 3 — Live Beyond Proposal Content

#### Executive Summary
Zazig provides a managed CPO + CTO service powered by AI-native development. Tom Weaver serves as pseudo-CPO, Chris Evans as pseudo-CTO. AI agents compress traditional agency timelines and costs by 5-10x. All costs are fronted by Zazig and deferred into a loan note, repaid after Live Beyond raises funding.

#### Phase 1 — MVP Sprint (March → May 30) ~$5K/month

| # | Deliverable | Description |
|---|------------|-------------|
| 1 | Launch website | `livebeyond.world` — multi-language (EN/PL/DE), expert pages with QR code landings, waitlist capture, book presale links |
| 2 | Longevity Map experience | Gamified path through 5 levels of the longevity game, web-based for instant QR access |
| 3 | Self-diagnostic onboarding | "Where are you on the longevity map?" questionnaire, personalizes the path |
| 4 | Initial iOS app | Native app shipping the Longevity Map + diagnostic to the App Store, ready for LifeSummit Berlin |
| 5 | Clickable demo app | Frontend-only prototype showing the full platform vision (habits, personalization, library, retreats) — investor walk-through |
| 6 | Investor deliverables | 1-pager for deck, 2-year cost projection |

#### Phase 2 — Full Platform Build (June → ongoing) ~$3.5K/month

- Longevity Calendar (daily/weekly/annual reminders from diagnostic data)
- Habit builder & tracker (3 habits max, 20-30 day cycles)
- Content library (structured courses from 300hrs of interview footage)
- Personalized guidance (wearables → blood biomarkers → gene testing, progressive)
- Retreat waitlist & booking system
- Affiliate/partnership recommendations engine
- Android app
- Community features & multiplayer elements
- Multi-language expansion (Chinese, Portuguese)
- Analytics dashboard for Marek's team

#### Pricing Rationale

- Phase 1 higher rate: sprint with hard deadline + investor deliverables
- Phase 2 drops: infrastructure established, agents work more autonomously
- Total Year 1: ~$45K vs the $1.5M agency quote — headline differentiator
- Loan note: full amount deferred, repaid after Series A or equivalent raise

#### Team Section

- **Tom Weaver** — CPO. Track record includes building technology processing 30M orders/day.
- **Chris Evans** — CTO. Technical architecture and engineering leadership.
- **Zazig Platform** — AI-native development: what "managed service" means in practice, how AI agents compress delivery timelines.

#### Timeline

```
March ──────── May 30 ──────── September ──────── Ongoing
  │              │                 │                  │
  │  Phase 1     │  Phase 2       │  Movie launch    │
  │  MVP Sprint  │  Full build    │  Book markets    │
  │              │                │                  │
  ├─ Website     ├─ Calendar     ├─ Android         │
  ├─ Map         ├─ Habits       ├─ Personalization │
  ├─ Diagnostic  ├─ Library      ├─ Community       │
  ├─ iOS app     ├─ Retreats     ├─ Scale           │
  ├─ Demo app    ├─ Affiliates   │                  │
  └─ Investor    └─ Guidance     │                  │
    deliverables                  │                  │
                                  │                  │
              LifeSummit Berlin ──┘                  │
              Die Zeit article                      │
```

## 3. What We're NOT Building

- No CRM table (future CSO capability)
- No CSO pipeline (future — CSO will eventually get its own pipeline like engineering)
- No proposal editor UI (proposals created via edge function / direct DB)
- No proposal versioning (edit in place)
- No client branding system beyond logo + accent colour
- No Slack integration for proposal notifications (Resend email only)

## 4. Implementation Sequence

### Migrations (can be one or split):
1. CSO role + 3 archetypes + zazig-dev personality seed
2. `proposals` table + `proposal_views` table + RLS + `user_can_view_proposal()` function

### Edge Functions:
3. `create-proposal` + `view-proposal` + `request-proposal-access`
4. Resend integration (API key in Doppler, domain verification)

### WebUI:
5. `/proposals/:id` route — co-branded gate page + proposal renderer
6. Frontend design for proposal page (standalone layout, Zazig branding)
7. Team page update — CSO shows alongside CPO/CTO with archetype picker

### Content:
8. Write Live Beyond proposal content (structured jsonb)
9. Seed first proposal record with content + Marek's email in allowlist

## 5. Open Questions

1. **Resend domain verification** — need to verify `zazig.com` in Resend. Who owns DNS? Tom can do this.
2. **CSO CLAUDE.md** — should the CSO get a file-based operating manual (like the user mentioned), or follow existing pattern of DB-only prompts? Recommendation: DB prompt for now, CLAUDE.md when CSO runs persistent sessions.
3. **Proposal PDF export** — Marek may want to share a PDF with investors. Not in scope but worth noting as a fast follow.
4. **Clickable demo app tooling** — frontend-only prototype could be a separate Vercel deploy or a route within the main app. TBD during implementation.
5. **Pricing finalization** — $5K/$3.5K monthly figures are ballpark. CSO can refine these as more deal data comes in.
