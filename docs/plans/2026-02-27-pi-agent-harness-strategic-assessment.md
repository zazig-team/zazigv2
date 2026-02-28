# Pi as Agent Harness: Strategic Assessment

**Date:** 2026-02-27
**Author:** CPO
**Status:** Research complete, awaiting human decision
**Supporting research:**
- `docs/plans/2026-02-27-pi-mono-technical-recon.md` (pi-mono architecture deep dive)
- `docs/research/2026-02-27-can1357-oh-my-pi.md` (oh-my-pi fork analysis)
- OpenClaw reference repo analysis (in-session, not persisted)

---

## The Question

We currently run agents inside Claude Code. We depend on its skills, MCP servers, hooks, permission system, and subprocess model. Pi is the harness OpenClaw is built on. If we want to become the next OpenClaw, should we build on Pi?

## What Pi Actually Is

Pi-mono is a TypeScript monorepo (MIT, 17.6k stars) by Mario Zechner with 7 packages:

- **pi-ai** — Unified LLM API across 17+ providers, 2000+ models. Mid-session model switching. JSON-serializable contexts for cross-model handoff.
- **pi-agent-core** — Agent loop state machine. Tool execution, validation, event streaming.
- **pi-coding-agent** — The CLI harness. 4 core tools (read/write/edit/bash). Sub-1000-token system prompt. Four modes: interactive, print, RPC, SDK.
- **pi-mom** — Slack bot.
- **pi-web-ui** — Web components for chat interfaces.
- **pi-tui** — Terminal UI with differential rendering.
- **pi-pods** — vLLM GPU infrastructure management.

The design philosophy is radical minimalism. 4 tools. Tiny system prompt. Everything else added via extensions or skills. "If you want the agent to do something, ask it to extend itself."

## What OpenClaw Built on Top of Pi

OpenClaw took Pi's core and built a full platform:

