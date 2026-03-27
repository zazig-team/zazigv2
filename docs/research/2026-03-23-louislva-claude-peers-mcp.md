# Recon: claude-peers-mcp
*Analyzed: 2026-03-23 | Commit: fc26491 | Compared against: zazigv2*

## TL;DR

- ~400 lines of real code. Local broker daemon (Bun + SQLite) + per-session MCP server + CLI.
- The key innovation is using Claude Code's `claude/channel` protocol to push messages into running sessions proactively — making agents interruptible.
- Transport is poll-based (1s interval), NOT true push from broker to session. Each MCP server polls the broker, then emits `notifications/claude/channel` locally.
- Channels are still a research preview. Require `--dangerously-load-development-channels`, `claude.ai` login (not API keys), and Claude Code v2.1.80+.
- **Steal the channel injection pattern. Skip everything else.** zazig's daemon already IS the broker — it just needs a per-worker channel sidecar.

## Steal List

1. **Session-local channel injection pattern** — The core idea: an MCP server attached to a Claude Code process that translates external events into `notifications/claude/channel`. This is the only way to push context into a running Claude session without the model having to poll. For zazig, this means: spawn a small MCP channel server alongside each Claude worker. That server maintains a connection back to the daemon (WebSocket/SSE) and translates daemon events (`cancel`, `spec_revision`, `dependency_failed`, `human_message`) into local channel notifications. **Impact: transforms agents from fire-and-forget to interruptible.**

2. **CLI message injection** — `bun cli.ts send <id> <msg>` lets a human push text into a running Claude session from any terminal. zazig could expose `zazig msg <job-id> "text"` for human-to-agent communication during live sessions. Low effort, high utility for debugging and steering.

3. **Auto-summary via cheap LLM** — Each instance generates a 1-2 sentence summary of what it's working on using gpt-5.4-nano (fractions of a cent). Useful for dashboard/status views. zazig could do this on job start — "Working on feature X, job Y, editing files A/B/C" — and surface it in pipeline status.

## We Do Better

1. **Orchestration** — zazig has a full job pipeline with breakdown, dispatch, combine, review. claude-peers is flat peer messaging with no coordination semantics.
2. **Persistence** — Supabase with Realtime vs local SQLite. zazig survives machine restarts; claude-peers doesn't.
3. **Multi-machine** — zazig works across machines via Supabase. claude-peers is localhost-only with PID-based liveness (signal 0 checks).
4. **Role-based coordination** — CPO, engineers, specialists, reviewers. claude-peers is flat peers with no hierarchy or role awareness.
5. **Delivery guarantees** — claude-peers marks messages delivered on poll, BEFORE channel injection succeeds. If the worker dies between poll and notification, the message is lost. Acceptable for chat, not for orchestration control messages.

## Architecture Observations

**Transport model (important correction):** The README says "arrives instantly" but the actual path is: broker stores message in SQLite → worker MCP server polls every 1s → worker emits `notifications/claude/channel` locally. There is no WebSocket, no SSE, no true push from broker to worker. The "instant" feel comes from the 1s polling being fast enough for human perception.

**Channel protocol:** Declared via MCP capability `experimental: { "claude/channel": {} }`. Notifications use method `notifications/claude/channel` with `content` (text) and `meta` (structured attributes). The channel appears in the Claude session as a `<channel source="claude-peers" ...>` block that the model can read and respond to.

**Liveness:** PID-based only (`process.kill(pid, 0)`). Heartbeat updates `last_seen` but isn't used for expiry — cleanup runs on a 30s interval checking PIDs. This is a reasonable design for localhost but fundamentally wrong for multi-machine.

**Security:** No authentication on broker endpoints. Any localhost process can register as a peer, send messages to any session, or poll messages. Anthropic's channel docs explicitly warn that ungated channels are prompt-injection vectors. zazig would need authn, authz, typed event schemas, and revision/causality checks.

**Soft vs hard interruption:** Channels give cooperative interruption — the model sees the message and can choose to respond. They do NOT preempt an in-flight shell command or hung tool call. zazig still needs process kill for actual cancellation. Channels are for replanning, not hard stops.

**Auth constraint (blocker?):** Channels require `claude.ai` subscription login. API key auth is not supported. If zazig workers authenticate via API keys, channels are blocked. This is the biggest near-term risk.

## Codex Second Opinion

**Agreed with:** Don't adopt wholesale. Build zazig-native control channel. Channel injection is the valuable pattern.

**Pushed back on:**
- My framing overclaimed "push" — correctly identified it as poll-then-local-emit
- Narrowed steal list further: skip peer mesh, skip SQLite broker, skip peer discovery. Only steal the channel injection idea.
- Flagged delivery reliability gap: messages marked delivered before successful injection
- Flagged security gap: unauthenticated endpoints + free-text into Claude = prompt injection surface
- Noted channels are "soft interruption" only — process kill still needed for hard cancellation

**Additional suggestions:**
- Structured events only (`cancel`, `checkpoint_request`, `spec_revision`, `dependency_failed`, `human_message`) with ack/retry/idempotency
- Per-worker MCP channel server with persistent WebSocket back to daemon (not polling)
- Derive peer awareness from job graph and pipeline state, not machine/directory heuristics
- If channel auth constraints are unacceptable now, fall back to cooperative polling at safe points + hard kill
- For human takeover, Anthropic's Remote Control feature is more natural than building a chat bridge

## Raw Notes

- `@modelcontextprotocol/sdk` v1.27.1 is the only real dependency
- Auto-summary uses OpenAI gpt-5.4-nano — zazig could use Claude haiku or similar
- Broker auto-launches from MCP server if not running (nice DX pattern)
- `--dangerously-load-development-channels` flag name suggests this is experimental/risky
- The `set_summary` tool lets Claude describe itself — could be useful for zazig job status
- CLI is minimal but useful: status, peers, send, kill-broker
- No tests in the repo
- CLAUDE.md is mostly Bun boilerplate, not project-specific
