# CPO Report — slack-events Edge Function

## Summary
Created the `slack-events` Supabase Edge Function that receives Slack webhook events and routes inbound messages to the running local agent via Supabase Realtime. This is Wave 2, Section 3 of the bidirectional agent messaging plan.

## Discovery
- Read `docs/plans/2026-02-22-agent-messaging-bidirectional.md` Section 3 fully
- Studied existing `orchestrator` Edge Function for Deno patterns, import style, Supabase client creation, and Realtime broadcast pattern
- Read `packages/shared/src/messages.ts` to understand `MessageInbound` type (already merged in Wave 1)
- Read `supabase/functions/_shared/messages.ts` — found `MessageInbound` was not individually re-exported; added it

## Files Changed
- `supabase/functions/slack-events/index.ts` — new Edge Function (main implementation)
- `supabase/functions/slack-events/deno.json` — import map matching existing function pattern
- `supabase/functions/_shared/messages.ts` — added `MessageInbound` to type re-exports

## Implementation Details

### url_verification
Parses JSON body, returns `{ challenge: body.challenge }` with 200.

### Slack Signature Verification
HMAC-SHA256 of `v0:{timestamp}:{rawBody}` using `SLACK_SIGNING_SECRET` via Web Crypto API. Rejects requests older than 5 minutes (replay protection). Uses constant-time comparison.

### Bot Message Skipping
Returns 200 immediately if `event.bot_id` is present.

### Event Deduplication
In-memory bounded Set (max 1000 entries) with FIFO eviction. Deduplicates by `event_id`.

### Agent Lookup
1. Looks up `team_id` → `company_id` + `bot_token` from `slack_installations`
2. Queries `jobs` WHERE `job_type = 'persistent_agent'` AND `status = 'executing'`, joins with `machines` to get machine name and status

### Agent Online Path
- Generates `conversationId = "slack:{team_id}:{channel}:{thread_ts || ts}"`
- Broadcasts `MessageInbound` to `agent:{machineName}` channel via Supabase Realtime
- Uses same subscribe/send/unsubscribe pattern as orchestrator

### Agent Offline Path
- Posts "The CPO is currently offline" reply to Slack using `bot_token` from `slack_installations` via `chat.postMessage`
- Replies in-thread using `thread_ts`

### Deploy Annotation
Must deploy with `--no-verify-jwt` (Slack doesn't send JWTs).

## Acceptance Criteria
- [x] Edge Function created at `supabase/functions/slack-events/index.ts`
- [x] `supabase/functions/slack-events/deno.json` created (matching pattern of existing functions)
- [x] `url_verification` challenge handled
- [x] Slack request signature verified using HMAC-SHA256
- [x] Bot messages skipped (event.bot_id check)
- [x] Event deduplication by event_id (in-memory bounded Set, max 1000)
- [x] Looks up team_id → company_id from slack_installations
- [x] Finds running agent via jobs + machines join
- [x] Agent online: broadcasts MessageInbound to agent:{machineName}
- [x] Agent offline: posts "CPO is currently offline" reply to Slack
- [x] Always returns 200 within 3 seconds
- [x] Deploy annotation: --no-verify-jwt

## Token Usage
- Token budget: claude-ok (wrote code directly)
