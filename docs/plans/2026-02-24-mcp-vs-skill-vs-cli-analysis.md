# MCP vs Skill vs CLI — Context Cost Analysis for Persistent Agent Tools

**Date:** 2026-02-24
**Status:** Discussion
**Context:** The persistent-agent-identity design uses MCP tools for `create_feature`, `update_feature`, `query_projects`, and `send_message`. This doc questions whether MCP is the right abstraction for all of them, given persistent agents are context-constrained.

---

## The Problem

The CPO is a long-running persistent session. Context window is its scarcest resource. Every token of permanent overhead reduces how much conversation history and reasoning the agent can retain.

MCP tools have a constant context cost: their JSON schemas (name, description, parameter definitions) are loaded at session start and stay in context forever. On top of that, the current design puts tool usage documentation into `roles.prompt` in the CLAUDE.md — so the agent pays twice: once for the schema, once for the prose docs explaining how to use it.

For a session that runs for hours or days, that baseline matters.

---

## Context Cost Comparison

### MCP Tool

**Constant overhead (always in context):**
- JSON schema per tool: ~200-400 tokens (name, description, parameter types, required fields)
- 4 tools = ~800-1600 tokens of permanent context
- Tool documentation in `roles.prompt`: ~200-500 tokens per tool (usage examples, parameter explanations)
- Total permanent cost: **~1600-3600 tokens**

**Per-invocation cost:**
- Tool call (structured JSON) + response (structured JSON)
- These accumulate in conversation history

**Benefits:**
- Typed inputs with schema validation — agent can't pass wrong parameters
- Structured JSON response — no parsing needed
- Auto-approvable via `.claude/settings.json` — no human approval needed
- Native to Claude Code — appears in the tool palette, agent discovers it naturally
- Good developer ergonomics

**Drawbacks:**
- Permanent context cost regardless of usage frequency
- Double documentation (schema + prose docs in role prompt)
- Overkill for simple CRUD operations called a few times per day

### Skill

**Constant overhead:** Zero. Skills are not in context until invoked.

**Per-invocation cost:**
- Skill prompt expands into context when called (could be large, but temporary in the sense that it's a one-time expansion per invocation)
- The actual DB write would still need a mechanism (fetch call via Bash, a helper script, or a single MCP tool)

**Benefits:**
- No baseline context cost — only pays when used
- Can embed multi-step reasoning (ask questions, validate, then write)
- Easy for Tom to edit (it's just a markdown prompt file)
- Good for complex workflows that involve decision-making

**Drawbacks:**
- Skills are user-initiated or explicitly triggered, not something an agent naturally calls mid-conversation. The CPO would need to know to invoke `/create-feature` at the right moment, which is less natural than just calling a tool.
- Still needs a mechanism to actually write to the DB (skill = workflow wrapper, not an API call)
- Can't be auto-approved in the same way as MCP tools

### CLI (Bash wrapper or curl)

**Constant overhead:** ~50-100 tokens of documentation in the role prompt ("use `zazig create-feature '{json}'` to create features").

**Per-invocation cost:**
- One Bash tool call + stdout text response
- Minimal compared to MCP structured call/response

**Benefits:**
- Near-zero baseline context cost
- Testable outside Claude Code (any shell)
- Simple to implement (thin wrapper around curl to the edge function)
- One line of documentation in the role prompt

**Drawbacks:**
- Agent uses Bash tool — broader permission surface, harder to auto-approve just this command
- No input validation — typo in JSON silently fails or returns a 400
- Unstructured text output — agent parses stdout instead of getting typed JSON
- Less discoverable — agent only knows about it from the prompt docs

---

## Usage Frequency Matters

Not all tools are equal:

| Tool | Estimated frequency | Nature |
|------|-------------------|--------|
| `send_message` | Dozens per day | Core interaction loop — every Slack reply |
| `query_projects` | Several per day | Context lookup during conversations |
| `create_feature` | 2-3 per day | Occasional, triggered by user request |
| `update_feature` | 5-10 per day | Moderate, used to refine features |

High-frequency tools benefit from MCP's structured ergonomics. Low-frequency tools don't justify permanent context residency.

---

## Recommendation

**Hybrid approach:**

| Tool | Mechanism | Rationale |
|------|-----------|-----------|
| `send_message` | **MCP** | Called constantly. Structured input (conversation ID, message body) prevents errors. Worth the context cost. |
| `query_projects` | **MCP** | Called frequently for context. Structured response (JSON array) is much easier for the agent to reason over than parsing curl output. |
| `create_feature` | **CLI or Skill** | Called 2-3x/day. Simple POST with a JSON body. Doesn't justify ~400-800 tokens of permanent context. |
| `update_feature` | **CLI or Skill** | Called 5-10x/day. Same reasoning. Slightly more frequent but still not core-loop. |

This keeps the 2 high-frequency tools as MCP (structured, auto-approved, always available) and moves the 2 low-frequency CRUD tools to a lighter mechanism, saving ~800-1600 tokens of permanent context overhead.

### If CLI

A thin `zazig` CLI wrapper that calls the edge functions:

```bash
# In the role prompt, document these two commands:
zazig create-feature '{"project_id":"...","title":"...","description":"..."}'
zazig update-feature '{"feature_id":"...","status":"ready_for_breakdown"}'
```

The wrapper handles auth (reads JWT from env), calls the edge function, returns the JSON response. ~3 lines of docs in the role prompt.

### If Skill

A `/create-feature` skill that expands into a prompt guiding the agent through the creation, then does a `fetch` call. More heavyweight than CLI but allows embedding validation logic ("does this feature have a clear description? does it belong to an existing project?").

The skill approach makes more sense if we want the CPO to go through a structured reasoning process before creating a feature. The CLI approach makes more sense if `create_feature` is a mechanical action the CPO has already decided to take.

---

## Open Question

Is the context cost actually measurable? We could test this empirically: run the CPO with all 4 MCP tools and measure when context starts compressing, vs. running with only 2 MCP tools + CLI for the others. If the session lasts significantly longer before compression, the hybrid approach pays for itself.

---

## TL;DR

MCP tools have a permanent context cost (~200-400 tokens per tool for schemas, plus documentation in the role prompt). For a persistent agent where context is the scarcest resource, not every tool justifies that cost. High-frequency tools (`send_message`, `query_projects`) should stay MCP. Low-frequency CRUD tools (`create_feature`, `update_feature`) could be CLI wrappers or skills to save ~800-1600 tokens of permanent overhead.
