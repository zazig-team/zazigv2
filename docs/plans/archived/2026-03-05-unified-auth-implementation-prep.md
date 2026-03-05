# Unified Auth Implementation Prep (Critical Change)

**Date:** 2026-03-05
**Based on:** `docs/plans/active/2026-03-04-unified-auth-cpo-plan.md`
**Status:** Ready for implementation
**Risk level:** Critical - auth/domain mistakes will break login across CLI and Web

---

## Objective

Implement unified auth safely across all five consumers:

1. **CLI production** (`zazig`) - authenticates against production Supabase
2. **CLI staging** (`zazig-staging`) - authenticates against staging Supabase
3. **Web production** (`zazig.com` on Vercel) - authenticates against production Supabase
4. **Web staging** (`zazig-webui-staging.vercel.app` - must be created) - authenticates against staging Supabase
5. **Local dev** (`localhost:3000`) - authenticates against whichever Supabase the dev configures

`zazig-staging` login reliability is a first-class requirement, not a follow-up.

---

## What Already Happened (Context)

The current broken state is the result of a back-and-forth between Tom and Chris (Slack, 2026-03-04):

1. Site URL was originally `http://localhost:3000` (for CLI magic link flow)
2. Chris changed Site URL to the Netlify URL (`zazig-webui.netlify.app`) to fix web auth
3. This broke CLI login — magic link emails started redirecting to the website instead of `localhost`
4. Tom changed CLI to code-based/OTP login, which worked for him
5. Chris didn't `cd packages/cli && npm link` so he never got Tom's OTP change
6. Site URL was reverted to `http://localhost:3000` to unbreak CLI
7. Web auth is now broken again

**The core problem:** Supabase has ONE Site URL. CLI wants localhost. Web wants the website. Whoever sets it last wins; the other breaks. This plan eliminates the conflict permanently.

**Agreed direction (Tom + Chris, meeting + Slack 2026-03-04):** Move webui to `zazig.com` on Vercel. Use `zazig.com` as Site URL. Move CLI login off localhost entirely (device-code flow). Chris confirmed: "sounds good and agree we need both logins to work without localhost."

---

## Current State Audit (2026-03-05)

### Production Supabase URL Config (BROKEN)

Audited from Supabase dashboard (2026-03-05 screenshot):

| Setting | Current Value | Problem |
|---------|--------------|---------|
| **Site URL** | `http://localhost:3000` | Reverted to this after Vercel URL broke CLI. Should be production web URL. |
| **Redirect URLs** (7 total) | `http://127.0.0.1:3000` | CLI localhost only |
| | `http://127.0.0.1:3000/callback` | CLI localhost only |
| | `http://127.0.0.1:*/callback` | Wildcard port - security concern |
| | `http://localhost:3000` | CLI localhost only |
| | `http://localhost:3000/callback` | CLI localhost only |
| | `http://localhost:*/callback` | Wildcard port - security concern |
| | `http://localhost:54321/callback` | Local Supabase dev |

**Zero production web URLs in the redirect list.** No `zazig.com`, no Vercel URLs. Web auth cannot work.

### Staging Supabase URL Config

**ACTION: Tom needs to screenshot staging Supabase URL Configuration page before any changes.** Likely has similar gaps — needs baseline.

### Web UI Auth Code

- **Deployment:** Netlify was interim (`zazig-webui.netlify.app`). Moving to Vercel + `zazig.com`. Vercel config exists in repo (`packages/webui/vercel.json`).
- **Supabase client:** Falls back to production defaults if `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` not set (`packages/webui/src/lib/supabase.ts`)
- **Auth calls:** `signInWithMagicLink()` and `signInWithGoogle()` both redirect to `${window.location.origin}/dashboard` - dynamic origin is correct
- **Callback handling:** No explicit `/auth/callback` route. Uses Supabase SDK `detectSessionInUrl: true` which parses tokens from URL hash on any page load
- **No staging web deployment exists.** There is no separate Vercel site for staging. If one were created without `VITE_SUPABASE_*` env vars, it would silently authenticate against production.

### CLI Auth Code

- **Flow:** Magic link with localhost HTTP callback server (`packages/cli/src/commands/login.ts`)
- **Port:** Prefers 3000, falls back to random available port
- **Redirect:** `http://127.0.0.1:{port}/callback` - requires localhost in Supabase redirect list
- **Staging:** `zazig-staging` sets `ZAZIG_ENV=staging` and hardcodes staging Supabase URL/key (`packages/cli/src/staging-index.ts`)
- **Credentials:** Already env-scoped: `credentials.json` (prod) vs `credentials-staging.json` (staging) (`packages/cli/src/lib/credentials.ts`)

