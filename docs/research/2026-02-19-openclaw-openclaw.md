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
- ACP (Agent Client Protocol) as external IDE integration protocol (not internal IPC — correction from deep-dive below)

---

# Deep Dive: Gateway + Triggers Architecture
*Revisit: 2026-02-22 | Focus: heartbeat, crons, hooks, webhooks, event loops | Compared against: zazigv2*

## TL;DR

- OpenClaw's trigger architecture is built around a **universal wake pattern** (`requestHeartbeatNow()`) — any subsystem (cron, webhook, exec completion) calls one function to wake the agent, with reason-based prompt routing and 250ms coalescing
- **Command Lanes** (Main, Cron, Subagent, Nested) provide per-lane FIFO queues with configurable concurrency — the heartbeat skips when Main lane has items in-flight
- Cron has **two execution paths**: "main" (enqueue system event → heartbeat relays) and "isolated" (fresh session per run on own lane) — maps directly to CPO vs ephemeral agent patterns
- **Two coexisting hook systems**: internal (simple event-key strings) and plugin lifecycle (14 typed hooks with priority, blocking capability on `before_tool_call`)
- OpenClaw's in-memory event architecture **does not translate directly** to zazigv2's distributed model — must be mapped to Supabase Realtime/Postgres

## Correction from Original Report

Line 244 of the original report said "ACP (Agent Client Protocol) as internal IPC bus between gateway and agent sessions." This is **incorrect**. ACP is an **external IDE integration protocol** served over stdio (NDJSON stream) for VS Code / Cursor integration. The actual internal event bus uses Node.js module-level event emitters (`onAgentEvent`, `onHeartbeatEvent`).

---

## 1. Gateway Architecture

### Entry Point & Boot Sequence

`src/gateway/server.impl.ts` — `startGatewayServer()` (748 lines). Boot order:

1. Config validation + auto-migration (legacy entries, schema check)
2. Registry init: subagent registry, plugin registry, channel gateway methods
3. HTTP server(s) — one per bind host (loopback + LAN), TLS, auth, rate limiter
4. WebSocket server (`noServer: true`, maxPayload 8 MiB) with challenge-response handshake
5. Node registry, subscriptions, channel manager
6. Service discovery (mDNS/Bonjour, Tailscale)
7. **Sidecars**: browser control, Gmail watcher, internal hooks, `startChannels()`, plugin services
8. `gateway:startup` hook (250ms delay)
9. Config file watcher for hot-reload (hooks, heartbeat, cron, channels)

### Message Pipeline

```
Platform event (Slack/Discord/Telegram/etc.)
  → Channel plugin normalizes to MsgContext { Body, SessionKey, Provider, ChatType, SenderId, ... }
  → dispatchInboundMessage() in src/auto-reply/dispatch.ts
  → finalizeInboundContext() (resolves sessionKey, routing)
  → dispatchReplyFromConfig() → getReplyFromConfig()
  → enqueueCommand() on CommandLane.Main (FIFO queue)
  → agent run (CLI or embedded runner)
  → streaming response via WS (150ms delta throttle, seq gap detection)
  → deliverOutboundPayloads() → channel plugin outbound.send()
```

### Concurrency: Command Lanes

`src/process/command-queue.ts` — four FIFO lanes:

| Lane | Default concurrency | Used for |
|------|-------------------|----------|
| Main | 1 (agents.maxConcurrentRuns) | User messages, heartbeat |
| Cron | 1 (cron.maxConcurrentRuns) | Isolated cron jobs |
| Subagent | configurable | Nested agent calls |
| Nested | configurable | Deep nesting |

Each lane: FIFO queue, `drainLane()` pumps up to `maxConcurrent` tasks. Warns if task waits >2s. WS clients with `bufferedAmount > 16 MiB` are force-closed.

**Backpressure:** Events with `dropIfSlow: true` are silently skipped for slow WS clients. In-flight deduplication via `context.dedupe` map (TTL 5 min, max 1000 entries).

### BOOT.md

