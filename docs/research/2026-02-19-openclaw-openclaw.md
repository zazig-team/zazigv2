# Recon: OpenClaw
*Analyzed: 2026-02-19 | Commit: 2fa78c17d | Compared against: zazig, zazigv2*

## TL;DR

- OpenClaw is a production-grade personal AI assistant gateway (TypeScript, 800+ source files) supporting 10+ messaging platforms with a plugin architecture
- Its **SOUL.md** personality system (per-turn disk reload, explicit activation directive, sub-agent stripping) is cleaner than zazig's one-shot AGENT.md loading
- **Filesystem session transcripts** (JSONL + JSON store) survive restarts — zazig's in-memory sessions are its biggest durability gap
- **Inbound message debounce** merges rapid messages before LLM calls — zazig has no equivalent, causing turn fragmentation
- **HEARTBEAT_OK token suppression** is simpler and more robust than zazig's JSON-parsing heartbeat response pattern

## Steal List

Ranked by impact for zazig. Codex second opinion re-ranked — original had SOUL.md #1, Codex bumped transcripts up.

### 1. Filesystem Session Transcripts (Codex: highest impact)

**What:** Sessions stored as JSONL transcript files + JSON session store on disk. Survives restarts. Transcript is the source of truth; session store is metadata only.

**Why it matters:** Zazig keeps sessions in `dict[str, SessionInfo]` in memory (`agent.py:106`). On restart, it recovers by fetching 20 messages from Slack history — lossy and Slack-dependent. OpenClaw's approach is durable, debuggable (you can `cat` a transcript), and portable.

**Key files:**
- `src/config/sessions/store.ts` — JSON store with 45s TTL cache, file-level write lock
- `src/config/sessions/types.ts` — `SessionEntry` type (sessionId, updatedAt, tokenCount, compactionCount)
- `src/auto-reply/reply/session.ts:99-470` — `initSessionState()` — freshness evaluation, reset triggers

**Borrowing plan:** Add a `TranscriptStore` to `zazig/agent.py` that writes each turn (user + assistant) as JSONL to `~/.local/share/zazig-{instance}/transcripts/{session_key}.jsonl`. On restart, load from disk instead of Slack history. Session store (metadata) as JSON sidecar. Key design decisions:
- File-level write lock (Python `fcntl.lockf`)
- Freshness policy: daily reset at startup or idle-N-minutes
- Archive old transcripts on reset (move to `archive/` subdir)
- PII/secrets at rest risk — add rotation/pruning from day one

**Risk (from Codex):** Retention growth, lock/corruption, PII at rest. Plan pruning and rotation before building.

---

### 2. Inbound Message Debounce (Codex: #2, agreed)

**What:** Per-sender/thread debouncer that merges rapid messages within a configurable window before dispatching to the LLM. Used across all channels (Slack, Discord, Telegram, WhatsApp, Signal, iMessage).

**Why it matters:** Zazig processes each Slack message immediately into an LLM call (`slack_adapter.py:448`). When a user sends 3 messages in 2 seconds, that's 3 LLM turns instead of 1. OpenClaw's debouncer coalesces them.

**Key files:**
- `src/auto-reply/inbound-debounce.ts:21` — `resolveInboundDebounceMs()` (per-channel configurable)
- `src/slack/monitor/message-handler.ts:24-68` — Slack debounce key: `slack:{accountId}:{threadKey}:{senderId}`
- Commands bypass debouncing (line 54-55)

**Borrowing plan:** Add `InboundDebouncer` to `zazig/slack_adapter.py`. Key = `{channel}:{thread_ts}:{sender}`. Default 1500ms window. Concatenate buffered messages with newlines. Exempt: `/commands`, media attachments. Simple `asyncio.create_task` with `asyncio.sleep(debounce_ms)` + cancellation on new message.

**Risk (from Codex):** Delayed responsiveness and accidental command batching. Exempt commands/media.

---

### 3. SOUL.md Personality Pattern (Codex: #3, demoted from #1)

**What:** A dedicated `SOUL.md` file in the workspace directory, loaded fresh from disk on every agent run, injected into the system prompt under a `# Project Context` header with an explicit activation directive: *"If SOUL.md is present, embody its persona and tone."*

