# CPO Slack Chat: Real-time Bidirectional Communication

**Date:** 2026-02-21
**Status:** Approved

## Problem

The CPO runs as a Claude Code session on a local machine but has no way to receive Slack messages in real-time. The existing `SlackNotifier` in the shared package is outbound-only. Users need to chat back and forth with CPO via Slack for standups, feature discussions, and planning — with near-instant response times.

## Decision

**Approach A: Socket Mode listener in the local agent + Slack MCP for responses.**

The local agent daemon (already always-on) adds a Slack Socket Mode connection for the CPO bot. Inbound messages are injected into the CPO's Claude Code tmux session via `tmux send-keys`. CPO responds using Slack MCP tools configured on its Claude Code session.

### Why not Slack MCP for both directions?

Slack MCP tools are pull-based — Claude must actively call `slack_get_messages` to check for new messages. There's no push mechanism. This creates unacceptable latency (30-60s polling delay) for real-time chat. Socket Mode delivers messages in ~100ms.

### Why not a standalone Slack bot service?

The v2 design explicitly chose Claude Code (not Agent SDK) as the CPO runtime, so CPO keeps access to the full Claude Code toolchain (hooks, skills, MCP servers, file access). A standalone bot would need to replicate this.

## Architecture

```
Inbound:  Slack DM/@mention → Socket Mode → Local Agent (SlackChatRouter) → tmux send-keys → CPO Claude Code
Outbound: CPO Claude Code → Slack MCP (slack_post_message) → Slack
```

### Inbound Flow

1. User sends DM or @CPO in a configured channel
2. Slack delivers the event via Socket Mode to the local agent's `SlackChatRouter`
3. `SlackChatRouter` formats the message with metadata:
   ```
   [Slack from @tom in #cpo, thread:1234567890.123456]
   What's the status of the pipeline?
   ```
4. Checks if CPO session is busy (captures tmux pane, looks for prompt cursor)
   - If idle: injects via `tmux send-keys -t {cpo-session} "..." Enter`
   - If busy: queues the message, injects when CPO finishes current task
5. CPO processes the message and uses Slack MCP to reply in the same thread

### Outbound Flow

CPO already has access to Slack MCP tools (`slack_post_message`, `slack_get_messages`, etc.) via its MCP server configuration. No new code needed — just ensure the Slack MCP server is configured when CPO starts.

### CPO Session Lifecycle

- CPO runs as a **persistent Claude Code session** in interactive REPL mode (not `-p` print mode)
- The local agent spawns it on startup if `cpo.enabled` is true in config
- Lives in a tmux session named `{machineId}-cpo`
- Does not exit after completing a task — stays in the REPL waiting for next input

## Config

### machine.yaml additions

```yaml
cpo:
  enabled: true
  slack:
    bot_token: ${CPO_SLACK_BOT_TOKEN}   # CPO bot user OAuth token
    app_token: ${CPO_SLACK_APP_TOKEN}   # Socket Mode app-level token
    channels:
      - C0123456789                     # #cpo channel ID
```

### New env vars (via Doppler)

- `CPO_SLACK_BOT_TOKEN` — CPO Slack bot's OAuth token
- `CPO_SLACK_APP_TOKEN` — Socket Mode app-level token

## Implementation

### New files

- `packages/local-agent/src/slack-chat.ts` — `SlackChatRouter` class
  - Socket Mode listener (using `@slack/bolt`)
  - Message formatting (includes sender, channel, thread_ts)
  - tmux injection (`tmux send-keys`)
  - Message queue with busy detection
- `config.ts` additions — parse `cpo` section from machine.yaml

### Changes to existing files

- `packages/local-agent/src/index.ts` — instantiate `SlackChatRouter` on startup, spawn CPO session
- `packages/local-agent/src/executor.ts` — add ability to spawn a persistent (non `-p`) Claude Code session for CPO

### New dependency

- `@slack/bolt` — Socket Mode client for Node.js

## Scope (v1)

### In scope

- Socket Mode listener for DMs and channel @mentions directed at CPO
- Message injection into CPO tmux session via `tmux send-keys`
- Message queuing when CPO is busy processing
- Busy detection via tmux pane capture (prompt cursor check)
- Config additions to machine.yaml
- CPO responds via its own Slack MCP config

### Not in scope (future cards)

- Multi-role Slack chat (CMO, CTO — only CPO for now)
- Conversation memory/persistence across CPO restarts
- Auto-reply when CPO is offline
- Bot presence/status indicators
- File/image uploads from Slack
- Emoji reactions or interactive Slack components
