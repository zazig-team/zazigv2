# Telegram Bot: Manual Build Plan

**Date:** 2026-03-01
**Status:** Ready for manual build
**Context:** Feature `59b8d9e5` failed 73x in the pipeline. Code was merged to master on 2026-02-27 (commit 703623f). The implementation is complete but has never been deployed or configured. This plan covers the deployment and configuration steps needed to make it operational.

**Feature branch:** `origin/feature/telegram-ideas-bot-*` (multiple attempts)
**Design spec:** `docs/plans/active/2026-02-25-ideas-pipeline-unified-design.md` (Telegram section)

---

## What was built (on master)

| Component | Status | Notes |
|-----------|--------|-------|
| Edge function: telegram-bot | Complete | Deno webhook handler at `supabase/functions/telegram-bot/` |
| Bot handler module | Complete | `bot.ts` — handleCommand, handleVoice, handleText |
| Voice transcription | Complete | Downloads from Telegram CDN, transcribes via OpenAI Whisper |
| Ideas table integration | Complete | Writes to ideas table with `source='telegram'` |
| Node.js package | Complete | `packages/telegram-bot/` — reusable library (currently unused) |
| Migration | Already applied | Ideas table schema (054_ideas_inbox.sql) deployed separately |

## Architecture

```
Telegram → Webhook POST → Supabase Edge Function (telegram-bot)
  ├── Text message → save to ideas table
  ├── Voice note → download from Telegram CDN → OpenAI Whisper → save to ideas table
  └── /start, /help commands → reply with instructions
```

The edge function uses fire-and-forget: returns 200 immediately, processes async via `EdgeRuntime.waitUntil()`. This prevents Telegram webhook timeouts.

## What's NOT on master

- Webhook registration with Telegram API
- Environment variables in Supabase
- Edge function deployment to Supabase
- `/status` and `/recent` commands (partially implemented)

---

## Manual build steps

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | Verify ideas table schema | | Check for company_id column |
| 2 | Set environment variables in Supabase | | 2 required, 2 optional |
| 3 | Deploy edge function | | `supabase functions deploy telegram-bot --no-verify-jwt` |
| 4 | Register webhook with Telegram | | curl to Telegram Bot API |
| 5 | Test end-to-end | | Send text + voice to bot |

---

## Step-by-step: What you need to run

### Step 1: Verify ideas table schema (SQL Editor)

The edge function expects the full ideas table from the Ideas Pipeline work. Verify the schema is correct:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'ideas'
ORDER BY ordinal_position;
```

You should see columns including: `id`, `company_id`, `raw_text`, `title`, `description`, `source`, `originator`, `status`, `priority`, `tags`, etc. If you only see 4-5 columns (id, text, source, metadata, created_at), apply migration `054_ideas_inbox.sql`.

### Step 2: Set environment variables (Supabase Dashboard → Edge Functions → Secrets)

**Required:**
```
TELEGRAM_BOT_TOKEN=<from @BotFather>
OPENAI_API_KEY=<for Whisper transcription>
```

**Optional:**
```
TELEGRAM_ALLOWED_USERS=<comma-separated Telegram user IDs — restricts who can use the bot>
TELEGRAM_SECRET_TOKEN=<for webhook header validation>
```

If the bot token doesn't exist yet, create one via @BotFather on Telegram:
1. Message @BotFather
2. `/newbot`
3. Follow prompts, save the token

Check Doppler first — these may already be configured:
```bash
doppler secrets --project zazig --config prd --only-names | grep -i telegram
doppler secrets --project zazig --config prd --only-names | grep -i openai
```

### Step 3: Deploy edge function

```bash
cd ~/Documents/GitHub/zazigv2
supabase functions deploy telegram-bot --no-verify-jwt
```

The `--no-verify-jwt` flag is required because Telegram webhooks don't include a Supabase JWT. The function handles its own authentication via the optional `TELEGRAM_SECRET_TOKEN` header.

### Step 4: Register webhook with Telegram

```bash
# Replace {TOKEN} with TELEGRAM_BOT_TOKEN
# Replace {PROJECT_REF} with your Supabase project reference
curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://{PROJECT_REF}.supabase.co/functions/v1/telegram-bot",
    "secret_token": "{TELEGRAM_SECRET_TOKEN}"
  }'
```

Omit `secret_token` if not using header validation.

Verify webhook is set:
```bash
curl "https://api.telegram.org/bot{TOKEN}/getWebhookInfo"
```

### Step 5: Test end-to-end

1. Send a text message to the bot on Telegram
2. Check the ideas table:
```sql
SELECT id, title, raw_text, source, originator, status, created_at
FROM ideas
WHERE source = 'telegram'
ORDER BY created_at DESC
LIMIT 5;
```
3. Send a voice note (tests Whisper transcription)
4. Verify the transcribed text appears in the ideas table

---

## What's deferred

| Component | Status | Notes |
|-----------|--------|-------|
| /status command | Partial | Handler exists but not fully wired |
| /recent command | Partial | Handler exists but not fully wired |
| Node.js package usage | Deferred | Library at packages/telegram-bot/ is complete but unused — no polling consumer yet |
| Test coverage for edge function | Deferred | Vitest tests exist for Node.js package only |
| TELEGRAM_ALLOWED_USERS filtering | Optional | Restrict bot access to specific Telegram user IDs |

## Estimated effort

| Step | Who | Time |
|------|-----|------|
| 1. Verify schema | Tom | 1 min |
| 2. Set env vars | Tom | 5 min |
| 3. Deploy edge function | Tom | 2 min |
| 4. Register webhook | Tom | 3 min |
| 5. Test | Tom | 5 min |
| **Total** | | **~15 min** |
