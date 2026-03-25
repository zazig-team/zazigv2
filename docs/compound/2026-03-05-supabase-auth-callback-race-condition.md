# Supabase Auth Callback Race: Flash of Login Page

**Date:** 2026-03-05
**Tags:** Supabase, `detectSessionInUrl`, AuthCallback, race condition, "flash of login", React, `onAuthStateChange`

## Problem

Clicking a magic link redirects to `/auth/callback#access_token=...`. The page briefly shows the login page before redirecting to the dashboard. On staging this was more pronounced.

## Context

`AuthCallback.tsx` uses the `useAuth` hook which calls `getCurrentSession()` on mount and listens to `onAuthStateChange`. The Supabase client has `detectSessionInUrl: true` which parses hash tokens.

The race: `getCurrentSession()` resolves before the hash is parsed → returns `null` → `loading=false, session=null` → component navigates to `/login`. Then `onAuthStateChange` fires with the actual session → `LoginRoute` detects session → redirects to `/dashboard`.

## Solution

Guard against premature redirect by checking for hash tokens:

```tsx
useEffect(() => {
  if (loading) return;
  if (session) {
    navigate("/dashboard", { replace: true });
    return;
  }
  // If URL has auth tokens in hash, Supabase is still processing
  const hash = window.location.hash;
  if (hash && (hash.includes("access_token") || hash.includes("error"))) {
    return; // Don't redirect — wait for onAuthStateChange
  }
  navigate("/login", { replace: true });
}, [loading, navigate, session]);
```

## Decision Rationale

Considered adding a fixed delay or retry loop, but checking the hash is deterministic and zero-cost. If hash contains tokens, we know Supabase will process them — just wait. If no hash, redirect to login immediately.

## Prevention

- Any auth callback route that uses `detectSessionInUrl` must account for the async gap between page load and hash processing.
- The Supabase `getSession()` call does NOT wait for hash processing to complete — it returns whatever is in storage at that moment.