### Local Agent

- **Auth:** Reads tokens from `credentials.json`, refreshes via Supabase SDK, writes refreshed tokens back to same file (`packages/local-agent/src/connection.ts`)
- **Env awareness:** Reads `SUPABASE_URL` from env (set by CLI at daemon spawn time). Staging CLI passes staging URL.
- **Credential path:** Writes to `~/.zazigv2/credentials.json` regardless of environment - but this is OK because the CLI passes tokens via env vars at spawn time, not by file path.

---

## Critical Blockers

### 1. Production Supabase has no web URLs in redirect list

**Impact:** Web magic link and Google OAuth cannot redirect back to the web UI.
**Fix:** Add production web URLs to redirect list. Change Site URL. See Supabase Config section below.

### 2. No staging web deployment exists

**Impact:** Can't test web auth against staging Supabase.
**Fix:** Create a staging Vercel site (or Vercel project) with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing to staging Supabase.

### 3. Web auth silent production fallback

**Impact:** If staging web build lacks `VITE_SUPABASE_*` env vars, it authenticates against production.
**Fix:** Fail fast in non-localhost builds when env vars are missing. Add build-time check.

### 4. CLI localhost callback requires wildcard port redirects

**Impact:** `http://127.0.0.1:*/callback` and `http://localhost:*/callback` are security-loose entries.
**Fix:** Keep during transition. Remove only after device-code flow is default and stable.

### 5. Staging email delivers code, not link

**Impact:** CLI waits for browser callback but staging may send a 6-digit code instead of a clickable link.
**Fix:** Implement dual-mode CLI login (link callback + OTP code entry) in Phase 0.

### 6. CI deploy sequencing

**Impact:** Edge functions can deploy before migrations they depend on.
**Fix:** Enforce migration-first dependency for auth-sensitive deploys.

---

## Decided: Vercel + zazig.com

**Decision (Tom + Chris meeting, 2026-03-04):** Vercel for both staging and production. Custom domain `zazig.com` for production. Tom said "I'm happy with using Vercel", Chris agreed. Tom to move web UI back into Vercel and link through the domain.

**Current state (verified via `vercel project ls --scope zazig`):**

| Project | URL | Status |
|---------|-----|--------|
| `zazigv2-webui` | `https://www.zazig.com` | LIVE - production, custom domain configured |
| `zazigv2-webui-staging` | `https://zazigv2-webui-staging.vercel.app` | LIVE - staging |
| `dashboard` | `https://dashboard-zazig.vercel.app` | Chris's dashboard (separate) |

Both projects already exist under the `zazig` Vercel team (owner: `caksabre` / Chris). `zazig.com` domain is configured and routing to production.

Netlify site at `zazig-webui.netlify.app` (site ID: `dc0c201a-c481-4724-8b07-40e089f3b6d4`) was an interim step — can be decommissioned once Vercel is confirmed working.

**Still needs verification:**
- Do both Vercel projects have `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set? (Can't check without linking — Tom or Chris to verify in Vercel dashboard)
- Does the staging project point to staging Supabase or production?

---

## Supabase Auth Configuration (Target State)

### Production Supabase

Once `zazig.com` custom domain is configured on Vercel, it becomes both the Site URL and the primary redirect.

| Setting | Value | Reason |
|---------|-------|--------|
| **Site URL** | `https://zazig.com` | Default redirect for magic link emails. |
| **Redirect URLs** | | |
| | `https://zazig.com/**` | Production web (custom domain) |
| | `https://www.zazig.com/**` | Production web (www variant) |
| | `https://zazigv2-webui.vercel.app/**` | Vercel auto-assigned domain (alias) |
| | `http://localhost:3000/**` | Local web dev |
| | `http://127.0.0.1:3000/**` | Local web dev (alt) |
| | `http://127.0.0.1:*/callback` | CLI localhost callback (TEMPORARY - remove after device-code ships) |
| | `http://localhost:*/callback` | CLI localhost callback (TEMPORARY - remove after device-code ships) |

