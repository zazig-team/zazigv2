# Zazig Terminal: Purpose-Built Multi-Agent Terminal Application

**Date:** 2026-02-25
**Status:** Proposal (Research Phase)
**Authors:** Tom + CPO
**Complexity:** High — this is the most ambitious concept in the product exploration batch

---

## Executive Summary

A custom terminal application purpose-built for multi-agent interaction. Rather than switching between tmux sessions in a generic terminal, Zazig Terminal provides a unified interface with session management, pipeline visibility, multi-threading per agent, and role-aware quick actions — all while preserving the raw terminal experience that makes `zazig chat` powerful.

This proposal evaluates four architectural approaches, recommends a phased delivery strategy, and is honest about the complexity involved.

---

## Problem Statement

The current interaction model for zazigv2 persistent agents (CPO, CTO, CMO) has five friction points:

1. **Session switching is manual.** The user must know tmux session names, use `tmux attach`, or Tab-cycle in the blessed TUI. There is no visual overview of all agents.
2. **No peripheral visibility.** While talking to the CPO, you cannot see what the CTO is doing, whether a pipeline job just completed, or if a verification specialist needs attention.
3. **Single-threaded per exec.** Each agent runs in one tmux session. You cannot ask the CPO to "research this in the background" while continuing to spec a feature in the main thread. Every side-quest blocks the main conversation.
4. **No pipeline context in the terminal.** Feature status, job progress, and system health live in Supabase. The terminal has zero awareness of pipeline state.
5. **No role-aware shortcuts.** Invoking a skill means typing `/brainstorm` or `/spec-feature`. There is no discoverable UI for what skills are available per role.

The `zazig chat` TUI (blessed-based, Node.js) addresses points 1 and 2 partially but is fundamentally limited by being a text-mode overlay on tmux capture-pane polling. It cannot embed rich UI, cannot display pipeline data, and cannot support multiple threads per agent.

---

## Research: Ghostty Architecture

### Why Ghostty Is Interesting

Ghostty is a terminal emulator written in Zig by Mitchell Hashimoto (Vagrant, Terraform, HashiCorp). It stands out for three reasons relevant to this project:

1. **libghostty separation.** The terminal emulation core is a C-ABI compatible library. The macOS GUI is a separate Swift/SwiftUI app that consumes this library via a clean C API. This means you can build a completely custom macOS app that embeds Ghostty's terminal engine without reimplementing VT100/xterm emulation.

2. **Platform-native UI.** The macOS app uses real AppKit/SwiftUI, real Metal rendering, real CoreText fonts. It is not a least-common-denominator cross-platform wrapper. Adding native macOS UI panels (sidebars, toolbars, status bars) would use the same frameworks the existing app already uses.

3. **MIT license.** Forking is explicitly permitted. The project moved to non-profit fiscal sponsorship under Hack Club in 2025, but the license remains unchanged.

### Ghostty macOS Internals

The architecture relevant to forking:

```
Swift App (macos/Sources/)
  |
  |-- TerminalController.swift    -- window/lifecycle management
  |-- SurfaceView.swift           -- NSView hosting a terminal surface
  |-- [SwiftUI views]             -- settings, tabs, splits
  |
  v  (C API calls)
libghostty (Zig, compiled to static lib + XCFramework)
  |
  |-- src/apprt/embedded.zig      -- the C API bridge
  |-- src/Surface.zig             -- per-terminal instance (3 threads: main, I/O, renderer)
  |-- src/App.zig                 -- global state, font cache, mailbox
  |-- src/terminal/Terminal.zig   -- VT state machine
  |-- src/renderer/Metal.zig      -- GPU rendering
  |-- include/ghostty.h           -- public C header
```

The Swift app drives the event loop and calls `ghostty_app_tick()` each frame. libghostty communicates back via function-pointer callbacks (wakeup, action, clipboard, close). Each terminal "surface" runs I/O and rendering on dedicated threads.

**What forking would involve for custom UI panels:**

