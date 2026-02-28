# Pi-Mono Technical Recon: Agent Harness Evaluation

**Date:** 2026-02-27
**Author:** CPO
**Purpose:** Evaluate pi-mono as a potential replacement for Claude Code as our agent harness
**Source repo:** https://github.com/badlogic/pi-mono (MIT, 17.6k stars, v0.55.3)

---

## Executive Summary

Pi-mono is a TypeScript monorepo providing a minimal, extensible agent toolkit built by Mario Zechner. It consists of 7 packages layered from LLM abstraction up to application-level integrations. The system is deliberately opinionated: 4 core tools (read/write/edit/bash), sub-1000-token system prompts, no built-in MCP, no built-in subagents. Everything beyond the core is added via extensions, skills, or packages.

**Key finding for our use case:** Pi's SDK mode and RPC mode provide genuine programmatic embedding capabilities. You can spawn pi as a subprocess (RPC over stdin/stdout) or embed it as a library (`createAgentSession()`). This is the critical capability we need for replacing Claude Code as a harness -- we could drive agent sessions programmatically from our orchestrator without going through a CLI.

**Risk:** Single-maintainer project. Mario is "dictatorial" about contributions and explicitly discourages PRs that don't align with his vision. OSS vacation until March 2, 2026. We would be building on someone else's opinionated foundation.

---

## 1. Architecture: Monorepo Structure

Seven packages in a three-tier layered architecture:

### Foundation Layer (independent, no cross-deps)

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-ai` | Unified multi-provider LLM API. Streaming, tool calling via TypeBox schemas, thinking/reasoning support, token/cost tracking, cross-provider context handoffs. Supports 17+ providers, 2000+ models. Only includes tool-calling-capable models. |
| `@mariozechner/pi-tui` | Terminal UI library with differential rendering. Retained-mode, appends to scrollback buffer, selective redraws of changed lines only. No full-screen takeover. |

### Core Framework Layer

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-agent-core` | Agent loop state machine. Tool execution orchestration, validation, event streaming. Depends only on pi-ai. |

### Application Layer

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-coding-agent` | The CLI harness. Sessions, extensions, skills, prompt templates, themes. Four operating modes: interactive, print/JSON, RPC, SDK. |
| `@mariozechner/pi-mom` | Slack bot. Delegates messages to the coding agent with Docker/host sandbox modes. |
| `@mariozechner/pi-web-ui` | Web components for AI chat interfaces. |
| `@mariozechner/pi-pods` | CLI for managing vLLM deployments on GPU infrastructure. |

All packages use **lockstep versioning** (currently 0.55.3) with caret-range internal dependencies.

**Build:** TypeScript via `tsgo` compiler. Biome for linting/formatting. Foundation packages build in parallel, then core, then applications.

### Dependency Graph

```
pi-ai (standalone)          pi-tui (standalone)
   |                            |
   v                            v
pi-agent-core -------> pi-coding-agent <--- pi-tui
                            |      |
                            v      v
                        pi-mom   pi-web-ui

pi-pods (standalone, infra only)
```

---

## 2. Extension System

Extensions are TypeScript modules that get full system access. They are the primary mechanism for adding capabilities beyond the 4 core tools.

### Discovery Locations

- `~/.pi/agent/extensions/*.ts` (global, single files)
- `~/.pi/agent/extensions/*/index.ts` (global, directory with deps)
- `.pi/extensions/*.ts` (project-local)
- `.pi/extensions/*/index.ts` (project-local directories)
- Additional paths via `settings.json` `extensions` array
- CLI flag: `pi -e ./my-extension.ts`

### Extension Interface

Every extension exports a default function receiving `ExtensionAPI`:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subscribe to events
  pi.on("session_start", async (event, ctx) => { ... });

  // Register custom tools
  pi.registerTool({ name, label, description, parameters, execute });

  // Register slash commands
  pi.registerCommand("mycommand", { ... });

  // Register keyboard shortcuts
  pi.registerShortcut("ctrl+k", { ... });

  // Register feature flags
  pi.registerFlag("myfeature", { ... });

  // Register custom message renderers
  pi.registerMessageRenderer("custom_type", renderer);
}
```

### Lifecycle Events (Complete List)

**Session events:**
- `session_start`, `session_before_switch`, `session_switch`
- `session_before_fork`, `session_fork`
- `session_before_compact`, `session_compact`
- `session_before_tree`, `session_tree`
- `session_shutdown`