- **Embedded Pi runtime** — `runEmbeddedPiAgent()` runs pi in-process, not as a subprocess
- **12 messaging channels** — WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Google Chat, Teams, Matrix, WebChat, etc.
- **Gateway control plane** — WebSocket server (ws://127.0.0.1:18789) routing inbound messages to isolated agents
- **Multi-agent routing** — Session keys encode `agent:channel:account:target`. Each agent fully isolated (workspace, skills, config)
- **Plugin SDK** — Extensions are TypeScript modules with `register(api)` pattern. Each gets its own package.json.
- **40+ skills** — 1Password, Apple Notes, Obsidian, GitHub, Discord, Slack, etc.
- **Native apps** — macOS menu bar (SwiftUI), iOS companion, Android companion
- **Tool streaming** — Real-time partial results to UI with smart chunking

OpenClaw proves Pi can support a production multi-agent platform. It's not a toy.

## What oh-my-pi Proves About Pi's Extensibility

Can1357's fork shows Pi's foundation supports aggressive modification:

- **Hash-anchored edits** — 10x improvement in edit reliability (6.7% → 68.3% on weak models). Line-level hashes replace string matching.
- **LSP integration** — 40+ languages, server multiplexing, format-on-write
- **Rust native engine** — 7,500 lines of N-API for grep, shell, text, image, clipboard
- **Parallel subagents** — Worker pool with git worktree isolation, baseline capture/restore, delta extraction
- **MCP support** — Added what pi-mono deliberately omits
- **TTSR** — Mid-stream correction without restarting generation
- **14 stealth browser scripts** — Anti-detection for web automation

This is a near-complete rewrite of the tooling layer on Pi's foundation. The core agent loop and extension system were solid enough to support it.

---

## Our Current Architecture vs Pi

### What We Have (Claude Code harness)

```
Orchestrator (Supabase edge functions)
    → Daemon (local machine, slot management)
        → Claude Code CLI (subprocess per job)
            → MCP servers (pipeline tools)
            → Skills (injected via workspace)
            → Hooks (pre/post tool use)
            → CLAUDE.md (agent identity + instructions)
```

### What Pi Would Give Us

```
Orchestrator
    → Daemon
        → Pi RPC (subprocess, JSON protocol over stdin/stdout)
            OR
        → Pi SDK (in-process, full programmatic control)
            → Extensions (tool registration, lifecycle hooks, event interception)
            → Skills (markdown capability packages)
            → Multi-model (17+ providers, mid-session switching)
            → Session branching (tree-structured, fork/navigate)
```

### Direct Comparison

| Dimension | Claude Code | Pi | Verdict |
|-----------|------------|-----|---------|
| **Programmatic control** | Subprocess only, parse stdout | SDK (in-process) + RPC (JSON protocol) | Pi wins decisively |
| **Tool registration** | MCP servers (separate process, JSON-RPC) | Native TypeScript extensions (in-process) | Pi — faster, simpler, more powerful |
| **Multi-model** | Anthropic only | 17+ providers, mid-session switching | Pi — cost optimisation, fallback chains |
| **Extension system** | Hooks (pre/post tool), MCP | 65+ lifecycle events, tool interception, UI, commands | Pi — much richer |
| **Session management** | Opaque, no branching | Tree-structured JSONL, fork/navigate, custom compaction | Pi — we can build retry/branch strategies |
| **Built-in tools** | ~15 (search, notebook, web, git, etc.) | 4 (read, write, edit, bash) | Claude Code — but Pi's are extensible |
| **Permission system** | Built-in allow/deny | None (YOLO). Extension-based. | Claude Code — but we barely use it |
| **MCP support** | Native | None built-in. Extension/bridge needed. | Claude Code — this is our biggest dependency |
| **Anthropic optimisation** | Purpose-built for Claude | Model-agnostic (works with Claude but not optimised) | Trade-off — optimisation vs portability |
| **License** | Proprietary | MIT | Pi — we own our destiny |
| **Maintainer** | Anthropic (company) | Mario Zechner (individual, opinionated) | Risk either way |
| **Maturity** | Production, widely used | Production, but 0.x versioning | Comparable |

---

## Three Paths Forward

### Path 1: Full Migration to Pi

Replace Claude Code entirely. Run all agents on Pi.

**What we'd gain:**
- SDK mode — drive agents programmatically from our Deno executor (via RPC) or rewrite executor in Node (via SDK)
- Multi-model — use Haiku/Flash for simple jobs, Opus for complex. Save money.
- Extension system — replace our MCP servers + skills + hooks with a single, richer abstraction
- Session control — branching, custom compaction, mid-session model switching
- MIT license — fork and modify freely if Mario's direction diverges from ours

**What we'd lose:**
- MCP integration — our pipeline tools (query_features, create_idea, etc.) are MCP servers. Need bridge or rewrite as extensions.
- Claude Code's 15+ built-in tools — Glob, Grep, WebFetch, NotebookEdit, etc. Would need to build/source extensions.
- Anthropic-specific optimisations — Claude Code is tuned for Claude. Pi is generic.
- Stability guarantee — 0.x version, single maintainer, lockstep releases

**Effort:** Large. 4-8 weeks minimum. High risk of discovering gaps mid-migration.

**Recommendation:** Not yet. Too much unknown. But this is the eventual destination if we're serious about becoming an agent platform company.

### Path 2: Steal Ideas, Stay on Claude Code

Keep Claude Code as harness. Adopt Pi's best patterns into our architecture.

**What to steal:**
1. **Multi-model dispatch** — Use pi-ai as a library for non-agentic LLM calls. Route simple classification/extraction to cheap models.
2. **Extension middleware pattern** — Tool call/result interception for governance. Could inform how we structure approval gates.
3. **Session branching** — Conceptually. If a job fails, fork the session and retry from the last good state instead of starting over.
4. **Hash-anchored edits** (from oh-my-pi) — If edit reliability becomes a bottleneck, this is proven.
5. **TTSR mid-stream correction** (from oh-my-pi) — Guardrails during generation, not just post-hoc.

**What we'd gain:**
- Incremental improvements without migration risk
- Stay on Claude Code's update path (Anthropic keeps improving it)
- Lower effort

**What we'd lose:**
- Still locked to Claude Code's subprocess model
- Still locked to Anthropic models
- Still no programmatic session control
- Still dependent on a proprietary harness we can't modify

**Effort:** Small per item. 1-2 weeks total.

**Recommendation:** Good tactical moves regardless of strategic direction. Do these now.

### Path 3: Hybrid — Pi for Orchestration, Claude Code for Execution

Use Pi's SDK/RPC as the orchestration layer. Keep Claude Code as one possible execution backend. Add Pi-native agents as another backend.

```
Orchestrator
    → Daemon
        → Pi SDK (orchestration layer)
            → Extension: claude-code-bridge (spawns Claude Code for jobs that need it)
            → Extension: pi-native-agent (runs directly for jobs that don't)
            → Extension: zazig-pipeline (replaces MCP with native tools)
            → Extension: multi-model-router (picks model by job complexity)
```

**What we'd gain:**
- Best of both — Pi's programmatic control + Claude Code's tool ecosystem where needed
- Gradual migration path — start with Pi wrapper, move jobs to Pi-native one at a time
- Multi-model from day one
- Extension system for custom tools without MCP overhead

**What we'd lose:**
- Complexity of maintaining two runtimes during transition
- Need to build the claude-code-bridge extension

**Effort:** Medium. 2-4 weeks for the bridge + first Pi-native job type.

**Recommendation:** This is the pragmatic path if we're serious about the transition. It lets us validate incrementally.

---

## The "Become OpenClaw" Question

OpenClaw is a **consumer-facing personal AI assistant** that uses Pi as its agent runtime. It connects to your messaging channels, runs on your machine, has native apps.

We are a **B2B agent pipeline** that orchestrates specialised agents to ship software. Different product, different architecture needs.

What we should learn from OpenClaw is not "use Pi" but rather:

1. **Embedded runtime > subprocess spawning** — OpenClaw runs Pi in-process. We spawn Claude Code as a subprocess. The in-process model is faster, gives more control, and eliminates parsing overhead.

2. **Plugin SDK pattern** — OpenClaw's `register(api)` pattern is cleaner than our MCP server pattern. Extensions are just TypeScript modules. No separate processes, no JSON-RPC, no port management.

3. **Session key routing** — Their `agent:channel:account:target` key pattern is elegant. Our routing is more complex but the principle (encode routing in the session key) is sound.

4. **Tool policy as data** — Tool allowlists and policies are configurable, not hardcoded. Enforced at dispatch time.

5. **Multi-agent isolation** — Each agent gets its own workspace, config, and skills. This is what we already do with workspaces, but OpenClaw does it more cleanly because Pi supports it natively.

---

## What I'd Actually Recommend

**Short term (this week):** Path 2. Steal the ideas. Specifically:
- Evaluate pi-ai as a library for our non-agentic LLM calls (classification, extraction, summarisation)
- Document the MCP-to-extension migration path for our pipeline tools

**Medium term (next 2-4 weeks):** Spike Path 3.
- Take one simple job type (e.g., a research job)
- Run it through Pi RPC mode instead of Claude Code
- Measure: setup time, execution quality, tool coverage gaps, subprocess overhead
- Build the zazig-pipeline extension (pipeline MCP tools as Pi extensions)

**Long term (if spike succeeds):** Execute Path 3 fully.
- Build the Pi orchestration layer
- Migrate job types one at a time from Claude Code to Pi-native
- Eventually drop Claude Code dependency entirely

**Decision point:** The spike will tell us if Pi's 4-tool minimalism is a real problem or if the extension ecosystem fills the gap. If we need Glob, Grep, WebFetch etc. and they don't exist as extensions, the migration cost doubles.

---

## Risk Register

| Risk | Severity | Mitigation |
|------|----------|------------|
| Single maintainer (Mario) | High | MIT license means we can fork. Budget for maintenance if he disappears. |
| No MCP built-in | Medium | oh-my-pi added MCP. Bridge extension is feasible. |
| 4-tool minimalism | Medium | Extensions exist for more. Spike will quantify the gap. |
| Deno/Node gap | Low | RPC mode is language-agnostic. SDK needs Node but we could migrate executor. |
| 0.x API instability | Medium | Pin versions. Lockstep versioning means we upgrade atomically. |
| Claude Code improves faster than Pi | Low | Monitor both. The switch cost decreases over time as Pi matures. |
| OpenClaw moves in a direction that doesn't serve us | Low | We'd build on pi-mono, not OpenClaw. They're separate projects. |

---

## Sources

- [Pi blog post (Armin Ronacher)](https://lucumr.pocoo.org/2026/1/31/pi/)
- [Pi-Mono GitHub](https://github.com/badlogic/pi-mono)
- [oh-my-pi GitHub](https://github.com/can1357/oh-my-pi)
- [Mario Zechner's design philosophy](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [Pi extensions docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi SDK docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- [Pi RPC docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [pi-subagents community extension](https://github.com/nicobailon/pi-subagents)
- OpenClaw reference repo (local: `~/Documents/GitHub/openclaw-reference/`)
