# Agent Messaging: Bidirectional Agent <-> Orchestrator <-> External Platform

## Context
The CPO can receive Slack messages (via Socket Mode on the local agent) but can't reply. The current design is fragile — if the local agent isn't running, Slack messages are lost. The fix is to move external platform communication to the backend (Supabase), making the wire protocol between agent and orchestrator platform-agnostic.

## Architecture

```
INBOUND (someone messages an agent):
  Slack/Discord/etc.
    -> Platform Adapter (Edge Function: slack-events)
    -> generates conversationId, looks up company + agent
    -> agent online? -> broadcast MessageInbound via Realtime -> local agent -> tmux inject
    -> agent offline? -> orchestrator replies "agent offline" via adapter

OUTBOUND (agent wants to reply):
  Agent calls MCP tool: send_message(conversation_id, text)
    -> MCP server (local stdio subprocess)
    -> HTTP POST to Edge Function: agent-message
    -> parses conversationId prefix to determine adapter (slack:... -> Slack)
    -> posts via platform API using stored bot token
```

**Key principle:** The agent never knows about Slack. It receives `MessageInbound` with an opaque `conversationId` and replies with `MessageOutbound` echoing that ID. The orchestrator/adapter handles all platform routing.

## Wire Protocol (shared package)

### New message types

```typescript
// Orchestrator -> Agent: "someone sent you a message"
interface MessageInbound {
  type: "message_inbound";
  protocolVersion: number;
  conversationId: string;  // opaque ID (e.g. "slack:T123:C456:1234.5678")
  from: string;            // human-readable sender ("@tom")
  text: string;            // message content
}

// Agent -> Orchestrator: "I want to send a reply"
interface MessageOutbound {
  type: "message_outbound";
  protocolVersion: number;
  jobId: string;
  machineId: string;
  conversationId: string;  // echo back the inbound conversationId
  text: string;
}
```

`conversationId` format: `{adapter}:{adapter-specific-routing-data}` — opaque to agents, parsed only by the orchestrator's outbound Edge Function.
- Slack: `slack:{team_id}:{channel_id}:{thread_ts}`
- Future Discord: `discord:{guild_id}:{channel_id}:{message_id}`

## Database

### New table: `slack_installations`

