# Telegram Bot Webhook Silently Stops Working (401 Unauthorized)

**Date:** 2026-03-03
**Tags:** Telegram, webhook, "verify_jwt", Supabase Edge Function, 401, "Unauthorized", `--no-verify-jwt`, bot down

## Problem
Telegram ideas inbox bot stopped receiving messages. No errors visible from the Telegram side — messages just silently disappeared. The bot appeared "down" with no obvious cause.

## Context
The Telegram bot is a Supabase Edge Function (`telegram-bot`) that receives webhook POSTs from Telegram's servers. Telegram webhooks cannot send JWTs — they authenticate via a custom `X-Telegram-Bot-Api-Secret-Token` header instead. The function must be deployed with `--no-verify-jwt` so the Supabase gateway lets the request through to the function code, which does its own secret token validation.

## Investigation
1. Checked Doppler for `TELEGRAM_BOT_TOKEN` — not there (it's a Supabase-native secret, not in Doppler)
2. Checked Supabase project secrets via Management API — all four Telegram secrets present (`TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY`, `TELEGRAM_SECRET_TOKEN`, `TELEGRAM_ALLOWED_USERS`)
3. Checked edge function deployment status — `ACTIVE`, version 13
4. Pinged the function directly with a dummy POST — got `401`
5. Checked function config via Management API — **`verify_jwt: true`**

Root cause: the function had been redeployed (now at v13) without the `--no-verify-jwt` flag, which reset `verify_jwt` back to `true`. The Supabase gateway was rejecting all Telegram webhook requests before they ever reached the function code.

## Solution
Flipped `verify_jwt` to `false` via the Supabase Management API:

```bash
curl -X PATCH "https://api.supabase.com/v1/projects/<PROJECT_REF>/functions/telegram-bot" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verify_jwt": false}'
```

Bot immediately started receiving messages again.

## Decision Rationale
Used the Management API PATCH instead of redeploying because:
- Faster — no build/deploy cycle
- No risk of introducing code changes
- Confirms the fix is isolated to the `verify_jwt` flag

For permanent fix, always include `--no-verify-jwt` when deploying:
```bash
SUPABASE_ACCESS_TOKEN=... npx supabase functions deploy telegram-bot --no-verify-jwt --project-ref <PROJECT_REF>
```

## Prevention
- **Always deploy with `--no-verify-jwt`** for any edge function that receives external webhooks (Telegram, Slack, GitHub, Stripe, etc.)
- The deploy command in the napkin and MEMORY.md already includes the flag — use it as-is, don't improvise
- Consider a deploy script or CI step that enforces `--no-verify-jwt` for webhook functions
- Add a periodic smoke check (the `scripts/telegram-bot-smoke-check.sh` script exists for this) to catch silent failures early
