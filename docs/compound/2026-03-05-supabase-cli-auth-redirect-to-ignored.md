# Supabase CLI Auth: redirect_to Silently Ignored

**Date:** 2026-03-05
**Tags:** Supabase, GoTrue, `redirect_to`, magiclink, CLI auth, `/auth/v1/magiclink`, "redirect_to not working", localhost callback

## Problem

CLI login sends a magic link with `redirect_to=http://127.0.0.1:3000/callback` but Supabase ignores it. The magic link email redirects to the Site URL (`zazig.com`) instead of localhost. The CLI hangs waiting for a callback that never arrives.

## Context

The CLI uses a localhost HTTP callback server (same pattern as GitHub CLI, Vercel CLI). It sends `redirect_to` in the POST body to `/auth/v1/magiclink`:

```typescript
const body = { email, redirect_to: redirectTo };
await fetch(`${supabaseUrl}/auth/v1/magiclink`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: anonKey },
  body: JSON.stringify(body),
});
```

## Investigation

1. First suspected Supabase wildcard port matching (`http://127.0.0.1:*/callback`) didn't work — but Supabase docs confirm `*` matches non-separator chars (separators are `.` and `/`), so port matching is fine.
2. Checked Supabase GitHub issues — multiple reports of `redirectTo` not being respected.
3. Found the Supabase JS client source: `_request()` adds `redirect_to` as a **URL query parameter**, not in the POST body.
4. Confirmed via bundled `@supabase/supabase-js` in the repo: line 3896 of the bundled client uses `qs["redirect_to"] = options.redirectTo` then appends as query string.

## Solution

Move `redirect_to` from POST body to query parameter:

```typescript
// Before (broken — GoTrue ignores body redirect_to):
body.redirect_to = redirectTo;
const resp = await fetch(`${supabaseUrl}/auth/v1/magiclink`, { ... });

// After (works — GoTrue reads query param):
let url = `${supabaseUrl}/auth/v1/magiclink`;
if (redirectTo) {
  url += `?redirect_to=${encodeURIComponent(redirectTo)}`;
}
const resp = await fetch(url, { ... });
```

## Decision Rationale

Considered replacing raw fetch with `@supabase/supabase-js` `signInWithOtp()` (already a dependency in `setup.ts`). This would prevent future API drift. Chose the minimal query-param fix for speed — the device-code flow (Phase 2) will replace the localhost callback entirely.

## Prevention

- When using GoTrue REST API directly, match the Supabase JS client's behavior — read the client source, don't guess the API contract.
- The `redirect_to` parameter placement is not documented clearly in Supabase docs. If a parameter is silently ignored, check how the official SDK sends it.
- Consider using the SDK instead of raw fetch for auth endpoints.