| Change | Difficulty |
|--------|-----------|
| Add SwiftUI sidebar/toolbar views alongside existing SurfaceView | Moderate — standard macOS UI work |
| Multiple SurfaceView instances in one window (for session previews) | Moderate — Ghostty already supports splits |
| New callbacks for terminal data (e.g., streaming last N lines to sidebar) | Hard — requires changes to embedded.zig C API |
| New actions in the Action union (src/apprt/action.zig) | Moderate — append-only enum, ABI-stable |
| Keeping fork in sync with upstream | Hard — Ghostty is actively developed, merge conflicts guaranteed |

### libghostty-vt: The Embeddable Option

As of September 2025, the Ghostty project began shipping **libghostty-vt** — a zero-dependency library for terminal sequence parsing and state management. It provides:
- SIMD-optimized VT parsing
- Unicode and grapheme cluster handling
- Kitty Graphics Protocol support
- No libc dependency (works on WASM)

The Zig API is available now. The C API is in development. Longer-term, the project plans additional libraries: input handling, GPU rendering (provide a Metal/OpenGL surface), GTK widgets, and Swift frameworks for a complete terminal view.

**Implication:** Rather than forking all of Ghostty, we could potentially build a native macOS app that embeds libghostty (or the future Swift framework) for terminal rendering, with our own UI surrounding it. This decouples us from the Ghostty app's release cycle while still getting its terminal engine.

---

## Architecture Options Comparison

### Option A: Ghostty Hard Fork

Fork the Ghostty repository. Modify the macOS Swift app to add custom panels, sidebar, toolbar, and pipeline status. Ship as "Zazig Terminal" — a separate macOS application.

**Pros:**
- Fastest terminal rendering (Zig + Metal, GPU-accelerated)
- Platform-native macOS UI (SwiftUI/AppKit) — feels like a real Mac app
- The terminal emulation is production-proven and extremely correct
- Full control over every aspect of the application

**Cons:**
- **Upstream merge burden.** Ghostty ships updates frequently. Every upstream release requires rebasing our fork. The Swift app layer changes often. This is a permanent maintenance tax.
- **Zig expertise required.** Any change that touches terminal behavior requires Zig knowledge. The talent pool is tiny.
- **Build system complexity.** Ghostty requires a specific Zig compiler version. The build system (build.zig + Nix flake) is non-trivial.
- **Scope explosion.** We inherit the entire Ghostty codebase — hundreds of config options, Linux/GTK support, GLFW runtime — when we only need the macOS terminal engine.

**Estimated effort:** 3-4 months for a basic working fork with sidebar + pipeline. Ongoing maintenance: ~20% of one engineer's time.

**Verdict:** High ceiling, high cost. The upstream merge burden makes this risky for a small team.

### Option B: Native macOS App with libghostty Embedding

Build a new native macOS app (Swift/SwiftUI) that embeds libghostty for terminal rendering. The app is ours from scratch; only the terminal engine comes from Ghostty.

**Pros:**
- Clean separation — our app, their engine
- Full control over UI architecture from day one
- No upstream merge conflicts on the app layer
- Platform-native (SwiftUI toolbars, sidebars, inspector panels are first-class)
- Supabase Swift SDK available for Realtime subscriptions
- Could use SwiftTerm as a fallback if libghostty's Swift framework takes too long

**Cons:**
- **libghostty's Swift framework does not exist yet.** The current roadmap lists it as a future deliverable with no timeline. We would need to either (a) build our own Swift wrapper around the C API, or (b) use SwiftTerm instead and lose Ghostty's rendering performance.
- **SwiftTerm alternative** is mature (6 years, MIT, used in commercial SSH clients) but is not GPU-accelerated — it uses CoreText directly without Metal batching.
- Requires substantial macOS/Swift expertise
- macOS-only (no Linux, no web)

**Estimated effort:** 2-3 months for an MVP with SwiftTerm. Add 1-2 months if wrapping libghostty's C API directly. Less ongoing maintenance since there is no fork to rebase.

**Verdict:** Best native experience. Pragmatic path: start with SwiftTerm, migrate to libghostty when the Swift framework ships.

### Option C: Electron + xterm.js

