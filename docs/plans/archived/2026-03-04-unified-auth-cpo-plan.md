# Unified Auth Plan: CLI + Web UI + Staging/Production

**Date:** 2026-03-04
**Author:** CPO
**Status:** Draft — awaiting CTO review, then Chris approval
**Priority:** High — auth is currently broken for at least one consumer at all times

---

## Problem

Supabase auth has one **Site URL** (default redirect) and a **Redirect URLs** allow list. We now have four consumers that need to authenticate against the same Supabase instance:

1. **CLI (production)** — `zazig start`, authenticates against production Supabase
2. **CLI (staging)** — `zazig-staging start`, authenticates against staging Supabase
3. **Web UI (production)** — `zazig.com`, authenticates against production Supabase
4. **Web UI (staging)** — `zazigv2-webui-staging.vercel.app`, authenticates against staging Supabase

Today these conflict. Changing the Site URL or redirect config to fix one consumer breaks another. Tom and Chris have been trading breakages back and forth.

## Root Cause

The current CLI auth uses magic link or redirect-based flow with localhost URLs. The web UI also needs redirect-based flow. Supabase's Site URL can only point to one place, so whichever is set as the default wins — the other breaks.

## Proposed Solution

### Principle: Every consumer passes an explicit `redirectTo`. No one relies on the Site URL default.

This means all consumers can coexist in the same allow list without conflict.

---

### 1. CLI Auth: Web-Based Flow (Recommended)

**Model:** Same pattern as Vercel CLI, GitHub CLI, Stripe CLI.

The CLI opens the user's browser to a page on the zazig website (not localhost). The user authenticates there. The token is passed back to the CLI.

**Flow:**

```
CLI generates a unique session/device code
  → Opens browser to zazig.com/auth/cli?code=abc123
    → User authenticates via Supabase (email, OAuth, whatever)
      → On success, page stores the session token against the device code
        → CLI polls an endpoint with the device code
          → Gets the token back → authenticated
```

**Why this is better than localhost callback:**
- No local server needed (firewall issues, port conflicts disappear)
- No localhost URLs in the Supabase redirect config
- Works identically on any machine — no OS-specific networking quirks
- Same pattern every developer already knows from other CLIs

**Why this is better than OTP code flow:**
- One click vs switching to email, copying a code, pasting it
- Can support OAuth providers (Google, GitHub) not just email

**Implementation needs (CTO to weigh in):**
- A `/auth/cli` page in the web UI that accepts a device code param
- A way to store and retrieve the session token by device code (could be a Supabase edge function, a simple DB table with TTL, or even Supabase Realtime subscription)
- CLI code to generate device code, open browser, poll for token
- Decision: polling vs Realtime subscription vs SSE for token retrieval

**Fallback:** Keep OTP code flow as a backup for headless/SSH environments where no browser is available. `zazig login --code` or similar flag.

---

### 2. Web UI Auth: Explicit `redirectTo`

Every auth call in the web UI passes `redirectTo` dynamically based on the current origin:

```js
const { error } = await supabase.auth.signInWithOtp({
  email,
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
})
```

This means:
- On `zazig.com` → redirects to `zazig.com/auth/callback`
- On `zazigv2-webui-staging.vercel.app` → redirects to staging URL
- On `localhost:3000` → redirects to localhost (for dev)

Same code, works everywhere. Each URL just needs to be in the Supabase allow list.

---

### 3. Supabase URL Configuration

**Production Supabase:**

| Setting | Value |
|---|---|
| Site URL | `https://www.zazig.com` |
| Redirect URLs | `https://www.zazig.com/**` |
| | `https://zazig.com/**` |
| | `https://zazigv2-webui.vercel.app/**` |
| | `http://localhost:3000/**` (local dev) |
| | `http://127.0.0.1:3000/**` (local dev) |

**Staging Supabase:**

| Setting | Value |
|---|---|
| Site URL | `https://zazigv2-webui-staging.vercel.app` |
| Redirect URLs | `https://zazigv2-webui-staging.vercel.app/**` |
| | `http://localhost:3000/**` (local dev) |
| | `http://127.0.0.1:3000/**` (local dev) |

