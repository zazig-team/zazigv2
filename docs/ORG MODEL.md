# Zazig Org Model

**Date:** 2026-02-22
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
| Pipeline + Job Lifecycle | [`software-development-pipeline-design.md`](plans/2026-02-20-software-development-pipeline-design.md) |
| Messaging | [`agent-messaging-bidirectional.md`](plans/2026-02-22-agent-messaging-bidirectional.md) |

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
│     What they remember. Episodic context from past jobs,     │
│     learned patterns, project-specific knowledge.            │
│     Persists across jobs for workers with continuity.        │
│     → See: orchestration-server-design.md                    │
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
Position 9: Memory context              (what you remember)
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
| **Memory** | Persistent — episodic memory across all jobs |
| **Heartbeat** | Yes — autonomous, runs on a recurring cycle |
| **Gateway** | Yes — founders can talk to them directly (e.g., via Slack) |
| **Autonomy** | High — initiates work, not just responds to it |
| **Model tier** | Opus (execs require the strongest reasoning) |

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
| **Memory** | Persistent — learns from past jobs, builds expertise over time |
| **Heartbeat** | Yes — autonomous for routine tasks (review cycles, scheduled scans) |
| **Gateway** | No — executives manage them, founders don't engage directly |
| **Autonomy** | Moderate — runs routine work autonomously, also dispatched by execs |
| **Model tier** | Sonnet (capable reasoning, cost-efficient for volume) |

The key insight from Chris: **narrow-scope specialists with the right knowledge injected outperform generalists reasoning from first principles.** A dedicated PR reviewer with review doctrines and the team's engineering canon will produce better reviews than a CTO doing reviews as one of twelve responsibilities.

Employees have lite personality not for founder engagement (they have no gateway) but for **consistency** — a Senior Engineer's code style and commit messages should be recognizably "theirs" across jobs. A Market Researcher's daily digests should have a consistent analytical voice.

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
| **Memory** | None — stateless, no cross-job continuity |
| **Heartbeat** | No — not autonomous, dispatched per job |
| **Gateway** | No — no direct engagement |
| **Autonomy** | None — given a job, executes it, reports, gone |
| **Model tier** | Varies — Sonnet for reasoning-heavy, Codex for mechanical |

Contractors don't need personality because no one engages with them directly. They don't need memory because each job is self-contained. They don't need heartbeats because they aren't autonomous. What they *do* need is deep specialist knowledge — a Cybersecurity Tester with security doctrines + OWASP canons + pentest skills is far more effective than a generalist CTO running a security scan.

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
| **Memory** | Persistent | Persistent | None |
| **Heartbeat** | Yes | Yes | No |
| **Gateway** | Yes (Slack, etc.) | No | No |
| **Autonomy** | High | Moderate | None |
| **Managed by** | Founders | Executives | Dispatched per job |
| **Lifecycle** | Persistent (always-on) | Recurring (heartbeat cycles) | Ephemeral (spin up, execute, gone) |
| **Model** | Opus | Sonnet | Varies |
| **Identity continuity** | Strong | Moderate | None |

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
6. Load memory context (execs + employees only):
   ├── Exec:       Full episodic memory
   ├── Employee:   Full episodic memory
   └── Contractor: None
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

### Gateways

A gateway is a bidirectional communication channel between a worker and the outside world (founders, Slack, other platforms). Only executives have gateways.

Gateways are implemented via platform adapters (Supabase Edge Functions) that bridge external platforms to the orchestrator's message bus. The agent receives an opaque `conversationId` and replies via `MessageOutbound` — it never knows which platform it's talking to.

See: [`agent-messaging-bidirectional.md`](plans/2026-02-22-agent-messaging-bidirectional.md)

---

## Naming Conventions

Zazig deliberately avoids the term "agent" in its organizational model to prevent confusion with the broader AI ecosystem (Claude agents, Agent SDK, sub-agents in Claude Code). Instead:

| Zazig term | What it means | NOT this |
|------------|--------------|----------|
| **Executive** | Persistent, autonomous, full-identity leadership worker | Not "agent" (overloaded) |
| **Employee** | Recurring, specialist, lite-identity worker | Not "sub-agent" (Claude ecosystem term) |
| **Contractor** | Ephemeral, stateless, specialist-for-hire worker | Not "tool" or "function" |
| **Worker** | Generic term for any zazig AI entity across all tiers | — |
| **Gateway** | Bidirectional comms channel to external platforms | Not "chat" or "interface" |
| **Heartbeat** | Recurring autonomous execution cycle | — |

In implementation (code, database), the `roles` table uses `tier` to distinguish:

```sql
tier: 'exec' | 'employee' | 'contractor'
```

---

## Why Three Tiers, Not Two

The original architecture had two tiers: agents (with personality) and sub-agents (without). The three-tier model is better because:

1. **Employees need memory but not full identity.** A Senior Engineer benefits from remembering past code review feedback and project patterns, but doesn't need a founder-facing personality or a philosophy statement. Two tiers forces a binary choice — full identity or none — that doesn't reflect how real organizations work.

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

The knowledge architecture (v5) applies identically across all three tiers. Executives, employees, and contractors all benefit from doctrines and canons — the difference is scope, not mechanism. A CPO gets broad product doctrines across 5 lenses. A PR Reviewer gets deep code review doctrines in 1-2 lenses. A Cybersecurity Tester gets specialist security doctrines.

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
3. **Memory injection** — execs and employees get memory, contractors don't
4. **Gateway routing** — only execs have gateways
5. **Slot allocation** — contractors may use cheaper model tiers

The `roles` table gains a `tier` column. The `StartJob` payload already supports all the required fields — tier determines which fields are populated.

---

*Executives lead. Employees specialize. Contractors execute. The six layers — personality, role prompt, skills, doctrines, canons, memory — compose differently for each tier, but the orchestrator assembles them all the same way: compile at dispatch, inject as prompt, agent never sees the config. This is zazig's organizational model.*
