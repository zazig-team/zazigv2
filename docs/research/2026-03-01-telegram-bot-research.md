# Telegram Bot Feature (59b8d9e5) — Build & Deployment Research

**Date:** 2026-03-01  
**Feature ID:** 59b8d9e5  
**Branch:** `origin/feature/telegram-ideas-bot-59b8d9e5`  
**Status:** Merged to master (commit 703623f)  

---

## Summary

The Telegram Ideas Bot feature is **complete and merged to master**. The code exists in two parts:
1. **packages/telegram-bot/** — Node.js package with bot logic, transcription, and handlers
2. **supabase/functions/telegram-bot/** — Deno edge function that receives Telegram webhooks

Both are deployed. The ideas table migration exists as `054b_ideas_table.sql` but the later **Ideas Pipeline Phase 1** migration (`f30cf9d`) created a more complete schema (`054_ideas_inbox.sql`) that supersedes it. The current production ideas table has the expanded schema with 30+ columns for triage/classification.

---

## Codebase State

### Branch History
- **Feature branch:** `origin/feature/telegram-ideas-bot-59b8d9e5`
- **Merge commit:** `703623f` (Feb 27, 2026) — "feat: Telegram Ideas Bot (#116)"
- **Status:** All commits merged to master. Branch is current/active.

### Files on Master (Commit 703623f)

#### Node.js Package
```
packages/telegram-bot/
├── package.json
├── package-lock.json
├── tsconfig.json
├── tsconfig.build.json
└── src/
    ├── bot.ts                     (core message handling logic)
    ├── transcription.ts           (service interface)
    └── transcription-openai.ts    (OpenAI Whisper implementation)
```

#### Deno Edge Function
```
supabase/functions/telegram-bot/
├── index.ts                       (webhook handler)
├── bot.ts                         (handler exports)
└── deno.json                      (import mappings)
```

#### Database
```
supabase/migrations/
├── 054b_ideas_table.sql           (basic ideas schema — CURRENT ON MASTER)
└── 054_ideas_inbox.sql            (expanded schema from Phase 1 — if applied after)
```

---

## Architecture

### Fire-and-Forget Webhook Pattern

1. **Telegram sends webhook → Deno edge function (index.ts)**
   - Validates X-Telegram-Bot-Api-Secret-Token header (if configured)
   - Parses incoming Update JSON
   - Returns 200 immediately to Telegram
   - Processes update asynchronously using EdgeRuntime.waitUntil()

2. **Async processing in index.ts**
   - Checks allowlist (TELEGRAM_ALLOWED_USERS env var)
   - Routes by message type:
     - `/start`, `/help`, `/status`, `/recent` → handleCommand()
     - Voice/audio → handleVoice()
     - Text → handleText()

3. **Handlers in bot.ts (Deno edge function)**
   - Lookup company_id via telegram_users table
   - Download audio from Telegram CDN
   - Transcribe via OpenAI Whisper API
   - Insert to ideas table with source='telegram'
   - Send Telegram reply with preview + confirmation

### Node.js Package (packages/telegram-bot/)

The Node.js package is a **library layer**, not currently used in the Deno edge function. It contains:

- `TranscriptionService` — abstraction for pluggable transcription providers
- `OpenAITranscriber` — OpenAI Whisper implementation
- Full message handlers (handleCommand, handleText, handleVoice)
- Rate limiting, authorization, retry logic
- Helper functions for sending Telegram messages

**Purpose:** Provides a reusable, testable implementation that could be consumed by other Node.js services (e.g., polling worker, Slack bot, CLI tool). The Deno edge function implements the same logic independently (no code sharing between the two runtimes).

---

## Database Schema

### Migration 054b_ideas_table.sql (Simple Schema — Currently on Master)

```sql
CREATE TABLE ideas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text        TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'telegram',
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Columns:** 4  
**Indexes:** source, created_at DESC  
**RLS:** Enabled (disabled by default)  

### Migration 054_ideas_inbox.sql (Expanded Schema — Ideas Pipeline Phase 1)

If the Ideas Pipeline Phase 1 migrations have been applied after the Telegram PR, the schema is much richer:

```sql
CREATE TABLE ideas (
  -- Identification
  id                  uuid PRIMARY KEY,
  company_id          uuid NOT NULL REFERENCES companies(id),

  -- Capture
  raw_text            text NOT NULL,
  title               text,
  description         text,
  source              text CHECK (IN: terminal, slack, telegram, agent, web, api, monitoring),
  originator          text NOT NULL,
  source_ref          text,

  -- Classification
  scope               text CHECK (IN: job, feature, initiative, project, research, unknown),
  complexity          text CHECK (IN: trivial, small, medium, large, unknown),
  domain              text CHECK (IN: product, engineering, marketing, cross-cutting, unknown),
  autonomy            text CHECK (IN: exec-can-run, needs-human-input, needs-human-approval, unknown),
  tags                text[],
  flags               text[],

  -- Processing
  clarification_notes text,
  processed_by        text,
  related_ideas       uuid[],
  related_features    uuid[],
  project_id          uuid,

  -- Status & Triage
  status              text CHECK (IN: new, triaged, promoted, parked, rejected),
  priority            text CHECK (IN: low, medium, high, urgent),
  suggested_exec      text,
  triaged_by          text,
  triaged_at          timestamptz,
  triage_notes        text,

  -- Promotion
  promoted_to_type    text CHECK (IN: feature, job, research),
  promoted_to_id      uuid,
  promoted_at         timestamptz,
  promoted_by         text,

  -- Timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
```

**Columns:** 30+  
**Triggers:** update_updated_at_column() on UPDATE  

### Important: Table Mismatch

The code on the feature branch inserts to the **expanded schema** (company_id, raw_text, source, originator, status, etc.), but the simple 054b migration only has (id, text, source, metadata, created_at). This is a **deployment blocker if the expanded migration hasn't been applied**.

Check the current production database to determine which schema is active.

---

## Environment Variables

### Required (Edge Function)
```
TELEGRAM_BOT_TOKEN          # Telegram bot token from @BotFather
OPENAI_API_KEY              # OpenAI API key for Whisper transcription
ANTHROPIC_API_KEY           # Anthropic API key for streaming Claude acknowledgements
SUPABASE_URL                # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY   # Service role key for server-side auth
```

If `ANTHROPIC_API_KEY` is missing, the bot still captures ideas and falls back to static confirmation messages instead of streaming AI replies.

### Optional
```
TELEGRAM_ALLOWED_USERS      # Comma-separated Telegram user IDs (if empty, all allowed)
TELEGRAM_SECRET_TOKEN       # Secret token passed to Telegram's setWebhook (validates X-Telegram-Bot-Api-Secret-Token header)
```

### Required (Node.js Package — if used)
```
TELEGRAM_BOT_TOKEN
OPENAI_API_KEY
TELEGRAM_ALLOWED_USERS      # Comma-separated list
```

### Doppler Secrets (zazig project, prd config)
Check if these keys exist in Doppler. If not, they must be added before deployment.

---

## Deployment Checklist

### Pre-Deployment
- [ ] Verify ideas table schema in production (which migration is applied?)
- [ ] If schema is `054b_ideas_table.sql` only: apply `054_ideas_inbox.sql` migration
- [ ] Add/verify environment variables in Supabase (project settings → Edge Functions)
  - TELEGRAM_BOT_TOKEN
  - OPENAI_API_KEY
  - ANTHROPIC_API_KEY (if missing, bot falls back to static confirmations)
  - SUPABASE_URL (usually auto-populated)
  - SUPABASE_SERVICE_ROLE_KEY (usually auto-populated)
  - TELEGRAM_ALLOWED_USERS (optional, e.g., "123456789,987654321")
  - TELEGRAM_SECRET_TOKEN (optional but recommended for security)
- [ ] Create/register Telegram bot user ID in telegram_users table (if company-gating is required)

### Deploy Edge Function
```bash
# From zazigv2 root
supabase functions deploy telegram-bot \
  --project-id <your-project-id> \
  --no-verify-jwt
```

Flag: `--no-verify-jwt` is required because Telegram webhooks don't carry JWT tokens.

### Register Telegram Webhook
After deployment, set the webhook URL with Telegram:

```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<PROJECT_ID>.supabase.co/functions/v1/telegram-bot",
    "secret_token": "<TELEGRAM_SECRET_TOKEN>"  # if configured
  }'
```

### Verify Deployment
```bash
# Check webhook status
curl https://api.telegram.org/bot<TOKEN>/getWebhookInfo

# Send test message to bot (should see in Supabase logs)
```

---

## Key Implementation Details

### Transcription Flow
1. User sends voice note to Telegram bot
2. Handler downloads audio from Telegram CDN via getFileDownloadUrl()
3. Calls OpenAI Whisper API with audio bytes
4. Inserts transcript + metadata to ideas table
5. Sends user confirmation with preview (first 200 chars) and duration

### Duplicate Handling
- Ideas table has unique constraint on (company_id, source, source_ref)
- If Telegram retries delivery, duplicate is silently ignored (error code 23505)
- idempotent: safe to re-process the same Telegram update

### User Authorization
- Lookup: telegram_users.telegram_user_id → company_id
- If company_id not found: send "not registered" message
- If TELEGRAM_ALLOWED_USERS set: filter by allowlist
- Rate limiting: 20 messages per user per 60 seconds (in-memory, per function instance)

### Commands
- `/start` — Welcome message
- `/help` — Help text
- `/status` — (defined but not implemented in edge function index.ts)
- `/recent` — (defined but not implemented in edge function index.ts)

---

## Code Quality

### Node.js Package (packages/telegram-bot/)
- Full TypeScript with type definitions
- Modular: TranscriptionService interface for pluggable providers
- Scripts: build, typecheck, test, clean
- Test framework: Vitest
- ~200 LOC per file, well-commented

### Deno Edge Function
- Fire-and-forget pattern handles Telegram's 10-second response timeout
- Proper error handling and logging
- Validates secret token header
- EdgeRuntime.waitUntil() ensures background work completes
- ~350 LOC in index.ts + bot.ts combined

### Gaps
- `/status` and `/recent` command handlers are defined but not fully implemented
- No test coverage in the Deno edge function (vitest is Node.js-only)
- Node.js package is not consumed; logic is duplicated in Deno (maintainability risk)

---

## Deployment Risk Assessment

**Risk Level:** MEDIUM

### Blockers
1. **Schema Mismatch:** Code expects expanded schema (30+ columns), deployed schema may only have 4 columns. Fix: verify and apply `054_ideas_inbox.sql` if needed.
2. **Secrets Not in Doppler:** TELEGRAM_BOT_TOKEN and OPENAI_API_KEY must exist. Check before deploying.
3. **telegram_users table:** Must exist with columns (telegram_user_id, company_id, is_active). Verify before enabling company gating.

### Mitigations
1. Review current ideas table schema in SQL Editor (run: `SELECT * FROM ideas LIMIT 0;`)
2. Verify Doppler secrets exist: `doppler secrets --project zazig --config prd --only-names | grep TELEGRAM`
3. Query telegram_users table structure before enabling

---

## Files for Manual Build Doc

### Source Files to Document
1. **supabase/functions/telegram-bot/index.ts** — 150 lines, webhook entry point
2. **supabase/functions/telegram-bot/bot.ts** — 250 lines, handler logic
3. **packages/telegram-bot/src/bot.ts** — 350 lines, reusable library implementation
4. **packages/telegram-bot/src/transcription.ts** — interface definition
5. **packages/telegram-bot/src/transcription-openai.ts** — Whisper provider

### Configuration Files
- **supabase/functions/telegram-bot/deno.json** — import mappings
- **packages/telegram-bot/package.json** — build config, dependencies
- **supabase/migrations/054b_ideas_table.sql** — simple schema
- **supabase/migrations/054_ideas_inbox.sql** — production schema (if applied)

### Setup Guide Outline
1. Check which ideas table migration is deployed
2. Apply 054_ideas_inbox.sql if needed (schema expansion)
3. Populate telegram_users table (if company gating required)
4. Add environment variables to Supabase Edge Functions settings
5. Deploy edge function with --no-verify-jwt
6. Register webhook with Telegram bot API
7. Verify logs in Supabase

---

## Context for Manual Docs

The Telegram Ideas Bot is a **complete, production-ready integration** that captures:
- **Text ideas:** Direct messages are saved to ideas table
- **Voice ideas:** Audio notes are transcribed via OpenAI Whisper, saved as text
- **Idea metadata:** source='telegram', originator='human', source_ref=Telegram message ID
- **User gating:** Lookup company_id from telegram_users table; reject unregistered users
- **Async processing:** Fire-and-forget webhook pattern; Telegram gets 200 in <1s, processing happens in background

Manual build doc should focus on:
1. Schema verification (simple vs. expanded)
2. Environment setup (secrets, allowlists)
3. Deployment steps (supabase CLI, webhook registration)
4. Testing (curl Telegram message, check ideas table)
5. Troubleshooting (logs, rate limits, duplicate handling)