`src/gateway/boot.ts` — `runBootOnce()`:
- Reads `BOOT.md` from workspace dir
- If missing or empty → skip
- Runs a one-shot agent with `deliver: false` and `SILENT_REPLY_TOKEN` appended
- Session key: main session, session ID: `boot-{timestamp}-{random8}`
- **Purpose**: init tasks (e.g., check system state, warm caches) without delivering to user

**zazigv2 relevance**: Maps to "context hydration" for ephemeral agents. When spinning up an engineer to execute a card, a dynamic boot phase should pull repo state, PR context, and orchestrator intent before the agent starts working.

---

## 2. Heartbeat System

### Timer & Scheduling

`src/infra/heartbeat-runner.ts` — `startHeartbeatRunner()`:

- `resolveHeartbeatAgents(cfg)` finds all agents with heartbeat config
- Per-agent state: `{ agentId, intervalMs, lastRunMs, nextDueMs }`
- Single `setTimeout` per scheduling cycle, fires for the soonest agent
- Default interval: 30 minutes
- **Hot-reloadable**: `runner.updateConfig(cfg)` recomputes intervals without restart

### HEARTBEAT.md & Prompt

HEARTBEAT.md is loaded via the normal workspace bootstrap system — NOT injected directly into the heartbeat prompt. The heartbeat prompt just says: `"Read HEARTBEAT.md if it exists (workspace context). Follow it strictly. Do not infer or repeat old tasks from prior chats. If nothing needs attention, reply HEARTBEAT_OK."`

**Pre-flight emptiness check** (`heartbeat-runner.ts:436-454`): reads HEARTBEAT.md from disk, checks `isHeartbeatContentEffectivelyEmpty()` (only headers/whitespace/empty list items). If empty AND reason isn't exec/cron/wake → skip. Saves an API call.

### HEARTBEAT_OK Suppression

`src/auto-reply/heartbeat.ts:110` — `stripHeartbeatToken()`:

1. Normalize away HTML tags and markdown wrappers (`**HEARTBEAT_OK**`, `<b>HEARTBEAT_OK</b>`)
2. Strip token iteratively from start/end (handles trailing punctuation)
3. If remaining text ≤ `ackMaxChars` (default 300) → `shouldSkip: true`, return empty
4. If remaining text > 300 chars → agent said something real, deliver it

### Session Sharing

Heartbeat **reuses the existing user session** — full conversation context is visible. `resolveHeartbeatSession()` loads the main session key for the agent.

**Session updatedAt suppression** (`heartbeat-runner.ts:342-371`): When heartbeat gets only HEARTBEAT_OK, `restoreHeartbeatUpdatedAt` resets the session's `updatedAt` to pre-heartbeat value. Heartbeat polling alone doesn't extend idle session expiry.

### Skip Logic (11 conditions, in order)

| # | Reason | What it checks |
|---|--------|---------------|
| 1 | `disabled` | Global toggle off |
| 2 | `disabled` | Agent not in heartbeat-enabled list |
| 3 | `disabled` | intervalMs resolves to null/0 |
| 4 | `quiet-hours` | `isWithinActiveHours()` returns false |
| 5 | `requests-in-flight` | Main lane queue size > 0 |
| 6 | `empty-heartbeat-file` | HEARTBEAT.md only has headers/whitespace (unless exec/cron/wake reason) |
| 7 | `alerts-disabled` | Visibility settings say no alerts/ok/indicator |
| 8 | `no-target` | Delivery channel can't be resolved |
| 9 | `unknown-account` | Account not found |
| 10 | Channel not ready | `checkReady()` returns not ok |
| 11 | `duplicate` | Same text sent within last 24h |

**Retry on in-flight**: If skipped for `requests-in-flight`, wake handler retries after 1s with preserved priority. Schedule advances even on skip (no accumulated missed fires).

### Active-Hours Gating

`src/infra/heartbeat-active-hours.ts:70` — `isWithinActiveHours()`:

- Config: `{ start: "HH:MM", end: "HH:MM", timezone: "user"|"local"|IANA }`
- Handles overnight ranges (e.g., 22:00-06:00)
- "user" timezone defaults to `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Called before any API call or queue check

---

## 3. Cron System

### Schedule Types

`src/cron/schedule.ts` using **`croner`** library (not node-cron):

| Kind | Config | Resolution |
|------|--------|-----------|
| `at` | ISO timestamp | One-shot, disables after fire |
| `every` | `everyMs` + optional `anchorMs` | Arithmetic: `anchor + ceil((now-anchor)/interval) * interval` |
| `cron` | Cron expression + optional TZ | `croner.nextRun()`, floored to second boundary |

### Timer Engine

`src/cron/service/timer.ts`:

- Single `setTimeout`, max 60s delay clamp (prevents drift on process pause)
- `onTimer()` acquires lock → force-reloads store from disk → `findDueJobs()` → executes sequentially → updates state → re-arms
- If job already executing when timer fires, re-arms at 60s instead of returning (bug fix for issue #12025)
- Error backoff: `[30s, 1m, 5m, 15m, 60m]` indexed by `consecutiveErrors`

### Two Execution Paths

**"main" path** (`sessionTarget: "main"`, payload: `kind: "systemEvent"`):
1. `enqueueSystemEvent(text, { agentId })` — pushes to in-memory queue
2. If `wakeMode === "now"` AND `runHeartbeatOnce` available: calls directly, polls 250ms if in-flight, gives up after 2 min
3. Otherwise: `requestHeartbeatNow({ reason: "cron:jobId" })`
4. Heartbeat wakes → `peekSystemEvents()` → `buildCronEventPrompt(cronEvents)` → agent processes batch

**"isolated" path** (`sessionTarget: "isolated"`, payload: `kind: "agentTurn"`):
1. Fresh session per run: `sessionId = crypto.randomUUID()`
2. Session key: `cron:{jobId}:run:{runSessionId}`
3. Runs on `CommandLane.Cron` (doesn't block Main)
4. Results: direct delivery via channel plugin OR summary enqueued as system event on main session

### Session Reaper

`src/cron/session-reaper.ts` — runs every cron timer tick but self-throttles to ≤1 per 5 min. 24h retention. Prunes `...:cron:<jobId>:run:<uuid>` keys. Base session `cron:{jobId}` intentionally preserved.

---

## 4. Hook System (Two Systems)

### System A: Internal Hooks

`src/hooks/internal-hooks.ts`:

- Registration: `registerInternalHook(eventKey, handler)` — keys like `"command"`, `"agent:bootstrap"`, `"session:start"`
- Trigger: `triggerInternalHook()` — looks up handlers for both general type AND specific `type:action`, runs sequentially with `for...of` + `await`
- **Errors caught per-handler and logged** — don't block subsequent handlers
- `agent:bootstrap` is the most important: allows plugins to modify `WorkspaceBootstrapFile[]` before system prompt injection (soul-swapping)

### System B: Plugin Lifecycle Hooks

`src/plugins/hooks.ts` — `createHookRunner()`:

**All 14 hooks:**

| Hook | Model | Can block? |
|------|-------|-----------|
| `before_agent_start` | Modifying (sequential) | Can inject systemPrompt + prependContext |
| `agent_end` | Void (parallel) | No |
| `before_compaction` / `after_compaction` | Void (parallel) | No |
| `before_reset` | Void (parallel) | No |
| `message_received` | Void (parallel) | No |
| `message_sending` | Modifying (sequential) | Can modify/cancel |
| `message_sent` | Void (parallel) | No |
| `before_tool_call` | Modifying (sequential) | **YES — can return `{ block: true, blockReason }`** |
| `after_tool_call` | Void (parallel) | No |
| `tool_result_persist` | **Synchronous** | Modifies transcript only |
| `session_start` / `session_end` | Void (parallel) | No |
| `gateway_start` / `gateway_stop` | Void (parallel) | No |

- Priority: `(b.priority ?? 0) - (a.priority ?? 0)` — higher = runs first
- Void hooks: `Promise.all()` (parallel). Modifying hooks: sequential in priority order
- Global singleton via `initializeGlobalHookRunner(registry)` at gateway startup

---

## 5. Event Architecture

### System Events Queue

`src/infra/system-events.ts` — pure in-memory, ephemeral, session-scoped:

```typescript
enqueueSystemEvent(text, { sessionKey })  // max 20, consecutive dedup
drainSystemEvents(sessionKey)              // returns + clears
peekSystemEvents(sessionKey)               // read without drain
```

Fed by: cron main jobs, cron isolated summaries, webhook hooks. Drained by: heartbeat runner (builds prompt), auto-reply session updates (prepends to any agent turn).

### Agent Events Bus

`src/infra/agent-events.ts` — module-level pub/sub for streaming:

- `emitAgentEvent({ runId, seq, stream, ts, data })` → all registered listeners
- Listeners: `Set<listener>`, errors silently caught
- Used by gateway to stream tool calls + LLM responses to WS clients in real time
- Seq gap detection: if event seq is not `last+1`, broadcasts error event

### Heartbeat Events Bus

`src/infra/heartbeat-events.ts` — status tracking for UI:

- Statuses: `"sent" | "ok-empty" | "ok-token" | "skipped" | "failed"`
- Caches `lastHeartbeat` for on-demand UI queries

### Inbound Webhooks

`src/gateway/hooks.ts` + `server-http.ts`:

- Endpoint: `/hooks` (configurable path), auth via `Authorization: Bearer` or `X-OpenClaw-Token`
- Two actions on POST `{basePath}/agent`:
  - **wake**: enqueue system event + `requestHeartbeatNow({ reason: "hook:wake" })`
  - **agent**: create ephemeral `CronJob` + `runCronIsolatedAgentTurn()` (fire-and-forget)
- Config-driven URL path → action mappings (Zapier-style routing)
- Rate limiting: 20 auth failures per IP per 60s window

---

## 6. The Universal Poke: `requestHeartbeatNow()`

`src/infra/heartbeat-wake.ts`:

```
requestHeartbeatNow({ reason, coalesceMs })
  → queues pending wake reason
  → schedule(coalesceMs ?? 250, "normal")
  → setTimeout fires → run()
  → for each agent: check skip conditions → runHeartbeatOnce()