**Agent events:**
- `before_agent_start` (inject messages, modify system prompt)
- `agent_start`, `agent_end`
- `turn_start`, `turn_end`
- `message_start`, `message_update`, `message_end`
- `tool_execution_start`, `tool_execution_update`, `tool_execution_end`

**Tool events:**
- `tool_call` (can block dangerous operations -- return false to cancel)
- `tool_result` (can modify tool output before it reaches the model)

**Other:**
- `input` (intercept/handle user input)
- `model_select` (model selection/cycling)
- `user_bash` (user bash execution)

### Context API (ctx)

Event handlers receive a context object with:

```typescript
// UI interactions
ctx.ui.notify(message, type)
ctx.ui.confirm(title, message)  // returns boolean
ctx.ui.select(items)            // returns selected item
ctx.ui.input(prompt)            // returns string
ctx.ui.setStatus(id, text)      // footer status bar
ctx.ui.setWidget(id, lines)     // widget display
ctx.ui.custom(component)        // custom TUI components

// Session management
ctx.sessionManager              // access session storage
ctx.cwd()                       // current working directory
ctx.isIdle()                    // check agent status
ctx.abort()                     // cancel pending operations
ctx.shutdown()                  // terminate session

// Context operations
ctx.getContextUsage()           // token/context info
ctx.compact()                   // trigger compaction
ctx.getSystemPrompt()           // retrieve system prompt
```

### ExtensionAPI Core Methods

```typescript
// Event subscription
pi.on(event, handler)

// Tool/model control
pi.getActiveTools() / pi.setActiveTools(names)
pi.setModel(model)
pi.getThinkingLevel() / pi.setThinkingLevel(level)

// Message control
pi.sendMessage(message, options?)
pi.sendUserMessage(content, options?)
pi.appendEntry(customType, data?)  // persist custom data in session

// Session management
pi.setSessionName(name) / pi.getSessionName()
pi.setLabel(entryId, label)

// Execution
pi.exec(command, args, options?)   // run shell commands

// Inter-extension communication
pi.events                          // event bus for extension-to-extension messaging
```

### Extension Conflict Resolution

Registration conflicts no longer unload the later extension. All extensions stay loaded; conflicting command/tool/flag names resolve by first-registration-wins in load order.

### Package System

Extensions can be bundled as npm or git packages:

```json
{
  "pi": {
    "extensions": ["./extensions"],
    "skills": ["./skills"],
    "prompts": ["./prompts"],
    "themes": ["./themes"]
  }
}
```

Install via: `pi install npm:@org/package`, `pi install git:github.com/user/repo`

### Notable Example Extensions (65 total in repo)

- `subagent/` -- task delegation to specialized subagents
- `sandbox/` -- OS-level sandboxing via @anthropic-ai/sandbox-runtime
- `plan-mode/` -- read-only exploration mode with step tracking
- `permission-gate.ts` -- confirmation before dangerous bash commands
- `ssh.ts` -- delegates all tools to remote machines via SSH
- `git-checkpoint.ts` -- git stash checkpoints at each turn
- `tool-override.ts` -- extends built-in tools with logging/access control
- `custom-compaction.ts` -- custom conversation summarization strategy
- `claude-rules.ts` -- scans .claude/rules/ for rules integration
- `doom-overlay/` -- DOOM running as an overlay at 35 FPS (flex)

---

## 3. SDK/RPC Mode (Critical for Our Use Case)

### SDK Mode: In-Process Embedding

For Node.js/TypeScript applications, embed pi directly:

```typescript
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  sessionManager: SessionManager.inMemory(),
  authStorage,
  modelRegistry,
  // Optional overrides:
  model,              // specific model instance
  thinkingLevel,      // reasoning depth
  tools,              // custom tool array
  systemPrompt,       // custom system instructions
  extensions,         // custom command handlers
  skills,             // reusable capability sets
  contextFiles,       // conversation context (AGENTS.md equivalent)
  slashCommands,      // custom slash commands
  cwd,                // working directory
  agentDir,           // global config directory
  scopedModels,       // model cycling configuration
});

// Subscribe to events
const unsubscribe = session.subscribe((event) => {
  if (event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// Send prompts
await session.prompt("Implement the login feature");

// During streaming, must specify behavior
await session.prompt("Actually, use OAuth instead", {
  streamingBehavior: "steer"    // interrupt current tools
});
await session.prompt("Also add rate limiting", {
  streamingBehavior: "followUp" // queue for after completion
});

// Session control
await session.fork(entryId);         // branch conversation
await session.compact();              // compress history
await session.newSession();           // fresh conversation
session.setModel(anotherModel);       // switch models mid-session
session.setThinkingLevel("high");     // adjust reasoning

// State access
const state = session.agent.state;    // messages, model, tools, systemPrompt
await session.agent.waitForIdle();    // wait for processing

// Cleanup
session.dispose();
```

