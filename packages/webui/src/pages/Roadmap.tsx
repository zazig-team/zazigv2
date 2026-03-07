import { useCallback, useMemo, useState } from "react";

// ─── Types ─────────────────────────────────────────

type NodeStatus = "shipped" | "active" | "draft" | "locked";

interface RoadmapNode {
  id: string;
  lane: string;
  col: number;
  icon: string;
  title: string;
  status: NodeStatus;
  progress: number;
  tooltip: string;
  deps: string[];
  unlocks: string[];
  details: string;
  nextUp?: boolean;
}

interface Lane {
  id: string;
  label: string;
}

// ─── Layout Constants ──────────────────────────────

const LANE_H = 86;
const LANE_TOP = 16;
const COL_W = 230;
const COL_LEFT = 160;
const NODE_W = 200;
const NODE_H = 68;

// ─── Data ──────────────────────────────────────────

const LANES: Lane[] = [
  { id: "brain", label: "Agent Brain" },
  { id: "identity", label: "Agent Identity" },
  { id: "infra", label: "Infrastructure" },
  { id: "pipeline", label: "Pipeline" },
  { id: "interface", label: "Interface" },
  { id: "platform", label: "Platform" },
  { id: "strategy", label: "Strategy" },
];

const NODES: RoadmapNode[] = [
  // === Agent Brain ===
  { id: "personality", lane: "brain", col: 0, icon: "\u{1F9EC}", title: "Personality", status: "shipped", progress: 85,
    tooltip: "9 numeric dimensions per archetype. Compiled into prompt at dispatch.",
    deps: [], unlocks: ["memory-p1"],
    details: `## What It Is\n\nPersonality as **bounded numeric coordinates**, not prose. Each exec archetype has 9 dimensions with min/max bounds:\n\n- Verbosity (10-40), Formality (60-90), Risk tolerance (20-50), etc.\n- Compiled into a natural-language prompt snippet at dispatch time\n- Agent never sees raw numbers — only the compiled personality description\n\n## Three-Layer Stack\n\n1. **Archetype Philosophy** (immutable) — "The Pragmatist values shipping over perfection"\n2. **Personality Dimensions** (numeric bounds per archetype)\n3. **Per-user Contextual Modifiers** — small offset on one dimension based on who's talking\n\n## What's Built\n\n- Archetype definitions in DB (exec_archetypes table)\n- Dimension compilation logic\n- Prompt injection at dispatch time\n- Archetype picker in WebUI with write-back\n\n## Key Decision\n\nPersonality is **anti-SOUL.md**. We use coordinates that the orchestrator controls — deterministic, bounded, not vulnerable to prompt injection.\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-20-exec-personality-system-design.md\`` },

  { id: "memory-p1", lane: "brain", col: 1, icon: "\u{1F9E0}", title: "Memory P1", status: "active", progress: 35, nextUp: true,
    tooltip: "9-type taxonomy. Schema deployed. Next: orchestrator bulletin injection.",
    deps: ["personality"], unlocks: ["doctrines-p1"],
    details: `## What It Is\n\nA **9-type memory taxonomy** inspired by Google's always-on-memory-agent research. Every memory chunk is typed, scored, and retrieved by relevance:\n\n| Type | Example |\n|------|--------|\n| Identity | "I am the CPO of zazig-dev" |\n| Decision | "We chose coordinates over prose for personality" |\n| Gotcha | "GoTrue reads redirect_to as a query param, not body" |\n| Fact | "Staging Supabase ref is ciksoitqfwkgnxxtkscq" |\n| Preference | "Tom prefers TypeScript for everything" |\n| Observation | "Codex jobs fail silently when job_type not in CardType" |\n| Procedure | "Deploy edge functions: SUPABASE_ACCESS_TOKEN=..." |\n\n## Architecture\n\n- **Tier-specific budgets**: Persistent agents ~1500 tokens, contractors ~400 tokens\n- **Mandatory slot reservation** for memory retrieval in every job\n- **LLM rerank**: Retrieve top 20 by vector similarity, rerank to top 5\n\n## What's Next (Phase 1)\n\n- **Bulletin injection**: Orchestrator assembles a "memory bulletin" at dispatch time\n- **Write path**: Agents can store memories via MCP tool during execution\n\n## Design Doc\n\n\`docs/plans/active/2026-03-03-memory-system-design.md\`` },

  { id: "doctrines-p1", lane: "brain", col: 2, icon: "\u{1F4DC}", title: "Doctrines", status: "draft", progress: 15,
    tooltip: "Role-specific heuristics, proactively injected. Architecture approved (v5).",
    deps: ["memory-p1"], unlocks: ["memory-p2"],
    details: `## What It Is\n\n**Doctrines** are role-specific heuristics and policies injected proactively into every prompt.\n\nExamples:\n- CPO: "Never create features directly — commission a Project Architect"\n- CTO: "Frame rules as beliefs — agents adhere to beliefs more reliably than rules"\n- Senior Eng: "Every PR must have tests that exercise the acceptance criteria"\n\n## How It Works\n\n- ~500 tokens per role, cached across jobs (static prefix)\n- Stored in DB as structured entries per role\n- Orchestrator injects at Layer 4 of the prompt stack\n- Different roles can have **contradictory** doctrines\n\n## Doctrines vs Canons\n\n| | Doctrines | Canons |\n|---|---|---|\n| Scope | Per-role | Company-wide |\n| Injection | Proactive | Reactive (searched) |\n| Size | ~500 tokens | Unlimited |\n\n## Design Doc\n\n\`docs/plans/active/2026-02-22-exec-knowledge-architecture-v5.md\`` },

  { id: "memory-p2", lane: "brain", col: 3, icon: "\u{1F9E0}", title: "Memory P2", status: "locked", progress: 0,
    tooltip: "Active consolidation sleep cycles. Merge duplicates, promote observations.",
    deps: ["doctrines-p1"], unlocks: ["canons"],
    details: `## What It Is\n\nPhase 2 adds **active consolidation** — the system actively maintains and improves memories.\n\n## Key Capabilities\n\n- **Consolidation sleep cycles**: Periodic background job that:\n  - Merges near-duplicate memories\n  - Promotes recurring observations to facts (3+ times = fact)\n  - Decays stale memories\n  - Cross-references with new context\n\n- **Memory quality scoring** based on:\n  - Source reliability (human > exec > contractor)\n  - Confirmation count\n  - Recency\n\n## Prerequisites\n\n- Memory P1 must be deployed and generating memories\n- Doctrines must be working (consolidation uses doctrine context)\n\n## Design Doc\n\n\`docs/plans/active/2026-03-03-memory-system-design.md\` (Section 4.6)` },

  { id: "canons", lane: "brain", col: 4, icon: "\u{1F4DA}", title: "Canons", status: "locked", progress: 0,
    tooltip: "Shared reference knowledge. Hybrid search: vector + BM25.",
    deps: ["memory-p2"], unlocks: ["auto-spec"],
    details: `## What It Is\n\n**Canons** are shared reference knowledge — books, playbooks, regulations. Unlike doctrines (per-role, proactive), canons are company-wide and retrieved on demand.\n\n## How It Works\n\n- Stored as chunked documents with embeddings\n- **Hybrid retrieval**: Vector similarity + BM25 keyword search\n- **LLM rerank**: Top 20 candidates reranked to top 5\n- Any role can search canons, retrieval is context-aware\n\n## Future: Canon Marketplace\n\nCanons could be shared across companies — "install" a canon package like "SaaS Pricing Best Practices".\n\n## Design Doc\n\n\`docs/plans/active/2026-02-22-exec-knowledge-architecture-v5.md\` (Layer 5)` },

  { id: "auto-spec", lane: "brain", col: 5, icon: "\u{1F916}", title: "Auto-Spec", status: "locked", progress: 0,
    tooltip: "CPO auto-specs triaged ideas when pipeline quiet. The brain fully online.",
    deps: ["canons", "auto-greenlight"], unlocks: ["strategy-sim"],
    details: `## What It Is\n\nThe culmination of the Agent Brain lane. CPO operates **autonomously** — when the pipeline is quiet and triaged ideas are waiting, CPO automatically:\n\n1. Picks the highest-priority triaged idea\n2. Promotes it to a feature\n3. Writes a full spec with acceptance criteria\n4. Pushes it to ready_for_breakdown\n\n## Prerequisites\n\nEverything in the brain lane must be online: Memory, Doctrines, Canons, Auto-Greenlight.\n\n## Design Doc\n\n\`docs/plans/active/2026-03-03-auto-scheduling-design.md\`` },

  // === Agent Identity ===
  { id: "roles", lane: "identity", col: 0, icon: "\u{1F3AD}", title: "Roles & Prompts", status: "shipped", progress: 100,
    tooltip: "Role table, prompt injection, skills system.",
    deps: [], unlocks: ["persistent-id"],
    details: `## What It Is\n\nThe foundation of agent identity. Every agent has a **role** that defines:\n\n- **Prompt** (Layer 2): operational scope, responsibilities, output contract\n- **Skills**: procedural capability files loaded per job\n- **Model**: which LLM to use (being replaced by model preferences)\n- **Persistence**: whether this role auto-creates standing jobs\n\n## Current Roles\n\n| Role | Model | Persistent | Type |\n|------|-------|-----------|------|\n| CPO | Opus | Yes | Executive |\n| CTO | Sonnet | Yes | Executive |\n| Senior Engineer | Sonnet | No | Employee |\n| Reviewer | Sonnet | No | Employee |\n| Junior Engineer | Codex | No | Employee |\n| Breakdown Specialist | Sonnet | No | Contractor |\n| Project Architect | Sonnet | No | Contractor |\n| Verification Specialist | Sonnet | No | Contractor |\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-20-role-prompts-and-skills-design.md\`` },

  { id: "persistent-id", lane: "identity", col: 1, icon: "\u{1FAAA}", title: "Persistent Identity", status: "active", progress: 60, nextUp: true,
    tooltip: "Role-agnostic executor, prompt stack from DB.",
    deps: ["roles"], unlocks: ["bootstrap-parity"],
    details: `## What It Is\n\nThe shift from **role-specific executor code** to a **role-agnostic system** where all identity comes from the database.\n\n## 6-Layer Prompt Stack\n\n1. **Personality** — compiled from archetype dimensions\n2. **Role Prompt** — operational scope, responsibilities\n3. **Doctrines** — role-specific heuristics\n4. **Canon pointers** — relevant reference knowledge\n5. **Skills** — procedural capability files\n6. **Task context** — job spec + memory bulletin\n\nLayers 1-3 are cached (static prefix). Layers 4-6 are per-job.\n\n## What's Built\n\n- Role-agnostic handlePersistentJob in executor\n- Prompt stack assembly in orchestrator\n- MCP tool infrastructure\n\n## Design Doc\n\n\`docs/plans/active/2026-02-24-persistent-agent-identity-design.md\`` },

  { id: "bootstrap-parity", lane: "identity", col: 2, icon: "\u{1F504}", title: "Bootstrap Parity", status: "locked", progress: 0,
    tooltip: "All persistent agents bootstrap identically. No executor special cases.",
    deps: ["persistent-id"], unlocks: ["future-roles"],
    details: `## What It Is\n\nEnsure every persistent agent role bootstraps with **identical infrastructure**:\n\n- Same workspace setup process\n- Same MCP tools (role-scoped via .mcp.json)\n- Same CLAUDE.md assembly logic\n- No special cases in executor code\n\n## Why It Matters\n\nAdding a new persistent role should be: create the role in DB, set is_persistent: true, done.\n\n## Design Doc\n\n\`docs/plans/archived/2026-02-25-persistent-agent-bootstrap-parity-proposal.md\`` },

  { id: "future-roles", lane: "identity", col: 4, icon: "\u{1F465}", title: "Future Roles", status: "locked", progress: 0,
    tooltip: "CMO, CEO, VP-Eng, specialized researchers.",
    deps: ["bootstrap-parity", "canons", "model-flex"], unlocks: ["strategy-sim"],
    details: `## What It Is\n\nExpanding the exec team beyond CPO and CTO.\n\n## Planned Roles\n\n| Role | Type | Purpose |\n|------|------|--------|\n| CMO | Persistent | Marketing strategy, content, brand |\n| CEO | Persistent | Vision, fundraising, board relations |\n| VP-Eng | Persistent | Technical strategy, architecture |\n| Market Researcher | Ephemeral | Competitive scanning |\n\n## Prerequisites\n\n- **Bootstrap Parity**: Generic persistent agent setup\n- **Canons**: Each role needs reference knowledge\n- **Model Flexibility**: Different roles may use different models` },

  // === Infrastructure ===
  { id: "data-model", lane: "infra", col: 0, icon: "\u{1F5C3}\u{FE0F}", title: "Data Model", status: "shipped", progress: 100,
    tooltip: "Multi-tenant schema. 17+ tables. Foundation for everything.",
    deps: [], unlocks: ["orchestrator"],
    details: `## What It Is\n\nThe core multi-tenant database schema. 17+ tables in Supabase Postgres.\n\n## Key Tables\n\n| Table | Purpose |\n|-------|--------|\n| companies | Multi-tenant company records |\n| roles | Agent role definitions |\n| machines | Physical machines with slot capacity |\n| features | Product features with pipeline status |\n| jobs | Individual work units (DAG with depends_on) |\n| ideas | Inbox items (ideas, briefs, bugs, tests) |\n| memory_chunks | Agent memory storage |\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-19-zazigv2-data-model.md\`` },

  { id: "orchestrator", lane: "infra", col: 1, icon: "\u{2699}\u{FE0F}", title: "Orchestrator", status: "shipped", progress: 100,
    tooltip: "Supabase Edge Function. Deterministic dispatch. No LLM.",
    deps: ["data-model"], unlocks: ["deep-heartbeat"],
    details: `## What It Is\n\nThe **deterministic** orchestrator — a Supabase Edge Function that runs pure logic, no LLM.\n\n1. Polls the job queue for queued jobs\n2. Checks machine slot availability via heartbeats\n3. Routes jobs by complexity, role, model, machine\n4. Dispatches via Supabase Realtime websockets\n5. Manages job lifecycle transitions\n\n## Key Behaviors\n\n- **DAG dispatch**: Respects depends_on arrays\n- **Slot tracking**: Available = total - in-use per machine\n- **Complexity routing**: simple/medium/complex mapped to roles\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-18-orchestration-server-design.md\`` },

  { id: "deep-heartbeat", lane: "infra", col: 2, icon: "\u{1F493}", title: "Deep Heartbeat", status: "active", progress: 45, nextUp: true,
    tooltip: "Per-job health, stuck detection. Schema deployed.",
    deps: ["orchestrator"], unlocks: ["triggers"],
    details: `## What It Is\n\nGoes beyond "machine alive/dead" to **per-job health reporting**:\n\n- Job progress indicators\n- Context health (is the context window filling up?)\n- Stuck detection (no progress for N minutes)\n- Resource usage (token consumption rate)\n\n## What's Built\n\n- Health payload schema\n- Heartbeat receiver edge function\n- Stuck detection thresholds\n\n## What's Next\n\n- Event queue consumer for health alerts\n- Lifecycle hook callbacks\n- Automatic stuck job recovery\n\n## Design Doc\n\n\`docs/plans/active/2026-02-22-triggers-and-events-design.md\` (Subsystem 1)` },

  { id: "triggers", lane: "infra", col: 3, icon: "\u{26A1}", title: "Triggers & Events", status: "active", progress: 25,
    tooltip: "9 subsystems. Cron scheduler partial. Next: event queue.",
    deps: ["deep-heartbeat"], unlocks: ["auto-greenlight"],
    details: `## What It Is\n\nThe nervous system of zazig — **9 subsystems**:\n\n1. **Deep Health Heartbeat** — per-job health (partial)\n2. **Cron/Scheduler** — pg_cron + run_scheduler()\n3. **Agent Wake System** — universal poke\n4. **System Events Queue** — claim/ack pattern\n5. **Lifecycle Hooks** — callbacks on job events\n6. **Concurrency Lanes** — main + background per job\n7. **External Triggers** — webhooks from Slack/GitHub\n8. **Emergency Stop** — kill all agents\n9. **Daemon Restart Recovery** — persist in-flight work\n\n## What's Next (Priority)\n\n1. Event queue (claim/ack)\n2. Lifecycle hooks\n3. Concurrency lanes\n4. External triggers\n\n## Design Doc\n\n\`docs/plans/active/2026-02-22-triggers-and-events-design.md\`` },

  { id: "auto-greenlight", lane: "infra", col: 4, icon: "\u{1F7E2}", title: "Auto-Greenlight", status: "locked", progress: 0,
    tooltip: "Mechanical. Promotes specced features when capacity exists.",
    deps: ["triggers"], unlocks: ["auto-spec"],
    details: `## What It Is\n\n**Mechanical** (no LLM) autonomous behavior. On the orchestrator heartbeat:\n\n1. Are there features in created with a spec?\n2. Is there pipeline capacity?\n3. Is the pipeline healthy?\n\nIf all yes — automatically promote to ready_for_breakdown.\n\n## Why Mechanical\n\nThis is a simple state check, not a judgment call. The CPO already decided the feature should be built.\n\n## Prerequisites\n\n- Triggers & Events (orchestrator heartbeat with capacity checks)\n\n## Design Doc\n\n\`docs/plans/active/2026-03-03-auto-scheduling-design.md\`` },

  // === Pipeline ===
  { id: "pipeline", lane: "pipeline", col: 0, icon: "\u{1F504}", title: "Pipeline Engine", status: "shipped", progress: 100,
    tooltip: "Feature + job state machines. DAG dispatch. 8/8 tests pass.",
    deps: [], unlocks: ["contractors"],
    details: `## What It Is\n\nThe execution pipeline with two levels:\n\n### Feature Level\n\ncreated, ready_for_breakdown, breakdown, building, combining, verifying, deploying_to_test, ready_to_test, deploying_to_prod, complete\n\n### Job Level\n\nqueued, dispatched, running, complete, failed, cancelled\n\n## Key Features\n\n- **DAG dispatch**: Jobs have depends_on UUID arrays. Parallel fan-out, sequential deps, fan-in.\n- **8/8 infrastructure tests pass**\n\n## Three Entry Points\n\n- **A**: Human to CPO to features to jobs\n- **B**: Standalone quick fix (skip CPO)\n- **C**: Agent-initiated (Monitoring Agent to CPO)\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-24-software-development-pipeline-design.md\`` },

  { id: "contractors", lane: "pipeline", col: 1, icon: "\u{1F528}", title: "Contractors", status: "shipped", progress: 100,
    tooltip: "Skill + MCP pattern. Jobify, featurify, verify-feature shipped.",
    deps: ["pipeline"], unlocks: ["verification"],
    details: `## What It Is\n\nThe **Contractor Pattern**: a reasoning skill (the brain) wrapping role-scoped MCP tools (the hands).\n\n## Shipped Contractors\n\n| Contractor | Skill | Purpose |\n|-----------|-------|--------|\n| Breakdown Specialist | jobify | Feature spec to jobs with Gherkin AC |\n| Project Architect | featurify | Project plan to feature outlines |\n| Verification Specialist | verify-feature | AC to active system tests |\n\n## Key Decisions\n\n- Contractors are **ephemeral** — no persistent identity\n- Skills are the brain, MCP tools are the hands\n- All tiers get MCP tools, role-scoped via .mcp.json\n\n## Design Docs\n\n\`docs/plans/shipped/2026-02-24-jobify-skill-design.md\`\n\`docs/plans/shipped/2026-02-24-featurify-skill-design.md\`` },

  { id: "verification", lane: "pipeline", col: 2, icon: "\u{2705}", title: "Verification", status: "shipped", progress: 80,
    tooltip: "Active AC testing. Orchestrator branches on verification_type.",
    deps: ["contractors"], unlocks: ["monitoring"],
    details: `## What It Is\n\nTwo verification paths:\n\n- **Passive** (default): Existing reviewer does code review\n- **Active** (verification_type: active): Specialist exercises system against Gherkin AC\n\n## How Active Verification Works\n\n1. All jobs in a feature complete\n2. Orchestrator checks features.verification_type\n3. If active: commissions Verification Specialist\n4. Specialist reads AC, exercises system, reports pass/fail\n5. Feature moves to complete or back to building\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-24-verification-specialist-design.md\`` },

  { id: "monitoring", lane: "pipeline", col: 3, icon: "\u{1F441}\u{FE0F}", title: "Monitoring Agent", status: "locked", progress: 0,
    tooltip: "Signal collection, anomaly detection. Needs triggers/cron.",
    deps: ["verification", "triggers"], unlocks: ["product-intel"],
    details: `## What It Is\n\nA dedicated contractor that scans for signals and anomalies on a cron schedule.\n\n## Responsibilities\n\n- Scan external sources (GitHub, HN, Reddit, Twitter)\n- Monitor internal pipeline health\n- Surface anomalies to CPO\n- File agent-initiated proposals (Entry Point C)\n\n## Key Decision\n\nMonitoring is **separate from CPO**. The CPO shouldn't be doing surveillance — that's a different cognitive mode.\n\n## Prerequisites\n\n- Triggers & Events (cron scheduler)\n- Contractor pattern (shipped)\n\n## Design Doc\n\n\`docs/plans/active/2026-02-20-product-intelligence-pipeline-design.md\`` },

  { id: "product-intel", lane: "pipeline", col: 4, icon: "\u{1F52C}", title: "Product Intelligence", status: "locked", progress: 0,
    tooltip: "Market Researcher, PM pipeline. Commissioned by CPO.",
    deps: ["monitoring"], unlocks: ["strategy-sim"],
    details: `## What It Is\n\nTwo ephemeral agent roles for market intelligence:\n\n1. **Market Researcher** — daily cron, scans external sources\n2. **Product Manager** — on-demand deep research commissioned by CPO\n\n## Prerequisites\n\n- Monitoring Agent (feeds signals)\n- Triggers & Events (cron scheduling)\n\n## Design Doc\n\n\`docs/plans/active/2026-02-20-product-intelligence-pipeline-design.md\`` },

  // === Interface ===
  { id: "cli", lane: "interface", col: 0, icon: "\u{1F5A5}\u{FE0F}", title: "CLI & Agent", status: "shipped", progress: 100,
    tooltip: "zazig start/stop/status/chat. Daemon, tmux, heartbeats.",
    deps: [], unlocks: ["terminal-cpo"],
    details: `## What It Is\n\nThe zazig CLI binary and local agent daemon.\n\n## Commands\n\n| Command | Purpose |\n|---------|---------|\n| zazig login | Authenticate via Supabase |\n| zazig start | Start daemon, register machine |\n| zazig stop | Gracefully stop daemon |\n| zazig status | Show machine status, running jobs |\n| zazig chat | Reconnect to running TUI |\n\n## Architecture\n\n- CLI is an esbuild bundle (releases/zazig.mjs)\n- Daemon runs as detached Node.js process\n- Spawns Claude Code sessions in tmux panes\n- Heartbeats every 30s\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-21-cli-local-agent-design.md\`` },

  { id: "terminal-cpo", lane: "interface", col: 1, icon: "\u{1F4FA}", title: "Terminal CPO", status: "shipped", progress: 90,
    tooltip: "Split-screen TUI. CPO output + user input via tmux.",
    deps: ["cli"], unlocks: ["gateway-p1"],
    details: `## What It Is\n\nA split-screen terminal UI (Node + blessed):\n\n- **Top pane**: Live CPO Claude Code session output\n- **Bottom pane**: User input line\n\n## Key Features\n\n- zazig start spawns all persistent agents and shows TUI\n- zazig chat reconnects to a running TUI\n- Tabs to switch between persistent agent sessions\n- Full visibility into agent tool use, thinking, and actions\n\n## Why Terminal First\n\nSlack is async and lossy — you miss tool calls, thinking steps, errors. The terminal gives the full picture.\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-25-terminal-first-cpo-design.md\`` },

  { id: "gateway-p1", lane: "interface", col: 2, icon: "\u{1F4AC}", title: "Gateway (Slack)", status: "active", progress: 40, nextUp: true,
    tooltip: "Socket Mode receiver built. Next: Slack MCP integration.",
    deps: ["terminal-cpo", "persistent-id"], unlocks: ["interactive"],
    details: `## What It Is\n\nBidirectional Slack integration for CPO and persistent agents.\n\n## Architecture\n\n- **Inbound**: Socket Mode listener, ~100ms latency (push, not polling)\n- **Outbound**: MCP tools (send_message, post_thread, etc.)\n\n## What's Next\n\n1. Slack MCP tool integration\n2. Busy-detection for CPO session\n3. Queue/inject message routing\n\n## Design Docs\n\n\`docs/plans/active/2026-02-22-agent-messaging-bidirectional.md\`\n\`docs/plans/active/2026-02-21-cpo-slack-chat-design.md\`` },

  { id: "interactive", lane: "interface", col: 3, icon: "\u{1F91D}", title: "Interactive Jobs", status: "draft", progress: 5,
    tooltip: "Remote control, TUI mode. For test deploy + feature testing.",
    deps: ["gateway-p1", "triggers"], unlocks: ["gateway-p2"],
    details: `## What It Is\n\nReal-time human-agent collaboration via Claude Code's /remote-control.\n\n## Scenarios\n\n1. **Test deploy config**: Agent needs human help\n2. **Feature testing**: Human reviews deployed feature with agent\n\n## How It Works\n\n- Interactive jobs spawn Claude Code in TUI mode (no -p flag)\n- Longer timeout (30 min vs 10 min)\n- Agent calls enable_remote MCP tool, generates URL\n- URL posted to Slack, human clicks, real-time collaboration\n\n## Design Docs\n\n\`docs/plans/active/2026-02-27-interactive-jobs-remote-control-design.md\`` },

  { id: "gateway-p2", lane: "interface", col: 4, icon: "\u{1F310}", title: "Multi-Channel", status: "locked", progress: 0,
    tooltip: "Telegram, Discord, universal message routing.",
    deps: ["interactive"], unlocks: [],
    details: `## What It Is\n\nExtending the Gateway beyond Slack:\n\n- **Telegram**: Bot API adapter\n- **Discord**: Bot adapter\n- **Universal routing**: Platform-agnostic message format\n\nEach platform gets an adapter. The agent doesn't know which platform it's talking to.\n\n## Prerequisites\n\n- Interactive Jobs (full pipeline on Slack first)\n- Gateway P1 patterns proven and stable` },

  // === Platform ===
  { id: "webui", lane: "platform", col: 0, icon: "\u{1F4CA}", title: "WebUI", status: "active", progress: 55,
    tooltip: "Auth, pipeline board, team, Realtime. Next: detail panels.",
    deps: [], unlocks: ["model-flex"],
    details: `## What It Is\n\nThe web dashboard at **www.zazig.com**. React + Vite, hosted on Vercel.\n\n## What's Built\n\n- Google OAuth + magic link auth\n- Pipeline board (kanban-style)\n- Team page (archetype picker with write-back)\n- Realtime subscriptions\n- Theme persistence, goal progress, focus area health\n- Intake columns (Ideas, Triage)\n\n## Deployment\n\n- **Prod**: www.zazig.com (manual deploy)\n- **Staging**: zazigv2-webui-staging.vercel.app (auto-deploy)` },

  { id: "model-flex", lane: "platform", col: 1, icon: "\u{1F500}", title: "Model Flexibility", status: "draft", progress: 10,
    tooltip: "Dynamic backends, model preferences, runtime probing.",
    deps: ["webui", "orchestrator", "cli"], unlocks: ["roles-market"],
    details: `## What It Is\n\nDecouples roles from hardcoded models. Three layers:\n\n1. **Backends** — execution environments (claude-code, codex-cli, gemini-cli, ollama). Each machine has N backends with slot capacity.\n2. **Role Model Preferences** — ordered fallback list per role. Orchestrator walks list, picks first available.\n3. **Runtime Probing** — local agent discovers models by testing. Heartbeats carry live truth.\n\n## Key Changes\n\n- New machine_backends table replaces slots_claude_code/slots_codex\n- model_preferences text[] replaces default_model on roles\n- Backend interface: detect(), authenticate(), probeModels(), execute()\n\n## Design Doc\n\n\`docs/plans/active/2026-03-06-model-flexibility-design.md\`` },

  { id: "roles-market", lane: "platform", col: 2, icon: "\u{1F3EA}", title: "Roles Marketplace", status: "locked", progress: 0,
    tooltip: '"I got a new tool" / "I want a capability" paths.',
    deps: ["model-flex"], unlocks: ["local-models", "future-roles"],
    details: `## What It Is\n\nThe WebUI view where users discover and activate roles.\n\n### Path A: "I got a new tool"\n\nUser connects Codex. WebUI shows: "Codex unlocks Junior Engineer. Activate?" Done.\n\n### Path B: "I want a capability"\n\nUser browses available roles, sees "Deep Researcher", clicks. "This role needs Gemini, Perplexity, or Grok. Which do you have?"\n\n## Views\n\n1. **Fleet view**: Machines, backends, capacity\n2. **Roles grid**: Active vs available\n3. **Role config modal**: Drag-to-reorder model preferences\n\n## Part of Model Flexibility\n\n\`docs/plans/active/2026-03-06-model-flexibility-design.md\`` },

  { id: "local-models", lane: "platform", col: 3, icon: "\u{1F4BB}", title: "Local Models", status: "locked", progress: 0,
    tooltip: "Ollama, LM Studio, Qwen on Mac Mini. Privacy-first.",
    deps: ["roles-market"], unlocks: [],
    details: `## What It Is\n\nSupport for locally-hosted models as backends. Agent probes localhost:11434/api/tags (Ollama) and reports available models.\n\n## Use Cases\n\n- **Privacy**: Sensitive tasks never leave the machine\n- **Cost**: Free after hardware investment\n- **Experimentation**: Try new models without subscription\n- **Offline**: Work without internet\n\n## Supported Runtimes\n\n- Ollama (HTTP API, auto-discovers pulled models)\n- LM Studio (local server mode)\n- vLLM\n\n## Part of Model Flexibility\n\n\`docs/plans/active/2026-03-06-model-flexibility-design.md\`` },

  // === Strategy ===
  { id: "goals", lane: "strategy", col: 0, icon: "\u{1F3AF}", title: "Goals & Focus", status: "shipped", progress: 70,
    tooltip: "Measurable goals, focus area themes. Tables + seeding deployed.",
    deps: [], unlocks: ["health"],
    details: `## What It Is\n\nTwo object types for strategic alignment:\n\n### Goals\n\nMeasurable end-states. Example: "Ship MVP by March 2026" with quantifiable criteria.\n\n### Focus Areas\n\nCurrent work themes, cadence-driven. Example: "Agent Reliability".\n\n## How They Connect\n\n- Every feature links to a focus area\n- Every decision references which goal it serves\n- CPO uses focus areas to prioritize\n- Dashboard shows goal progress and focus area health\n\n## What's Built\n\n- Goals + focus_areas tables\n- Feature FK to focus_area\n- Seeding data for zazig-dev\n- WebUI goal progress bars\n\n## Design Doc\n\n\`docs/plans/shipped/2026-02-27-goals-and-focus-areas-design.md\`` },

  { id: "health", lane: "strategy", col: 1, icon: "\u{1F4C8}", title: "Health Scoring", status: "draft", progress: 10,
    tooltip: "Automated health across 6 dimensions. Manual v1 done.",
    deps: ["goals"], unlocks: ["strategy-sim"],
    details: `## What It Is\n\nAutomated health assessment for each focus area, scored across 6 dimensions:\n\n1. **Velocity** — are features shipping?\n2. **Blocking** — how many items are stuck?\n3. **Quality** — failure rate, rejection rate\n4. **Learning** — are agents getting better?\n5. **Direction confidence** — is the goal still clear?\n6. **Team morale** — proxy signals (cycle time, rework rate)\n\n## Two Versions\n\n- **v1 (Manual)**: Done once (2026-03-03)\n- **v2 (Automated)**: CPO heartbeat job, feeds dashboard\n\n## Design Doc\n\n\`docs/plans/active/2026-03-03-focus-area-health-assessment-process.md\`` },

  { id: "strategy-sim", lane: "strategy", col: 5, icon: "\u{1F3DB}\u{FE0F}", title: "Strategy Sim", status: "locked", progress: 0,
    tooltip: "The endgame. Consequence tracking, gamified decisions, Civ-style advisor.",
    deps: ["health", "product-intel", "auto-spec", "future-roles"], unlocks: [],
    details: `## What It Is\n\nThe **endgame**. A Civilization-style strategy interface where:\n\n- Every decision is logged with predicted consequences\n- Consequences are tracked over time\n- CPO acts as an advisor recommending next moves\n- Gamified question interface\n- **This tech tree becomes a live, data-driven feature**\n\n## Prerequisites\n\nEverything converges here: Health Scoring, Product Intelligence, Auto-Spec, Future Roles.\n\n## Inspiration\n\nSid Meier's Civilization tech tree — see how things connect, what unlocks what, and make strategic choices about where to invest.` },
];