**What changes from today:**
- Site URL: `http://localhost:3000` -> `https://zazig.com`
- Added: `https://zazig.com/**`, `https://www.zazig.com/**`, Vercel project URL
- Kept: localhost wildcard port entries (CLI still needs them until device-code ships)
- Removed: `http://localhost:54321/callback` (local Supabase dev, not needed in production)
- Removed: `http://127.0.0.1:3000` and `http://localhost:3000` (redundant with `/**` glob versions)
- Removed: `http://127.0.0.1:3000/callback` and `http://localhost:3000/callback` (covered by `*/callback` wildcards)

**Why this doesn't break CLI (yet):** The localhost wildcard entries (`http://127.0.0.1:*/callback`, `http://localhost:*/callback`) remain in the redirect list. CLI magic link flow sends `redirectTo=http://127.0.0.1:{port}/callback` which matches these. The Site URL change only affects magic link emails that DON'T specify a `redirectTo` — and the CLI always specifies one explicitly.

### Staging Supabase

| Setting | Value | Reason |
|---------|-------|--------|
| **Site URL** | `https://zazig-webui-staging.vercel.app` | Default redirect for staging emails. Adjust if Vercel assigns a different subdomain. |
| **Redirect URLs** | | |
| | `https://zazig-webui-staging.vercel.app/**` | Staging web |
| | `http://localhost:3000/**` | Local web dev against staging |
| | `http://127.0.0.1:3000/**` | Local web dev against staging (alt) |
| | `http://127.0.0.1:*/callback` | CLI staging localhost callback (TEMPORARY) |
| | `http://localhost:*/callback` | CLI staging localhost callback (TEMPORARY) |

### Google OAuth Redirect URIs

Google Cloud Console authorized redirect URIs must also include the Supabase auth callback URLs. For each Supabase project:

- Production: `https://jmussmwglgbwncgygzbz.supabase.co/auth/v1/callback`
- Staging: `https://ymgjtrbrvhezxpwjuhbu.supabase.co/auth/v1/callback`

**ACTION:** Verify these are configured in Google Cloud Console. If Google OAuth only works on one environment, this is likely why.

### Cross-Environment Isolation Rules

- Production Supabase redirect list must NEVER contain staging URLs
- Staging Supabase redirect list must NEVER contain production URLs
- No URL should appear in both lists (except localhost for local dev)
- This config MUST be version-controlled in `docs/supabase-auth-config.md` — ad-hoc dashboard edits are how we got into this mess
- Any change to Supabase auth config requires updating the version-controlled doc AND notifying the other developer

---

## The Staging Web Question

**"What if I'm trying to login to the staging WebUI but auth has to run via prod?"**

This MUST NOT happen. The architecture prevents it if set up correctly:

1. **Staging web build** gets `VITE_SUPABASE_URL=https://ymgjtrbrvhezxpwjuhbu.supabase.co` and staging anon key as build-time env vars
2. **Staging web Supabase client** initializes with staging project URL
3. **Auth calls** go to staging Supabase, not production
4. **Redirect URLs** in staging Supabase include the staging web domain
5. **User accounts** are separate - staging Supabase has its own `auth.users` table

If the staging web build does NOT have these env vars set, the shared package defaults kick in and it silently authenticates against production. This is the bleed risk.

**Mitigation (must ship in Phase 0):**

Add to `packages/webui/src/lib/supabase.ts`:
```typescript
// Fail fast: non-localhost builds MUST set Supabase env vars explicitly
if (typeof window !== 'undefined' && !window.location.hostname.match(/localhost|127\.0\.0\.1/)) {
  if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
    throw new Error(
      'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set for non-localhost builds. ' +
      'This prevents staging from silently authenticating against production.'
    );
  }
}
```

---

## Credential File Conventions

Already implemented correctly in the CLI:

| Environment | File | Set by |
|-------------|------|--------|
| Production | `~/.zazigv2/credentials.json` | `zazig login` |
| Staging | `~/.zazigv2/credentials-staging.json` | `zazig-staging login` |

Local agent credential refresh writes back to the same file the CLI read from. This is already env-aware because the daemon inherits `ZAZIG_ENV` from the CLI that spawned it.

**No changes needed here.** Blocker #3 from the original Codex doc is already resolved.

---

## Existing Sessions During Cutover

When Phase 3 switches CLI default to device-code flow:
- Existing `credentials.json` files with valid refresh tokens remain valid
- No forced re-auth required
- Device-code flow produces the same credential format (access_token + refresh_token)
- Users only re-auth when their refresh token naturally expires or they run `zazig login` again