**Key events for subscription:**
- `message_update` -- text and thinking deltas (streaming)
- `tool_execution_start/update/end` -- tool lifecycle
- `message_start/end` -- message boundaries
- `agent_start/end` -- agent processing
- `turn_start/end` -- LLM turn completion
- `auto_compaction_start/end` -- automatic context management

### RPC Mode: Subprocess Protocol

For non-Node.js environments, spawn pi as a subprocess:

```bash
pi --mode rpc --provider anthropic --model claude-sonnet-4 --no-session
```

**Protocol:** Line-delimited JSON over stdin/stdout.

**Commands (stdin):**

```json
// Prompting
{"type": "prompt", "text": "Implement auth", "id": "req-1"}
{"type": "steer", "text": "Use OAuth instead"}
{"type": "follow_up", "text": "Add rate limiting"}
{"type": "abort"}

// State
{"type": "get_state"}
{"type": "get_messages"}

// Model control
{"type": "set_model", "provider": "anthropic", "model": "claude-opus-4"}
{"type": "cycle_model"}
{"type": "get_available_models"}

// Thinking
{"type": "set_thinking_level", "level": "high"}
{"type": "cycle_thinking_level"}

// Session management
{"type": "new_session"}
{"type": "switch_session", "sessionId": "..."}
{"type": "fork", "entryId": "..."}
{"type": "compact"}

// Bash execution
{"type": "bash", "command": "ls -la"}
{"type": "abort_bash"}

// Configuration
{"type": "set_auto_compaction", "enabled": true}
{"type": "set_auto_retry", "enabled": true}
{"type": "set_steering_mode", "mode": "all"}
{"type": "set_follow_up_mode", "mode": "one-at-a-time"}
```

**Responses (stdout):**
```json
{"type": "response", "success": true, "id": "req-1"}
{"type": "response", "success": false, "error": "...", "id": "req-1"}
```

**Events (stdout, streamed):**
```json
{"type": "agent_start"}
{"type": "turn_start"}
{"type": "message_start"}
{"type": "message_update", "assistantMessageEvent": {"type": "text_delta", "delta": "..."}}
{"type": "tool_execution_start", "toolName": "bash", "params": {...}}
{"type": "tool_execution_update", "output": "..."}
{"type": "tool_execution_end"}
{"type": "message_end"}
{"type": "turn_end"}
{"type": "agent_end"}
```

**Extension UI Protocol (RPC):**

Extensions can request UI interactions, which get forwarded over RPC:

```json
// Pi sends (stdout):
{"type": "ui_request", "requestType": "confirm", "id": "ui-1", "title": "Delete files?", "message": "..."}
{"type": "ui_request", "requestType": "select", "id": "ui-2", "items": [...]}
{"type": "ui_request", "requestType": "input", "id": "ui-3", "prompt": "Enter name:"}

// Client responds (stdin):
{"id": "ui-1", "confirmed": true}
{"id": "ui-2", "value": "option-a"}
{"id": "ui-3", "value": "Tom"}
{"id": "ui-3", "cancelled": true}
```

**Client implementation:** A TypeScript RPC client exists at `src/modes/rpc/rpc-client.ts` for reference.

### SDK vs RPC: When to Use Which

| Criterion | SDK | RPC |
|-----------|-----|-----|
| Language | Node.js/TypeScript only | Any language |
| Performance | In-process, minimal overhead | Subprocess, JSON parsing overhead |
| Control | Full API access, type-safe | Protocol-limited, string-based |
| Isolation | Shared process | Process-level isolation |
| Extensions | Native support | UI protocol forwarding |
| Our orchestrator | Would need Node.js executor | Works with any executor (Deno, etc.) |

---

## 4. Session Model

### Tree-Structured Sessions

Sessions persist as JSONL files where each entry has an `id` and `parent_id`, forming a tree structure. This enables:

- **Branching:** Fork at any point in conversation history (`session.fork(entryId)`)
- **Navigation:** `/tree` command visualises the conversation tree
- **Exploration:** Try different approaches from the same point without duplicating files
- **In-place branching:** New branches share ancestry with the original, no file duplication

### Session Persistence