// ─── Helpers ───────────────────────────────────────

function renderMarkdown(src: string): string {
  const blocks: string[] = [];
  let html = src.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang: string, code: string) => {
    blocks.push(`<pre class="rm-pre"><code>${code.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</code></pre>`);
    return `\x00${blocks.length - 1}\x00`;
  });

  html = html.replace(/^(\|.+\|)\n(\|[-:\| ]+\|)\n((?:\|.+\|\n?)+)/gm, (_, hdr: string, _sep: string, body: string) => {
    const ths = hdr.split("|").slice(1, -1).map((h: string) => `<th>${h.trim()}</th>`).join("");
    const rows = body.trim().split("\n").map((r: string) => {
      const tds = r.split("|").slice(1, -1).map((c: string) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("");
    return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  html = html.replace(/((?:^- .+$\n?)+)/gm, (m: string) => {
    const items = m.trim().split("\n").map((l: string) => `<li>${l.replace(/^- /, "")}</li>`).join("");
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (m: string) => {
    const items = m.trim().split("\n").map((l: string) => `<li>${l.replace(/^\d+\.\s*/, "")}</li>`).join("");
    return `<ol>${items}</ol>`;
  });

  html = html.split("\n\n").map((block) => {
    const t = block.trim();
    if (!t || t.startsWith("<") || t.startsWith("\x00")) return t;
    return `<p>${t.replace(/\n/g, " ")}</p>`;
  }).join("\n");

  blocks.forEach((code, i) => { html = html.replace(`\x00${i}\x00`, code); });
  return html;
}

function buildPath(targetId: string, nodeMap: Map<string, RoadmapNode>): RoadmapNode[] {
  const visited = new Set<string>();
  const path: RoadmapNode[] = [];
  function walk(id: string): void {
    if (visited.has(id)) return;
    visited.add(id);
    const node = nodeMap.get(id);
    if (!node) return;
    node.deps.forEach(walk);
    path.push(node);
  }
  walk(targetId);
  return path;
}

function depsStatus(node: RoadmapNode, nodeMap: Map<string, RoadmapNode>): { done: number; total: number; items: Array<{ title: string; status: NodeStatus }> } {
  const items = node.deps.map((id) => {
    const dep = nodeMap.get(id);
    return { title: dep?.title ?? id, status: (dep?.status ?? "locked") as NodeStatus };
  });
  const done = items.filter((d) => d.status === "shipped").length;
  return { done, total: items.length, items };
}

const STATUS_ICON: Record<NodeStatus, string> = { shipped: "\u2713", active: "\u25D1", draft: "\u25CB", locked: "\u25CB" };

// ─── Component ─────────────────────────────────────

export default function Roadmap(): JSX.Element {
  const [selectedNode, setSelectedNode] = useState<RoadmapNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const nodeMap = useMemo(() => new Map(NODES.map((n) => [n.id, n])), []);
  const laneIndex = useMemo(() => new Map(LANES.map((l, i) => [l.id, i])), []);

  const maxCol = Math.max(...NODES.map((n) => n.col));
  const totalWidth = COL_LEFT + (maxCol + 1) * COL_W + 80;
  const totalHeight = LANE_TOP + LANES.length * LANE_H + 40;

  const nodeX = useCallback((n: RoadmapNode) => COL_LEFT + n.col * COL_W, []);
  const nodeY = useCallback((n: RoadmapNode) => LANE_TOP + (laneIndex.get(n.lane) ?? 0) * LANE_H, [laneIndex]);

  const buildNext = useMemo(() =>
    NODES.filter((n) =>
      n.status !== "shipped" &&
      n.deps.every((d) => {
        const dep = nodeMap.get(d);
        return dep && (dep.status === "shipped" || dep.status === "active");
      }),
    ).sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return 0;
    }).slice(0, 6),
  [nodeMap]);

  const highlightSet = useMemo(() => {
    if (!hoveredNode) return null;
    const set = new Set<string>([hoveredNode]);
    const walkUp = (id: string): void => {
      const n = nodeMap.get(id);
      if (!n || set.has(id)) return;
      set.add(id);
      n.deps.forEach(walkUp);
    };
    const walkDown = (id: string): void => {
      const n = nodeMap.get(id);
      if (!n || set.has(id)) return;
      set.add(id);
      n.unlocks.forEach(walkDown);
    };
    const node = nodeMap.get(hoveredNode);
    if (node) {
      node.deps.forEach(walkUp);
      node.unlocks.forEach(walkDown);
    }
    return set;
  }, [hoveredNode, nodeMap]);

  const statusCounts = useMemo(() => ({
    shipped: NODES.filter((n) => n.status === "shipped").length,
    active: NODES.filter((n) => n.status === "active").length,
    draft: NODES.filter((n) => n.status === "draft").length,
    locked: NODES.filter((n) => n.status === "locked").length,
  }), []);

  return (
    <div className="roadmap-page">
      <div className="page-header">
        <div className="page-header-left">
          <div className="page-title">Roadmap</div>
          <div className="page-stats">
            <div className="page-stat">Shipped <span className="page-stat-value" style={{ color: "var(--positive)" }}>{statusCounts.shipped}</span></div>
            <div className="page-stat">Active <span className="page-stat-value" style={{ color: "var(--ember)" }}>{statusCounts.active}</span></div>
            <div className="page-stat">Designed <span className="page-stat-value" style={{ color: "var(--info)" }}>{statusCounts.draft}</span></div>
            <div className="page-stat">Locked <span className="page-stat-value" style={{ color: "var(--dust)" }}>{statusCounts.locked}</span></div>
          </div>
        </div>
        <div className="page-header-right">
          <div className="roadmap-legend">
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--positive)" }} />Shipped</span>
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--ember)" }} />Active</span>
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--info)" }} />Designed</span>
            <span className="roadmap-legend-item"><span className="roadmap-legend-dot" style={{ background: "var(--dust)" }} />Locked</span>
          </div>
        </div>
      </div>

      <section className="roadmap-next">
        <div className="section-label">
          Build Next
          <span className="section-label-count">{buildNext.length} items</span>
        </div>
        <div className="roadmap-next-cards">
          {buildNext.map((node) => (
            <button key={node.id} className="roadmap-next-card" type="button" onClick={() => setSelectedNode(node)}>
              <span className="roadmap-next-icon">{node.icon}</span>
              <div className="roadmap-next-text">
                <div className="roadmap-next-title">{node.title}</div>
                <div className="roadmap-next-unlocks">
                  {node.unlocks.length > 0
                    ? `Unlocks: ${node.unlocks.map((id) => nodeMap.get(id)?.title).filter(Boolean).join(", ")}`
                    : "Endgame capability"}
                </div>
              </div>
              <span className={`roadmap-node-dot roadmap-node-dot--${node.status}`} />
            </button>
          ))}
        </div>
      </section>

      <div className="roadmap-scroll">
        <div className="roadmap-grid" style={{ width: totalWidth, height: totalHeight }}>
          <div className="roadmap-lane-labels">
            {LANES.map((lane, i) => (
              <div key={lane.id} className="roadmap-lane-label" style={{ top: LANE_TOP + i * LANE_H + 12 }}>
                {lane.label}
              </div>
            ))}
          </div>

          {LANES.map((_, i) => (
            <div key={`stripe-${i}`} className="roadmap-lane-stripe" style={{ top: LANE_TOP + i * LANE_H - 4, left: COL_LEFT - 10, width: totalWidth - COL_LEFT }} />
          ))}

          <svg className="roadmap-connections" width={totalWidth} height={totalHeight}>
            {NODES.flatMap((node) =>
              node.unlocks.map((targetId) => {
                const target = nodeMap.get(targetId);
                if (!target) return null;
                const x1 = nodeX(node) + NODE_W + 3;
                const y1 = nodeY(node) + NODE_H / 2;
                const x2 = nodeX(target) - 3;
                const y2 = nodeY(target) + NODE_H / 2;

                let color: string;
                let opacity: number;
                let dashArray: string | undefined;
                if (node.status === "shipped" && target.status === "shipped") {
                  color = "var(--positive)"; opacity = 0.45;
                } else if (node.status === "shipped" || node.status === "active") {
                  color = "var(--ember)"; opacity = 0.35;
                } else {
                  color = "var(--dust)"; opacity = 0.25; dashArray = "4,4";
                }

                if (highlightSet) {
                  if (highlightSet.has(node.id) && highlightSet.has(targetId)) {
                    opacity = Math.min(opacity * 2.5, 1);
                  } else {
                    opacity = 0.06;
                  }
                }

                const sameLane = node.lane === target.lane;
                const gap = x2 - x1;
                const key = `${node.id}-${targetId}`;

                return (
                  <g key={key}>
                    {sameLane && gap > 0 && gap < COL_W + 20 ? (
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeOpacity={opacity} strokeWidth={2} />
                    ) : (
                      <path
                        d={`M${x1},${y1} C${x1 + Math.max(30, Math.abs(gap) * 0.35)},${y1} ${x2 - Math.max(30, Math.abs(gap) * 0.35)},${y2} ${x2},${y2}`}
                        fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={2} strokeDasharray={dashArray}
                      />
                    )}
                    <polygon
                      points={`${x2},${y2} ${x2 - 5},${y2 - 3} ${x2 - 5},${y2 + 3}`}
                      fill={color} fillOpacity={opacity}
                    />
                  </g>
                );
              }),
            )}
          </svg>

          {NODES.map((node) => {
            const deps = depsStatus(node, nodeMap);
            const dimmed = highlightSet !== null && !highlightSet.has(node.id);
            const isNext = node.nextUp || (node.status !== "shipped" && deps.total > 0 && deps.done === deps.total);

            return (
              <div
                key={node.id}
                className={`roadmap-node roadmap-node--${node.status}${isNext ? " roadmap-node--next" : ""}${dimmed ? " roadmap-node--dimmed" : ""}`}
                style={{ left: nodeX(node), top: nodeY(node), width: NODE_W, height: NODE_H }}
                onClick={() => setSelectedNode(node)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <div className="roadmap-node-accent" />
                <div className="roadmap-node-body">
                  <div className="roadmap-node-header">
                    <span className="roadmap-node-icon">{node.icon}</span>
                    <span className="roadmap-node-title">{node.title}</span>
                    {isNext && node.status !== "shipped" ? <span className="roadmap-next-badge">NEXT</span> : null}
                    <span className={`roadmap-node-dot roadmap-node-dot--${node.status}`} />
                  </div>
                  {node.progress > 0 && node.progress < 100 ? (
                    <div className="roadmap-node-progress">
                      <div className={`roadmap-node-progress-fill roadmap-node-progress-fill--${node.status}`} style={{ width: `${node.progress}%` }} />
                    </div>
                  ) : null}
                  {deps.total > 0 ? (
                    <div className="roadmap-node-deps">
                      {deps.items.map((d, i) => (
                        <span key={i}>
                          {i > 0 ? " " : ""}
                          <span className={`roadmap-dep-indicator roadmap-dep-indicator--${d.status}`}>{STATUS_ICON[d.status]}</span>
                          {" "}{d.title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedNode ? (
        <>
          <div className="roadmap-detail-overlay" onClick={() => setSelectedNode(null)} />
          <aside className="roadmap-detail-panel">
            <header className="roadmap-detail-header">
              <span className="roadmap-detail-icon">{selectedNode.icon}</span>
              <div className="roadmap-detail-header-text">
                <div className="roadmap-detail-title">{selectedNode.title}</div>
                <div className="roadmap-detail-meta">
                  <span className={`roadmap-detail-badge roadmap-detail-badge--${selectedNode.status}`}>
                    {selectedNode.status}
                  </span>
                  {selectedNode.progress > 0 && selectedNode.progress < 100 ? (
                    <span className="roadmap-detail-progress">{selectedNode.progress}% complete</span>
                  ) : selectedNode.progress === 100 ? (
                    <span className="roadmap-detail-progress">Complete</span>
                  ) : null}
                </div>
              </div>
              <button className="roadmap-detail-close" type="button" onClick={() => setSelectedNode(null)}>&times;</button>
            </header>

            <div className="roadmap-detail-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedNode.details) }} />

            <footer className="roadmap-detail-footer">
              {selectedNode.deps.length > 0 ? (
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Build Path</div>
                  <div className="roadmap-build-path">
                    {buildPath(selectedNode.id, nodeMap).map((step, i, arr) => (
                      <span key={step.id} className="roadmap-build-step">
                        <button
                          type="button"
                          className={`roadmap-dep-chip roadmap-dep-chip--${step.status}`}
                          onClick={() => setSelectedNode(step)}
                        >
                          <span className={`roadmap-dep-dot roadmap-dep-dot--${step.status}`} />
                          {step.icon} {step.title}
                        </button>
                        {i < arr.length - 1 ? <span className="roadmap-build-arrow">&rarr;</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {selectedNode.unlocks.length > 0 ? (
                <div>
                  <div className="section-label" style={{ marginBottom: 6 }}>Unlocks</div>
                  <div className="roadmap-dep-chips">
                    {selectedNode.unlocks.map((id) => {
                      const target = nodeMap.get(id);
                      if (!target) return null;
                      return (
                        <button key={id} type="button" className={`roadmap-dep-chip roadmap-dep-chip--${target.status}`} onClick={() => setSelectedNode(target)}>
                          <span className={`roadmap-dep-dot roadmap-dep-dot--${target.status}`} />
                          {target.icon} {target.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </footer>
          </aside>
        </>
      ) : null}
    </div>
  );
}
