# CPO Report — agent-message Edge Function (outbound relay)

## Summary
Created the `agent-message` Edge Function that receives outbound reply requests from agents (via the MCP tool) and routes them to the correct external platform (Slack) by parsing the opaque `conversationId`.

This is Wave 2, Step 4 of the bidirectional agent messaging plan.

## Discovery
- Read plan doc Section 4 fully — understood conversationId format and routing logic
- Read existing `orchestrator` Edge Function to match patterns (Deno.serve, env vars, JSON responses, deno.json imports)
- Confirmed `conversationId` split: `slack:T123:C456:1234.5678` → 4 parts via `split(':')`
- Confirmed `slack_installations` table has `team_id TEXT PRIMARY KEY` and `bot_token TEXT NOT NULL`

## Files Changed
- `supabase/functions/agent-message/deno.json` — new file (import map matching existing pattern)
- `supabase/functions/agent-message/index.ts` — new file (Edge Function implementation)

## Implementation Details
- **Auth**: Deployed WITHOUT `--no-verify-jwt` (Supabase verifies JWT). Function also validates bearer token matches `SUPABASE_ANON_KEY` for defense-in-depth.
- **Routing**: Parses `conversationId` prefix to determine adapter. Currently supports `slack:` prefix only.
- **Slack adapter**: Fetches `bot_token` from `slack_installations` using service_role client, POSTs to `https://slack.com/api/chat.postMessage` with `channel`, `text`, `thread_ts`.
- **Error handling**: Returns structured `{ ok: false, error: "..." }` for all failure modes (missing fields, unknown prefix, missing Slack installation, Slack API errors).
- **Status codes**: 400 (bad request/unknown prefix), 401 (unauthorized), 405 (wrong method), 502 (Slack API failure).

## Acceptance Criteria
- [x] Edge Function created at `supabase/functions/agent-message/index.ts`
- [x] `supabase/functions/agent-message/deno.json` created (matching pattern of existing functions)
- [x] Accepts POST with JSON body: `{ conversationId: string, text: string, jobId: string }`
- [x] Auth: validates `Authorization: Bearer <token>` header — accepts SUPABASE_ANON_KEY
- [x] Parses `conversationId` prefix to determine adapter (`slack:` -> Slack)
- [x] For Slack: extracts `team_id`, `channel`, `thread_ts` from conversationId parts
- [x] Fetches `bot_token` from `slack_installations` WHERE `team_id = parsed_team_id` using service_role client
- [x] POSTs to `https://slack.com/api/chat.postMessage` with `channel`, `text`, `thread_ts`
- [x] Returns `{ ok: true }` on success
- [x] Returns `{ ok: false, error: "..." }` on failure (missing token, Slack API error, unknown prefix)
- [x] Handles unknown conversationId prefix gracefully (return 400)
- [x] Does NOT deploy with --no-verify-jwt (this function validates its own auth header)

## Token Usage
- Token budget: claude-ok
- Approach: Direct implementation (no codex delegation needed — small, focused function)