---

## Human Actions (Needs Both Tom AND Chris)

This work bypasses the pipeline because it affects the pipeline itself. Config changes are human-only. Code changes go through Codex via the multi-agent plan below.

### Tom Must Do

1. **Verify Vercel env vars** — check both `zazigv2-webui` and `zazigv2-webui-staging` in Vercel dashboard:
   - Production must have `VITE_SUPABASE_URL=https://jmussmwglgbwncgygzbz.supabase.co` + production anon key
   - Staging must have `VITE_SUPABASE_URL=https://ymgjtrbrvhezxpwjuhbu.supabase.co` + staging anon key
   - If staging has no env vars or has production values, fix immediately — this is the bleed risk
2. **Screenshot staging Supabase URL Configuration** before any changes (baseline)
3. **Update production Supabase auth config** per the tables below (Site URL + redirect URLs)
4. **Update staging Supabase auth config** per the tables below
5. **Verify Google OAuth redirect URIs** in Google Cloud Console
6. **Test login on both environments after config changes** — web + CLI
7. **After Chris merges code PRs:** `git pull origin master && npm install && npm run build && cd packages/cli && npm link`

### Chris Must Do

1. **Confirm staging Vercel project env vars** point to staging Supabase (he owns the Vercel team)
2. **After any CLI code merges to master:** `cd packages/cli && npm link` (this is what broke his flow last time — the CLI binary on his machine was stale)
3. **Test `zazig login` and `zazig-staging login`** after code changes
4. **Test web login on `www.zazig.com`** after Supabase config changes
5. **Review and approve** auth-related PRs before production promotion

### Both Must Do

- **Never edit Supabase URL Configuration without notifying the other person** — ad-hoc edits are how we got into this mess
- **After any auth config change:** both test their own login flows before calling it done
- **Keep `docs/supabase-auth-config.md` updated** when redirect URLs change

---

## Multi-Agent Implementation Plan (Codex)

The coding work is implemented by Codex using specialized agents. This is NOT a human task split — it's how Codex will organize the code changes.

### 1) `architect` - Design Authority
- Owns final technical design and phase sequencing
- Produces ADR decisions: callback route, device-code contract, fallback behavior, rollout strategy
- Rejects scope creep (no Realtime/SSE in v1 unless forced)

### 2) `frontend` - Web Auth Engineer
- Owns web auth route and redirect behavior
- Files:
  - `packages/webui/src/lib/auth.ts`
  - `packages/webui/src/lib/supabase.ts`
  - `packages/webui/src/App.tsx`
  - add `/auth/callback` and `/auth/cli` route/page(s)
- Ensures origin-based redirects with no Site URL dependency

### 3) `backend` - Supabase/Auth Exchange Engineer
- Owns DB migration + edge function contracts for device code
- Files:
  - `supabase/migrations/*auth_device*.sql`
  - `supabase/functions/auth-device-store/*`
  - `supabase/functions/auth-device-poll/*`
  - `supabase/config.toml` function `verify_jwt` settings
- Enforces single-use code, expiry, and secure token handling

### 4) `worker_high` (CLI-focused) - CLI Auth Engineer
- Owns CLI migration from localhost callback to device-code polling
- Files:
  - `packages/cli/src/commands/login.ts`
  - `packages/cli/src/staging-index.ts`
  - `packages/cli/src/lib/credentials.ts`
- Keeps OTP/headless fallback (`--otp`) through rollout

### 5) `devops` - Release/Env Engineer
- Owns deploy ordering and environment guardrails
- Files:
  - `.github/workflows/deploy-edge-functions.yml`
  - `.github/workflows/deploy-production.yml`
  - web deployment envs (Vercel)
- Enforces migrations-before-functions and manual production promotion gates

### 6) `reviewer` - Dedicated Code Reviewer (Required)
- Independent gatekeeper; does not implement features
- Reviews each PR for:
  - auth bypasses
  - staging/prod isolation breakage
  - token leakage/replay risk
  - rollback readiness
- Must approve before any production promotion

---

## Phase Plan

### Phase 0 - Unblock Login (Do This Now)

**Goal:** Make web auth and CLI auth work simultaneously without manual config toggling.

**Steps:**