```sql
CREATE TABLE slack_installations (
  team_id         TEXT PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES companies(id),
  team_name       TEXT,
  bot_token       TEXT NOT NULL,
  bot_user_id     TEXT NOT NULL,
  app_id          TEXT NOT NULL,
  scope           TEXT,
  authed_user_id  TEXT,
  installed_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

## Components to Build

### 1. Shared package updates
**Modify:** `packages/shared/src/messages.ts`
- Add `MessageInbound` to `OrchestratorMessage` union
- Add `MessageOutbound` to `AgentMessage` union

**Modify:** `packages/shared/src/validators.ts`
- Add `isMessageInbound()` and `isMessageOutbound()` validators

### 2. Edge Function: `slack-oauth` (OAuth callback)
**Create:** `supabase/functions/slack-oauth/index.ts` + `deno.json`

- Receives OAuth callback with `code` param
- Exchanges code for bot token via `oauth.v2.access`
- Upserts into `slack_installations` (linking `team_id` -> `company_id`)
- Redirects to success page
- Secrets: `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`

Company ID mapping: the `state` parameter in the OAuth URL encodes the `company_id` so the callback knows which company is installing.

### 3. Edge Function: `slack-events` (inbound webhook)
**Create:** `supabase/functions/slack-events/index.ts` + `deno.json`

- Handles `url_verification` challenge
- Verifies Slack request signature (`SLACK_SIGNING_SECRET`)
- Skips bot messages (`event.bot_id`)
- Deduplicates by `event_id`
- Looks up `team_id` -> `company_id` from `slack_installations`
- Finds running agent: query `jobs` for `card_type = 'persistent_agent'` AND `status = 'executing'`, join with `machines` to get machine name
- If agent online: generate `conversationId` = `slack:{team_id}:{channel}:{thread_ts}`, broadcast `MessageInbound` to `agent:{machineName}` via Realtime
- If agent offline: post "The CPO is currently offline" reply to Slack using stored `bot_token`
- Deploy with `--no-verify-jwt` (Slack doesn't send JWT)

### 4. Edge Function: `agent-message` (outbound relay)
**Create:** `supabase/functions/agent-message/index.ts` + `deno.json`

- Receives POST with `{ conversationId, text, jobId }`
- Auth: validates `Authorization: Bearer <SUPABASE_ANON_KEY>` header
- Parses `conversationId` prefix to determine adapter
- For `slack:` prefix: extracts `team_id`, `channel`, `thread_ts`
- Fetches `bot_token` from `slack_installations` by `team_id`
- Posts to Slack via `chat.postMessage` with `thread_ts` for threading
- Returns `{ ok: true }` or error

### 5. MCP server for agent outbound
**Create:** `packages/local-agent/src/agent-mcp-server.ts`

Minimal stdio MCP server with one tool:

**`send_message`**
- Params: `conversation_id` (string), `text` (string)
- Implementation: HTTP POST to `{SUPABASE_URL}/functions/v1/agent-message`
- Auth: `Authorization: Bearer {SUPABASE_ANON_KEY}`
- Returns success/failure message to the agent

**Dependencies:** Add `@modelcontextprotocol/sdk` to `packages/local-agent/package.json`
**Bin entry:** `"zazig-agent-mcp": "./dist/agent-mcp-server.js"`

### 6. Local agent: handle MessageInbound + create agent workspace
**Modify:** `packages/local-agent/src/executor.ts`

- Add handler for `message_inbound` events (received via Realtime)
- Format message: `[Message from {from}, conversation:{conversationId}]\n{text}`
- Inject into the appropriate agent's tmux session via `send-keys -l`
- Reuse idle-detection logic (scan for prompt) with queue for busy agents
- In `spawnPersistentCpoSession`: create `~/.zazigv2/cpo-workspace/`, write `.mcp.json` pointing to `agent-mcp-server.js`, spawn tmux with `-c` flag

**Modify:** `packages/local-agent/src/connection.ts` or `index.ts`
- Register handler for `message_inbound` event on `agent:{machineId}` channel

### 7. Remove SlackChatRouter
**Delete:** `packages/local-agent/src/slack-chat.ts`
**Modify:** `packages/local-agent/src/executor.ts` — remove `SlackChatRouter` import, `cpoRouter` field, router start/stop code
**Modify:** `packages/local-agent/package.json` — remove `@slack/bolt` dependency

### 8. DB migration
**Create:** `supabase/migrations/017_slack_installations.sql`

### 9. Slack app setup
- Create new zazig-owned Slack app (multi-tenant, for all companies)
- OAuth scopes: `chat:write`, `app_mentions:read`, `channels:history`, `im:history`
- Event subscriptions: `message.im`, `message.channels`, `app_mention`
- Request URL: `https://jmussmwglgbwncgygzbz.supabase.co/functions/v1/slack-events`
- Redirect URL: `https://jmussmwglgbwncgygzbz.supabase.co/functions/v1/slack-oauth`

## Implementation Order

1. Add `MessageInbound` + `MessageOutbound` to shared package + validators
2. Create `slack_installations` migration
3. Create `slack-events` Edge Function (inbound)
4. Create `agent-message` Edge Function (outbound relay)
5. Create `agent-mcp-server.ts` (local MCP server)
6. Update `executor.ts`: handle `message_inbound`, create workspace + `.mcp.json`, remove SlackChatRouter
7. Delete `slack-chat.ts`, remove `@slack/bolt`
8. Create `slack-oauth` Edge Function
9. Create zazig Slack app, configure OAuth + Events
10. Deploy all Edge Functions, set secrets, rebuild, test

## Verify

1. Set Supabase secrets: `SLACK_SIGNING_SECRET`, `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`
2. Deploy Edge Functions (all 3)
3. Create Slack app, set Request URL + Redirect URL
4. Install to test workspace via OAuth -> verify `slack_installations` row created
5. Manually insert `slack_installations` row for existing test company (shortcut for testing)
6. Rebuild local agent, restart with Doppler
7. Send Slack message -> verify Edge Function receives it -> routes to local agent -> CPO gets it
8. CPO replies using `send_message` MCP tool -> verify Edge Function posts to Slack
9. Stop local agent -> send Slack message -> verify "agent offline" auto-reply
