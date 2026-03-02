# Telegram Bot: Reality Check and Finish Plan

**Original plan date:** 2026-03-01  
**Audit date:** 2026-03-02  
**Status:** IMPLEMENTED and confirmed working

## Summary

The original plan is partly outdated. The `telegram-bot` edge function is already deployed in Supabase, but production readiness is still blocked on external configuration and data checks (webhook, secrets, and Telegram user-to-company mapping).

## What is definitely built

| Component | Status | Evidence |
|-----------|--------|----------|
| Supabase edge function code (`telegram-bot`) | Built | `supabase/functions/telegram-bot/index.ts` + `bot.ts` |
| Fire-and-forget webhook handling | Built | Uses immediate 200 + `EdgeRuntime.waitUntil()` |
| Text message capture to `ideas` table | Built | Inserts `raw_text`, `source='telegram'`, `source_ref`, `status='new'` |
| Voice note transcription via OpenAI Whisper | Built | Downloads Telegram file and calls `/v1/audio/transcriptions` |
| `/start` and `/help` commands | Built | Implemented in edge function command handler |
| Allow-list + webhook secret support | Built | `TELEGRAM_ALLOWED_USERS` and `TELEGRAM_SECRET_TOKEN` paths exist |
| Edge function deployment | Built and live | `supabase functions list` shows `telegram-bot` ACTIVE v3, updated `2026-02-27 13:25:49 UTC` |

## What was inaccurate in the original plan

| Original claim | Reality (2026-03-02) |
|---------------|------------------------|
| "Edge function not deployed" | Outdated. It is deployed and active in Supabase. |
| "Migration is 054_ideas_inbox.sql" | Not true in repo. That file is not present on master. |
| "Node.js package is complete" | Not fully true. Package points to `dist/index.js`, but no `src/index.ts` exists. |
| "Vitest tests exist for Node package" | No test files found under `packages/telegram-bot/` or edge function folder. |
| "`/status` and `/recent` partially implemented" | True only in the Node package; not present in the deployed edge function handler. |

## Important dependency not covered clearly in the original

The edge function requires user-company mapping in `telegram_users`:

- `lookupCompanyId()` queries `telegram_users` with `telegram_user_id` + `is_active=true`
- If no match exists, bot refuses to save ideas and returns "You are not registered..."

No migration for `telegram_users` exists in `supabase/migrations` on master. This table may exist manually in remote DB, but it is not represented in repo migrations.

## Verification gaps (cannot be proven from repo alone)

These are the remaining unknowns to confirm in live environment:

1. Are `TELEGRAM_BOT_TOKEN` and `OPENAI_API_KEY` set in Supabase secrets?
2. Is Telegram webhook currently registered to `/functions/v1/telegram-bot`?
3. Does `telegram_users` exist in remote DB?
4. Is your Telegram user mapped to a company in `telegram_users`?

## Finish checklist

### Human-required (Tom)

These require credentials or external systems:

1. Verify Supabase edge function secrets:
   - `TELEGRAM_BOT_TOKEN`
   - `OPENAI_API_KEY`
   - optional: `TELEGRAM_ALLOWED_USERS`, `TELEGRAM_SECRET_TOKEN`
2. Verify Telegram webhook:
   - `getWebhookInfo`
   - if needed, `setWebhook` to `https://{PROJECT_REF}.supabase.co/functions/v1/telegram-bot`
3. Verify DB tables and mapping rows:
   - `ideas` has required columns (`company_id`, `raw_text`, `source_ref`, etc.)
   - `telegram_users` exists
   - at least one active mapping row for your Telegram user ID
4. Run live E2E test:
   - send text and voice
   - confirm rows appear in `ideas` with `source='telegram'`

### Codex-can-do (now, in repo)

1. Add a proper migration for `telegram_users` (and optional seed/helper SQL).
2. Add `/status` and `/recent` to the Supabase edge function (currently only `/start` + `/help`).
3. Add tests for `supabase/functions/telegram-bot` handler logic.
4. Fix `packages/telegram-bot` package exports (`index.ts` + export surface) or mark package explicitly as internal prototype.
5. Add a small runbook script (`scripts/telegram-bot-smoke-check.sh`) for repeatable validation.

## Fastest path to "finished"

If you only need operational capture now (text + voice):

1. Confirm secrets
2. Confirm webhook
3. Confirm `telegram_users` mapping
4. Send text + voice test

That is sufficient even without `/status`, `/recent`, or Node package cleanup.

## SQL snippets for manual checks

```sql
-- 1) ideas columns
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ideas'
ORDER BY ordinal_position;
```

```sql
-- 2) telegram_users exists?
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telegram_users'
ORDER BY ordinal_position;
```

```sql
-- 3) current mappings
SELECT telegram_user_id, company_id, is_active
FROM telegram_users
ORDER BY created_at DESC
LIMIT 20;
```

```sql
-- 4) latest telegram ideas
SELECT id, company_id, raw_text, source, source_ref, status, created_at
FROM ideas
WHERE source = 'telegram'
ORDER BY created_at DESC
LIMIT 10;
```
