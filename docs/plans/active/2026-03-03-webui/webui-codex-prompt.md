# WebUI Build Prompt

## What This Is

You are building the **zazig WebUI** — a founder control panel for an AI-powered software engineering orchestration platform. It's a React SPA that connects to a live Supabase backend and deploys to Netlify.

## Context Documents

Read these files before writing any code:

1. **Design doc** — `docs/plans/2026-03-03-webui-design.md` — This is the canonical reference. It contains:
   - Full tech stack decisions (Section 2)
   - Complete database schema audit — every table, what exists, what's missing (Section 3)
   - Page-by-page data mapping — exactly which queries feed which UI sections (Section 4)
   - Security model and RLS coverage (Section 5)
   - Realtime subscription strategy (Section 6)
   - Auth setup with code samples for magic link + Google OAuth (Section 15)
   - Project file structure (Section 9)
   - Implementation phases with checklists (Section 10)

2. **Mockups** — These are the definitive visual spec. Each is a standalone HTML file with complete CSS:
   - `docs/mockups/landing.html` — Public landing page
   - `docs/mockups/login.html` — Auth page (magic link + Google OAuth)
   - `docs/mockups/founder-dashboard-v2.html` — Main dashboard
   - `docs/mockups/pipeline-v2.html` — Pipeline kanban board
   - `docs/mockups/team-v2.html` — Team management

3. **Napkin** — `.claude/napkin.md` — Codebase gotchas, spelling conventions, patterns that work

## Tech Stack

- **Vite + React + TypeScript** — scaffold in `packages/webui/`
- **Vanilla CSS with design system variables** — port tokens from the mockups into `src/tokens.css`. Do NOT use Tailwind. The design system is already fully defined.
- **Supabase JS client** (`@supabase/supabase-js`) — for auth, queries, and realtime
- **React Router** — for SPA routing between pages
- **Netlify** — static deploy with `_redirects` for SPA fallback

## Design System

The mockups define a complete token system. Extract it verbatim from the HTML files — don't invent new values. Key points:

- **Fonts**: Plus Jakarta Sans (400-800) for body/display, JetBrains Mono (400-500) for labels/mono. Load from Google Fonts.
- **Dark mode is default** (`data-theme="dark"` on html). Light mode is also defined. Use CSS custom properties that swap per theme.
- **Colors**: `--paper`, `--white`, `--chalk`, `--chalk-light`, `--dust`, `--stone`, `--graphite`, `--ink`, `--ember` plus status colors (`--positive`, `--caution`, `--negative`, `--info`) each with `--*-dim` variants.
- **Spacing**: 4px base scale (`--sp-1` through `--sp-8`)
- **Animation**: `fadeUp` (staggered entry with delay classes), `breathe` (pulsing status dot)
- **Brand**: "zazig" wordmark followed by a breathing green dot. Dot is AFTER the text, not before.

## Supabase Connection

The Supabase URL and anon key are already embedded in `packages/shared/src/index.ts`. Use those same values. The anon key is safe for client-side use — RLS policies protect all data.

```
URL: https://jmussmwglgbwncgygzbz.supabase.co
```

The anon key can be found in `packages/shared/src/index.ts`.

## Auth

Two sign-in methods:

1. **Magic link (primary)**: `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })`
2. **Google OAuth (secondary)**: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`

Google OAuth requires setup in Google Cloud Console first — see design doc Section 15.2. For initial dev, magic link alone is sufficient.

After auth, resolve the user's companies via `user_companies` table, then scope all queries to the active `company_id`.

## What to Build (Phase 1)

Follow the Phase 1 checklist in the design doc Section 10. In order:

### 1. Scaffold
- Vite + React + TypeScript in `packages/webui/`
- `tokens.css` ported from mockups (both light and dark theme variables)
- `global.css` with reset and base styles
- `netlify.toml` with build config
- `public/_redirects` with `/* /index.html 200`

### 2. Auth + Routing
- `src/lib/supabase.ts` — client init
- `src/hooks/useAuth.ts` — session state, sign in/out
- `src/hooks/useCompany.ts` — active company from `user_companies`
- `src/App.tsx` — React Router with auth guard (unauthenticated → /login, authenticated → /dashboard)
- Landing page at `/` (public)
- Login page at `/login` (public)

### 3. Shared Components
- `Nav.tsx` — sticky top bar with zazig wordmark + breathing dot, page links (Dashboard/Pipeline/Team), company switcher dropdown, theme toggle, user avatar
- `CompanySwitcher.tsx` — dropdown showing user's companies from `user_companies` join `companies`
- `ThemeToggle.tsx` — toggles `data-theme` attribute, persists to localStorage

### 4. Dashboard Page (`/dashboard`)
Read the mockup `founder-dashboard-v2.html` for exact layout. Two-column grid (main + 320px sidebar).

Data sources (see design doc Section 4.1):
- Greeting: user name from `auth.getUser()`, time-based greeting, computed stats
- Goals: `query-goals` edge function
- Activity feed: `events` table, ordered by `created_at DESC`, limit 20
- Focus areas sidebar: `query-focus-areas` edge function
- Pulse sidebar: aggregate queries on `features` and `jobs` for ship rate, active count
- Team sidebar: active jobs grouped by role, machine heartbeats
- Idea inbox: `create-idea` edge function on submit

The Decisions and "Needs You" sections need tables that don't exist yet (Phase 3). For now, show them with static placeholder data matching the mockup.

### 5. Pipeline Page (`/pipeline`)
Read the mockup `pipeline-v2.html` for exact layout. Full-width horizontal kanban.

Data sources (see design doc Section 4.2):
- Use `get-pipeline-snapshot` edge function — it returns features grouped by status with job counts
- Ideas column: `query-ideas` edge function
- Pipeline column mapping (post migration 098):
  - Ideas → `ideas` table
  - Created → `features.status = 'created'`
  - Breaking Down → `features.status = 'breaking_down'`
  - Building → `features.status = 'building'`
  - Combining & PR → `features.status = 'combining_and_pr'`
  - Verifying → `features.status = 'verifying'`
  - Merged → `features.status = 'merged'`
  - Failed → `features.status IN ('failed', 'cancelled')`
- Feature cards show: title, description (2-line clamp), priority dot, age, job progress pips
- Filters (All/Mine/Urgent/Stale) are client-side for v1
- Metrics bar: computed counts from the snapshot data

### 6. Team Page (`/team`)
Read the mockup `team-v2.html` for exact layout. Two-column grid (main + 340px sidebar).

Data sources (see design doc Section 4.3):
- Exec cards: `exec_personalities` joined with `exec_archetypes` and `roles`
- Archetype display: beliefs from `exec_archetypes.philosophy`, traits from `dimensions`
- Machines sidebar: `machines` table — show name, status, slot bars, heartbeat age
- Engineers sidebar: active ephemeral jobs from `jobs` table
- Contractors: filter `roles` for contractor types (breakdown-specialist, project-architect, verification-specialist, monitoring-agent)

## Important Rules

1. **Match the mockups exactly.** They define every color, font size, spacing value, and interaction. Don't improvise the design.
2. **Use the existing edge functions** for data fetching wherever possible (listed in design doc Section 3.2). Only fall back to direct `supabase.from()` queries for tables that don't have edge functions.
3. **Never expose the service role key** in browser code. Only the anon key.
4. **Dark mode is the default.** Both themes must work.
5. **The breathing green dot** is after "zazig", not before. It uses the `breathe` CSS animation (4s ease-in-out infinite).
6. **Spelling**: "zazig" (lowercase), "Supabase" (not SuperBase), "canons" (not cannons).
7. **Don't over-engineer.** Phase 1 is read-only except for idea submission and theme toggle. No realtime subscriptions yet (that's Phase 2).
8. **Company scoping**: Every data query must include `company_id` matching the user's active company. RLS enforces this server-side, but pass it explicitly in edge function calls.

## URL Structure

```
/              → Landing (public)
/login         → Login (public)
/dashboard     → Dashboard (auth required)
/pipeline      → Pipeline (auth required)
/team          → Team (auth required)
```

## File Structure

```
packages/webui/
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── netlify.toml
├── public/
│   └── _redirects
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── tokens.css
│   ├── global.css
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── auth.ts
│   │   └── queries.ts
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useCompany.ts
│   │   └── usePipelineSnapshot.ts
│   ├── components/
│   │   ├── Nav.tsx
│   │   ├── CompanySwitcher.tsx
│   │   └── ThemeToggle.tsx
│   └── pages/
│       ├── Landing.tsx
│       ├── Login.tsx
│       ├── Dashboard.tsx
│       ├── Pipeline.tsx
│       └── Team.tsx
```

Start by reading the design doc and all five mockup HTML files, then build Phase 1 in order: scaffold → auth → shared components → dashboard → pipeline → team.