```

**Priority queue** (lowest → highest):
1. RETRY (skipped-for-in-flight, retrying)
2. INTERVAL (periodic heartbeat timer)
3. DEFAULT (unknown/unspecified)
4. ACTION (manual, exec-event, hook:*, cron:*)

**Coalescing**: Multiple simultaneous requests merge into one execution. If handler is running when new request arrives, `scheduled = true` → re-fires from `finally` block.

**Reason-based prompt routing** in `runHeartbeatOnce()`:
- `reason?.startsWith("cron:")` → `buildCronEventPrompt(cronEvents)` (includes cron event text)
- `reason === "exec-event"` → `EXEC_EVENT_PROMPT` (command completion notice)
- `reason === "wake" || reason?.startsWith("hook:")` → standard heartbeat but skips "empty heartbeat file" check
- Default → `HEARTBEAT_PROMPT` (standard periodic check)

---

## Steal List for zazigv2

Ranked by impact, adjusted by Gemini second opinion:

### 1. Coalesced Wake Pattern (`requestHeartbeatNow`)

**Why #1 (Gemini agrees):** In a multi-agent system, the hardest problem is state sync without triggering infinite loops or duplicate API calls. By forcing every external stimulus (cron, webhook, sibling completion) through a single debounced function with reason-based prompt routing, you decouple event trigger from agent execution. Agents process batched updates in a single LLM prompt instead of N separate calls.

**zazigv2 adaptation:** Implement as a Supabase Edge Function (`wake-agent`) that local daemons call. The local daemon owns the coalescing (not the cloud side — Gemini notes 250ms is too tight for distributed systems, recommend 1000-2000ms). Reason string → prompt type mapping stays the same. Store pending wake reasons in a Postgres `agent_wake_queue` table rather than in-memory.

---

### 2. Modifying Hook Pattern (before_tool_call with block)

**Why #2 (Gemini promoted from #5):** "The ability to intercept, sequence, and structurally block tool calls is how you enforce safety, budget limits, and slot constraints before an agent dispatches work to a local machine." For exec agents with interdiction policies, `before_tool_call` → `{ block: true, blockReason }` maps directly to the orchestrator's policy enforcement plane.

**zazigv2 adaptation:** Implement typed hooks in the orchestrator (Edge Functions). Critical hooks: `before_job_start` (slot check, budget check), `before_tool_call` (policy enforcement), `after_job_complete` (card annotation, metrics). Use Supabase Realtime to fire hooks to local daemons.

---

### 3. Command Lane Pattern

**Why #3 (Gemini agrees, notes overlap with slots):** Maps to zazigv2's slot system but adds the queuing discipline. The key insight is **lane isolation** — cron work doesn't block user-initiated work, heartbeats skip when main lane is busy.

**zazigv2 adaptation:** Map lanes to slot types in the `machine_slots` table: `main` (user-dispatched jobs), `cron` (scheduled work), `subagent` (nested calls). Each type has independent concurrency limits. Queue discipline already exists in Supabase Postgres (the `jobs` table pipeline).

---

### 4. Two-Path Cron Execution

**Why #4 (Gemini agrees):** "main" path maps to CPO proactive behavior (shared context, surfaces via heartbeat). "isolated" path maps to ephemeral engineer dispatch (fresh session, own lane, direct delivery). This is the exact split between persistent and ephemeral agents in zazigv2.

**zazigv2 adaptation:** CPO cron jobs use "main" path → enqueue system event in `cpo_event_queue` table → CPO picks up on next heartbeat. Ephemeral cron (scheduled scans, metrics) uses "isolated" path → creates a new job in `jobs` table → dispatched to available machine.

---

### 5. Active-Hours Gating

**Why #5:** Quick win for CPO. Prevents LLM calls during off-hours. For ephemeral engineers: less relevant (they're card-driven worker threads, not proactive).

**zazigv2 adaptation:** Add `active_hours` column to `roles` table. CPO heartbeat checks before firing. Per-timezone support (Tom in UK, Chris in wherever).

---

### 6. BOOT.md as Context Hydration

**Why #6 (Gemini surfaced this as a miss):** For ephemeral agents, a dynamic boot phase should pull repo state, card context, and orchestrator intent before the agent starts executing. OpenClaw's `BOOT.md` is static; zazigv2 needs a dynamic equivalent.

**zazigv2 adaptation:** When dispatching a `StartJob`, include a `bootContext` field (compiled from card annotations, repo state, relevant PR context). The local daemon injects this into the agent's initial prompt before it reads the card.

---

### 7. System Events Queue (adapted for Postgres)

**Why #7 (Gemini flags in-memory version as useless for zazigv2):** The concept is valuable but the implementation must change. In-memory queues die with Edge Function invocations.

**zazigv2 adaptation:** `agent_events` table in Postgres: `{ id, agent_id, session_key, text, created_at, drained_at }`. Heartbeat drains via `UPDATE ... SET drained_at = now() WHERE drained_at IS NULL RETURNING *`. Max 20 per session via `INSERT ... WHERE (SELECT count(*) FROM agent_events WHERE ...) < 20`.

---

## We Do Better (updated)

From original report, plus new observations:

- **Multi-agent orchestration** — OpenClaw is fundamentally single-agent. zazigv2's multi-role dispatch is a different paradigm
- **Supabase-based state** — survives restarts, queryable, auditable. OpenClaw's filesystem + in-memory state is fragile for distributed systems
- **Slot-based resource pooling** — OpenClaw has no concept of cross-machine resource sharing
- **Distributed architecture** — OpenClaw is a single-process gateway. zazigv2's cloud orchestrator + local daemons is inherently more resilient
- **Policy enforcement plane** — zazigv2's charter/interdiction system (root constraints in `roles` table) is more structured than OpenClaw's hook-based approach

## Gemini Second Opinion

**Model:** gemini-3.1-pro-preview, 35.2s duration.

**Key reordering:** Promoted universal poke to #1 and modifying hooks to #2. Demoted command lanes to #3 (overlap with existing slots). Flagged active-hours, session-updatedAt, and in-memory events queue as overrated for zazigv2.

**Critical insight — distributed event bus dilemma:** "OpenClaw uses Node.js module-level event emitters. That breaks instantly in your architecture. You must map OpenClaw's internal bus to Supabase Realtime (Postgres NOTIFY or Websocket Broadcasts)."

**Critical insight — BOOT.md as context hydration:** "For your ephemeral engineers, this is actually a critical Context Hydration phase. When spinning up an ephemeral CTO/Engineer to execute a card, a dynamic BOOT sequence is required to pull the relevant repo state, PR context, and orchestrator intent before the agent starts executing."

**Critical insight — coalescing window:** "250ms works for a local process. In a distributed system, network latency jitter will cause race conditions. You likely need 1000ms-2000ms or handle coalescing strictly on the local daemon side, not the cloud side."

**Risk flagged — Edge Function timeouts:** "OpenClaw's sequential modifying hooks and long-running command lanes assume persistent memory. If you run the orchestrator in Edge Functions, you will hit execution timeouts. Long-running tasks must be pushed to the local daemons, with Edge Functions acting only as fast routers/validators."

**My take:** Gemini is right on all counts. The distributed systems translation is the key challenge — OpenClaw's patterns are sound but assume single-process in-memory state. Every adaptation for zazigv2 must map to Supabase Postgres + Realtime. The coalescing-on-daemon-side recommendation is particularly important.

---

## Raw Notes: File Map

### Gateway
| File | Role |
|------|------|
| `src/gateway/server.impl.ts` | Main 748-line boot + lifecycle |
| `src/gateway/server-channels.ts` | ChannelManager: start/stop/runtime snapshot |
| `src/gateway/server-chat.ts` | Agent event handler, delta throttling, seq gap detection |
| `src/gateway/server-methods/chat.ts` | `chat.send` handler (328-652) |
| `src/gateway/server-methods/send.ts` | Outbound delivery |
| `src/gateway/boot.ts` | BOOT.md one-shot runner |
| `src/auto-reply/dispatch.ts` | `dispatchInboundMessage()` pipeline entry |
| `src/process/command-queue.ts` | Command lane FIFO queues |

### Heartbeat
| File | Role |
|------|------|
| `src/infra/heartbeat-runner.ts` | Orchestrator: scheduling, skip logic, LLM call, delivery |
| `src/auto-reply/heartbeat.ts` | Domain: prompt, HEARTBEAT_OK stripping, emptiness check |
| `src/auto-reply/tokens.ts` | Token constants |
| `src/infra/heartbeat-wake.ts` | Wake request queue: coalescing, priority, retry |
| `src/infra/heartbeat-active-hours.ts` | Active-hours gating with timezone |
| `src/infra/heartbeat-events.ts` | Status bus for UI indicators |
| `src/infra/heartbeat-visibility.ts` | showOk/showAlerts/useIndicator per channel |

### Cron
| File | Role |
|------|------|
| `src/cron/service.ts` | Public CronService class |
| `src/cron/service/timer.ts` | Scheduling engine, job execution |
| `src/cron/service/ops.ts` | CRUD operations |
| `src/cron/schedule.ts` | Next-run computation using croner |
| `src/cron/isolated-agent/run.ts` | Isolated session runner |
| `src/cron/session-reaper.ts` | Session cleanup (24h retention) |
| `src/gateway/server-cron.ts` | Gateway wiring |

### Hooks & Events
| File | Role |
|------|------|
| `src/hooks/internal-hooks.ts` | Internal hook system (event-key strings) |
| `src/plugins/hooks.ts` | Plugin lifecycle hook runner |
| `src/plugins/types.ts:298-560` | All 14 hook type definitions |
| `src/infra/system-events.ts` | In-memory session-scoped event queue |
| `src/infra/agent-events.ts` | Agent streaming event bus |
| `src/gateway/hooks.ts` | Inbound webhook validation |
| `src/gateway/hooks-mapping.ts` | URL path → action mappings |