- **JSONL format:** Each message is a line, append-only
- **SessionManager.inMemory():** No persistence (SDK testing)
- **File-based SessionManager:** Full multi-session management with named sessions
- **Custom session directories:** `--session-dir <path>`
- **No-session mode:** `--no-session` for stateless operation

### Context Management

- **Auto-compaction:** When approaching context limits, older messages are automatically summarised
- **Manual compaction:** `/compact` or `session.compact()` triggers explicit summarisation
- **Custom compaction:** Extensions can override the compaction strategy entirely
- **Context files:** AGENTS.md/CLAUDE.md loaded from home dir, parent dirs, project root
- **Custom system prompt:** `.pi/SYSTEM.md` replaces the default system prompt

### Session Operations

```
/tree           -- navigate session history
/fork           -- create branch at current point
/compact        -- summarise older messages
/resume         -- resume previous sessions
/new            -- fresh session
session.switchSession(id)  -- programmatic switching
```

---

## 5. Tool System

### Core Tools (4 only)

Pi ships with only 4 built-in tools: `read`, `write`, `edit`, `bash`. The system prompt is under 1000 tokens combined with tool definitions. Zechner's thesis: frontier models understand coding agent concepts from RL training, making extensive tooling unnecessary.

### Tool Interface

Tools are defined with TypeBox schemas:

```typescript
interface AgentTool {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;  // TypeBox schema
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal,
    onUpdate: (update: string) => void,
    ctx: AgentContext
  ): Promise<ToolResult>;
}
```

**Tool registration (via extension):**

```typescript
pi.registerTool({
  name: "deploy",
  label: "Deploy",
  description: "Deploy the current project to staging",
  parameters: Type.Object({
    environment: StringEnum(["staging", "production"]),
    dryRun: Type.Boolean({ default: false })
  }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    onUpdate("Starting deployment...");
    // ... implementation
    return { content: [{ type: "text", text: "Deployed successfully" }] };
  }
});
```

**Tool capabilities:**
- Streaming updates via `onUpdate()` callback
- AbortSignal for cancellation
- Custom rendering for tool calls and results
- Override built-in tools by registering with the same name
- Enable/disable tools dynamically: `pi.getActiveTools()` / `pi.setActiveTools(names)`

### Tool Event Interception

Extensions can intercept tool calls:

```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.name === "bash" && event.params.command.includes("rm -rf")) {
    const confirmed = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
    if (!confirmed) return false;  // blocks execution
  }
});

pi.on("tool_result", async (event, ctx) => {
  // Modify tool output before model sees it
  event.result = truncate(event.result, 5000);
});
```

---

## 6. Skills vs Extensions

| Aspect | Skills | Extensions |
|--------|--------|------------|
| Format | Markdown files (SKILL.md) | TypeScript modules |
| Registration | Auto-discovered, listed in system prompt | Auto-discovered, loaded at startup |
| Invocation | `/skill:name` command, or model loads on-demand | Always active, event-driven |
| Capabilities | Instructions, scripts, reference docs | Tools, commands, shortcuts, UI, events |
| When loaded | On-demand (only name/description at startup) | At startup (full code execution) |
| Security model | Model follows instructions | Full system access |
| Use case | Specialized workflows, setup guides | System-level capabilities, tool registration |

### Skills in Detail

