# Recon: badlogic/pi-mono
*Analyzed: 2026-02-19 | Commit: 4ba3e5b | Compared against: zazig, zazigv2*

## TL;DR
- pi-mono is a TypeScript monorepo for AI coding agents: multi-provider LLM library, agent runtime, TUI/web-ui, Slack bot, GPU pod manager.
- The `packages/agent` and `packages/coding-agent` layers have exceptionally clean architecture — patterns worth stealing for the Python/Zazig runtime.
- The `steer` + `followUp` two-tier queue is the highest-value steal: Zazig's current turn execution is single-lane blocking; this fixes it.
- The `convertToLlm` boundary pattern solves a real Zazig problem: app-state messages (agent signals, status) leaking into LLM context.
- Session persistence as an append-only JSONL tree with branching is a complete, well-tested design worth adapting.

---

## Steal List

### 1. Steer + FollowUp two-tier queue ← **steal first**
**What it is:** Two distinct message queues on the agent.
- `steer(msg)` — injected mid-run, after each tool call completes. Cancels remaining tool calls in the current batch and redirects the agent.
- `followUp(msg)` — queued and delivered only after the agent has fully stopped (no more tool calls, no pending steering).

After every tool execution, the loop calls `getSteeringMessages()`. If any exist, remaining tool calls are skipped with `"Skipped due to queued user message."` results. Follow-ups extend the run after it would otherwise stop.

**Why steal first (Codex agrees):** Zazig's current flow is single-lane blocking (`slack_adapter.py:448`, `agent.py:281`). A Slack user's mid-run message either races the current turn or is dropped. The two-tier queue gives the biggest immediate behavioral win: steer preempts, follow-up queues, and the two never collide. It's also the right foundation for cancellation, coalescing, and non-blocking Slack UX.

**Borrowing plan:** Add `steering_queue: asyncio.Queue` and `followup_queue: asyncio.Queue` to `AgentSession`. After each tool call result, drain steering queue before the next LLM call. Drain follow-up queue at turn completion.

---

### 2. `convertToLlm` message boundary — clean filter at LLM call time
**What it is:** The agent loop operates on `AgentMessage[]` — a superset that can include custom/notification/status messages. At the LLM call boundary, `convertToLlm(messages: AgentMessage[]) => Message[]` filters and transforms. Custom messages (UI-only, agent-to-agent signals) return `[]`. There's also a `transformContext` pre-hook for context pruning or injection.

**Why steal:** Zazig injects thread context and system messages inline using string concatenation (`agent.py:216`). There's no explicit boundary — anything in the message list goes to the LLM. This means agent state signals, retried blocks, or debug context can pollute the LLM context window. The filter callback makes the boundary explicit and testable.

**Borrowing plan:** Add a `_to_llm_messages(messages)` method to `AgentSession`. Default implementation passes through user/assistant/tool_result. Custom agent subclasses can override to strip or transform. Apply before every LLM call.

---

### 3. Session persistence as append-only JSONL tree
**What it is:** Sessions are JSONL files where each line is a typed entry (`message`, `compaction`, `model_change`, `custom_message`, etc.). Each entry has `id` and `parentId` forming a tree. The leaf pointer tracks current position. `branch(id)` moves the leaf to an earlier entry for diverging paths. `buildSessionContext()` walks root→leaf. `CompactionEntry` stores a summary + `firstKeptEntryId` for sliding-window context management with preserved summary.

**Why steal:** Zazig has zero session persistence. Every restart loses conversation context. The current workaround is prepending thread history as a blob (a hack that scales poorly and burns tokens). The JSONL append-only model is simple, fast, requires no database, and handles crashes cleanly.

**Borrowing plan:** Implement `SessionManager` in Python using `pathlib` + `json`. Start with linear sessions (no branching). Key sessions by `cwd` or `instance_id + thread_ts`. Add `appendMessage` / `buildContext`. Compaction comes later — start with simple truncation.

---

### 4. Generic EventStream<T, R> push-pull primitive
**What it is:** A single class wrapping an asyncio-style push queue:
```typescript
class EventStream<T, R> implements AsyncIterable<T> {
  push(event: T): void      // producer side
  [Symbol.asyncIterator]()  // consumer side
  result(): Promise<R>      // final value when isComplete fires
}
```
Constructor takes `isComplete(event): bool` and `extractResult(event): R` predicates. Used for both LLM streaming events and agent loop events.

**Why steal:** The Python Claude Agent SDK already has streaming but Zazig's agent loop fires callbacks ad-hoc. This pattern makes the agent loop composable — you can `async for event in agent.run(...)` from outside and inspect events or react to them. Enables clean testing.