1. **Screenshot staging Supabase URL Configuration** for baseline before any changes (TW: done as *supabase baseline config.png*)
2. **Update production Supabase URL config** per the table above:
   - Site URL: `http://localhost:3000` -> `https://zazig.com`
   - Add `https://zazig.com/**` to redirect list
   - Remove redundant specific-path localhost entries (keep the wildcards)
3. **Update staging Supabase URL config** per the table above:
   - Site URL -> `https://zazig-webui-staging.vercel.app`
   - Add staging web domain + localhost entries to redirect list
4. **Verify staging Vercel project env vars** (`zazigv2-webui-staging` already exists at `zazigv2-webui-staging.vercel.app`):
   - Must have `VITE_SUPABASE_URL=https://ymgjtrbrvhezxpwjuhbu.supabase.co` + staging anon key
   - If missing or pointing to production, fix in Vercel dashboard and redeploy
5. **Verify production Vercel project env vars** (`zazigv2-webui` at `www.zazig.com`):
   - Must have `VITE_SUPABASE_URL=https://jmussmwglgbwncgygzbz.supabase.co` + production anon key
   - Even though the code defaults to production, being explicit prevents the bleed risk pattern
6. **Add build-time env guard** in `packages/webui/src/lib/supabase.ts` (fail fast if non-localhost build has no env vars)
7. **Fix web auth redirectTo:** Change `${window.location.origin}/dashboard` to `${window.location.origin}/auth/callback` in both `signInWithMagicLink()` and `signInWithGoogle()`
8. **Add `/auth/callback` route** in web UI that handles token extraction and redirects to dashboard
9. **Implement CLI dual-mode login:** Accept both magic link callback AND typed OTP code (for when staging sends a code instead of a link)
10. **Version-control the redirect URL config** in `docs/supabase-auth-config.md`
11. **Both Tom and Chris: after CLI code merges to master:**
    - `git pull origin master && npm install && npm run build`
    - `cd packages/cli && npm link`
    - This is what broke Chris's flow last time — stale local binary

**Acceptance:**

1. `zazig login` succeeds (magic link, localhost callback)
2. `zazig-staging login` succeeds (magic link or OTP code)
3. Magic-link login works on `zazig.com`
4. Magic-link login works on `zazig-webui-staging.vercel.app`
5. Google OAuth works on production web
6. Google OAuth works on staging web
7. No manual Supabase dashboard edits needed between consumers
8. Staging web build fails at startup if `VITE_SUPABASE_*` env vars are missing
9. Chris and Tom can both log in to CLI and web simultaneously without breaking each other

### Phase 1 - Isolation Hardening

**Goal:** Close remaining bleed paths before introducing new auth flow.

**Steps:**

1. **CI deploy ordering:** Make migration jobs complete before edge function deploys in both staging and production workflows
2. **Add CI check:** Confirm staging build artifacts contain staging Supabase URL, not production
3. **Audit Google OAuth config:** Verify authorized redirect URIs in Google Cloud Console match what's in both Supabase projects

**Acceptance:**

1. Running `zazig` and `zazig-staging` concurrently does not interfere (already true - verify)
2. Staging build artifact always points to staging Supabase
3. Deployment cannot publish auth-dependent edge functions before their migration
4. Google OAuth works on both staging and production web domains

### Phase 2 - Device-Code Flow (Staging Dark Launch)

**Goal:** Build and prove the new CLI auth path on staging before touching production.

**Steps:**

1. **Create `auth_device_codes` table** - migration with TTL, single-use semantics:
   ```sql
   CREATE TABLE auth_device_codes (
     code TEXT PRIMARY KEY,           -- crypto.randomBytes(32).toString('hex')
     session_data JSONB,              -- null until auth completes, then {access_token, refresh_token}
     created_at TIMESTAMPTZ DEFAULT now(),
     expires_at TIMESTAMPTZ DEFAULT now() + interval '5 minutes',
     consumed BOOLEAN DEFAULT false
   );
   -- Cleanup: opportunistic delete in poll function, no pg_cron needed at our scale
   ```
2. **Add `auth-device-store` edge function** (POST, JWT required) - web UI calls after auth completes
3. **Add `auth-device-poll` edge function** (GET, `verify_jwt=false`, rate-limited by code) - CLI polls
4. **Add `/auth/cli` web route** - accepts `?code=xxx`, authenticates user, calls store endpoint, shows "you can close this tab"
5. **Add CLI `--device` flag** - generates code, opens browser to `{web_url}/auth/cli?code={code}`, polls for tokens
6. **Both `zazig --device` and `zazig-staging --device` must work** - staging opens staging web URL, production opens production web URL
7. **Cleanup:** poll function deletes expired codes opportunistically on each invocation

