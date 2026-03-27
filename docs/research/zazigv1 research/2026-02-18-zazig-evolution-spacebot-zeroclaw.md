# Zazig Evolution Plan: Lessons from Spacebot + ZeroClaw

**Date:** 2026-02-18
**Author:** CPO
**Status:** Draft — pending Tom review
**Input:** Full architectural analysis of [spacedriveapp/spacebot](https://github.com/spacedriveapp/spacebot) and [zeroclaw-labs/zeroclaw](https://github.com/zeroclaw-labs/zeroclaw), compared against zazig capability map.

---

## Executive Summary

We analyzed two of the most architecturally interesting open-source agent runtimes. Neither replaces zazig — both are single-agent-or-small-team runtimes with no exec team model — but both contain patterns we should adopt.

**Three things to adopt immediately** (low effort, high value):
1. Credential scrubbing in tool output (ZeroClaw)
2. Structured memory types with importance decay (Spacebot)
3. Query-based model routing — Haiku for cheap reads, Opus for reasoning (ZeroClaw)

**One architectural shift to plan for** (medium effort, unlocks scale):
- Non-blocking chat layer via Branch pattern (Spacebot) — the biggest thing zazig currently gets wrong

**One thing to skip entirely:**
- Rust rewrite. Python + Claude Agent SDK gives better velocity, better skills portability, better LLM integration. Rust's speed advantage doesn't apply to exec team workloads.

---

## What We Analyzed

### Spacebot (spacedriveapp/spacebot)
Rust-based, multi-user community bot. Core thesis: **the conversation layer should never touch tools**. Achieves this via Channel/Branch/Worker decomposition. Standout features: typed graph memory, message coalescing, worker lifecycle state machine, embedded everything (no server deps), single binary.

### ZeroClaw (zeroclaw-labs/zeroclaw)
Rust-based, edge-first single-user agent runtime. Core thesis: **ultra-lean, portable, zero server deps**. Standout features: memory snapshot/soul export, credential scrubbing, component supervisor with exponential backoff, query classification → model routing, trait+factory architecture for full extensibility.

### Zazig (us)
Python-based, Slack-native multi-instance exec team engine. Core strengths: tmux-persistent VP-Eng sessions (unlimited context), exec team model (CPO/CTO/CMO coordination), sophisticated Trello integration, per-instance env isolation, thread affinity + loop prevention. Core gaps: blocking chat layer during tool use, shallow flat memory, no credential scrubbing, fragile component restart.

---

## Competitive Scorecard

| Dimension | Spacebot | ZeroClaw | Zazig |
|-----------|----------|----------|-------|
| **Non-blocking chat** | ✅ Branch/Worker decomposition | ❌ Sequential in-turn | ⚠️ Per-session lock held across full LLM call |
| **Memory depth** | ✅ 8 typed categories, graph, decay | ✅ FTS5+vector, hygiene, snapshot export | ⚠️ Flat markdown, QMD search (good but untyped) |
| **Memory portability** | ❌ DB-only | ✅ MEMORY_SNAPSHOT.md auto-hydration | ❌ No portable snapshot |
| **Exec team model** | ❌ None | ❌ None | ✅ Unique — CPO/CTO/CMO/VP-Eng |
| **Persistent sessions** | ❌ Process-scoped | ❌ In-process Vec | ✅ tmux (unlimited context via Claude Code) |
| **Message coalescing** | ✅ Debounce window, LLM sees batch | ❌ | ❌ |
| **Credential scrubbing** | ❌ | ✅ All tool output scrubbed | ❌ |
| **Model routing** | ✅ Process-type + task-type routing | ✅ Query classification → model | ❌ Single model per role |
| **Component supervision** | ✅ tokio task + backoff | ✅ spawn_component_supervisor | ⚠️ Python try/except, fragile |
| **Skills in Slack context** | ✅ Worker-injected | ⚠️ Static files | ⚠️ Claude Code only |
| **Config hot-reload** | ✅ ArcSwap on every turn | ❌ | ❌ Restart required |
| **Approval workflow** | ❌ | ✅ Yes/No/Always + audit log | ⚠️ Move card to Needs Human |
| **Multi-platform** | ✅ Discord/Slack/Telegram/Webhook | ✅ 14+ channels | ⚠️ Slack only |
| **Observability** | ✅ Control UI + SSE | ✅ Prometheus + OTel | ⚠️ Dashboard stub |
| **Embedded LLM** | ✅ FastEmbed (no API cost) | ✅ Same | ❌ All remote |

**Zazig's moat:** exec team coordination, tmux persistence, Trello integration, instance isolation, skill ecosystem (50+ skills). These are not replicated anywhere — zazig is genuinely ahead on the product coordination layer.

**Zazig's biggest gap:** the chat layer blocks during tool use, and the memory system is too flat to enable the kind of ambient context awareness that makes Spacebot's Cortex useful.

---

## Key Findings by System

### What Spacebot Gets Right

**Branch-as-git-metaphor (the key insight):**
When a Channel needs to think, it doesn't do it inline. It creates a Branch: literally `channel_history.clone()`. The Branch runs as an independent tokio task — concurrent with the Channel. It returns a conclusion via broadcast channel when done. The Channel is never suspended. Multiple branches run concurrently. This is how zazig's CPO/CTO should work: they should never block a Slack thread waiting for a memory search or Trello read.

**Typed memory with importance scores:**
Eight memory types (Identity 1.0 → Observation 0.3). Different decay rates. Graph associations (RelatedTo, Contradicts, Updates, CausedBy). Memory bulletin (LLM-synthesized briefing of top memories across six dimensions) injected into every Channel turn — ambient awareness without per-message search cost. This is materially better than zazig's flat markdown append model.

**Message coalescing:**
Multiple users talking at once in a Slack channel → debounce window (1500ms default, 5000ms max) → batched into one LLM turn → LLM sees them as a group with timing context → can skip some with the `skip` tool. This is exactly what zazig's CMO and CPO need in active team Slack channels.

**Worker lifecycle:**
Formal state machine. Workers run in 25-turn segments with inline compaction at 70% context usage. Emergency truncation at 95% (programmatic, no LLM, instant). Workers report status via `set_status` tool → injected into Channel context on next turn. The Channel always knows what its workers are doing.

**Skills in worker context:**
Channel sees skill name+description only. Worker that's spawned to execute a skill gets the full content injected as system prompt. Context-efficient and correct — the skill is where the execution happens.

### What ZeroClaw Gets Right

**Credential scrubbing:**
Regex scrub of `token`, `api_key`, `password`, `secret`, `bearer`, `credential` patterns from all tool output before it enters history or gets logged. Zazig's exec agents handle Slack tokens, Trello API keys, Doppler secrets — and currently none of this is scrubbed. This is a direct security gap.

**Memory snapshot / soul export:**
`MEMORY_SNAPSHOT.md` — Git-committed, human-readable export of core agent memories. On cold boot (missing DB), agent auto-hydrates from this file. This answers "what happens when we move to a new Mac" and "what do we lose when an exec agent's memory DB gets corrupted." Zazig has no equivalent.

**Query classification → model routing:**
Keyword/pattern rules classify incoming messages before the LLM call (zero latency, zero cost) and route to different provider+model combinations. Quick Trello reads → Haiku. Deep CPO reasoning → Opus. This is a direct cost optimization with a simple implementation.

**Component supervisor:**
`spawn_component_supervisor(name, task_fn, config)` — each subsystem (gateway, channels, heartbeat, cron) runs in its own supervised task with exponential backoff restart and health state updates. Zazig's Python service has similar structure but less robust — the watchdog is a launchd plist that checks staleness, not an in-process supervisor.

**Approval workflow:**
`ApprovalManager` with Yes/No/Always per tool call, session-scoped allowlists, and audit log. Cleaner than zazig's "move to Needs Human" card for risky actions. For Slack-native use, this would be a reply-based approval prompt.

**What ZeroClaw validates (things zazig already does right):**
HEARTBEAT.md periodic task pattern — ZeroClaw has it, zazig has it, it's a validated pattern. Zazig is ahead on implementation.

### Where Zazig Has No Peer

- **Exec team model**: CPO/CTO/CMO/VP-Eng coordination with role-specific manuals, standup synthesis, state file protocol, and card-based task queue. Nothing else does this.
- **tmux persistence**: VP-Eng runs as a persistent Claude Code session. This gives unlimited effective context via conversation continuation, and access to the full Claude Code skill/tool ecosystem. Neither Spacebot nor ZeroClaw has this.
- **Trello as source of truth**: The Trello ↔ agent flow (card → task spec → agent → cpo-report → card comment → Done) is a complete workflow loop. No competitor has anything equivalent.
- **Skill ecosystem**: 50+ skills covering marketing, engineering, product strategy, design. This accumulates as competitive advantage. No other framework has an opinionated skill library.

---

## Evolution Plan

### Tier 1: Quick Wins (1-2 sprints)

**T1.1 — Credential scrubbing in tool output**
*Source: ZeroClaw*
Add regex scrub of common credential patterns before any tool result enters agent history or gets logged. Patterns: `TRELLO_TOKEN`, `SLACK_BOT_TOKEN`, `DOPPLER_TOKEN`, generic `sk-`, `xoxb-`, `xapp-`.
- File: `zazig/tools.py` (tool result path) + `zazig/providers/tools.py`
- Effort: 1-2 hours. Zero architectural change.
- Risk: None.

**T1.2 — Memory snapshot export (exec agent soul)**
*Source: ZeroClaw*
Each exec agent's `memory/` directory gets a `MEMORY_SNAPSHOT.md` that is auto-generated from `core` category memories. On startup, if memory DB is empty and snapshot exists, auto-hydrate. Snapshots can be committed to the zazig repo (or the instance config repo) for disaster recovery.
- Files: `zazig/memory.py` (add export/hydrate functions), `MemoryWriter` (periodic snapshot write)
- Effort: 1 day.
- Risk: Low.

**T1.3 — Query-based model routing**
*Source: ZeroClaw*
Add a lightweight keyword classifier to `AgentSession.handle_message()` that pre-routes messages to cheaper models. Rules configured in `zazig.yaml`:
```yaml
model_routes:
  fast: claude-haiku-4-5-20251001   # quick reads, simple queries
  reasoning: claude-opus-4-6        # strategy, deep analysis
  default: claude-sonnet-4-6        # everything else
query_hints:
  fast: ["trello list", "trello card", "show me", "what's on", "quick"]
  reasoning: ["deep dive", "brainstorm", "compare", "strategy", "plan"]
```
- Files: `zazig/config.py`, `zazig/session.py`
- Effort: 2-3 hours. Zero breaking changes.
- Risk: Low. Default behavior unchanged if no rules configured.

---

### Tier 2: Medium Effort (2 weeks)

**T2.1 — Structured memory types**
*Source: Spacebot*
Add typed memory categories to QMD indexing and the `memory_save` / `memory_search` tool interface. Types: `decision`, `goal`, `preference`, `fact`, `event`, `observation`. Importance scores control retention in memory bulletin (see T2.3).
- Files: `zazig/memory.py`, `zazig/tools.py` (memory_save tool gets `category` param)
- Impact: Enables T2.3 (memory bulletin) and dramatically improves memory retrieval precision.
- Effort: 3-5 days.

**T2.2 — Non-blocking Slack responses (async tool execution)**
*Source: Spacebot Branch pattern*
Current state: per-session lock is held across the full LLM response + tool execution cycle. If CPO is searching Trello + reading 3 files, the Slack thread is silent for 30+ seconds.

Proposed: After first message turn, for tool-intensive follow-up turns, post an immediate "thinking..." message, release the session lock, run the LLM+tools flow in a background task, then edit the posted message when complete. This is Spacebot's "streaming via edit" pattern adapted to zazig's Python + bolt architecture.

This does NOT require the full Branch/Worker decomposition — a targeted change to `SlackAdapter._handle_message()` achieves 80% of the UX benefit.
- Files: `zazig/slack_adapter.py` (non-blocking message handling), `SlackAdapter` (post+edit flow)
- Effort: 1-2 weeks.
- Risk: Medium — changes message delivery semantics. Needs careful testing.

**T2.3 — Memory bulletin (ambient context injection)**
*Source: Spacebot Cortex*
On agent startup (and on a configurable refresh interval), run a memory query across six dimensions (recent decisions, active goals, user preferences, key facts, current projects, recent events) and synthesize into a ~300-word bulletin. Inject into system prompt as `[Context Bulletin]` block.

This gives every exec agent ambient awareness of the full portfolio state without requiring a memory search on every turn. ZeroClaw does this per-turn; we can do it on startup + periodic refresh.
- Files: `zazig/memory.py` (bulletin generation), `zazig/session.py` (inject into system prompt)
- Depends on: T2.1 (typed categories for better bulletin quality)
- Effort: 1 week.

**T2.4 — Message coalescing for multi-user Slack channels**
*Source: Spacebot*
When multiple Slack users send messages in rapid succession to the same channel, buffer them (1500ms debounce, 5000ms max) and deliver as a batch to the LLM. LLM sees all messages with timestamp context and can decide what to engage with.

Most relevant for: CPO in a Slack channel with multiple team members, CMO in marketing discussions.
- Files: `zazig/slack_adapter.py` (per-channel debounce buffer)
- Effort: 2-3 days.
- Risk: Low. DMs bypass coalescing entirely.

**T2.5 — Slack-native approval workflow**
*Source: ZeroClaw ApprovalManager*
When an exec agent wants to take a risky action (create a PR, send an external message, deploy, modify a production Trello board), instead of moving a card to "Needs Human", post a Slack approval request:
```
CPO wants to: merge PR #47 (spine-platform)
[✅ Approve] [❌ Decline] [🔁 Always approve]
```
Agent waits for reply. Reply is handled via Slack interactive components (button callbacks) or simple "yes"/"no" text reply detection on the thread.
- Files: `zazig/approval.py` (new), `zazig/slack_adapter.py` (interactive message handling)
- Effort: 1 week.
- Risk: Requires Slack interactive components setup (new bot permission scopes).

---

### Tier 3: Architectural Evolution (4 weeks)

**T3.1 — CTO/CMO pickup loops**
Currently CTO and CMO respond to @mentions but have no autonomous loop. The design doc from 2026-02-15 outlines the fix. Spacebot validates the pattern: specialized agents with narrow jobs (thinking, not executing) are more reliable than a single agent doing everything.

CTO pickup loop: poll for cards with `tech-review` label in Up Next → review card description + linked PR → write tech decision to card comment (via subagent) → remove `tech-review` label → card moves to Up Next proper.

**T3.2 — Dashboard → Command Center**
Already on roadmap. Spacebot's control UI (React SPA, SSE for live events, TanStack Query, OpenAPI-typed endpoints) is the reference implementation. Port the design to zazig's aiohttp + React frontend. Add:
- Live agent event stream (SSE)
- Memory browser per exec agent
- Cron job management
- One-click agent restart
- Approval queue (connect to T2.5)

**T3.3 — Multi-platform channels**
Spacebot and ZeroClaw both abstract messaging via a Channel trait/interface. Zazig's SlackAdapter is currently monolithic. When Discord or Telegram support is needed (possible for customer-facing zazig deployments), refactor SlackAdapter behind a `MessagingAdapter` interface. This is a prerequisite for the eventual cloud product.

**T3.4 — VP-Eng Branch pattern**
The most ambitious adoption. VP-Eng currently runs as a sequential Claude Code session: read card → dispatch agent → wait → collect report → dispatch next agent. Adopting the Branch pattern would let VP-Eng fork for parallel investigation tasks (reading multiple project docs, running multiple QA checks) while the main session remains responsive to CPO directives.

This requires VP-Eng to run as a proper async loop (not just tmux shell), which is a significant architecture change. Defer until T3.1 and T3.2 are done.

---

## What to Skip (and Why)

| Pattern                              | Skip Reason                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rust rewrite**                     | Python + Claude Agent SDK = better LLM integration, better skill portability, better dev velocity. Zazig's bottleneck is never CPU/memory — it's API latency and human decision time.    |
| **Full Branch/Worker decomposition** | The lightweight non-blocking adaptation (T1b) gets 80% of the benefit at 10% of the cost. Full Spacebot-style Branch model is appropriate when we have 5+ concurrent active channels or CPO parallel standup analysis becomes the primary bottleneck. **Not skipping permanently** — tracked as Backlog (`scale-up` label) with the trigger conditions above. Design doc analysis already captured in this document. |
| **FastEmbed local embeddings**       | QMD's remote embedding + LLM reranking has better quality. Cost is acceptable. We'd only revisit if zazig runs in a zero-internet environment (unlikely).                                |
| **AIEOS identity format**            | Our role manual + context.md pattern is working well and is already zazig-specific. No benefit to adopting a third-party identity spec.                                                  |
| **ZeroClaw hardware/firmware**       | Not applicable.                                                                                                                                                                          |
| **Spacebot skills.sh ecosystem**     | Our skill system is already mature and Claude Code-native. We don't need a separate discovery mechanism.                                                                                 |
| **ArcSwap hot-reload**               | Zazig agents read context files at startup, not every turn. Hot-reload adds complexity for a restart model that already works.                                                           |

---

## Card Catalog

Sequencing reflects Codex second-opinion corrections (non-blocking promoted to T1; model routing demoted to T4). Each card is numbered `{tier}.{index}` for dependency tracking. Scale-up cards use `S.{index}`.

---

### 1.1 — Centralized secret scrubbing

| | |
|---|---|
| **Type** | Feature |
| **What** | Regex-based redaction middleware that scrubs credential patterns from all tool output before it enters agent history, memory flushes, or logs. Patterns: `xoxb-*`, `xapp-*`, `sk-*`, `TRELLO_TOKEN=*`, generic `token`, `api_key`, `password`, `secret`, `bearer`, `credential`. Format-aware: must not corrupt structured JSON output. |
| **Why** | Tool stdout/stderr currently passes raw Slack tokens, Trello API keys, and Doppler secrets verbatim into LLM context. Confirmed at `tools.py:233-235`, `agent.py:392-394`, `providers/openai.py:103`. Direct security gap identified by ZeroClaw comparison and confirmed by Codex code review. |
| **Depends on** | None |
| **Complexity** | Low (2-3 hours) |
| **Model** | **Codex** |
| **Labels** | `codex-first` |
| **Files** | `zazig/tools.py`, `zazig/providers/tools.py`, `zazig/agent.py`, `zazig/memory.py` |
| **Gotcha** | Regex-only misses some token shapes and can corrupt structured outputs if done naively. Use allowlist of known safe formats + blocklist of known credential patterns. Test against actual tool output samples. |

---

### 1.2 — Credential file denylist in read_file

| | |
|---|---|
| **Type** | Feature |
| **What** | Add explicit deny patterns to the `read_file` tool for `.env` files, `credentials.json`, key files, and `~/.zazig/*.env`. Deny check runs before the existing allowed-path check. |
| **Why** | Current `ALLOWED_READ_PATHS` permits reading `~/.zazig/*.env` which contains raw Slack/Trello tokens. An agent can inadvertently read and surface credentials into its own context. Identified by Codex review of `tools.py:117`. |
| **Depends on** | None |
| **Complexity** | Low (30 min) |
| **Model** | **Codex** |
| **Labels** | `codex-first` |
| **Files** | `zazig/tools.py` |

---

### 1.3 — Least-privilege trello-lite subprocess env

| | |
|---|---|
| **Type** | Feature |
| **What** | Pass only `TRELLO_API_KEY` and `TRELLO_TOKEN` to the trello-lite subprocess instead of the full instance env dict. |
| **Why** | Currently the full instance env (all Slack tokens, Doppler secrets, every API key) is passed to the trello-lite subprocess at `tools.py:221` and `agent.py:379`. Trello-lite only needs 2 keys. Least-privilege principle. Identified by Codex code review. |
| **Depends on** | None |
| **Complexity** | Low (30 min) |
| **Model** | **Codex** |
| **Labels** | `codex-first` |
| **Files** | `zazig/tools.py`, `zazig/agent.py` |

---

### 1.4 — Non-blocking Slack responses

| | |
|---|---|
| **Type** | Feature |
| **What** | Per-thread async queue with post-then-edit pattern. On message receipt: (1) post "thinking..." immediately, (2) release session lock, (3) run LLM+tools flow in background task, (4) edit posted message with final response when complete. Requires idempotency (same message not processed twice), cancellation support (user sends "cancel"), and ordered delivery (responses arrive in message order). |
| **Why** | Per-session lock currently held across the entire LLM response + tool execution cycle (`slack_adapter.py:448`, `agent.py:281-289`). Causes 30s+ silent gaps in Slack threads — the highest-visibility UX gap in zazig. Confirmed by Codex code review. Source: Spacebot's "streaming via edit" pattern. |
| **Depends on** | None. But this card's per-thread queue is the **foundation** that 2.2 (coalescing) and 2.3 (approval) plug into, and the evolutionary basis for S.1 (Branch/Worker). Build it right. |
| **Complexity** | Medium-High (1-2 weeks) |
| **Model** | **Sonnet 4.6** — concurrency reasoning, race condition handling, message ordering edge cases |
| **Labels** | `claude-ok`, `tech-review` |
| **Files** | `zazig/slack_adapter.py`, `zazig/agent.py` |
| **CTO review required** | Yes — changes message delivery semantics. Needs architecture sign-off on the queue model, cancellation behavior, and error handling (what happens when background task fails after "thinking..." is already posted). |
| **Gotcha** | Need idempotency, cancellation, and ordered delivery to avoid racy/out-of-order replies. Test thoroughly with concurrent messages on the same thread. |

---

### 2.1 — Memory snapshot export

| | |
|---|---|
| **Type** | Feature |
| **What** | Auto-generate `MEMORY_SNAPSHOT.md` per exec agent from core memory category. On cold boot (empty/missing QMD index), auto-hydrate from snapshot. Snapshots are versioned with ISO timestamps in a header block. Can be committed to the zazig repo or instance config repo for disaster recovery. |
| **Why** | No portability story for agent memory today. Mac migration, QMD DB corruption, or new instance setup means agents start from zero with no context. ZeroClaw's "soul export" pattern solves this. This also answers "what happens when we add a new collaborator — how do their agents get baseline knowledge?" |
| **Depends on** | None |
| **Complexity** | Low (1 day) |
| **Model** | **Codex** |
| **Labels** | `codex-first` |
| **Files** | `zazig/memory.py` (export/hydrate functions), `MemoryWriter` (periodic snapshot trigger) |
| **Gotcha** | Snapshots must include a generation timestamp and a hash of the source data. On hydration, compare timestamps — never overwrite a newer DB with an older snapshot. Stale snapshots are worse than no snapshots. |

---

### 2.2 — Message coalescing

| | |
|---|---|
| **Type** | Feature |
| **What** | Per-channel debounce buffer. Multiple rapid messages within a configurable window (1500ms default, 5000ms max) are batched into a single LLM turn. LLM sees all messages with timing context and sender attribution. Agent has the option to selectively respond (skip some messages in the batch). DMs bypass coalescing entirely. |
| **Why** | In multi-user Slack channels (CPO with multiple collaborators, CMO marketing discussions), rapid-fire messages cause multiple separate LLM calls — expensive, and the agent loses the conversational context of the burst. Batching produces more natural, cheaper responses. Source: Spacebot. |
| **Depends on** | 1.4 (per-thread queue makes this natural — coalescing is a buffer layer in front of the queue) |
| **Complexity** | Low-Medium (2-3 days) |
| **Model** | **Codex** |
| **Labels** | `codex-first` |
| **Files** | `zazig/slack_adapter.py` |
| **Gotcha** | Must not suppress urgent interrupts. Keep max-wait window short. Consider a priority bypass for messages containing "urgent", "@here", or explicit bot mentions mid-buffer. |

---

### 2.3 — Slack-native approval workflow

| | |
|---|---|
| **Type** | Feature |
| **What** | When an exec agent wants to take a risky action (merge PR, send external message, deploy, modify production Trello board), post a Slack approval request with interactive buttons: `[Approve] [Decline] [Always approve]`. Agent pauses and waits for reply. "Always" is scoped: per tool + per channel + 24-hour TTL (not a permanent global bypass). Approval audit log written to state dir. |
| **Why** | Current "move card to Needs Human" flow adds hours of latency for simple yes/no decisions. A Slack-native flow makes approval near-instant. Source: ZeroClaw's ApprovalManager. This directly enables more autonomous agent behavior — agents can attempt more if the safety net is fast. |
| **Depends on** | None technically, but integrates cleanly with 1.4 (queue handles the "wait for reply" state) |
| **Complexity** | Medium (1 week) |
| **Model** | **Sonnet 4.6** — Slack interactive component architecture, approval state machine |
| **Labels** | `claude-ok`, `tech-review` |
| **Files** | `zazig/approval.py` (new module), `zazig/slack_adapter.py` (interactive message handling) |
| **CTO review required** | Yes — requires new Slack bot permission scopes (interactive components). Also needs agreement on which actions require approval vs. which are auto-approved. |
| **Gotcha** | "Always" must be TTL-scoped to prevent permanent unsafe bypass. What happens if the human doesn't respond within X minutes? Default-deny with a timeout notification. |

---

### 3.1 — Structured memory types

| | |
|---|---|
| **Type** | Feature |
| **What** | Add typed memory categories to QMD indexing and the `memory_save` / `memory_search` tool interface. Categories with default importance scores: `decision` (0.8), `goal` (0.9), `preference` (0.7), `fact` (0.6), `event` (0.4), `observation` (0.3). Support a `pinned` flag that exempts a memory from decay. Importance scores influence memory bulletin composition (3.2) and search result ranking. |
| **Why** | Memory is currently flat append-only markdown with no differentiation between a critical product decision and a passing observation. This makes memory search imprecise and the planned memory bulletin (3.2) impossible to compose well. Source: Spacebot's 8-type model (adapted to 6 types relevant to our exec team use case). |
| **Depends on** | None (but enables 3.2) |
| **Complexity** | Medium (3-5 days) |
| **Model** | **Sonnet 4.6** (design: category schema, score tuning, decay policy) → **Codex** (implementation) |
| **Labels** | `claude-ok`, `design` |
| **Files** | `zazig/memory.py`, `zazig/tools.py` (memory_save gets `category` and `pinned` params) |
| **Gotcha** | Decay can drop still-critical old constraints (e.g. "never hard-code Slack tokens" — a decision from month 1 that's still vital). The `pinned` flag addresses this. Retrieval quality matters more than schema labels — don't over-index on the type taxonomy. |

---

### 3.2 — Memory bulletin

| | |
|---|---|
| **Type** | Feature |
| **What** | On agent startup (and on a configurable refresh interval, default 30 min), run memory queries across six dimensions: recent decisions, active goals, user preferences, key facts, current projects, recent events. LLM synthesizes into a ~300-word bulletin. Injected into system prompt as `[Context Bulletin]` block. Refresh triggered by timer or by event (new memory saved with importance >= 0.7). |
| **Why** | Today exec agents have no ambient awareness — they only know things they actively search for. A CPO opening a session has no idea what happened overnight unless it reads state files. The bulletin gives every exec agent a baseline understanding of the full portfolio state on every turn, without per-message search cost. Source: Spacebot Cortex bulletin. |
| **Depends on** | 3.1 (typed categories dramatically improve bulletin section quality) |
| **Complexity** | Medium (1 week) |
| **Model** | **Sonnet 4.6** |
| **Labels** | `claude-ok` |
| **Files** | `zazig/memory.py` (bulletin generation), `zazig/agent.py` (system prompt injection) |
| **Gotcha** | Token tax: ~300 tokens per turn added to system prompt. Risk of "summary drift" if refresh interval is too long and the bulletin diverges from reality. Consider event-triggered refresh (new high-importance memory → regenerate) alongside the timer. |

---

### 3.3 — CTO/CMO pickup loops

| | |
|---|---|
| **Type** | Design |
| **What** | Design doc for autonomous CTO and CMO polling loops. CTO: poll Trello for `tech-review` labeled cards in Up Next → read card description + linked PR/design doc → write technical review as card comment → remove `tech-review` label → card unblocked for VP-Eng. CMO: poll for `marketing` labeled cards → produce GTM plan or content strategy → report to CPO. |
| **Why** | CTO and CMO currently respond only to @mentions — they do no autonomous work. The exec team model is incomplete without their autonomous loops. Both roles have operating manuals but no execution cycle. Spacebot validates: specialized agents with narrow, well-scoped jobs are more reliable than generalists. |
| **Depends on** | None (design only — implementation cards will be created from the design doc) |
| **Complexity** | Medium (design doc: 1 day CPO deep dive with Opus) |
| **Model** | **Opus 4.6** — strategic role design, boundary decisions between CPO/CTO/CMO/VP-Eng |
| **Labels** | `design`, `tech-review` |
| **Output** | `docs/plans/2026-XX-XX-cto-cmo-pickup-loops.md` |

---

### 4.1 — Query-based model routing

| | |
|---|---|
| **Type** | Feature |
| **What** | Lightweight keyword classifier in `AgentSession.handle_message()` that pre-routes messages to different models. Quick reads → Haiku. Strategy → Opus. Default → Sonnet. Config-driven rules in `zazig.yaml`. Requires refactoring the provider abstraction to support model changes mid-session (or creating lightweight session pools per model tier). |
| **Why** | All exec roles currently run on a single fixed model regardless of task complexity. This wastes Opus tokens on "show me the Trello board" and under-powers deep reasoning on Sonnet. Direct cost optimization. Source: ZeroClaw. |
| **Depends on** | Session redesign — model is currently bound at session creation (`config.py:27`, `providers/claude.py:78`). Per-turn switching without this redesign would split context across providers. Only start this after telemetry confirms which queries are truly cheap vs expensive in our actual workload. |
| **Complexity** | Medium (1-2 weeks including session redesign) |
| **Model** | **Sonnet 4.6** |
| **Labels** | `claude-ok`, `tech-review` |
| **Files** | `zazig/config.py`, `zazig/agent.py`, `zazig/providers/claude.py`, `zazig/providers/openai.py` |
| **CTO review required** | Yes — session model changes affect all agents. Risk of context fragmentation if not designed carefully. |
| **Gotcha** | Keyword classification is a heuristic that fails at edges (a cleverly phrased complex question won't hit the keyword list). May need telemetry/eval before this is worth doing. |

---

### S.1 — Full Branch/Worker decomposition

| | |
|---|---|
| **Type** | Architecture |
| **What** | Concurrent branches (history-cloned independent LLM tasks), formal worker state machine (`Running → WaitingForInput → Done → Failed`), status injection into Channel context on every turn, worker log persistence, cross-branch context sharing. Full Spacebot Channel/Branch/Worker/Compactor architecture adapted to Python/zazig. |
| **Why** | Enables parallel CPO standup analysis across all project boards simultaneously, VP-Eng parallel QA across multiple projects, and true non-blocking multi-worker orchestration. Card 1.4 is the minimal version; this is the full realization. |
| **Depends on** | 1.4 (per-thread queue is the foundation), 3.1 (structured memory for worker context), 3.3 (CTO/CMO loop design informs worker role contracts) |
| **Complexity** | High (4-6 weeks) |
| **Model** | **Sonnet 4.6** (architecture) → **Codex** (implementation) |
| **Labels** | `claude-ok`, `design`, `scale-up` |
| **Trigger** | 5+ concurrent active Slack channels, OR CPO parallel standup analysis is the primary bottleneck, OR VP-Eng needs parallel QA across 3+ projects simultaneously |
| **Design reference** | Spacebot analysis in this document (sections on Branch model, Worker lifecycle, Compactor, status injection) |

---

### Dependency Graph

```
1.1 ─┐
1.2 ─┼─ (all independent, run in parallel)
1.3 ─┘
1.4 ───────────────┬──── 2.2 (coalescing plugs into queue)
                   ├──── 2.3 (approval waits via queue)
                   └──── S.1 (queue is the evolutionary foundation)
2.1 ─── (independent)
3.1 ─── 3.2 (bulletin needs typed categories)
3.3 ─── (independent design work)
4.1 ─── (blocked by session redesign, needs telemetry)
```

### CTO Review Required

Cards that need CTO architecture sign-off before moving to Up Next:
- **1.4** — non-blocking queue model, cancellation, error handling
- **2.3** — Slack interactive component scopes, approval action scope
- **4.1** — session model changes, context fragmentation risk
- (Future) **T3.3 multi-platform channels** — adapter abstraction design

---

## Decision Needed from Tom/Chris

1. **Priority of T1.x quick wins** — all three are low-risk and can run in parallel this sprint. Approve moving to Up Next?
2. **T2.2 (non-blocking responses)** — this is the biggest UX improvement. Do you feel the "thinking..." + edit approach is the right user experience for Slack, or do you prefer the current silent wait?
3. **T2.5 (Slack approval workflow)** — requires new Slack interactive component permissions. Are you willing to update the bot scopes for this? It would make the "Needs Human" flow much faster.
4. **T3.1 (CTO/CMO pickup loops)** — design doc needed first. Should this be a CPO deep dive next session?