**Why it matters:** Zazig loads AGENT.md once at process start (`agent.py:107,151`) and reuses it for all sessions. Changes to AGENT.md require a process restart. OpenClaw's per-turn reload means personality edits take effect immediately. The explicit activation directive is also better than hoping the model picks up on a generic system prompt.

**Key design decisions:**
- Template structure: Core Truths, Boundaries, Vibe, Continuity sections
- Agent can self-modify SOUL.md: *"This file is yours to evolve"*
- Sub-agents get SOUL stripped (only AGENTS.md + TOOLS.md pass through) — token optimization
- 20k char truncation with 70% head + 20% tail strategy
- `agent:bootstrap` hook allows programmatic soul swapping (e.g. by channel, time of day)
- Context pruner has safety guard: never prunes anything before first user message (protects SOUL.md)

**Key files:**
- `docs/reference/templates/SOUL.md` — default template
- `docs/reference/templates/SOUL.dev.md` — fully developed C-3PO persona (shows how rich these can get)
- `src/agents/workspace.ts:278` — `loadWorkspaceBootstrapFiles()` (fresh read every run)
- `src/agents/workspace.ts:334-344` — `filterBootstrapFilesForSession()` (sub-agent stripping)
- `src/agents/system-prompt.ts:552-572` — soul detection + activation directive injection
- `src/agents/pi-extensions/context-pruning/pruner.ts:255` — bootstrap safety guard