**Security requirements:**

- Device codes: `crypto.randomBytes(32)` - not UUIDs
- Single-use: `consumed = true` after first successful poll, never serve twice
- 5-minute TTL
- Poll must return both `access_token` AND `refresh_token` (daemon needs refresh for long-running sessions)
- Rate limit poll endpoint (10 req/min per code, enforced by counter column or application logic)

**Acceptance:**

1. 20+ successful staging device logins across multiple machines
2. Poll returns pending/ready/expired states correctly
3. Token refresh works beyond 1-hour session lifetime
4. Replay test: second poll after consume returns 410
5. Both CLIs pass identical login test suite

### Phase 3 - Production Cutover

**Goal:** Switch defaults without breaking existing users.

**Steps:**

1. Promote migration + edge functions + web changes to production via `zazig promote`
2. Switch CLI default from localhost-callback to device-code (keep `--otp` fallback)
3. Run 7-day stability window
4. After stability window: remove `http://127.0.0.1:*/callback` and `http://localhost:*/callback` from production Supabase redirect list
5. Keep `http://localhost:3000/**` for local web dev permanently

**Acceptance:**

1. 7-day window with zero auth incidents
2. No staging/production cross-auth incidents
3. Rollback plan documented and tested (previous auth config snapshot, previous web deployment, previous CLI version)
4. `zazig login --otp` still works as fallback

---

## Required Test Matrix (Promotion Gate)

### Web Login Matrix

| Domain | Magic Link | Google OAuth |
|--------|-----------|-------------|
| Production web | MUST PASS | MUST PASS |
| Staging web | MUST PASS | MUST PASS |
| localhost:3000 (prod Supabase) | MUST PASS | MUST PASS |
| localhost:3000 (staging Supabase) | MUST PASS | MUST PASS |

### CLI Login Matrix

| Binary | Link callback | OTP code | Device flow | Headless `--otp` |
|--------|--------------|----------|-------------|-----------------|
| `zazig` | MUST PASS | MUST PASS | MUST PASS (Phase 2+) | MUST PASS |
| `zazig-staging` | MUST PASS | MUST PASS | MUST PASS (Phase 2+) | MUST PASS |

### Security Tests

- One-time consume: second device-code poll returns 410
- Expired code: poll after 5 minutes returns expired
- Brute force: invalid codes return 404, no information leakage
- No credential file cross-write: running both CLIs concurrently writes to separate files

### Isolation Tests

- Staging web cannot authenticate against production Supabase
- Production web cannot authenticate against staging Supabase
- Staging web build without env vars fails at startup (not silently uses production)
- No staging domain appears in production Supabase redirect list

---

## Deployment Guardrails

1. **Snapshot current Supabase auth config** (both projects) before any edits - screenshot or export
2. **Version-control redirect URL lists** in `docs/supabase-auth-config.md`
3. **Manual approval required** before production Supabase auth config changes
4. **Rollback assets prepared before Phase 3:**
   - Previous auth config snapshot (both Supabase projects)
   - Previous Vercel deployment ID (both sites)
   - Previous production CLI version (npm)
   - Previous commit SHA

---

## Kickoff Sequence

1. **Right now (Tom):** Screenshot staging Supabase auth config for baseline.
2. **Right now (Tom + Chris):** Verify Vercel env vars on both projects (staging + production). Both projects already exist and are deployed.
3. **Session 1 (config, Tom):** Phase 0 steps 1-5 — Supabase dashboard changes + Vercel env var verification. No code changes. Can do in 30 min.
4. **Session 2 (code, Codex):** Phase 0 steps 6-9 — web callback route + CLI dual-mode login + build-time env guard. One PR.
5. **After merge (both):** `git pull && npm install && npm run build && cd packages/cli && npm link`. Then both test login.
6. **Session 3:** Phase 0 step 10 — version-control the auth config doc.
7. **Later:** Phase 1 (CI hardening), Phase 2 (device-code flow), Phase 3 (production cutover).

Sessions 1 and 2 can happen same day. Config changes (Session 1) unblock web login immediately. Code changes (Session 2) unblock CLI dual-mode.