Build a desktop app using Electron with xterm.js for terminal rendering. Use React for the UI. Standard web technologies throughout.

**Pros:**
- **Fastest to build.** The entire UI (sidebar, pipeline, toolbar, session previews) is React components. Massive ecosystem of libraries.
- **Cross-platform.** macOS, Linux, Windows from one codebase.
- **xterm.js is battle-tested.** Powers VS Code's integrated terminal, Azure Cloud Shell, Coder, Wave Terminal.
- **WebGL renderer available** for xterm.js — decent performance for terminal rendering.
- **Supabase JS SDK** with Realtime is mature and well-documented.
- **Existing prior art.** Agentboard (github.com/gbasin/agentboard) already does tmux-session-to-browser streaming with xterm.js + WebSocket. It demonstrates the pattern works.

**Cons:**
- **Electron overhead.** ~200MB base memory, slower startup than native. For a terminal app — a tool people keep open all day — this is noticeable.
- **Not native-feeling.** No matter how good the CSS is, Electron apps do not feel like Mac apps. Menus, focus handling, keyboard shortcuts, window management — all have subtle wrongness.
- **Terminal rendering quality.** xterm.js with WebGL is good but not Metal-native good. Font rendering, subpixel antialiasing, and scrolling smoothness are measurably worse.
- **Two runtimes.** The zazig CLI is already Node.js. Adding Electron means two Node.js processes, two IPC mechanisms, more moving parts.

**Estimated effort:** 1.5-2 months for a working MVP. Lowest maintenance burden of any option.

**Verdict:** Fastest path to something usable. Acceptable for validation. May become the "good enough" permanent solution if native feel is not a priority.

### Option D: Enhanced TUI + Web Dashboard (Hybrid)

Keep the terminal-first approach (tmux + zazig chat) but enhance it significantly. Build a companion web app for pipeline visibility that runs alongside the terminal.

**Pieces:**
1. Upgrade `zazig chat` TUI: better status bar, session previews via tmux capture-pane, skill shortcuts
2. Build a lightweight web dashboard (React/Next.js) for pipeline status, served by the local daemon
3. Use tmux control mode (`tmux -C`) for programmatic session management
4. Multi-threading via tmux windows within the same session

**Pros:**
- **Incremental.** Each piece delivers value independently. No big-bang launch.
- **Lowest risk.** Builds on what exists. No new application to package, sign, distribute.
- **Terminal purist.** The terminal stays a terminal. The web dashboard is additive.
- **tmux control mode** is a stable, documented API for programmatic tmux interaction. Agentboard, webmux, and MCPretentious all use it successfully.

**Cons:**
- **Split attention.** Pipeline status in a browser, conversations in a terminal. Context-switching between two apps is the problem we are trying to solve.
- **TUI ceiling.** blessed/ink can only do so much. Mini-preview windows of other sessions are janky in text mode. The sidebar concept does not work well in a terminal.
- **No single pane of glass.** The entire premise of Zazig Terminal is unification. This option does not achieve it.

**Estimated effort:** 2-3 weeks for TUI improvements. 1-2 months for the web dashboard. Low maintenance.

**Verdict:** Good as a Phase 0 regardless of which primary option we choose. The TUI improvements are worth doing no matter what.

---

## Comparison Matrix

| Criterion | A: Ghostty Fork | B: Native macOS + libghostty | C: Electron + xterm.js | D: TUI + Web |
|-----------|----------------|---------------------------|----------------------|-------------|
| Terminal rendering quality | Excellent | Good (SwiftTerm) to Excellent (libghostty) | Good (WebGL) | N/A (tmux) |
| Native macOS feel | Excellent | Excellent | Poor | N/A |
| Time to MVP | 3-4 months | 2-3 months | 1.5-2 months | 3-5 weeks |
| Ongoing maintenance | High (upstream merges) | Low-Medium | Low | Low |
| Cross-platform potential | No (fork is macOS only) | No (Swift is macOS only) | Yes | Partial |
| Custom UI flexibility | High | High | Very High | Low |
| Pipeline integration | Moderate (Supabase Swift) | Moderate (Supabase Swift) | Easy (Supabase JS) | Easy (JS) |
| Multi-thread support | Hard (deep fork changes) | Medium (app-level) | Medium (app-level) | Easy (tmux windows) |
| Risk of abandonment | High (Zig expertise, merge fatigue) | Medium | Low | Very Low |
| Talent pool | Tiny (Zig + Swift) | Small (Swift) | Large (React/TS) | Large (Node) |