**Note:** No localhost callback URLs needed for CLI if we go with the web-based flow. The localhost entries above are only for local web UI development (`npm run dev`).

---

### 4. What Gets Removed

Once the web-based CLI flow is live:
- Remove `http://127.0.0.1:*/callback` wildcard port entries (security improvement)
- Remove any CLI-specific localhost redirect URLs
- CLI no longer spins up a local HTTP server for auth

---

## Migration Path

1. **Immediate (no code changes):** Set up Supabase redirect allow list per the tables above. Set Site URL to production web UI. This unblocks web UI auth immediately.
2. **Short term:** Update web UI auth code to pass explicit `redirectTo`. Keep CLI on OTP code flow (Tom's current workaround) as interim.
3. **Medium term:** Build the web-based CLI auth flow (`/auth/cli` page + device code exchange). Replace OTP flow as default, keep as fallback.

Steps 1 and 2 can ship independently and immediately. Step 3 is the proper fix but needs CTO implementation.



---

## Risk

Low. This is additive — we're adding URLs to an allow list and making auth calls explicit. No breaking changes to existing auth providers, policies, or user sessions. Each step can be tested independently.

The only coordination needed is making sure nobody changes the Supabase URL config without checking this plan first. Suggest we treat the redirect URL list as managed config (documented, not ad-hoc).

## CTO Review: (2026-03-04)

**Verdict:** Good plan. The `redirectTo` fix is correct and should ship today. The device-code CLI flow is the right long-term design but has a few decisions to nail down.

---

## Findings

### 1. Immediate Fix — Approve, Ship Now

The `redirectTo` + allow-list changes (Steps 1 & 2) are correct and low-risk. Two notes:

- **`localhost:3000/**` in production Supabase is fine for dev** but document it. If this project ever gets a security audit, wildcard localhost in a prod allow-list will get flagged. Acceptable for now.
- **`window.location.origin` for `redirectTo`** — the web UI currently hardcodes `emailRedirectTo: "/dashboard"` (relative path, not full URL with origin). That's the bug. Fix is exactly what the plan says: `${window.location.origin}/auth/callback`. Straightforward.

### 2. CLI Device-Code Flow — Approve With Modifications

The device-code pattern (RFC 8628 style) is the right call. Every serious CLI does this. Answers to the open questions:

#### Q1: Token exchange — Use polling.

Polling. 3-second interval, 5-minute timeout. Reasons:
- Simplest to implement and debug
- No WebSocket/Realtime dependency for the CLI (the CLI shouldn't need `@supabase/realtime-js`)
- Latency is irrelevant — user is in a browser, 3 seconds is invisible
- This is exactly what GitHub CLI, Vercel CLI, and Stripe CLI do
- If polling endpoint is a Supabase Edge Function, it's ~$0 at our scale

Realtime subscription would add a dependency and connection lifecycle management for zero UX benefit. SSE same story. Don't do it.

#### Q2: Device code storage — DB table + Edge Function.

Simple table:

```sql
CREATE TABLE device_codes (
  code TEXT PRIMARY KEY,       -- crypto random, 32 chars
  session_data JSONB,          -- null until auth completes
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '5 minutes',
  consumed BOOLEAN DEFAULT false
);
```

Two Edge Function endpoints:
- `POST /auth/device/store` — called by the web UI after auth succeeds. Stores tokens against device code. Requires valid auth session (RLS or JWT check).
- `GET /auth/device/poll?code=xxx` — called by CLI. Returns tokens if available, 404 if pending, 410 if expired. **No auth required** (the code itself is the auth factor).

**Security considerations:**
- Device codes must be cryptographically random (256 bits minimum). Not UUIDs — too guessable.
- Rate-limit the poll endpoint (10 req/min per IP). Supabase Edge Functions don't have built-in rate limiting — use a counter column or accept the risk at our scale.
- Mark `consumed = true` after first successful poll. Never serve the same tokens twice.
- 5-minute TTL is standard and correct.

#### Q3: Auth page location — Route in the web UI.

`/auth/cli` as a route in the web UI. Reasons:
- Shares the existing Supabase auth setup (client, providers, styles)
- Can reuse existing sign-in components
- Deploys with the web UI — no separate infrastructure
- The page is simple: authenticate → call Edge Function to store token → show "you can close this tab"

Don't make it an Edge Function page. Separate deploy, separate framework, separate styling. Unnecessary.

#### Q4: Session handling — CLI needs refresh tokens. Non-negotiable.

- Supabase access tokens expire in 1 hour (default)
- The daemon runs continuously and auto-refreshes via `supabase.auth.setSession()`
- If the device-code flow only passes back an access token, the daemon dies after 1 hour
- Current flow already stores and uses refresh tokens in `~/.zazigv2/credentials.json`

The web UI page must call `supabase.auth.getSession()` after auth and pass **both** `access_token` and `refresh_token` to the store endpoint. The CLI receives both via polling.

#### Q5: Staging CLI auth — Separate URLs, same code.

`zazig-staging` opens the **staging** web UI URL (`zazigv2-webui-staging.vercel.app/auth/cli`). Reasons:
- Staging authenticates against the staging Supabase instance
- The staging web UI's Supabase client is already configured for staging
- An "environment param" on the production URL would mean the production web UI needs staging Supabase credentials — config leak
- Keep environments fully isolated. The CLI already knows which environment it targets.

### 3. Security Findings

| Severity | Finding |
|----------|---------|
| **Medium** | Device code polling endpoint is unauthenticated by design. The code is the sole auth factor. Codes must be high-entropy (crypto.randomBytes, not UUID) and single-use. |
| **Low** | `localhost` entries in the production Supabase allow-list. Acceptable for dev. Document the reason. |
| **Low** | Credentials file stores refresh tokens in plaintext. Standard for CLIs. Worth noting for future SOC2. |

### 4. What I'd Change in the Plan

1. **Say "refresh token" not "session token."** The plan says "session token" throughout. Be specific: the CLI needs `access_token` + `refresh_token`. The daemon's auto-refresh depends on it.

2. **Add cleanup strategy for `device_codes`.** TTL columns without a cleanup job do nothing. Either:
   - `pg_cron`: `DELETE FROM device_codes WHERE expires_at < now()` every 5 minutes
   - Or: opportunistic cleanup in the poll function (delete expired rows per invocation). Simpler, good enough at our scale.

3. **Keep OTP fallback.** SSH sessions, CI, containers — no browser. `zazig login --otp` should remain. Low maintenance cost.

4. **Version-control the redirect URL list.** Put the expected allow-list in `docs/supabase-auth-config.md` or better, use `supabase/config.toml` `[auth]` settings. Manual dashboard changes drift.

### 5. Migration Path — One Addition

Steps 1→2→3 ordering is correct. Add:

**Step 1.5:** Fix the web UI `redirectTo` calls immediately after setting the allow-list. Current code uses relative paths (`"/dashboard"`) which Supabase resolves against Site URL. Change to `${window.location.origin}/auth/callback`. One-line fix per auth call. Eliminates the current breakage.

### 6. Architecture Risk

**Low.** Standard auth plumbing. Device-code pattern is RFC 8628. No new infrastructure. One new table, two Edge Functions, one new web route.

Only coordination risk: two people changing Supabase redirect URLs ad-hoc. Lock it down with docs or config-as-code.

---

## Recommendations Summary

| Decision | Recommendation | Confidence |
|----------|---------------|------------|
| Token exchange | Polling (3s interval, 5min timeout) | High |
| Device code storage | Supabase table + 2 Edge Functions | High |
| Auth page | Web UI route (`/auth/cli`) | High |
| Refresh tokens | Must include both tokens | Non-negotiable |
| Staging CLI | Opens staging web UI, fully isolated | High |
| OTP fallback | Keep for headless environments | High |
| Redirect URL config | Version-controlled | Medium |
