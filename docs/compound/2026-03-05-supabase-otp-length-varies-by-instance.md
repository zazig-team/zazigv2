# Supabase OTP Code Length Varies Between Instances

**Date:** 2026-03-05
**Tags:** Supabase, OTP, `{{ .Token }}`, "code too long", "8 digit code", staging vs production

## Problem

Production Supabase sends 6-digit OTP codes. Staging Supabase sends 8-digit codes. The web UI had `maxLength={6}` and `normalizeOtp` truncating to 6 digits, silently breaking staging OTP verification.

## Context

Supabase doesn't expose OTP length in the dashboard. The GoTrue config `GOTRUE_MAILER_OTP_LENGTH` controls this. Different Supabase instances (especially free tier vs pro, or different regions/versions) may default to different lengths. The email template `{{ .Token }}` renders whatever length GoTrue generates.

## Solution

Make client-side OTP handling flexible:

```typescript
// Before: hardcoded 6
function normalizeOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}
// canVerify: otpCode.length === 6
// maxLength={6}

// After: accepts 6-8
function normalizeOtp(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}
// canVerify: otpCode.length >= 6
// maxLength={8}
```

Also removed "6-digit" from UI copy — now just says "Enter code".

## Prevention

- Never hardcode OTP length assumptions. Supabase can change defaults between versions.
- When building multi-environment apps, test auth flows on EVERY environment — staging and prod may behave differently in surprising ways.