---

## UI Design: Detailed Layout Description

Regardless of implementation choice, the target UI is the same. This section describes it precisely.

### Main Window Layout

```
+------------------------------------------------------------------+--------+
|  [Project: Acme Corp v]  [Brainstorm] [Standup] [Spec Feature]   | [gear] |
+------------------------------------------------------------------+--------+
|                                                  |                         |
|                                                  |  SESSION SIDEBAR        |
|                                                  |                         |
|                                                  |  +-------------------+  |
|                                                  |  | CPO       [active]|  |
|                                                  |  | > Speccing auth   |  |
|                                                  |  | > feature with    |  |
|          MAIN TERMINAL AREA                      |  | > user. Running   |  |
|                                                  |  | > /spec-feature.. |  |
|    Full terminal session for the active agent.   |  +-------------------+  |
|    Keyboard input goes here.                     |  | CTO         [idle]|  |
|    This is a real terminal, not a preview.        |  | Last active: 2h   |  |
|                                                  |  | > Architecture    |  |
|                                                  |  | > review complete |  |
|                                                  |  +-------------------+  |
|                                                  |  | CMO      [working]|  |
|                                                  |  | Running task...   |  |
|                                                  |  | > Generating Q1   |  |
|                                                  |  | > content plan    |  |
|                                                  |  +-------------------+  |
|                                                  |                         |
|                                                  |  THREADS (CPO)          |
|                                                  |  [1. Main] [2. Research]|
|                                                  |  [+ New Thread]         |
|                                                  |                         |
+------------------------------------------------------------------+---------+
|  PIPELINE STATUS BAR                                                       |
|  Features: auth-system [in-progress] dark-mode [ready-for-breakdown]       |
|  Jobs: 3 building | 1 verifying | 0 blocked                               |
|  System: orchestrator [ok] daemon [ok] mcp [ok]     12:34 PM  25 Feb 2026 |
+----------------------------------------------------------------------------+
```

### Component Details

**Top Toolbar:**
- Project selector dropdown (left). Filters which agents/pipeline data are shown. Multi-company support mirrors `zazig start`'s company picker.
- Quick action buttons (center). Dynamically populated from the active agent's skill set. Clicking "Spec Feature" sends `/spec-feature` to the active terminal session. Buttons change when you switch agents (CPO skills differ from CTO skills).
- Settings gear (right). Theme, font, connection settings.

**Main Terminal Area:**
- Occupies ~70% of window width, full height minus toolbar and status bar.
- This is a real terminal surface — not a text preview. Full keyboard input, mouse support, scrollback, clipboard.
- Connects to the active agent's tmux session (or Claude Code process directly).

**Session Sidebar (right, ~30% width):**
- One card per persistent agent. Each card shows:
  - Role name and color-coded icon (CPO: blue, CTO: green, CMO: orange)
  - Status badge: `active` (green dot, currently viewed), `working` (amber, running a task), `idle` (grey, waiting for input), `error` (red)
  - Mini-preview: last 4-5 lines of terminal output, updated in real-time. Monospace font, dimmed compared to main terminal. This is a read-only capture.
  - Click to switch: clicking a card makes that agent the main terminal.
- Below the agent cards: thread list for the currently active agent (see Multi-Threading section).

**Pipeline Status Bar (bottom, 2-3 lines):**
- Feature status badges from Supabase (Realtime subscription on `features` table).
- Active job counts by status (from `jobs` table).
- System health indicators: daemon process alive, orchestrator edge function responding, MCP server process running.
- Clock and date (right-aligned).
- Clicking a feature opens a detail popover with its jobs.