Skills follow the [Agent Skills](https://github.com/nicobailon/agent-skills-spec) standard.

**Discovery locations:**
- `~/.pi/agent/skills/` and `~/.agents/skills/` (global)
- `.pi/skills/` and `.agents/skills/` (project)
- `pi.skills` in `package.json` (package)
- `--skill <path>` (CLI)

**Skill structure:**
```
my-skill/
  SKILL.md          # frontmatter + instructions (required)
  scripts/          # helper scripts (optional)
  references/       # documentation (optional)
```

**Frontmatter:**
```yaml
---
name: my-skill      # 1-64 chars, lowercase/numbers/hyphens
description: ...    # max 1024 chars
---
```

At startup, pi extracts name+description from all skills and injects them into the system prompt as XML. When the agent decides a skill is relevant, it loads the full SKILL.md content.

---

## 7. Multi-Model Support

### Provider Abstraction (pi-ai)

The unified API normalises across 17+ providers:

```typescript
const model = getModel("anthropic", "claude-opus-4");
const model = getModel("openai", "gpt-4o");
const model = getModel("google", "gemini-2.0-flash");
```

Fully typed autocomplete for both provider and model ID.

### Context Portability

Contexts (systemPrompt + messages + tools) are plain JSON-serializable objects. You can:
1. Start a conversation with Claude
2. Serialize the context
3. Switch to GPT-4o mid-session
4. Continue with full history

Provider-specific quirks handled transparently: Anthropic thinking traces convert to `<thinking>` tags for OpenAI, signed blobs managed, `max_tokens` vs `max_completion_tokens` normalised.

### Model Cycling

```typescript
scopedModels: [
  { model: opus, thinkingLevel: "high" },
  { model: haiku, thinkingLevel: "off" }
]
```

Cycle with Ctrl+P (interactive) or `session.cycleModel()` (SDK).

### Thinking/Reasoning Support

Six levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`. Thinking content streams via dedicated events, separate from response text.

### Custom Providers

`~/.pi/agent/models.json` for self-hosted endpoints supporting OpenAI/Anthropic/Google APIs. Extensions can register entirely custom providers (see `custom-provider-anthropic/`, `custom-provider-gitlab-duo/`, `custom-provider-qwen-cli/` examples).

### Token & Cost Tracking

Every response includes input/output token counts and per-request cost, enabling budget monitoring.

---

## 8. Subagent Support

Pi does **not** have built-in subagent/parallel execution. This is a deliberate design decision -- Zechner argues subagents "create black boxes" and prefers spawning via bash for visibility.

However, there are two approaches:

### Extension-Based Subagents (Official Example)

The `subagent/` extension example in the repo demonstrates spawning pi instances for task delegation (e.g., code review). The subagent runs as a separate pi process, typically via bash.

### Third-Party: pi-subagents Package

[nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) provides:

- **Single agent:** `/run <agent> <task>`
- **Chains:** `/chain agent1 "task1" -> agent2 "task2"` (sequential pipeline)
- **Parallel:** `/parallel agent1 "task1" -> agent2 "task2"` (concurrent)
- **Background:** `--bg` flag for async execution
- **Agent definitions:** Markdown files with YAML frontmatter (model, thinking level, tools, output destinations)
- **Chain files:** `.chain.md` for reusable pipelines
- **Variable passing:** `{task}`, `{previous}`, `{chain_dir}` between steps

Agents are defined as markdown with frontmatter:
```yaml
---
model: anthropic/claude-sonnet-4
thinking: high
tools: bash,read,write
output: review.md
extensions: ""  # sandboxed
---
```

### Comparison to Our Current Architecture

Our orchestrator dispatches jobs to separate Claude Code instances. Pi's model is similar in spirit (spawn separate processes) but the pi-subagents extension adds structured chaining and parallel execution that we currently implement at the orchestrator level.

---

## 9. Communication Channels

### Slack Bot (pi-mom)

**Architecture:** When a user mentions the bot in Slack, pi-mom:
1. Syncs unseen messages from `log.jsonl` into `context.jsonl`
2. Loads memory from `MEMORY.md`
3. Uses tools to respond
4. Stores files in channel-specific directories

**Sandbox modes:**
- Docker (recommended): commands execute in isolated container
- Host: direct machine access (dangerous)

**Skills:** Stored at `/workspace/skills/` (global) or `/workspace/<channel>/skills/` (channel-specific). Each skill has a `SKILL.md` file.

**Events system:** JSON event files in `data/events/`:
- Immediate: triggers on file creation
- One-shot: fires at specified datetime
- Periodic: cron-scheduled

**Config:** `MOM_SLACK_APP_TOKEN`, `MOM_SLACK_BOT_TOKEN`, optional `ANTHROPIC_API_KEY`

### Web UI (pi-web-ui)

Web components for AI chat interfaces. Less documented; appears to be a component library rather than a standalone product.

### No Other Integrations

No Telegram, Discord, or webhook integrations beyond Slack. The extension system could add these, but nothing ships built-in.

---

## 10. Prompt Templates

Reusable Markdown files in `~/.pi/agent/prompts/` or `.pi/prompts/`.

**Usage:** Type `/templatename` in the editor to expand.

**Template variables:** `{{focus}}` and other double-brace variables get interpolated.

**Relationship to skills:** Prompt templates are simpler -- just text expansion. Skills are full capability packages with scripts, references, and agent instructions. Templates are for the human; skills are for the agent.

---

## Evaluation Matrix for Zazig Replacement

### What Pi Gives Us That Claude Code Doesn't

| Capability | Claude Code | Pi |
|------------|-------------|-----|
| Programmatic SDK embedding | No (subprocess only) | Yes (`createAgentSession()`) |
| RPC protocol | No | Yes (stdin/stdout JSON) |
| Multi-provider support | Anthropic only | 17+ providers, mid-session switching |
| Extension system | Limited (MCP) | Rich (65 lifecycle hooks, tool registration, UI) |
| Custom tools | MCP servers only | Native TypeScript, full context access |
| Session branching | No | Tree-structured, fork/navigate |
| Context portability | No | JSON-serializable, cross-model |
| Custom compaction | No | Overridable via extension |
| Open source | No | MIT license |
| Cost tracking | Limited | Per-request token/cost |

### What Claude Code Gives Us That Pi Doesn't

| Capability | Claude Code | Pi |
|------------|-------------|-----|
| Built-in MCP support | Yes | No (extension-based) |
| Built-in subagents (Task tool) | Yes | No (extension-based) |
| Anthropic-optimised tools | Yes (search, notebook edit, etc.) | 4 core tools only |
| Permission system | Yes (allow/deny) | No (YOLO by default, extension-based) |
| Background bash | Yes | No (use tmux) |
| Built-in git integration | Yes | No (extension-based) |
| Anthropic support/stability | Commercial backing | Single maintainer |

### Integration Feasibility with Our Orchestrator

**Option A: SDK Embedding (Node.js executor)**
- Replace Claude Code subprocess with `createAgentSession()` calls
- Full control over session lifecycle, model selection, tool registration
- Would require rewriting executor from Deno to Node.js (or using Deno's npm compat)
- Extensions could replace our custom tool injection
- `SessionManager.inMemory()` for stateless jobs, file-based for persistent agents

**Option B: RPC Subprocess (Current architecture)**
- Replace `claude` CLI with `pi --mode rpc`
- Parse JSON events instead of Claude Code's output
- Minimal orchestrator changes -- still spawning subprocesses
- Tool registration happens via extension files in workspace, not runtime injection
- UI protocol forwarding for extension interactions (would need handling)

**Option C: Hybrid (Recommended for evaluation)**
- Use RPC mode first (lowest integration effort)
- Migrate to SDK if we need tighter control
- Write a zazig extension that injects our tools, session context, and reporting
- Use pi-ai directly for non-agentic LLM calls (replacing any direct Anthropic SDK usage)

### Risks

1. **Single maintainer.** Mario is explicit about this being his project, his way. Forking is encouraged but means we maintain it.
2. **No built-in permission system.** "YOLO mode" by default. We'd need a permission-gate extension for production use.
3. **TypeScript/Node.js only.** SDK embedding requires Node.js. Our executor is Deno. RPC mode works around this but adds overhead.
4. **4 tools may be too minimal.** We rely on Claude Code's built-in file search, notebook editing, web fetch. Would need to rebuild these as extensions or skills.
5. **No MCP.** We use MCP extensively for our pipeline tools. Would need to bridge MCP servers into pi's extension system (or use the community MCP extension if one exists).
6. **Session format incompatibility.** JSONL vs whatever Claude Code uses. Migration path unclear.
7. **Version 0.x.** API stability not guaranteed. Lockstep versioning means any package change bumps everything.

### Recommendation

Pi-mono is architecturally superior to Claude Code as an agent harness for programmatic use. The SDK/RPC modes solve our core pain point (driving agents programmatically). The extension system is richer than MCP for tool registration. Multi-model support opens cost optimisation paths we currently lack.

However, the integration cost is non-trivial. We'd need to:
1. Build MCP bridge extension (or verify community solution exists)
2. Rebuild our tool injection layer as pi extensions
3. Handle the Deno/Node.js gap (RPC mode avoids this)
4. Accept single-maintainer risk or plan to fork

**Next step:** If this is worth pursuing, I'd recommend a spike: take one simple job type (e.g., a code job) and run it through pi RPC mode instead of Claude Code. Measure: setup time, execution quality, tool coverage gaps, and overhead. That gives us data instead of speculation.

---

## Sources

- [Pi-Mono GitHub Repository](https://github.com/badlogic/pi-mono)
- [Pi Coding Agent README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [Extensions Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [SDK Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)
- [RPC Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/rpc.md)
- [Pi-AI Package](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md)
- [Mario Zechner's Design Philosophy Blog Post](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)
- [DeepWiki Architecture Overview](https://deepwiki.com/badlogic/pi-mono)
- [Pi-Subagents Extension](https://github.com/nicobailon/pi-subagents)
- [Extension Examples](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/extensions)