**Borrowing plan:**
1. Rename `AGENT.md` → `SOUL.md` (or keep both: SOUL.md for personality, AGENT.md for capabilities)
2. Add per-turn reload: re-read SOUL.md from disk at `send_message()` time, check mtime to avoid unnecessary reads
3. Add activation directive to system prompt assembly: `"Embody the persona defined in SOUL.md. Follow its tone and boundaries."`
4. Strip SOUL from ephemeral heartbeat sessions (they don't need personality)

**Risk (from Codex):** Token/latency cost on every turn. Mitigate with mtime-based caching (only re-read if file changed). Behavior instability if agent self-modifies SOUL mid-session — consider requiring explicit `/reload` command.

---

### 4. HEARTBEAT_OK Suppression (Codex: #4, promoted from #5)

**What:** Heartbeats run through the full agent pipeline (same as user messages). If the model replies with `HEARTBEAT_OK` (or within 300 chars of just that token), the response is stripped and not delivered. No special JSON parsing needed.

**Why it matters:** Zazig's heartbeat expects structured JSON responses (`heartbeat.py:190`) — fragile, requires regex/JSON parsing, and doesn't give the heartbeat full tool access. OpenClaw's approach is simpler (sentinel token) and more powerful (full pipeline = tool calls work in heartbeats).

**Additional patterns:**
- Skip heartbeat entirely if `HEARTBEAT.md` is effectively empty (all comments/whitespace)
- System events queue: async job completions get queued, next heartbeat picks them up and relays to user
- Isolated cron sessions (`cron:{jobId}`) don't pollute user conversation

**Key files:**
- `src/auto-reply/heartbeat.ts:6-7` — default prompt, `HEARTBEAT_OK` token
- `src/auto-reply/heartbeat.ts:110-171` — `stripHeartbeatToken()` — sentinel stripping
- `src/infra/heartbeat-runner.ts` — full heartbeat orchestration
- `src/infra/system-events.ts` — async event queue

**Borrowing plan:** Replace JSON-parsing heartbeat with sentinel-based suppression. Keep existing heartbeat actions (proactive DMs) but trigger them via tool calls from the LLM during heartbeat runs, not via parsed JSON.

---

### 5. Composable Session Keys (Codex: #5, same)

**What:** Session keys encode the full routing context: `agent:{agentId}:{channel}:{chatType}:{peerId}`. Cross-channel identity linking via config. `dmScope` controls whether DMs share context across platforms.

**Why it matters:** Zazig keys are simple (`thread_ts` or `dm:{channel}`) — works for Slack-only but can't encode agent, channel type, or enable cross-channel context sharing. When zazig adds Discord or Telegram, the current keys won't scale.

**Key files:**
- `src/routing/session-key.ts:139` — `buildAgentPeerSessionKey()` with `dmScope` options
- `src/routing/resolve-route.ts:289` — `resolveAgentRoute()` with binding priority tiers

**Borrowing plan:** Adopt when adding channel #2. Not urgent for Slack-only. Design the key format now so session files use future-proof keys from day one.

**Risk (from Codex):** Migration breakage if existing session keys change format. Plan backward compatibility.

---

### 6. Plugin/Adapter Channel Abstraction (deferred)

**What:** `ChannelPlugin` interface with ~15 optional adapters (config, gateway, outbound, threading, security, directory, auth, heartbeat). "Dock vs plugin" split keeps shared code lightweight.

**Why it matters for later:** When zazig adds Discord, a `ChannelPlugin` interface would prevent the codebase from becoming a tangle of `if slack:` / `if discord:` branches.

**Not urgent now.** Zazig is Slack-only and will be for a while. Premature complexity.

---

### 7. Sub-Agent Soul Stripping (deferred)

**What:** Sub-agents only receive AGENTS.md + TOOLS.md. SOUL.md is stripped to save tokens.

**Why it matters for later:** Token optimization for subagent-heavy workflows. Zazig doesn't currently have a comparable subagent architecture within the Slack service.

---

## We Do Better

Honest assessment of where zazig/zazigv2 is ahead:

- **QMD memory search**: Both use QMD, but zazig's integration is deeper — pre-compaction flush writes memories to QMD-indexed directories, agents search via MCP tool. OpenClaw's QMD integration is similar conceptually but zazig's is more purpose-built for the multi-agent exec team use case.

- **Thread affinity**: Zazig's Slack-native thread claiming (bot claims on @mention, yields when another bot is mentioned, 4h TTL) is more sophisticated than OpenClaw's model. OpenClaw doesn't have multi-bot thread handoff because it's a single-agent system.

- **Multi-instance architecture**: Zazig runs multiple instances (tom, zazig) with per-instance credentials, Trello boards, and state directories. OpenClaw is fundamentally single-user/single-instance (though it supports multiple agents within one instance).

- **Exec team structure**: CPO/CTO/VP-Eng/CMO role separation with operating manuals, state files, and inter-agent communication is unique to zazig. OpenClaw is a personal assistant, not an exec team.

- **Token budget system**: Zazig's `codex-first` / `claude-ok` / `team-ok` dispatch model optimizes cost per task. OpenClaw has model fallback chains but no equivalent "cheapest appropriate model" routing.

## Architecture Observations

**OpenClaw's core bet is portability.** Same AI assistant across every messaging surface. The plugin architecture is the product moat — adding a new channel is implementing an interface, not rewriting the agent.

**Zazig's core bet is specialization.** Each exec role has deep domain knowledge, operating manuals, and inter-agent coordination. The value isn't "one agent everywhere" but "the right agent for the right job."

**These bets inform what to steal:**
- Steal OpenClaw's *infrastructure* patterns (sessions, debounce, heartbeat) — they're channel-agnostic plumbing
- Don't steal OpenClaw's *product* patterns (single-agent, cross-channel identity) — they serve a different use case

**OpenClaw's fire-and-forget dispatch** (`chat.send` returns immediately, results stream via WebSocket) is a good pattern for long-running agent turns. Zazig currently blocks the Slack adapter thread during LLM calls — but slack-bolt's async handler + Socket Mode already provides similar non-blocking behavior.

**OpenClaw's session freshness policies** (daily reset at 4am, idle-N-minutes) are configurable per channel — a nice touch. Zazig's 4h TTL is fixed and undifferentiated.

**The SOUL.md self-modification pattern** ("this file is yours to evolve") is philosophically interesting but operationally risky for exec agents. A CPO agent modifying its own operating constraints is a different risk profile than a personal assistant adjusting its tone. Zazig should adopt per-turn reload but NOT self-modification for exec roles.

## Codex Second Opinion

**Model:** gpt-5.3-codex, reasoning: xhigh, 197k tokens consumed, 235s duration.

**Where it agreed:**
- All 7 items are valid steal candidates
- "We do better" list is accurate
- Three-layer dedup (event + idempotency + debounce) is a notable OpenClaw advantage

**Where it differed — re-ranking:**
Codex bumped **filesystem session transcripts to #1** (from #2), arguing that zazig's in-memory session volatility is the single biggest reliability gap. Demoted **SOUL.md to #3**, noting that per-turn reload has real token/latency cost and should use mtime-based caching rather than naive re-reads.

**What it added (missed by original analysis):**
1. **Session-store hygiene**: Locking, pruning, capping, and rotation must be planned alongside transcript adoption — not afterthought
2. **Heartbeat efficiency controls**: OpenClaw skips heartbeats entirely when `HEARTBEAT.md` is effectively empty (all comments/whitespace) and suppresses duplicate nags — zazig's heartbeat fires regardless
3. **Session key correctness risk**: Zazig's `thread_ts` keys are fragile for evolution — recommend encoding channel context in keys from day one, even before adding channels

**Adoption risks flagged per item:**
- Transcripts: PII at rest, retention growth, lock corruption
- Debounce: delayed responsiveness, accidental command batching
- SOUL reload: token cost, behavior instability mid-session
- HEARTBEAT_OK: false positive if token appears in normal text
- Composable keys: migration breakage
- Channel abstraction: premature complexity
- Subagent stripping: can accidentally strip safety context

**My take on disagreements:** Codex is right to promote transcripts — it's a reliability fix, not a feature. SOUL.md is important but the mtime caching suggestion is sound. The "missed items" are all valid — heartbeat empty-file skip in particular is a quick win zazig should adopt immediately.

## Raw Notes

### Session lifecycle details
- OpenClaw session freshness: `daily` mode resets at 4am, `idle` mode resets after N minutes of no messages (default 60)
- Reset triggers: `/new`, `/reset` (configurable list) — detected in `session.ts:175-199`
- Session preferences (thinkingLevel, verboseLevel, TTS) carry forward across resets
- Session hooks (`session_start`, `session_end`) fired on transitions
- No automatic GC of old sessions — `sessions.compact` is manual/API-triggered

### Soul pipeline (6 steps)
1. Disk read: `loadWorkspaceBootstrapFiles()` reads AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, BOOTSTRAP.md, MEMORY.md in fixed order
2. Hook intercept: `agent:bootstrap` hook lets plugins swap files (e.g. alternate soul by channel)
3. Sub-agent filter: only AGENTS.md + TOOLS.md pass through for sub-agents
4. Truncation: 20k char max, 70% head + 20% tail with marker
5. System prompt assembly: soul content under `# Project Context` with activation directive
6. Session application: `session.agent.setSystemPrompt()` overrides pi-agent-core default

### Channel architecture
- `ChannelPlugin` interface with optional adapters (config, gateway, outbound, threading, security, directory, auth, heartbeat)
- "Dock" (lightweight config for shared code) vs "Plugin" (full implementation for execution boundaries)
- 10+ built-in channels: Slack, Discord, Telegram, WhatsApp, Signal, iMessage, Google Chat, IRC, Matrix, Zalo, Teams
- Extensions via `openclaw.plugin.json` manifest in `extensions/` directory
- Multi-account per channel is first-class (e.g. two Slack workspaces)

### Three-layer dedup
1. Per-channel event dedup: LRU-TTL cache (60s, 500 entries), keyed `{channel}:{ts}`
2. Send idempotency: per-request dedup + inflight tracking via `context.dedupe` + `inflightByContext` WeakMap
3. Inbound debounce: per-sender/thread buffer, merges rapid messages, configurable per-channel

### Proactive behavior
- Heartbeat: full agent pipeline, 30min default interval, active-hours gating, HEARTBEAT_OK suppression
- BOOT.md: runs once on gateway startup, response not delivered (for init tasks)
- Cron: isolated sessions (`cron:{jobId}`), won't pollute user conversation
- System events queue: async completions surface to user via next heartbeat

### Monorepo scale
- ~800-1200 TypeScript files in `src/` + `extensions/`
- ~200+ Swift/Kotlin files in `apps/` (macOS, iOS, Android)
- Vitest with V8 coverage, 70% thresholds
- pnpm 10 monorepo, tsdown build, oxlint/oxfmt

### Tech stack highlights
- Claude Agent SDK (OAuth + API key), OpenAI, Bedrock, Gemini, Ollama, 10+ providers
- QMD for memory (same as zazig)
- @mariozechner/pi-coding-agent for session management (JSONL transcripts, compaction)
- ACP (Agent Client Protocol) as internal IPC bus between gateway and agent sessions