### Interaction Model

- **Keyboard focus** always stays in the main terminal area. The sidebar and toolbar are mouse-only (or have keyboard shortcuts that do not conflict with terminal keybindings).
- **Cmd+1/2/3** switches between agents (like browser tabs).
- **Cmd+T** creates a new thread for the active agent.
- **Cmd+Shift+P** opens the quick action palette (like VS Code's command palette) for skill invocation.
- **Escape** from the palette returns focus to the terminal.

---

## Multi-Threading Design

This is the hardest problem. Today, one persistent agent = one Claude Code instance = one tmux session = one conversation. The user wants concurrent conversations with the same agent.

### What "Multi-Thread" Means

Not OS threads. Conversation threads. The user is talking to the CPO about Feature A. They want to ask the CPO to research Feature B in parallel without interrupting Feature A. This requires two independent conversations with the same role, sharing the same company context but maintaining separate conversation histories.

### Option MT-1: Multiple tmux Windows in One Session

```
tmux session: cpo-session
  |-- window 0: "Main" (active conversation)
  |-- window 1: "Research: Feature B" (background thread)
  |-- window 2: "Planning: Q2 roadmap" (background thread)
```

Each window runs a separate Claude Code instance, all sharing the same workspace directory (`~/.zazigv2/{companyId}-cpo-workspace/`).

**Pros:** Uses existing infrastructure. tmux natively supports multiple windows. The terminal app just switches which window it displays.

**Cons:**
- **Shared workspace conflicts.** Multiple Claude Code instances writing to the same `CLAUDE.md`, `.claude/` directory, and plan files will corrupt each other. This is a known bug (Claude Code issue #27311). Plan files, task files, and CLAUDE.md are shared state with no locking.
- **Shared MCP server.** The `.mcp.json` points to one MCP server process. Multiple Claude Code instances calling `update_feature` simultaneously could create race conditions.
- **No conversation isolation.** Both instances see the same `CLAUDE.md` conversation context. They might interfere with each other's tool approvals.

**Verdict:** Does not work safely without changes to Claude Code's workspace isolation model.

### Option MT-2: Separate Workspaces per Thread

```
~/.zazigv2/{companyId}-cpo-workspace/          # thread 1 (main)
~/.zazigv2/{companyId}-cpo-workspace-thread-2/  # thread 2
~/.zazigv2/{companyId}-cpo-workspace-thread-3/  # thread 3
```

Each thread gets its own workspace directory, its own Claude Code instance, its own tmux session. They share the same `CLAUDE.md` content (copied on thread creation) and the same MCP server config (pointing to the same Supabase backend).

**Pros:**
- Full isolation. No shared-state conflicts.
- Each thread has independent conversation history.
- MCP tool calls go to the same Supabase, so pipeline state is naturally shared.

**Cons:**
- **No shared conversation context.** Thread 2 does not know what was discussed in Thread 1 unless explicitly told. If the user asks Thread 2 to "continue what we were discussing," it has no context.
- **Resource cost.** Each Claude Code instance consumes an API session. With Claude Max, there may be rate limits on concurrent sessions.
- **Workspace proliferation.** Many directories to manage, clean up, and track.

**Verdict:** Works today. The isolation is a feature, not a bug — each thread is an independent investigation. The terminal app manages the workspace lifecycle.

### Option MT-3: Agent-Managed Sub-Conversations

The agent itself manages threads. When the user says "research this in the background," the CPO:
1. Creates a new Claude Code instance (via a skill or MCP tool)
2. Gives it a scoped brief ("Research X and write findings to a file")
3. The sub-conversation runs independently
4. When done, it writes results to a shared location
5. The main CPO thread reads the results when needed

This is the **agent teams** pattern that Anthropic describes in their Claude Code documentation.

**Pros:**
- The agent decides when to parallelise, not the user.
- Results flow back naturally through the file system or database.
- Mirrors how a real executive delegates — brief a researcher, get a report.

**Cons:**
- **Requires pipeline support.** The CPO would need a way to spin up sub-agents. Today, `commission_contractor` only supports project-architect, monitoring-agent, and verification-specialist — not generic research tasks.
- **Not interactive.** The sub-conversation is fire-and-forget. The user cannot observe or redirect it mid-flight (unless the terminal app provides a view of it).
- **Complexity in the agent's prompt.** The CPO needs to know when and how to delegate. This is prompt engineering, not terminal engineering.

**Verdict:** The right long-term model. But it is an agent architecture change, not a terminal feature. The terminal app should support viewing sub-agent sessions when they exist.

### Recommended Multi-Threading Approach

**Phase 1: Option MT-2 (separate workspaces).** The terminal app lets the user create new threads. Each thread is a new workspace + Claude Code instance + tmux session. The sidebar shows threads under each agent. Switching threads switches the main terminal to that session. Simple, safe, works today.

**Phase 2: Option MT-3 (agent-managed).** Extend the pipeline so agents can commission sub-tasks that produce research reports. The terminal app shows these as "background threads" with a read-only view. This requires orchestrator changes but is the natural evolution.

**Not recommended: Option MT-1.** The shared-workspace problem is fundamental and cannot be solved at the terminal layer.

---

## Feasibility Assessment

### Ghostty Fork (Option A): Not Recommended

The fork approach has a compelling demo but an unsustainable maintenance story. Ghostty is under active development — Mitchell Hashimoto ships frequently. Keeping a fork in sync while adding significant UI changes to the Swift app layer means constant merge conflict resolution in both Zig and Swift code. The Zig expertise requirement makes this a single-point-of-failure for the team.

The one scenario where this makes sense: if the Ghostty project itself adopts an extension/plugin model that lets us add UI panels without forking. This does not exist today and is not on their public roadmap.

### Native macOS App (Option B): Recommended for Final Form

A native macOS app built with SwiftUI, embedding terminal views via SwiftTerm (short-term) or libghostty (when the Swift framework ships), is the best long-term architecture. It delivers:
- True macOS-native UI (toolbars, sidebars, inspector panels, notifications)
- Fast terminal rendering (SwiftTerm uses CoreText; libghostty would add Metal)
- Direct Supabase Swift SDK integration for Realtime pipeline status
- Full control over multi-session management
- No upstream merge burden

The risk is that it requires sustained Swift/macOS expertise. This is mitigable — SwiftUI is well-documented, and SwiftTerm has a clean API with examples.

### Electron + xterm.js (Option C): Recommended for Validation

If the goal is to validate the concept quickly and gather real usage data before committing to native development, Electron is the right choice. The existing ecosystem (Agentboard, Wave Terminal, Hyper) proves the pattern works. The xterm.js WebGL renderer is good enough for daily use.

The risk is that "temporary Electron" becomes permanent. If we go this route, we should be explicit: this is a prototype. If we decide to keep it, we accept the Electron trade-offs.

### Enhanced TUI + Web (Option D): Recommended as Phase 0

Regardless of which primary approach we choose, the TUI improvements are worth doing immediately:
- Better tmux session awareness in `zazig chat`
- Skill shortcut bar in the status line
- A local web dashboard (localhost:4041) for pipeline status, served by the daemon

This delivers value within weeks and does not block any other option.

---

## Recommended Approach: Phased Delivery

### Phase 0: Enhanced TUI + Pipeline Web Dashboard (2-3 weeks)

Improve `zazig chat` with better session switching, skill shortcuts, and status display. Build a minimal pipeline dashboard as a local web app served by the daemon. This delivers immediate value and generates usage data about which features matter most.

**Deliverables:**
- `zazig chat` improvements: agent status indicators, Cmd-number switching, `/` skill autocomplete
- `zazig dashboard` or `localhost:4041`: pipeline status page with Realtime subscriptions
- Metrics: which agents get used most, how often users switch, what skills are invoked

### Phase 1: Electron Prototype (6-8 weeks)

Build the Zazig Terminal concept as an Electron app with xterm.js. This validates the unified interface concept — sidebar, pipeline status, quick actions, multi-thread — with real users (which is: you, Tom). Use Agentboard's architecture as a reference implementation.

**Deliverables:**
- Electron app with the layout described in the UI Design section
- xterm.js terminals connected to tmux sessions via WebSocket
- Supabase JS Realtime for pipeline status bar
- Session sidebar with mini-previews (capture-pane polling)
- Quick action toolbar populated from role skill definitions
- Multi-thread support via Option MT-2 (separate workspaces)
- Project selector connected to `query_projects` MCP data

### Phase 2: Native macOS App (3-4 months, if Phase 1 validates)

If the Electron prototype confirms the concept is worth investing in permanently, build the native macOS app.

**Deliverables:**
- SwiftUI macOS app with the same layout
- SwiftTerm for terminal rendering (migrate to libghostty when available)
- Supabase Swift SDK for Realtime pipeline subscriptions
- Native macOS notifications for pipeline events
- Spotlight integration for quick agent/feature search
- Menu bar widget showing pipeline summary

### Phase 3: Agent-Managed Threading (ongoing, parallel to Phase 2)

Extend the pipeline to support agent-initiated sub-tasks. The terminal app (whether Electron or native) shows these as background threads.

**Deliverables:**
- New contractor role: `research-agent` (or generic sub-task)
- CPO prompt updates: when and how to delegate research
- Terminal app: read-only view of background sub-agent sessions
- Results flow: sub-agent writes to a known location, main agent reads it

---

## Key Technical Decisions and Open Questions

### 1. tmux vs Direct PTY

The current system routes everything through tmux. The terminal app could instead spawn Claude Code directly and manage PTY connections without tmux.

**Keep tmux:** Simpler. `zazig chat` and Zazig Terminal can coexist. SSH-based remote access (Agentboard-style) works automatically. tmux is battle-tested session persistence.

**Drop tmux:** Lower latency (no capture-pane polling). Direct PTY gives the terminal app full control over I/O. But we lose session persistence if the terminal app crashes.

**Recommendation:** Keep tmux for Phase 0-1. Evaluate direct PTY for Phase 2 native app, where the app itself can manage session persistence.

### 2. How Do Mini-Previews Work?

The sidebar needs to show the last few lines from each agent's terminal. Options:

- **tmux capture-pane polling** (current approach in `zazig chat`): Poll every 300ms. Simple but CPU-wasteful with multiple sessions. Good enough for 3-5 agents.
- **tmux pipe-pane streaming**: tmux pipes output to a file/pipe. More efficient than polling. Used by Agentboard and NTM.
- **Direct PTY tee**: If we own the PTY, we can tee the output stream to both the main terminal and a preview buffer. Only works without tmux.

**Recommendation:** Use `tmux pipe-pane` for Phase 1. It is more efficient than capture-pane and provides a real-time stream rather than periodic snapshots.

### 3. Authentication for Pipeline Data

The pipeline status bar needs to read from Supabase. Authentication options:

- **Service role key**: The daemon already has Supabase credentials. The terminal app connects to the daemon, which proxies Supabase queries.
- **User JWT**: The terminal app authenticates directly with Supabase using the user's JWT. Requires a login flow in the terminal app.
- **Daemon WebSocket relay**: The daemon subscribes to Supabase Realtime and relays events to the terminal app over a local WebSocket.

**Recommendation:** Daemon WebSocket relay. The daemon already has credentials. The terminal app connects to `localhost` only. No additional auth required.

### 4. Packaging and Distribution

- **Phase 0-1 (TUI/Electron)**: Distributed via npm (`npx zazig-terminal`) or bundled with the zazig CLI.
- **Phase 2 (Native)**: macOS .app bundle. Could use Sparkle for auto-updates (like Ghostty does). Or distribute via Homebrew cask.

---

## Competitive Landscape and Prior Art

| Product | Relevant Feature | What We Can Learn |
|---------|-----------------|-------------------|
| **Agentboard** | Web-based tmux session viewer for AI agents | Architecture (Bun + React + xterm.js), session auto-discovery, status inference from pane content |
| **Warp Terminal** | Custom Rust UI framework, AI agent integration, "agentic development environment" | Proves that a terminal with rich UI chrome can work. Their approach: custom everything in Rust. We should not replicate this — the scope is astronomical. |
| **Wave Terminal** | Open-source, AI-native terminal, Electron + xterm.js | Validates the Electron terminal approach. Shows what is achievable with xterm.js + custom UI. |
| **TabzChrome** | Chrome extension with persistent tmux terminals + MCP integration | Demonstrates terminal-in-browser with MCP tool control. Niche but relevant for the web approach. |
| **VS Code Integrated Terminal** | Multiple terminal instances, split views, task integration | The multi-terminal UX is good. But embedding Zazig into VS Code would lose the dedicated experience. |

---

## Risk Register

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Electron prototype becomes permanent ("good enough" trap) | Medium — Electron UX tax paid forever | High | Explicit Phase 2 gate: decide native or keep Electron by a set date |
| libghostty Swift framework never ships | Medium — stuck on SwiftTerm for native app | Medium | SwiftTerm is capable enough. Not a blocker, just a performance ceiling. |
| Multi-thread workspace isolation causes Claude Code issues | High — broken experience | Medium | Test thoroughly in Phase 1. File issues with Anthropic if workspace isolation is buggy. |
| Scope creep into full IDE territory | High — never ships | Medium | Hard constraint: this is a terminal with chrome, not an IDE. No file tree, no editor, no debugger. |
| Single user (Tom) means limited feedback signal | Medium — build for one person's preferences | High | Acceptable for now. The product is for internal use. Broader feedback comes later. |

---

## Cost Estimate (Time Only)

| Phase | Elapsed Time | Engineering Effort | Cumulative |
|-------|-------------|-------------------|------------|
| Phase 0: Enhanced TUI + Web Dashboard | 2-3 weeks | ~40 hours | 40 hours |
| Phase 1: Electron Prototype | 6-8 weeks | ~160 hours | 200 hours |
| Phase 2: Native macOS App | 3-4 months | ~400 hours | 600 hours |
| Phase 3: Agent Threading | Ongoing | ~80 hours initial | 680 hours |

Phase 0 and Phase 1 can be built by AI agents in the pipeline (these are code/infra tasks). Phase 2 likely requires human Swift expertise unless the team has strong SwiftUI knowledge.

---

## Decision Required

1. **Do we proceed with Phase 0?** Low risk, immediate value, informs all later phases. Recommend: yes.
2. **Do we commit to Phase 1 (Electron prototype)?** Medium investment, validates the concept. Recommend: yes, after Phase 0 delivers.
3. **Phase 2 decision deferred** until Phase 1 usage data exists. The question then becomes: is the Electron version good enough, or does native matter?

---

## Appendix: Research Sources

- [Ghostty GitHub Repository](https://github.com/ghostty-org/ghostty)
- [Ghostty Architecture (DeepWiki)](https://deepwiki.com/ghostty-org/ghostty)
- [Ghostty About Page](https://ghostty.org/docs/about)
- [Libghostty Is Coming — Mitchell Hashimoto](https://mitchellh.com/writing/libghostty-is-coming)
- [Ghostty License (MIT)](https://github.com/ghostty-org/ghostty/blob/main/LICENSE)
- [Agentboard — Web GUI for tmux AI agents](https://github.com/gbasin/agentboard)
- [xterm.js — Terminal for the web](https://github.com/xtermjs/xterm.js)
- [SwiftTerm — Xterm/VT100 Terminal emulator in Swift](https://github.com/migueldeicaza/SwiftTerm)
- [Warp Terminal — Agentic Development Environment](https://github.com/warpdotdev/Warp)
- [Supabase Swift SDK](https://github.com/supabase/supabase-swift)
- [tmux Control Mode Wiki](https://github.com/tmux/tmux/wiki/Control-Mode)
- [Claude Code Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams)
- [Claude Code Shared State Issue #27311](https://github.com/anthropics/claude-code/issues/27311)
- [Ghostty Non-Profit Transition](https://linuxiac.com/ghostty-terminal-emulator-transitions-to-non-profit-status/)
