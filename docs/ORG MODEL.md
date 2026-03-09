# Zazig Org Model

**Date:** 2026-02-22 (updated 2026-03-09: Expert Sessions)
**Status:** reference document
**Authors:** Tom (owner), Chris (co-founder), CPO (agent)

---

## What This Is

This is the canonical reference for how zazig's AI workforce is organized. It defines the three tiers of zazig workers, the six layers that compose each worker, and how the orchestrator assembles them at dispatch time.

Every other design doc handles one layer in depth. This doc is the map that shows how they connect.

### Design Docs (by layer)

| Layer | Design Doc |
|-------|-----------|
| Personality | [`exec-personality-system-design.md`](plans/2026-02-20-exec-personality-system-design.md) |
| Role Prompt + Skills | [`role-prompts-and-skills-design.md`](plans/2026-02-20-role-prompts-and-skills-design.md) |
| Knowledge (Doctrines + Canons) | [`exec-knowledge-architecture-v5.md`](plans/2026-02-22-exec-knowledge-architecture-v5.md) |
| Orchestrator + Dispatch | [`orchestration-server-design.md`](plans/2026-02-18-orchestration-server-design.md) |
| Pipeline + Job Lifecycle | [`software-development-pipeline-design.md`](plans/2026-02-24-software-development-pipeline-design.md) |
| Messaging | [`agent-messaging-bidirectional.md`](plans/2026-02-22-agent-messaging-bidirectional.md) |
| Memory | [`memory-system-design.md`](plans/active/2026-03-03-memory-system-design.md) |
| Expert Sessions | Covered in this document ([Expert Sessions](#expert-sessions-interactive-pair-programming)) — implementation in `expert-session-manager.ts` |
| Model Routing | Covered in this document ([Model Routing](#model-routing)) — may graduate to own design doc when local model support lands |

---

## The Six Layers

Every zazig worker is assembled from up to six layers, compiled by the orchestrator into a prompt stack at dispatch time. The agent never sees the raw config for any layer — it receives a compiled prompt fragment.

```
┌─────────────────────────────────────────────────────────────┐
│  1. PERSONALITY                                              │
│     Who they are. Bounded numeric dimensions (verbosity,     │
│     risk tolerance, analysis depth, etc.) + archetype        │
│     philosophy. Compiled into natural-language prompt.        │
│     → See: exec-personality-system-design.md                 │
├─────────────────────────────────────────────────────────────┤
│  2. ROLE PROMPT                                              │
│     What they do. Operational scope, responsibilities,       │
│     hard stops, output contract. Stored in roles.prompt.     │
│     → See: role-prompts-and-skills-design.md                 │
├─────────────────────────────────────────────────────────────┤
│  3. SKILLS                                                   │
│     How they work. Procedural capability files loaded per    │
│     job. Listed in roles.skills[], loaded from               │
│     ~/.claude/skills/{name}/SKILL.md.                        │
│     → See: role-prompts-and-skills-design.md                 │
├─────────────────────────────────────────────────────────────┤
│  4. DOCTRINES                                                │
│     What they believe. Role-specific curated heuristics,     │
│     frameworks, policies. Proactively injected. Can          │
│     contradict across roles (that's the value).              │
│     → See: exec-knowledge-architecture-v5.md                 │
├─────────────────────────────────────────────────────────────┤
│  5. CANONS                                                   │
│     What they've studied. Shared reference knowledge —       │
│     books, regulations, playbooks. Mostly reactive           │
│     (agent searches when needed). Company-wide, not          │
│     role-specific.                                           │
│     → See: exec-knowledge-architecture-v5.md                 │
├─────────────────────────────────────────────────────────────┤
│  6. MEMORY                                                   │
│     What they remember. 9-type taxonomy: Identity            │
│     (biographical), Decision, Gotcha, Fact, Preference,      │
│     Observation, Moment, Relationship, Procedure.            │
│     Stored in Supabase, injected via bulletin (persistent    │
│     agents) or ContextPack (contractors). Tier-specific      │
│     token budgets, mandatory slot reservation.               │
│     → See: memory-system-design.md                           │
└─────────────────────────────────────────────────────────────┘
```

### The Prompt Stack (assembly order)

The orchestrator's prompt compiler assembles layers in attention-priority order (informed by "Lost in the Middle" research — LLMs attend most to the beginning and end of context):

```
Position 1: Personality prompt          (who you are — highest attention)
Position 2: Role prompt                 (what you do)
Position 3: Doctrine Tier 1 index       (what you believe — stable pointers)
Position 3b: Canon library pointers     (what you've studied — stable pointers)
--- cache break line ---
Position 4: Proactive doctrine claims   (task-relevant beliefs)
Position 5: Doctrine tension blocks     (cross-role contradictions)
Position 6: Canon source summaries      (if high-similarity match)
Position 7: Skill content               (how to work on this type of task)
Position 8: Task context                (what to do now)
Position 9: Memory context              (what you remember — bulletin or ContextPack, tier-budgeted)
```

Positions 1–3b form a **static prefix** cached across all jobs for the same role within a company. Positions 4–9 are **dynamic** and change per task. This split reduces inference costs by ~10x.

---

## Three Tiers of Workers

Zazig's workforce is organized into three tiers, modeled on how real companies work. Each tier gets a different subset of the six layers and different operational privileges.

### Executives

**Examples:** CPO, CTO, CMO, CEO, VP-Engineering, VP-Product

Executives are the leadership team. They have full identity, full knowledge, and run autonomously.

| Attribute | Value |
|-----------|-------|
| **Personality** | Full — all 9 dimensions, archetype, philosophy, auto-evolution |
| **Role prompt** | Generalist operational scope with hard stops |
| **Skills** | Full skill set for their domain |
| **Doctrines** | Full — role-specific beliefs, heuristics, frameworks |
| **Canons** | Full — access to all company canon libraries |
| **Memory** | Persistent — 9-type episodic memory across all jobs, injected via bulletin (1000-1500 token budget). Biographical identity, decisions, gotchas, procedures. See [memory-system-design.md](plans/active/2026-03-03-memory-system-design.md) |
| **Heartbeat** | Yes — autonomous, runs on a recurring cycle |
| **Gateway** | Yes — founders can talk to them directly (e.g., via Slack) |
| **Autonomy** | High — initiates work, not just responds to it |
| **Charter** | Full — mandates + interdictions. See [Charters](#charters-mandates-and-interdictions) |
| **Model routing** | Per-role config — see [Model Routing](#model-routing) section |

Executives are **generalists within their domain**. The CPO handles product strategy, roadmap, prioritization, sprint planning, and founder communication. The CTO handles architecture, security, engineering standards, and technical health. Their broad scope is what makes them valuable — they see the whole picture for their function.

Executives manage employees. Founders manage executives.

### Employees

**Examples:** Product Manager, Social Media Manager, PR Reviewer, Senior Engineer, DevOps Engineer, Market Researcher

Employees are skilled workers with continuity and light identity. They're more narrowly scoped than executives — each employee is expert at one thing.

| Attribute | Value |
|-----------|-------|
| **Personality** | Lite — values + 2-3 relevant dimensions (e.g., a PR reviewer's verbosity and analysis depth). Ensures consistent voice across jobs. No full archetype or philosophy. |
| **Role prompt** | Tightly scoped — single responsibility, clear boundaries |
| **Skills** | Focused skill set for their specific function |
| **Doctrines** | Yes — narrow, deep doctrines for their specialty |
| **Canons** | Yes — access to relevant canon libraries |
| **Memory** | Persistent — 9-type memory, learns from past jobs, builds expertise. Injected via bulletin (700-1200 token budget). Role-type shared memory available (all Senior Engineers share patterns). See [memory-system-design.md](plans/active/2026-03-03-memory-system-design.md) |
| **Heartbeat** | Yes — autonomous for routine tasks (review cycles, scheduled scans) |
| **Gateway** | Scoped — role-specific, typically write-only (e.g., Social Media Manager posts to X but doesn't receive founder DMs). Not all employees have gateways; granted per role config. |
| **Autonomy** | Moderate — runs routine work autonomously, also dispatched by execs |
| **Charter** | Light — mainly interdictions (scope creep prevention). See [Charters](#charters-mandates-and-interdictions) |
| **Model routing** | Per-role config — see [Model Routing](#model-routing) section |

The key insight from Chris: **narrow-scope specialists with the right knowledge injected outperform generalists reasoning from first principles.** A dedicated PR reviewer with review doctrines and the team's engineering canon will produce better reviews than a CTO doing reviews as one of twelve responsibilities.

Employees have lite personality not for founder engagement (their gateways, when they have them, are scoped and operational — not conversational) but for **consistency** — a Senior Engineer's code style and commit messages should be recognizably "theirs" across jobs. A Market Researcher's daily digests should have a consistent analytical voice.

Employees are managed by executives. The CPO assigns work to the Product Manager. The CTO assigns work to the Senior Engineer. Employees can also run autonomously on heartbeat cycles (a Market Researcher runs daily scans without being told to).

### Contractors

**Examples:** Curator (knowledge ingestion QA), Cybersecurity Tester, Legal Document Reviewer, Accessibility Auditor, Performance Profiler, Migration Specialist

Contractors are specialist experts hired per job. They're the most narrowly scoped tier — each contractor does exactly one thing, does it well, and leaves.

| Attribute | Value |
|-----------|-------|
| **Personality** | None — cold function spec, values-only mode |
| **Role prompt** | Minimal — task format, output contract, standards |
| **Skills** | Specialist skill set for their one function |
| **Doctrines** | Yes — deep specialist doctrines (a Cybersecurity Tester has OWASP doctrines) |
| **Canons** | Yes — specialist canon libraries (security canons, legal canons) |
| **Memory** | Job-scoped — injected via ContextPack (300-800 token budget). Optionally shared: learns patterns across jobs for the same contractor type. Opt-in per role config; some contractors are genuinely stateless. Tombstone commit on job completion. See [memory-system-design.md](plans/active/2026-03-03-memory-system-design.md) |
| **Heartbeat** | No — not autonomous, dispatched per job |
| **Gateway** | No — no direct engagement |
| **Autonomy** | None — given a job, executes it, reports, gone |
| **Charter** | None — task-scoped by definition, no governance needed |
| **Model routing** | Per-role config — see [Model Routing](#model-routing) section |

Contractors don't need personality because no one engages with them directly. They don't need heartbeats because they aren't autonomous. What they *do* need is deep specialist knowledge — a Cybersecurity Tester with security doctrines + OWASP canons + pentest skills is far more effective than a generalist CTO running a security scan.

**Contractor memory model.** Contractors have opt-in, two-tier memory. **Job-scoped memory** persists within a single engagement — a Migration Specialist doing Phase 2 of a migration can recall Phase 1 decisions without re-reading the entire context. **Shared memory** accumulates across jobs for the same contractor type — a Cybersecurity Tester that has audited 50 codebases learns common vulnerability patterns and carries those forward. Both tiers are opt-in per role config; some contractors (one-shot auditors, simple linters) should remain genuinely stateless. On job completion, contractors perform a **tombstone commit** — structured memory extraction before termination. Memory is injected via **ContextPack** (300-800 token budget, scored by relevance, mandatory slot reservation). See [memory-system-design.md](plans/active/2026-03-03-memory-system-design.md) for full specification.

**The contractor marketplace.** Contractors are the natural unit for a zazig marketplace. Like real contractors, they build expertise that serves any client. A company doesn't need to "hire" a full-time Accessibility Auditor — they spin one up when needed, pay per job, and it arrives pre-loaded with accessibility doctrines and WCAG canons. This dovetails with the canon library marketplace (see knowledge architecture v5, Phase 6): you're selling pre-configured specialist knowledge, not just books.

```
Zazig Contractor Marketplace (future)
├── Cybersecurity Audit       $X/job    OWASP doctrines + security canons + pentest skill
├── Accessibility Review      $X/job    WCAG doctrines + a11y canons + audit skill
├── Legal Doc Review          $X/job    Contract doctrines + legal canons + review skill
├── Performance Profiling     $X/job    Perf doctrines + optimization canons + profiler skill
├── SOC2 Compliance Check     $X/job    Compliance doctrines + SOC2/GDPR canons + audit skill
└── Migration Specialist      $X/job    Migration doctrines + framework canons + migration skill
```

---

## Tier Comparison

| | Executives | Employees | Contractors |
|---|---|---|---|
| **Personality** | Full (9 dims, archetype, philosophy) | Lite (values + 2-3 dims) | None (values only) |
| **Role prompt** | Generalist scope | Narrow scope | Minimal spec |
| **Skills** | Broad | Focused | Specialist |
| **Doctrines** | Wide domain | Deep, narrow | Deep, narrow |
| **Canons** | All company libraries | Relevant libraries | Specialist libraries |
| **Memory** | Persistent (bulletin, 1000-1500 tokens) | Persistent (bulletin, 700-1200 tokens) | Job-scoped + optional shared (ContextPack, 300-800 tokens) |
| **Heartbeat** | Yes | Yes | No |
| **Gateway** | Yes — bidirectional (Slack, etc.) | Scoped — role-specific, typically write-only | No |
| **Charter** | Full (mandates + interdictions) | Light (interdictions only) | None |
| **Autonomy** | High | Moderate | None |
| **Managed by** | Founders | Executives | Dispatched per job |
| **Lifecycle** | Persistent (always-on) | Recurring (heartbeat cycles) | Ephemeral (spin up, execute, gone) |
| **Model routing** | Per-role config (default: Opus) | Per-role config (default: Sonnet) | Per-role config (default: varies) |
| **Identity continuity** | Strong | Moderate | None |

---

## Expert Sessions: Interactive Pair Programming

Expert sessions are a **fourth interaction mode** that cuts across the three tiers. Where executives run autonomously, employees run on heartbeats, and contractors execute fire-and-forget jobs, experts are **interactive** — a human (or exec) and a specialist agent work together in real-time.

### The Concept

The pipeline handles autonomous work well. But some tasks need a human in the loop — deploying to staging, debugging a live issue, writing a migration with someone watching, pair-coding a tricky feature. Expert sessions fill this gap.

An executive (typically the CPO) or a human triggers an expert session by saying "I need a Supabase expert to help with this migration." The system:

1. Creates a fully scaffolded workspace (git worktree, CLAUDE.md, MCP tools, skills)
2. Writes a brief to `.claude/expert-brief.md`
3. Spawns an **interactive Claude tmux session** with the role's model and prompt
4. Links the tmux window into the viewer TUI as a new tab — the human sees it appear
5. The expert reads its brief on startup (via SessionStart hook) and begins working
6. Human and expert pair-program interactively
7. When done, the expert writes a summary to `.claude/expert-report.md`
8. On session exit: report is written to DB, injected into the CPO's tmux session, viewer switches back to CPO, worktree is cleaned up

### Expert Roles

Expert roles are **global templates** — not tied to a company. They define the specialist persona:

| Field | Purpose |
|-------|---------|
| `name` | Unique identifier (e.g., `supabase-expert`) |
| `display_name` | Human-readable (e.g., "Supabase Expert") |
| `prompt` | Role-specific system prompt — domain knowledge, workflow guidance |
| `model` | Which model to use (default: `claude-sonnet-4-6`) |
| `skills` | Skill files loaded into the workspace |
| `mcp_tools` | MCP tool configuration |
| `settings_overrides` | Claude settings (hooks, permissions, etc.) |

Current seeded roles:

- **Test Deployment Expert** — guides staging deploys, verifies they work, troubleshoots
- **Supabase Expert** — writes/debugs migrations, RLS policies, edge functions, realtime channels
- **Hotfix Engineer** — rapid interactive code changes, pair coding with human

### How Experts Differ from Other Tiers

Experts are not a fourth tier — they're a **session mode** that any specialist role can operate in. The key differences:

| | Pipeline Jobs | Expert Sessions |
|---|---|---|
| **Interaction** | Fire-and-forget | Interactive, real-time |
| **Slot consumption** | Yes — consumes a job slot | No — doesn't consume slots |
| **Lifecycle** | Dispatched → executing → complete | Requested → running → completed |
| **Output** | Job result + report file | Expert report → injected into CPO |
| **Workspace** | Ephemeral job workspace | Git worktree with full repo context |
| **Visibility** | Background (logs only) | Foreground (tmux tab in viewer TUI) |
| **Triggered by** | Orchestrator dispatch | CPO, human, or `start_expert_session` MCP tool |

### The CPO ↔ Expert Loop

The most powerful pattern is the CPO commissioning experts. When the CPO hits something outside its competence — a complex migration, a deployment issue, a security audit — it commissions an expert session:

```
CPO encounters complex migration issue
    │
    ▼
CPO calls start_expert_session MCP tool
  → role: supabase-expert
  → brief: "Migration 118 fails on staging — pipeline_snapshot function
            references columns that don't exist yet. Need to fix the
            migration ordering and verify on staging."
    │
    ▼
Expert session spawns in viewer TUI
  → Human sees new tab, can interact
  → Expert reads brief, starts working
    │
    ▼
Expert completes work, writes report
    │
    ▼
Session exits → report injected into CPO's context
  → CPO absorbs the outcome: "Migration fixed, deployed to staging,
     verified working. Changed execution order to create columns
     before the function that references them."
    │
    ▼
CPO continues with full awareness of what happened
```

This creates a **knowledge loop** — the CPO delegates specialized work, gets the result back, and maintains continuity without having done the work itself. The expert is ephemeral but the knowledge persists through the CPO.

### Expert Sessions and the Six Layers

Experts use a subset of the six layers, assembled differently from pipeline workers:

| Layer | Expert Sessions |
|-------|----------------|
| **Personality** | None — task-focused, not identity-focused |
| **Role prompt** | From `expert_roles.prompt` — domain knowledge + workflow guidance |
| **Skills** | From `expert_roles.skills` — specialist capabilities |
| **Doctrines** | Not currently injected (future: specialist doctrines) |
| **Canons** | Not currently injected (future: domain reference material) |
| **Memory** | Not currently injected (future: expert learns from past sessions) |

Expert sessions are deliberately lightweight on identity layers — personality, doctrines, and canons are omitted because the session is interactive and short-lived. The human provides the judgment that these layers would normally supply. As the system matures, doctrine and memory injection may be added to make experts more capable without human steering.

### Storage

- **`expert_roles`** — Global role templates. No `company_id` — roles are shared across all companies.
- **`expert_sessions`** — Session lifecycle tracking. Company-scoped. Has `brief` (input), `summary` (output), `triggered_by`, `status`, timestamps.

### Future: Expert Marketplace

Expert roles are the natural unit for a marketplace alongside contractors. Where contractors execute autonomously, experts provide interactive specialist assistance:

```
Zazig Expert Marketplace (future)
├── Supabase Expert           Interactive DB, migration, RLS help
├── Deployment Expert         Guided staging/production deploys
├── Security Auditor          Interactive security review with human
├── Performance Profiler      Guided performance investigation
├── Hotfix Engineer           Rapid pair-coding for urgent fixes
└── Architecture Consultant   Interactive design session with CTO
```

The distinction from the contractor marketplace: contractors are **autonomous specialists** (give them a job, they execute). Experts are **interactive specialists** (work alongside a human or exec in real-time). Some roles may exist in both modes — a Security Auditor could run as a contractor (autonomous scan) or as an expert (guided review with a human watching).

---

## How the Orchestrator Assembles Workers

When the orchestrator dispatches a job, it reads the worker's tier and role, then assembles the prompt stack:

```
Job dispatched
    │
    ▼
1. Read worker tier (exec / employee / contractor)
    │
    ▼
2. Compile personality (tier-dependent):
   ├── Exec:       Full personality from exec_personalities table
   ├── Employee:   Lite personality (values + subset of dimensions)
   └── Contractor: Values-only mode (safety constraints, no persona)
    │
    ▼
3. Read role prompt from roles.prompt
    │
    ▼
4. Compile knowledge context (same for all tiers that have it):
   ├── Doctrine Tier 1 index (stable pointers)
   ├── Canon library pointers (stable pointers)
   ├── Proactive doctrine claims (task-relevant, gated by similarity)
   ├── Doctrine tensions (if cross-role contradictions exist)
   └── Canon source summaries (if high-similarity match)
    │
    ▼
5. Load skill content from roles.skills[]
    │
    ▼
6. Load memory context (tier-dependent):
   ├── Exec:       Bulletin — LLM-synthesised brief from top memories (1000-1500 tokens)
   ├── Employee:   Bulletin — scoped to role + project (700-1200 tokens)
   └── Contractor: ContextPack — scored memories, greedy fill (300-800 tokens)
   Mandatory slot reservation: 2 gotchas + 2 decisions + 1 risk filled first
    │
    ▼
7. Assemble prompt stack in cache-optimized order
    │
    ▼
8. Dispatch via StartJob payload
```

### Heartbeat and Autonomy

Workers with heartbeats run on recurring cycles managed by the orchestrator:

- **Executives** heartbeat every 30s. The orchestrator monitors liveness and triggers failover if an exec's host machine goes silent for >15 minutes (CPO failover is the critical path).
- **Employees** heartbeat on role-specific schedules. A Market Researcher runs daily. A PR Reviewer polls for new PRs on a cycle. A DevOps Engineer monitors deployment health hourly.
- **Contractors** have no heartbeat. They're dispatched, execute, report, and terminate.

> **Terminology note (2026-02-22):** "Heartbeat" refers to two distinct subsystems in the implementation:
> 1. **Machine heartbeat** — 30s liveness pings from local agent to orchestrator. Reports machine health + per-job health (`JobHealth`). Implemented in the [Triggers and Events Design](plans/2026-02-22-triggers-and-events-design.md), Section 1.
> 2. **Worker heartbeat** (this section) — role-specific autonomous work cycles. Implemented via the **scheduler/cron** subsystem in the Triggers and Events Design, Section 2. A Market Researcher's "daily heartbeat" is a `scheduled_job` with `session_mode='isolated'` and `schedule='0 8 * * *'`. These are not heartbeat packets — they are scheduled work triggers.

### Gateways

A gateway is a communication channel between a worker and the outside world (founders, Slack, other platforms).

**Executive gateways** are fully bidirectional — founders can message the CPO via Slack and receive responses. This is the primary engagement model for leadership workers.

**Employee gateways** are scoped and typically write-only. A Social Media Manager may have a gateway to post to X, but does not receive founder DMs through it. Employee gateways are granted per role config — not all employees have them. The permissions model is tightly scoped: each gateway specifies allowed operations (read/write), allowed platforms, and rate limits.

**Contractors** have no gateways.

Gateways are implemented via platform adapters (Supabase Edge Functions) that bridge external platforms to the orchestrator's message bus. The agent receives an opaque `conversationId` and replies via `MessageOutbound` — it never knows which platform it's talking to.

See: [`agent-messaging-bidirectional.md`](plans/2026-02-22-agent-messaging-bidirectional.md)

---

## Charters: Mandates and Interdictions

A charter is the governance contract for a worker. It defines two things:

- **Mandate** — what this worker owns and is authorized to do. Jurisdiction.
- **Interdictions** — what this worker must never do, regardless of circumstance. Constitutional constraints.

Charters exist to prevent authority collisions in an autonomous org. When 5+ workers operate independently, overlapping mandates create conflicts and missing interdictions create overreach. Charters are the separation of powers.

### Why Charters Are Separate from Role Prompts

The role prompt (Layer 2) describes *what the worker does* — operational scope, responsibilities, output contracts. The charter describes *governance boundaries* — what they're authorized to own and what's constitutionally forbidden. The distinction matters because:

1. **Charters are relational.** A CPO's interdiction "never make architecture decisions" only exists because the CTO's mandate says "owns architecture." They're a contract *between* roles, not just constraints *on* a role.

2. **Charters are cross-validatable.** Stored as structured data, the orchestrator can detect mandate overlaps (two execs claiming the same jurisdiction) and interdiction gaps (an action no exec is forbidden from, but no exec owns) at config time — before runtime conflicts occur.

3. **Charters are enforceable.** A line in a role prompt saying "never dispatch agents" is a suggestion the model may ignore under pressure. A charter interdiction stored in the orchestrator can be enforced — if the CPO tries to create a job dispatch, the orchestrator checks the interdiction list and blocks it.

### Storage and Compilation

Charters are **stored separately** from role prompts (as a `charter` JSONB column on the `roles` table or a dedicated `charters` table) but **compiled into** the role prompt at dispatch time. The agent sees its charter as part of its identity:

```
## Your Charter

### You Own (Mandate)
- Product strategy and roadmap ownership
- Card prioritization in Backlog
- Design doc authorship and review
...

### You Must Never (Interdictions)
- NEVER dispatch implementation agents — VP-Eng handles execution
- NEVER make architecture decisions — CTO owns technical direction
...
```

The orchestrator also reads charters for enforcement (blocking forbidden actions) and for governance validation (flagging mandate conflicts across roles).

### Charter by Tier

| Tier | Charter | Rationale |
|------|---------|-----------|
| **Executives** | Full — mandates + interdictions | Autonomous actors with broad scope; must not step on each other |
| **Employees** | Light — mainly interdictions | Narrow scope means mandate is implicit in the role prompt; interdictions prevent scope creep |
| **Contractors** | None | No autonomy, no governance needed — task-scoped by definition |

### Example Charters

#### CPO Charter

```jsonc
{
  "role": "cpo",
  "tier": "exec",
  "mandate": [
    "Product strategy and roadmap ownership for all focus projects",
    "Card prioritization — Backlog ordering, Up Next gating, sprint planning",
    "Design doc authorship — deep dives produce design docs, reviewed via /review-plan",
    "Standup synthesis — founder-facing communication, status updates, decision surfacing",
    "Code review decisions — approve/reject based on QA results (product lens)",
    "Manual test plan authorship — acceptance criteria for founder testing",
    "Founder communication — primary exec interface for product questions",
    "Restart stalled exec sessions — if blocking pipeline and Supervisor hasn't caught it",
    "Roadmap health monitoring — daily comparison of ROADMAP.md against Trello state",
    "Directive authorship — write cpo-directives.json to influence VP-Eng execution priority"
  ],
  "interdictions": [
    "NEVER dispatch implementation agents — VP-Eng owns execution",
    "NEVER write code — plan, design, and review only",
    "NEVER make architecture decisions — CTO owns technical direction",
    "NEVER write to Trello in-thread — all Trello writes via subagents",
    "NEVER work on defocused projects without founder re-authorization",
    "NEVER override CTO technical decisions — escalate disagreements to founder",
    "NEVER approve PRs without QA pass — product approval requires engineering sign-off first"
  ]
}
```

#### CTO Charter

```jsonc
{
  "role": "cto",
  "tier": "exec",
  "mandate": [
    "Architecture decisions — tech stack, system design, infrastructure patterns",
    "Engineering standards — code quality, review standards, CI/CD requirements",
    "Security posture — vulnerability management, access control, audit policy",
    "Tech review gate — review cards with tech-review label before they become dispatchable",
    "DX ownership — developer experience, tooling, agent infrastructure improvements",
    "Technical health monitoring — dependency audits, performance baselines, tech debt tracking",
    "Model routing recommendations — advise on model_config for new roles"
  ],
  "interdictions": [
    "NEVER make product decisions — CPO owns what to build and prioritization",
    "NEVER dispatch implementation agents — VP-Eng owns execution",
    "NEVER write production code — set standards, don't implement",
    "NEVER override CPO product priorities — escalate disagreements to founder",
    "NEVER approve cards for Up Next — CPO and founder own the pipeline input"
  ]
}
```

#### VP-Engineering Charter

```jsonc
{
  "role": "vp-eng",
  "tier": "exec",
  "mandate": [
    "Execution — pull cards from Up Next, write task specs, dispatch implementation agents",
    "Agent management — launch, monitor, collect reports from implementation agents",
    "QA coordination — run multi-agent review before PR submission",
    "Card lifecycle — move cards through In Progress → Review based on agent output",
    "State file maintenance — keep vpe-state.json current for CPO/Supervisor consumption",
    "Report synthesis — write cpo-report.md summarizing agent output for CPO review"
  ],
  "interdictions": [
    "NEVER make product decisions — CPO owns strategy and prioritization",
    "NEVER make architecture decisions — CTO owns technical direction",
    "NEVER add the team label to cards — requires founder approval (surfaced by CPO/CTO)",
    "NEVER skip QA — all PRs require multi-agent review before submission",
    "NEVER pull cards with design, blocked, needs-human, or tech-review labels",
    "NEVER brainstorm or write design docs — execution only, not strategy"
  ]
}
```

#### Employee Charter (example: Senior Engineer)

```jsonc
{
  "role": "senior-engineer",
  "tier": "employee",
  "mandate": [],  // implicit in role prompt — narrow scope doesn't need explicit mandate
  "interdictions": [
    "NEVER merge without review approval",
    "NEVER modify infrastructure or CI/CD config",
    "NEVER change database schemas without CTO-approved migration plan",
    "NEVER commit secrets or credentials"
  ]
}
```

### Governance Validation

At startup (or when roles are modified), the orchestrator runs a governance check:

```
For each pair of exec roles:
  1. Mandate overlap check — flag if two execs claim the same jurisdiction
  2. Interdiction coverage check — flag if an action appears in no exec's interdictions
     (governance gap — who stops this from happening?)
  3. Mandate-interdiction consistency — flag if an exec's mandate contradicts
     another exec's interdiction (e.g., CPO mandates "card prioritization" but
     VP-Eng's interdictions don't mention "NEVER reprioritize cards")
```

Governance violations are surfaced to founders at startup, not silently ignored. The system should refuse to dispatch workers with unresolved charter conflicts.

### Charter Evolution

Charters are living documents — they evolve as roles mature and new execs are added. When a new executive role is created:

1. Draft charter (mandate + interdictions) as part of role creation
2. Cross-validate against all existing exec charters
3. Resolve any mandate overlaps or interdiction gaps
4. Founder approves the charter before the exec becomes active

When an existing charter needs amendment (e.g., a mandate is being transferred from one exec to another), both charters must be updated atomically — you can't remove a mandate from one exec without adding it to another, or the org has a governance gap.

---

## Naming Conventions

Zazig deliberately avoids the term "agent" in its organizational model to prevent confusion with the broader AI ecosystem (Claude agents, Agent SDK, sub-agents in Claude Code). Instead:

| Zazig term | What it means | NOT this |
|------------|--------------|----------|
| **Executive** | Persistent, autonomous, full-identity leadership worker | Not "agent" (overloaded) |
| **Employee** | Recurring, specialist, lite-identity worker | Not "sub-agent" (Claude ecosystem term) |
| **Contractor** | Ephemeral, specialist-for-hire worker (optionally scoped memory) | Not "tool" or "function" |
| **Worker** | Generic term for any zazig AI entity across all tiers | — |
| **Gateway** | Bidirectional comms channel to external platforms | Not "chat" or "interface" |
| **Charter** | Governance contract: mandate (what you own) + interdictions (what you must never do) | Not "permissions" or "ACL" (those are runtime; charters are constitutional) |
| **Heartbeat** | Recurring autonomous execution cycle | — |

In implementation (code, database), the `roles` table uses `tier` to distinguish:

```sql
tier: 'exec' | 'employee' | 'contractor'
```

---

## Why Three Tiers, Not Two

The original architecture had two tiers: agents (with personality) and sub-agents (without). The three-tier model is better because:

1. **Employees need memory but not full identity.** A Senior Engineer benefits from remembering past code review feedback and project patterns, but doesn't need a founder-facing personality or a philosophy statement. Two tiers forces a binary choice — full identity or none — that doesn't reflect how real organizations work. Even contractors benefit from scoped memory (job-scoped for multi-phase work, shared for cross-job learning) — a spectrum, not a binary.

2. **Employees need autonomy but not a gateway.** A Market Researcher should run daily scans without being told to, but founders shouldn't be DMing the Market Researcher directly. Two tiers conflates autonomy (heartbeat) with accessibility (gateway).

3. **Contractors are a marketplace opportunity.** Real contractors work for multiple clients. Zazig contractors can be pre-configured specialists sold per job — a business model that doesn't exist in a two-tier world where everything without personality is a disposable sub-agent.

4. **Terminology matters.** "Sub-agent" is already overloaded in the Claude ecosystem (Claude Code sub-agents, Agent SDK sub-agents). "Employee" and "contractor" are immediately understood by every founder and map to real organizational decisions: who do you hire full-time vs who do you bring in for specific jobs?

---

## Implications for Existing Designs

### Personality System

The personality system design currently describes full personality for "agents" and values-only for "sub-agents." This needs a third mode:

- **Full mode** (executives): All 9 dimensions, archetype, philosophy, auto-evolution
- **Lite mode** (employees): Values + 2-3 role-relevant dimensions, no archetype, no philosophy, no auto-evolution
- **Values-only mode** (contractors): Safety constraints and organizational values only

Lite mode is a new concept. It preserves consistency (the PR reviewer always writes in a similar voice) without the overhead of full personality management. Implementation: a subset of the personality dimensions marked as `employee_relevant: true` in the archetype config.

### Knowledge System

The knowledge architecture (v5) applies identically across all three tiers. Executives, employees, and contractors all benefit from doctrines and canons — the difference is scope, not mechanism. A CPO gets broad product doctrines across 5 pillars. A PR Reviewer gets deep code review doctrines in 1-2 pillars. A Cybersecurity Tester gets specialist security doctrines.

Principle 15 (narrow-scope specialists over broad generalists) is the architectural justification for employees and contractors. The knowledge system makes narrow specialists viable by giving them exactly the expertise they need without requiring them to be generalists.

### Role Prompts

The role prompts design currently lists 7 roles with "agent" vs "sub-agent" prompting styles. This maps to the three-tier model:

| Current | New tier | Prompt style change |
|---------|----------|-------------------|
| CPO | Executive | No change |
| CTO | Executive | No change |
| senior-engineer | Employee | Add lite personality, persistent memory |
| reviewer | Employee | Add lite personality, persistent memory |
| junior-engineer | Contractor | No change (already minimal spec) |
| researcher | Employee | Add lite personality, persistent memory |
| product_manager | Employee | Add lite personality, persistent memory |

### Orchestrator

The orchestrator needs to be aware of tiers for:

1. **Prompt compilation** — which personality mode to use
2. **Heartbeat management** — execs and employees get heartbeats, contractors don't
3. **Memory injection** — execs and employees get bulletin (LLM-synthesised, tier-budgeted); contractors get ContextPack (scored, greedy fill). Mandatory slot reservation ensures critical gotchas/decisions always surface. Post-job extraction runs via `extract-memories` Edge Function. See [memory-system-design.md](plans/active/2026-03-03-memory-system-design.md)
4. **Gateway routing** — execs get bidirectional gateways; employees get scoped gateways (if configured); contractors get none
5. **Model routing** — read `model_config` from role, resolve primary model, check local availability, select review chain (see [Model Routing](#model-routing))
6. **Charter enforcement** — validate actions against interdictions; cross-validate mandates across all active execs at startup (see [Charters](#charters-mandates-and-interdictions))

The `roles` table gains a `tier` column. The `StartJob` payload already supports all the required fields — tier determines which fields are populated.

---

## Model Routing

Model choice is an **orchestrator concern**, not a prompt concern. By the time the agent reads its prompt, the model decision has already been made. The orchestrator reads a `model_config` field from the role definition and routes accordingly.

### The Problem

A flat `model_tier: 'opus' | 'sonnet' | 'codex'` attribute is too simple. Real-world model routing involves:

1. **Cost optimization** — a Senior Engineer should default to Codex for implementation, not burn Opus tokens on mechanical coding
2. **Capability matching** — some tasks need investigation (reasoning model) before implementation (coding model), requiring two dispatches
3. **Review chains** — cheap models produce, expensive models review. A Junior Engineer on Qwen writes code that gets reviewed by Codex or Sonnet
4. **Local model availability** — if the host machine has Qwen or Minimax running locally, the orchestrator should prefer free local inference when the task is within capability
5. **Subscription budget awareness** — when a founder is burning through their Claude subscription, the orchestrator should aggressively route to cheaper models

### Role-Level Model Config

Each role carries a `model_config` object in the `roles` table:

```jsonc
{
  "primary": "codex",           // default dispatch model
  "investigation": "sonnet",    // for tasks requiring reasoning/exploration first
  "review_by": "sonnet",        // who reviews this worker's output
  "fallback": "sonnet",         // if primary fails or exceeds scope
  "local_eligible": true,       // can run on local models (Qwen, Minimax, etc.)
  "local_models": ["qwen-3.5"]  // which local models are acceptable (if local_eligible)
}
```

**Example configs by role:**

| Role | primary | investigation | review_by | local_eligible | Notes |
|------|---------|---------------|-----------|----------------|-------|
| CPO | opus | — | — | false | Strategy requires strongest reasoning |
| CTO | opus | — | — | false | Architecture requires strongest reasoning |
| Senior Engineer | codex | sonnet | sonnet | false | Codex-first, Sonnet investigates and reviews |
| Junior Engineer | qwen-3.5 | — | codex | true | Local model produces, Codex reviews |
| PR Reviewer | sonnet | — | — | false | Review is the primary task, needs reasoning |
| Market Researcher | minimax-2.5 | — | sonnet | true | Local model for research synthesis, Sonnet validates |
| Cybersecurity Tester | sonnet | — | — | false | Security reasoning can't be delegated to weak models |

### Dispatch Flow

```
Job arrives for role "senior-engineer"
    │
    ▼
1. Read model_config from roles table
    │
    ▼
2. Does task require investigation phase?
   ├── Yes → Dispatch investigation phase on model_config.investigation (sonnet)
   │         → Investigation report feeds into implementation task
   └── No  → Continue
    │
    ▼
3. Is model_config.local_eligible AND host has a matching local model?
   ├── Yes → Dispatch on local model (free)
   └── No  → Dispatch on model_config.primary (codex)
    │
    ▼
4. Worker completes task
    │
    ▼
5. Does model_config.review_by exist?
   ├── Yes → Dispatch review phase on model_config.review_by (sonnet)
   │         → Review passes → Done
   │         → Review fails  → Re-dispatch or escalate
   └── No  → Done
```

### The Review Chain Pattern

The produce-review pattern is a **pipeline concern**, not a single-agent concern. When the orchestrator sees `review_by` in the model config, it automatically schedules a follow-up review job after the primary job completes. The worker doesn't know it's being reviewed — it just does its job and reports. The reviewer doesn't know who produced the work — it just reviews.

This is structurally cheaper than running everything on expensive models:
- Junior Engineer on Qwen (free/local) + Codex review (~$0.01/job) vs Sonnet for everything (~$0.10/job)
- Senior Engineer on Codex (~$0.01/job) + Sonnet review (~$0.05/job) vs Opus for everything (~$0.50/job)

### Transitional Note

The current `codex-delegate` skill pattern (where a Claude Code agent shells out to Codex) is a transitional implementation. In zazigv2, the orchestrator handles model routing natively at dispatch time — the skill becomes unnecessary because the architecture does the routing. During the transition period, both patterns may coexist.

### Future: Local Model Discovery

When local model support lands, the orchestrator will need a capability registry:

```jsonc
// machine_capabilities (reported via heartbeat)
{
  "machine_id": "toms-macbook",
  "local_models": [
    { "name": "qwen-3.5", "capabilities": ["code", "creative"], "context_window": 32768 },
    { "name": "minimax-2.5", "capabilities": ["research", "summarization"], "context_window": 65536 }
  ]
}
```

The orchestrator cross-references `model_config.local_models` with the host machine's reported capabilities. If there's a match, route locally. If not, fall back to `model_config.primary`. This may warrant its own design doc when implementation begins.

---

## Open Questions

Questions to resolve before implementation. Items marked **(Chris)** need Chris's input.

### 1. Heartbeat Schedule Ownership **(Chris)**

Who defines employee heartbeat schedules? Options:

- **A) Role config** — `heartbeat_schedule` field in the `roles` table (e.g., `"daily"`, `"hourly"`, `"every 5m"`). CTO/infra concern.
- **B) Operational config** — per-company override in a separate config table. Product concern.
- **C) Both** — role provides default, company can override.

Needs alignment on whether this is a platform decision (same for all zazig customers) or a per-company customization.

### 2. Lite Personality Dimension Selection

Who curates the 2-3 personality dimensions for employee roles?

- **A) Per-role in the personality table** — each role has `employee_dimensions: ["verbosity", "analysis_depth"]` hardcoded. Platform decision.
- **B) Per-company customizable** — company admins choose which dimensions matter for their PR Reviewer. Product-facing, needs UI eventually.
- **C) Auto-derived** — the orchestrator selects dimensions most relevant to the role's skill set. No human curation.

Current lean: **(A)** for launch, graduate to **(B)** when we have a company admin UI.

### 3. Employee Gateway Permissions Model

Scoped gateways need a permissions schema. Draft:

```jsonc
{
  "gateway_config": {
    "enabled": true,
    "platforms": ["twitter"],
    "operations": ["write"],       // read | write | read_write
    "rate_limit": "10/hour",
    "requires_approval": false     // if true, posts queue for exec approval
  }
}
```

Does this live in the `roles` table or a separate `gateway_permissions` table? Does the `requires_approval` flow route through the managing executive or through the founder?

### 4. Contractor Shared Memory Scope

When a contractor type accumulates shared memory across jobs, what's the scope?

- **A) Per-company** — a Cybersecurity Tester's shared memory is specific to one company's patterns
- **B) Cross-company** — the tester learns from all companies (better expertise, privacy implications)
- **C) Both** — per-company memory + anonymized cross-company patterns

This has privacy and marketplace implications. Per-company is safe for launch. Cross-company is the marketplace differentiator but needs careful design.

---

---

## Reference Material: Archetype & Doctrine Sources

Collected reference material for informing personality archetypes, doctrines, and engineering standards across roles. These are external sources to draw from during implementation — not zazig canon, but inputs that shape how we configure our workers.

### "YC Engineer" (Garry Tan, Y Combinator CEO)

Source: Garry Tan's engineering preferences for AI coding agents. Strong candidate for CTO personality dimensions and/or engineering doctrine layer.

**Plan Review Mode:**
- Review plans thoroughly before making code changes
- For every issue or recommendation: explain concrete tradeoffs, give an opinionated recommendation, ask for input before assuming a direction

**Priority Hierarchy (context compression):**
- Step 0 > Test diagram > Opinionated recommendations > Everything else
- Never skip Step 0 or the test diagram

**Engineering Preferences:**
- DRY is important — flag repetition aggressively
- Well-tested code is non-negotiable; rather have too many tests than too few
- Code should be "engineered enough" — not under-engineered (fragile, hacky) and not over-engineered (premature abstraction, unnecessary complexity)
- Err on the side of handling more edge cases, not fewer; thoughtfulness > speed
- Bias toward explicit over clever
- Minimal diff: achieve the goal with the fewest new abstractions and files touched

**Where this could land in the six layers:**
- **Personality (Layer 1):** Influences CTO dimensions — high analysis_depth, moderate risk_tolerance, high quality_bar
- **Doctrines (Layer 4):** Direct source for CTO engineering doctrines — each preference becomes a doctrine claim with reasoning
- **Skills (Layer 3):** The "Plan Review Mode" pattern could become a skill or skill section for code review roles

---

*Executives lead. Employees specialize. Contractors execute. Experts pair. The six layers — personality, role prompt, skills, doctrines, canons, memory — compose differently for each tier and mode, but the orchestrator assembles them all the same way: compile at dispatch, inject as prompt, agent never sees the config. Expert sessions add a fourth interaction mode — interactive, real-time, human-in-the-loop — that complements the autonomous pipeline. Model routing sits alongside this as an orchestrator-level concern — the right model for the right task, enforced at dispatch, invisible to the worker. This is zazig's organizational model.*