**Borrowing plan:** In Python, implement as an `asyncio.Queue`-backed async generator with a `result()` coroutine. The `AgentSession.run()` method yields `AgentEvent` objects rather than calling callbacks.

---

## We Do Better

**QMD memory search (SQLite FTS5 + vector + LLM reranking)** — pi has no equivalent. Zazig's memory system is more sophisticated.

**Multi-instance architecture** — pi is single-user, single-instance. Zazig's instance-keyed config, Doppler secrets, and tmux session management is significantly more powerful for team/shared operation.

**Provider compat quirk tracking** — irrelevant. We're Anthropic-only. pi tracks 15+ OpenAI compat flags because it supports everything. We don't need any of that.

**Persistent exec team roles** (CPO/CTO/CMO/VP-Eng with Trello, Slack, heartbeats) — completely out of scope for pi, which is a personal coding agent.

---

## Architecture Observations

**Three-layer separation in pi:** `packages/ai` (LLM API abstraction) → `packages/agent` (agent loop + state) → `packages/coding-agent` (app-layer with tools, sessions, extensions). Zazig conflates all three in `zazig/agent.py`. The separation is worth understanding even if not porting directly.

**The extension system is a full plugin platform** — 1200+ lines of types, 30+ lifecycle events, typed tool/command registration, per-extension event bus. Way too heavyweight to borrow as-is, but the typed event taxonomy (`session_before_compact`, `context`, `input`, `tool_call`, `tool_result`) is a useful reference for designing Zazig's own event hooks if we ever need them.

**Overflow detection is exhaustive** — 12 regex patterns covering Anthropic, OpenAI, Google, xAI, Groq, OpenRouter, Cerebras, Mistral, LLM Studio. Not relevant since we're Anthropic-only, but impressive as a reference.

**The proxy stream pattern** (client sends model+context to `/api/stream`, server strips `partial` from delta events, client reconstructs) is a clean bandwidth optimization for multi-client setups. Relevant if Zazig ever needs a shared LLM proxy for cost tracking or key centralization.

---

## Codex Second Opinion

**Consulted:** gpt-5.3-codex (xhigh reasoning, 132s, ~127k tokens)

**Top pick:** C — steer + followUp two-tier queue. Agrees this is steal-first because Zazig is "effectively single-lane/blocking" and "high-priority human steering gets stuck behind long turns/tool loops."

**Suggested rollout order:** C → B → D → A (differs from my original 1→2→3→4, but same semantics: interrupt semantics first, boundary second, persistence third, streaming primitive last).

**What Codex thinks I missed:**
- **Idempotency + causality IDs per turn** (`event_id`, `turn_id`, `parent_turn_id`) for replay safety. Not in pi-mono's design, but Codex is right that Zazig needs this to avoid double-processing Slack events.
- **Explicit preempt/cancel policy** for in-flight follow-ups. pi has `clearFollowUpQueue()` but no documented policy for when to call it.
- **Boundary sanitization/redaction before history/log writes** — specifically at `zazig/agent.py:316` and `zazig/providers/openai.py:103` where tool output is injected. Close cousin of the `convertToLlm` boundary, but focused on what gets *written to logs* rather than what gets *sent to the LLM*.
- **Backpressure + observability** — queue depth, latency, dropped/coalesced message counts. pi doesn't track this either, but it's worth adding alongside the queue implementation.

**Agreement:** Both analyses agree on C → B → D → A ordering. Codex's additions (idempotency IDs, backpressure metrics) are complementary, not contradictory.

---

## Raw Notes

- `mom` package is a Slack bot that delegates messages to the pi coding agent — conceptually similar to Zazig's Slack adapter but much simpler (one agent, one channel, no roles).
- `packages/tui` is a full differential terminal renderer — not relevant but impressive.
- `packages/pods` manages vLLM deployments on GPU pods via CLI — not relevant.
- Lockstep versioning: all packages always share the same version number. Simpler than independent semver.
- AGENTS.md has strict parallel-agent git rules: never `git add .`, track your own files, no destructive ops. Good template for our multi-agent PR workflow docs.
- `disable-model-invocation` skill flag = only accessible via explicit `/skill:name`, not auto-injected into system prompt. We should add this to our skills system.
- Session names are user-defined labels stored as `session_info` entries in the JSONL — clean UX for session browser.
- The `branch_summary` entry type captures abandoned conversation paths when branching — smarter than our current "prepend thread history" hack for context carryover.
