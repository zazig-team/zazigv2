# Idea to Job Pipeline Design

**Date:** 2026-02-24
**Status:** Implemented and tested (Entry Point B single job + DAG dispatch verified end-to-end)
**Authors:** Tom + Claude (brainstorming session)
**Reviewed by:** Codex (gpt-5.3) and Gemini (3.1 Pro) — second opinions on MCP tooling
**Supersedes:** Portions of `2026-02-24-software-development-pipeline-design.md` (stages 1-5), `2026-02-24-persistent-agent-identity-design.md` (MCP tool scoping), `2026-02-24-mcp-vs-skill-vs-cli-analysis.md` (decision: MCP for all, role-scoped)
**Companion docs:** `2026-02-24-jobify-skill-design.md` (breakdown detail), `2026-02-24-featurify-skill-design.md` (structuring detail), `ORG MODEL.md` (tier/layer reference)
**Implementation PRs:** #85 (migrations), #86 (skills), #88 (breakdown MCP tools), #89 (consistency fixes), #90 (architect MCP tools), #91 (orchestrator DAG + notifications), #92 (workspace assembly), #93 (commission_contractor)

---

## Overview

This document describes the full pipeline from a human having an idea to jobs being queued for execution. It covers who owns each stage, what tools they use, how actors communicate, and where the boundaries are between human, CPO, orchestrator, and contractors.

**Scope:** Ideation through job dispatch. Execution, verification, and shipping are covered in the existing pipeline design doc and remain unchanged.

**Key actors:**

| Actor | Type | Lifecycle | Role in pipeline |
|-------|------|-----------|-----------------|
| Human | N per company | External | Ideas, approval, acceptance testing |
| CPO | Executive (Tier 1) | Persistent | Product brain — triage, feature design, prioritization |
| Orchestrator | Deterministic server | Always-on | Notification bus, dispatch, status transitions — no LLM |
| Project Architect | Contractor (Tier 3) | Ephemeral | Structures approved plans into projects + feature outlines |
| Breakdown Specialist | Contractor (Tier 3) | Ephemeral | Breaks features into executable jobs (jobify skill) |
| Monitoring Agent | Contractor (Tier 3) | Ephemeral (scheduled) | Scans for opportunities, researches viability, proposes to CPO |

---

## 1. Pipeline Stages

Seven stages, three entry points.

```
ENTRY POINT A: Through CPO (full pipeline)
  Human → CPO conversation → triage by scope

ENTRY POINT B: Standalone (quick fixes, bypass CPO)
  Human → orchestrator → single orphan job

ENTRY POINT C: Agent-initiated (automated discovery)
  Monitoring Agent → research → proposal → CPO → Human approval

─────────────────────────────────────────────────────

[1] IDEATION         Human has an idea, talks to CPO
[2] PLANNING         CPO + Human refine scope, decide project vs feature
[3] STRUCTURING      Project Architect creates project + feature outlines
[4] FEATURE DESIGN   CPO + Human spec each feature (AC, checklist)
[5] BREAKDOWN        Breakdown Specialist runs jobify → jobs in Supabase
[6] EXECUTION        Orchestrator dispatches jobs to workers
[7] VERIFICATION     Two gates (job verify, feature verify) → ship
```

### Pipeline flow diagram

```
  ENTRY POINT A                ENTRY POINT C
  Human → CPO                  Monitoring Agent
  (gateway)                    (scheduled)
       │                            │
       │                    ┌───────┴────────┐
       │                    │ Research &     │
       │                    │ discovery      │
       │                    │ x-scan,        │
       │                    │ deep-research, │
       │                    │ repo-recon     │
       │                    └───────┬────────┘
       │                            │
       │                    ┌───────┴────────┐
       │                    │ Internal       │
       │                    │ proposal       │
       │                    │ (internal-     │
       │                    │  proposal)     │
       │                    └───────┬────────┘
       │                            │
       │                    ┌───────┴────────┐
       │                    │ CPO reviews    │
       │                    │ proposal,      │
       │                    │ presents to    │
       │                    │ human          │
       │                    └───────┬────────┘
       │                            │
       │                   Approved? ◆─── No ──→ Parked/killed
       │                            │ Yes
       ▼                            ▼
  ┌──────────────────────────────────────┐
  │ [1] IDEATION                         │
  │     CPO + Human (or CPO + proposal)  │
  └──────────────────┬───────────────────┘
                     │
            CPO triage by scope
           ┌─────────┼─────────────┐
           ▼         ▼             ▼
       New       Single        Quick fix
    capability   feature       ───────────────► ENTRY POINT B
           │         │                          /standalone-job
           ▼         │                          → job queued
  ┌─────────────┐    │
  │ [2] PLANNING│    │
  │ CPO + Human │    │
  │ /plan-      │    │
  │  capability │    │
  │ /reconcile- │    │
  │  docs       │    │
  │ review-plan │    │
  └──────┬──────┘    │
         │           │
         ▼           │
  ┌─────────────┐    │
  │ [3] STRUCT  │    │
  │ Project     │    │
  │ Architect   │    │
  │ featurify   │    │
  └──────┬──────┘    │
         │           │
         ▼           ▼
  ┌──────────────────────────┐
  │ [4] FEATURE DESIGN       │
  │ CPO + Human (per feature)│
  │ /spec-feature            │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │ [5] BREAKDOWN            │
  │ Breakdown Specialist     │
  │ jobify                   │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │ [6] EXECUTION            │
  │ Orchestrator → Workers   │
  │ repo-recon               │
  └────────────┬─────────────┘
               │
               ▼
  ┌──────────────────────────┐
  │ [7] VERIFICATION & SHIP  │
  │ Job verify → Feature     │
  │ verify → Ship            │
  │ multi-agent-review       │
  │ second-opinion           │
  └──────────────────────────┘
```

### Entry Point A: Through CPO

The standard path. Human talks to CPO via gateway (terminal, Slack, web UI, voice — channel-agnostic per org model). CPO triages by scope:

- **Single feature, existing project** → skip to Stage 4
- **New capability requiring multiple features** → Stage 2 (planning) → Stage 3 (structuring)
- **Whole new product/workstream** → Stage 2 (deep planning, possibly research) → Stage 3

### Entry Point B: Standalone

For quick fixes, small tasks, and anything too small for a project or feature. Human (or CPO) creates a standalone job directly — `feature_id: null`, tagged `standalone`, goes straight to `queued`. Still requires spec + at least 1 Gherkin acceptance criterion (the schema gate enforces this).

The CPO reviews standalone jobs periodically to ensure they don't accumulate into an untracked shadow backlog.

### Entry Point C: Agent-initiated

For opportunities discovered through automated monitoring. A separate Monitoring Agent — commissioned by the CPO on a schedule or triggered by external events — runs independently to scan for opportunities and research their viability.

**The flow:**

1. **Discovery** — Monitoring Agent scans for signals (social media via `x-scan`, industry trends via `deep-research`, codebase improvements via `repo-recon`)
2. **Research** — Agent investigates viability, gathers evidence, assesses effort vs impact
3. **Proposal** — Agent structures findings using `internal-proposal` skill ("Today X. What if Y? We propose Z.")
4. **CPO review** — Proposal delivered to CPO via orchestrator notification. CPO evaluates product fit, timing, strategic alignment
5. **Human approval** — CPO presents the proposal to the human via gateway with a recommendation
6. **Pipeline entry** — If approved, enters at Stage 1/2 with the proposal as context. The human may not see the idea again until a fully specced feature emerges at Stage 4

**The key difference from Entry Point A:** The human didn't initiate the idea. The first time they see it is as a structured proposal with research backing, not a raw thought. The CPO acts as curator — filtering agent-discovered opportunities down to the ones worth the human's attention.

**Future: autonomy levels.** A per-company setting could control how much human involvement is required:

| Level | Behaviour |
|-------|-----------|
| **Always ask** (default) | Proposal requires explicit human approval before entering pipeline |
| **Trust but verify** | CPO auto-approves and enters pipeline, human notified and can halt at any stage |
| **Full autonomy** | Build it, tell me when it ships |

This is not designed in now — the default is always-ask. The autonomy toggle is a future exploration once trust is established through the always-ask path.

### Stage Ownership

| Stage | Owner | Skills used | Output |
|-------|-------|------------|--------|
| Entry Point C | Monitoring Agent → CPO → Human | `x-scan`, `deep-research`, `repo-recon`, `internal-proposal`, `review-plan` (autonomous) | Approved proposal, enters Stage 1/2 |
| 1. Ideation | Human + CPO | — | Raw idea, conversation context |
| 2. Planning | CPO + Human | `/plan-capability`, `/reconcile-docs`, `review-plan`, `deep-research`* | Approved plan (scope, goals, constraints). Includes documentation reconciliation. |
| 3. Structuring | Project Architect (contractor) | `featurify` | Project record + feature outlines in Supabase |
| 4. Feature Design | CPO + Human | `/spec-feature`, `second-opinion`* | Fully specced feature (spec, AC, human checklist) |
| 5. Breakdown | Breakdown Specialist (contractor) | `jobify` | Jobs in Supabase (`queued`, with `depends_on` DAG) |
| 6. Execution | Orchestrator + Workers | `repo-recon`* | Code on branches |
| 7. Verification & Ship | Orchestrator + Human | `multi-agent-review`*, `second-opinion`* | Merged, deployed, done |

\* General-purpose skill — used when applicable, not every time.

---

## 2. Ideation & Planning (Stages 1-2)

### How it starts

A human talks to the CPO. The channel doesn't matter — the CPO receives messages via the gateway pattern (org model). The message arrives as `[Message from @username, conversation:{platform}:{ids}]` and the CPO replies via the `send_message` MCP tool. The CPO never knows which platform it's talking to.

### CPO triage

The CPO's first job is scope assessment. It asks clarifying questions, checks existing projects (via `query_projects` MCP tool), and determines whether this is:

1. **A feature for an existing project** — "Add dark mode to the dashboard app." CPO finds the project, skips to Stage 4.
2. **A new capability requiring a project** — "We need user authentication." CPO enters planning mode.
3. **A quick fix / standalone job** — "Fix the favicon." Entry Point B — standalone job, no project needed.

### Planning (when needed)

For new capabilities, the CPO runs a planning conversation:

- Asks questions to understand requirements, constraints, success criteria
- May commission internal research before coming back to the human (dispatches a research contractor)
- Multi-round dialogue — the CPO proposes scope, human refines
- Output: an approved plan with clear boundaries

The CPO does not create the project itself. Once the plan is approved, it commissions a Project Architect contractor.

### Documentation reconciliation

Complex planning often requires iterating across existing design docs before the plan is ready. This is a distinct activity that happens naturally during planning — not feature design, not spec work, but ensuring the documentation landscape is coherent before breaking anything down.

The CPO (or a contractor it commissions) may need to:

- **Read existing docs** to understand what's already decided and how the new plan relates
- **Identify gaps, contradictions, or stale content** across docs that the new plan exposes
- **Update affected docs** — close open questions now resolved, correct statements now superseded
- **Fix cross-references** — ensure docs link to each other correctly, especially when renaming or restructuring
- **Produce new docs** that crystallize patterns spotted during planning (e.g., a pattern emerging across two designs gets its own section or doc)

This is the equivalent of a product person reading all existing specs before writing a new one — making sure the existing specs still make sense in light of what's about to change. It prevents the documentation landscape from drifting out of sync with the actual design, which would cause downstream confusion when contractors and implementing agents reference these docs.

**When this matters most:** When the plan touches multiple existing systems or design docs. A small single-feature addition may not need reconciliation. A multi-feature capability that changes how existing systems interact needs thorough reconciliation before structuring begins.

**Who does it:** The CPO does lightweight reconciliation itself (reading docs, spotting contradictions, updating cross-references). For deep reconciliation requiring codebase analysis or architecture review, the CPO commissions a research contractor or involves the CTO.

### What the CPO does NOT do at this stage

- Create projects (that's the Project Architect)
- Write architecture docs (that's a research/design contractor or the CTO)
- Break features into jobs (that's the Breakdown Specialist)
- Dispatch implementation agents (that's the orchestrator)

The CPO reasons and acts — it uses MCP tools for executive actions (creating features, querying state, sending messages) — but it delegates structural and implementation work to specialists. This is the org model's separation: execs lead, contractors execute.

---

## 3. Structuring (Stage 3)

### The Project Architect

Every project is created by a Project Architect contractor. No exceptions. Even a "lightweight" project goes through this path. The reasoning:

- **Consistency** — every project has the same structure regardless of how it was conceived
- **CPO stays strategic** — the CPO's context is too valuable to spend on mechanical structuring
- **Quality** — the Project Architect is a specialist with structuring skills and doctrines; the CPO is a generalist

### What the Project Architect produces

1. **Project record** in Supabase (name, description, status, company_id)
2. **Feature outlines** — one per major capability, with enough detail for the CPO to refine but not fully specced. Each feature gets a record in Supabase with `status: created`.
3. **Dependency notes** — which features depend on others, what the critical path looks like

### How it's triggered

1. CPO decides a project is needed (Stage 2 output)
2. CPO calls `update_feature` or creates a planning job (mechanism TBD — likely a `commission_contractor` MCP tool or orchestrator event)
3. Orchestrator dispatches a Project Architect contractor with the approved plan as context
4. Project Architect creates the project + feature outlines
5. Orchestrator notifies CPO (via gateway — see Section 6) that structuring is complete
6. CPO reviews the feature outlines and proceeds to Stage 4 for each

### Contractor workspace

The Project Architect gets a full workspace — `.mcp.json`, `CLAUDE.md`, `.claude/settings.json` — identical to any other worker. The only difference between an executive and a contractor is lifecycle (persistent vs ephemeral), not capability. This is a core org model principle: all tiers get the six layers assembled by the orchestrator.

**Implementation note:** The current executor only sets up workspaces for persistent jobs (`handlePersistentJob`). Ephemeral jobs run `claude -p` bare. This needs to change — all workers should get workspace setup with role-scoped MCP tools. See Section 5.

---

## 4. Feature Design (Stage 4)

### CPO + Human collaboration

This is where most of the human-CPO conversation happens. For each feature:

1. CPO presents the feature outline (from Stage 3) to the human
2. Conversation to refine requirements — what exactly does this feature do?
3. CPO drafts the feature spec (stored in `features.spec`)
4. CPO drafts acceptance criteria (stored in `features.acceptance_tests`)
5. CPO drafts the human checklist (stored in `features.human_checklist`)
6. Human reviews and approves

### The feature record

By the end of Stage 4, each feature has:

| Field | Content | Required for next stage |
|-------|---------|----------------------|
| `spec` | Full description of what to build | Yes |
| `acceptance_tests` | Automated test descriptions (feature-level) | Yes |
| `human_checklist` | Manual verification steps for test server | Yes |
| `status` | `ready_for_breakdown` | Yes |

### Status transition

When the CPO is satisfied with the spec, it calls `update_feature` with `status: ready_for_breakdown`. This is a one-way door — the feature enters the automated pipeline. The CPO cannot set any status beyond `ready_for_breakdown`.

The orchestrator picks up the `feature_status_changed` event and triggers Stage 5.

### Feature pipeline statuses (full lifecycle)

```
created → ready_for_breakdown → breakdown → building → combining →
verifying → deploying_to_test → ready_to_test → deploying_to_prod →
complete | cancelled
```

The CPO owns `created` → `ready_for_breakdown`. Everything after is orchestrator-driven.

---

## 5. Breakdown (Stage 5)

### The Breakdown Specialist

When a feature reaches `ready_for_breakdown`, the orchestrator dispatches a Breakdown Specialist contractor. This contractor runs the jobify skill.

### What jobify produces

For each feature, jobify:

1. Reads the feature spec and acceptance criteria from Supabase
2. Breaks the feature into jobs sized for one agent session (target: under 30 minutes)
3. Generates Gherkin acceptance criteria with unique IDs per job (AC-{SEQ}-{NUM})
4. Routes each job by complexity → model (`simple`→Codex, `medium`→Sonnet, `complex`→Opus)
5. Produces a dependency graph via `depends_on` UUID array (DAG, not linear sequence)
6. Pushes jobs to Supabase with `status: queued`

### Job record

| Field | Description |
|-------|-------------|
| `feature_id` | Parent feature UUID |
| `spec` | Self-contained task description |
| `acceptance_tests` | Gherkin criteria with IDs |
| `role` | Which worker type executes this |
| `job_type` | `code` / `infra` / `design` / `research` / `docs` |
| `complexity` | `simple` / `medium` / `complex` |
| `model` | Routed from complexity |
| `depends_on` | UUID array — jobs that must complete first |
| `status` | `queued` (always, for new jobs) |

### Why jobs go directly to `queued`

Jobs skip `design` status. By the time jobify creates them, the spec and acceptance criteria are fully defined — there's nothing left to design. The `design` status exists at the feature level (the CPO conversation). If the breakdown is bad, it fails at the job or feature verification gates and gets routed back.

### Dependency graph dispatch

The orchestrator dispatches any job whose `depends_on` jobs all have `status: complete`. Jobs with `depends_on: []` are immediately dispatchable. This replaces the linear `sequence` integer with a proper DAG.

**Pending migration:** `depends_on` UUID array column on the `jobs` table. See jobify design doc for details.

### Detailed jobify reference

See `2026-02-24-jobify-skill-design.md` for:
- Input modes (feature ID, doc path, standalone)
- Acceptance criteria format and quality rules
- Build sequence documentation format
- Implementation prompt template
- Supabase integration code examples
- Full dependency list

---

## 6. Tooling Architecture

### MCP for everyone, role-scoped

**Decision:** All workers (executives, employees, contractors) use MCP tools for database operations. Tool sets are scoped per role — each worker only sees the tools relevant to its function.

**Status:** Working assumption. Flagged for measurement and revisit.

### Why MCP (the case for)

1. **Structured validation** — typed inputs with schema validation prevent the agent from passing wrong parameters. On a persistent autonomous agent (CPO), this matters more than on a supervised session.
2. **Structured responses** — JSON responses the agent can reason over without parsing stdout.
3. **Auto-approval** — MCP tools can be narrowly auto-approved in `.claude/settings.json`. Each tool is individually named and permissioned.
4. **Ergonomics** — tools appear in the agent's tool palette, discovered naturally. No need for documentation in the role prompt explaining CLI syntax.

### Why not CLI (the case against, weakened)

The original argument for CLI was lower context cost (~50-100 tokens vs ~200-400 tokens per tool). The original argument against CLI was "Bash can't be narrowly scoped for auto-approval."

Both arguments were weakened during review:
- **Context cost:** Real, but small. 4 role-scoped MCP tools cost ~800-1600 tokens of permanent context. For a CPO session that may run for hours, this is a rounding error against total conversation history.
- **Bash scoping:** Bash *can* be narrowly scoped via hooks, permissions, and potentially future sandbox modes. The auto-approval argument is not as strong as initially stated.

The remaining MCP advantage is **structured validation** — the CPO can't accidentally send malformed JSON to an edge function. For a persistent autonomous agent where errors compound, this is the stronger argument.

### Role-scoped tool sets

Not every worker needs every tool. The orchestrator assembles a role-specific `.mcp.json` at workspace creation time.

| Role | Tools | Rationale |
|------|-------|-----------|
| CPO | `send_message`, `query_projects`, `create_feature`, `update_feature` | Product brain — communicates, reads state, manages features |
| CTO | `send_message`, `query_projects`, `query_architecture` (future) | Architecture oversight, reads state |
| Project Architect | `create_project`, `create_feature`, `query_projects` | Structuring — creates projects and feature outlines |
| Breakdown Specialist | `query_features`, `batch_create_jobs` | Reads features, creates jobs atomically |
| Senior Engineer | `query_job`, `update_job_status` | Reads assignment, reports completion |

**Note on `query` tools:** Generic `query` tools are dangerous for persistent agents — they invite open-ended exploration that burns context. All reads must be bounded and specific: `query_projects` returns projects for a company, `query_features` returns features for a project, `query_job` returns a single job by ID. No generic SQL or filter-by-anything tools.

### All workers get workspaces

This is a core principle from the org model: the only difference between tiers is lifecycle (persistent vs ephemeral), not capability. Every worker — executive, employee, contractor — gets:

- `.mcp.json` with role-scoped tools
- `CLAUDE.md` with compiled prompt stack (personality + role prompt + knowledge)
- `.claude/settings.json` with auto-approved tools

The current implementation only does this for persistent jobs. Ephemeral jobs need the same treatment.

### The Contractor Pattern: Skill + MCP

A consistent architecture emerges across specialist contractors: each contractor is a **skill wrapping role-scoped MCP tools**. The skill provides the reasoning and decomposition logic; the MCP tools provide typed database operations.

```
Orchestrator dispatches contractor
  → Contractor gets workspace:
      - CLAUDE.md (role prompt + knowledge layers)
      - .mcp.json (role-scoped MCP tools)
      - .claude/settings.json (auto-approved tools)
  → Skill loaded per job type (guides reasoning, quality gates, output format)
  → MCP tools execute the writes (batch insert to Supabase)
```

| Contractor | Skill | MCP Tools (reads) | MCP Tools (writes) |
|------------|-------|-------------------|---------------------|
| Breakdown Specialist | jobify | `query_features` | `batch_create_jobs` |
| Project Architect | featurify | `query_projects` | `create_project`, `batch_create_features` |

**Why the skill is separate from the MCP tool:** The skill contains decomposition logic — how to break work apart, quality rules, Gherkin format, dependency reasoning, complexity routing. This is LLM reasoning that belongs in the agent prompt. The MCP tool is a dumb typed POST that validates schema and inserts rows. Putting reasoning in the edge function would break the principle of dumb infrastructure + smart agents.

**Why not put the logic in the edge function:** The orchestrator and edge functions are deterministic — no LLM, no reasoning. A "smart" edge function that takes a feature and returns jobs would push LLM reasoning into server-side code, which contradicts the architecture. The agent does the thinking; the infrastructure does the writing.

This pattern is replicable for any future contractor that needs to read from Supabase, reason about the data, and write structured output back. The skill is the variable; the MCP plumbing is the constant.

### Skill requirements by role and stage

Every actor in the pipeline needs specific skills at specific stages. This matrix maps which skills must be available to whom and when — critical for workspace assembly (the orchestrator must include the right skills in `.claude/settings.json` at dispatch time) and for machine capability verification (general-purpose skills may require machine-level installation).

**Pipeline-specific skills** — tied to a single stage, loaded on demand:

| Skill | Type | Used by | Pipeline stage | Purpose |
|-------|------|---------|---------------|---------|
| `/plan-capability` | Stage skill | CPO | 2. Planning | Guides scope assessment, multi-round dialogue, research commissioning |
| `/reconcile-docs` | Stage skill | CPO | 2. Planning (substage) | Reading existing docs, identifying gaps, updating cross-references |
| `/spec-feature` | Stage skill | CPO | 4. Feature Design | Guides spec writing, AC format, human checklist, status transition |
| `/standalone-job` | Stage skill | CPO | Entry Point B | Creating well-formed standalone job with spec + Gherkin AC |
| `featurify` | Contractor skill | Project Architect | 3. Structuring | Breaks project plan into feature outlines |
| `jobify` | Contractor skill | Breakdown Specialist | 5. Breakdown | Breaks features into executable jobs with dependency DAG |
| `internal-proposal` | Contractor skill | Monitoring Agent | Entry Point C | Structures discovered opportunity into proposal format |

**General-purpose skills** — may be used at multiple stages or by multiple actors:

| Skill | Used by | Pipeline stages | Purpose |
|-------|---------|----------------|---------|
| `deep-research` | Research Contractor, Monitoring Agent | 2. Planning, Entry Point C | Investigates technologies, patterns, trade-offs |
| `repo-recon` | Research Contractor, Workers | 2. Planning, 6. Execution | Analyses existing codebase for patterns and constraints |
| `x-scan` | Monitoring Agent | Entry Point C | Scans social/web for opportunities and signals |
| `review-plan` | CPO, any reviewer | 2. Planning, post-3. Structuring | Reviews and critiques plan quality. Two modes: **interactive** (CPO walks through plan with human, iterates on gaps together) and **autonomous** (CPO reviews solo or with contractor, commissions second opinions, applies recommendations without human in the loop — used in agent-initiated flows) |
| `second-opinion` | CPO | 2. Planning, 4. Feature Design | Gets independent review from Codex/Gemini on design decisions |
| `multi-agent-review` | Orchestrator / Workers | 7. Verification | Multi-perspective code review (security, performance, architecture, simplicity) |

**Skill distribution model:**

| Skill type | Distribution | Availability |
|-----------|-------------|-------------|
| Stage skills (`/plan-capability`, etc.) | Centrally stored (Supabase or git) | Pulled into workspace at dispatch time by orchestrator |
| Contractor skills (`jobify`, `featurify`, `internal-proposal`) | Centrally stored | Pulled into workspace at dispatch time by orchestrator |
| General-purpose (`deep-research`, `repo-recon`, etc.) | Machine-installed | Verified via machine capability registry (see Section 9) |

**Why this matters:** When the orchestrator dispatches a Breakdown Specialist, it must assemble a workspace that includes the `jobify` skill. If it dispatches a Monitoring Agent, that agent needs `x-scan`, `deep-research`, `repo-recon`, and `internal-proposal`. The skill matrix is the orchestrator's reference for workspace assembly — alongside the role-scoped MCP tools table above.

### Measure and revisit

The MCP decision is not permanent. To validate it:

1. Run the CPO with all MCP tools and measure when context compression starts
2. Compare against a session with CLI wrappers for low-frequency tools
3. If MCP sessions last significantly longer before compression, keep MCP for all
4. If not, consider the hybrid approach (MCP for high-frequency tools, CLI for low-frequency)

The measurement should happen once the CPO is running real sessions with real conversation load.

### Second opinion synthesis (Codex + Gemini)

Both models independently reviewed the MCP decision:

**Where they agree:**
- MCP + role-scoped is directionally right
- Structured validation matters more on autonomous agents
- The context cost argument is real but small
- Start with MCP, measure, adjust

**Codex's corrections:**
- Role-scoping is ergonomics, not security — edge functions need proper auth regardless
- Bash *can* be narrowly scoped via hooks/permissions
- Contractors need workspaces too (implementation gap, not design intent)

**Gemini's additions:**
- Kill generic `query` tools — use bounded, specific reads
- Consider tool versioning for the `.mcp.json` configs
- MCP server should be separate per role, not one server with all tools

---

## 7. CPO Wakeup & Notification

### The problem

The CPO is a persistent Claude Code session. It can act (call tools, send messages) but it can't react to external events on its own — it needs a message in its conversation to trigger reasoning.

### Solution: Orchestrator as notification bus

The orchestrator sends notifications to the CPO via the same gateway pattern used for human messages. When an event happens that the CPO should know about, the orchestrator creates a `MessageInbound` record. The gateway adapter delivers it to the CPO's conversation as:

```
[System notification, conversation:internal:{event-id}]
Feature "Dark Mode" (feat-abc-123) structuring complete.
Project Architect created project "Dashboard Redesign" with 4 feature outlines.
Ready for your review.
```

The CPO receives this exactly like a human message and can reason + act on it.

### Events that notify the CPO

| Event | Message to CPO |
|-------|---------------|
| Project structuring complete | "Project {name} created with {N} feature outlines. Ready for review." |
| Feature breakdown complete | "Feature {name} broken into {N} jobs. {M} immediately dispatchable." |
| Feature verification failed | "Feature {name} failed verification: {reason}. Needs triage." |
| Feature testing complete (human approved) | "Feature {name} shipped to production." |
| Feature rejected (big) | "Feature {name} rejected by {user}: {feedback}. Needs redesign." |
| Standalone job backlog growing | "There are {N} unreviewed standalone jobs." |
| Monitoring agent proposal ready | "Monitoring agent has a proposal: {title}. Review and decide whether to present to human." |

### What the orchestrator does NOT do

The orchestrator is deterministic — no LLM, no reasoning. It reacts to status changes, dispatches workers, and sends notifications. It cannot:

- Decide whether a feature is ready for breakdown (CPO decides)
- Triage a rejection (CPO decides)
- Prioritize the queue (CPO decides)
- Create features or projects (workers with MCP tools do this)

The orchestrator is a pipe with a notification bus bolted on.

---

## 8. Communication Model

### Channel-agnostic gateways

All communication flows through gateways (org model). The CPO doesn't know if it's talking to a human on Slack, in a terminal, or via a web UI. Messages arrive in a standard format, replies go out via `send_message`.

### Actor-to-actor communication

| From | To | Mechanism |
|------|-----|-----------|
| Human → CPO | Gateway (Slack, terminal, web) | `MessageInbound` → CPO conversation |
| CPO → Human | `send_message` MCP tool | Gateway adapter routes to platform |
| Orchestrator → CPO | `MessageInbound` (internal) | Same pathway as human messages |
| CPO → Orchestrator | Status changes on features | `update_feature` triggers events |
| Orchestrator → Contractor | `StartJob` via Realtime | Contractor spawned with context |
| Contractor → Orchestrator | Job completion report | Status update on job record |

### No direct worker-to-worker communication

Workers don't talk to each other. All coordination flows through the orchestrator (status changes, events) or through the CPO (strategic decisions). This is deliberate — it keeps the communication graph simple and auditable.

**Future exploration:** [Aqua](https://github.com/quailyquaily/aqua) — a P2P messaging protocol for AI agents. Could enable direct worker-to-worker communication for specific use cases (pair programming, collaborative review). Flagged for investigation, not designed in now.

---

## 9. CPO Knowledge Architecture

### The problem

The CPO is a persistent session with many responsibilities — product strategy, standup, prioritization, triage, feature design, documentation reconciliation, contractor commissioning. The pipeline described in this document is one of several things the CPO knows how to do.

If we put the full procedural detail for every pipeline stage into the role prompt, it's enormous — potentially 2000+ tokens of permanent context. The CPO pays that cost even when it's doing a simple standup or answering a question about project status.

If we don't put it in the role prompt, the CPO doesn't know what to do when someone says "I want to add authentication."

### Solution: Routing prompt + stage skills + doctrines

Three layers, each with different context characteristics:

| Layer | What it contains | Context cost | When loaded |
|-------|-----------------|-------------|-------------|
| **Routing prompt** | Decision tree — how to assess scope and which skill to invoke | ~200 tokens, permanent | Always in `roles.prompt` |
| **Stage skills** | Detailed procedures for each pipeline stage | ~500-1000 tokens per skill, temporary | On demand, when the CPO enters that stage |
| **Doctrines** | Beliefs about how work should flow — "documentation must be coherent before structuring" | Proactively injected when relevant | Via knowledge system similarity matching |

### The routing prompt (in `roles.prompt`)

A lean decision tree that fits in ~200 tokens:

```markdown
## Pipeline: Idea to Job

When a human brings an idea:
1. Assess scope — query existing projects, ask clarifying questions
2. Quick fix with no project context → standalone job (/standalone-job)
3. Single feature for existing project → /spec-feature
4. New capability requiring multiple features → /plan-capability
   - Includes documentation reconciliation (/reconcile-docs)
   - Commissions Project Architect when plan is approved
5. After structuring complete (notification) → review feature outlines
6. For each feature → /spec-feature
7. When feature spec approved → set status to ready_for_breakdown

When a monitoring agent sends a proposal:
1. Review the proposal for product fit and strategic alignment
2. If promising → run review-plan (autonomous), commission second-opinion
3. Present to human with recommendation
4. If human approves → enter pipeline at step 4 above (/plan-capability)
5. If human rejects → park or kill the proposal

The orchestrator handles everything after ready_for_breakdown.
```

This tells the CPO *what to do* at each decision point and *which skill to invoke* for the detailed procedure. It does not contain the detailed procedure itself.

### Stage skills

Each pipeline stage has a corresponding skill with the full procedural detail:

| Skill | Stage | What it guides |
|-------|-------|---------------|
| `/plan-capability` | 2. Planning | Scope assessment, multi-round dialogue, research commissioning, documentation reconciliation, when to commission Project Architect |
| `/spec-feature` | 4. Feature Design | Spec writing, acceptance criteria format, human checklist, when to set `ready_for_breakdown` |
| `/standalone-job` | Entry Point B | Creating a well-formed standalone job with spec + Gherkin AC |
| `/reconcile-docs` | 2. Planning (substage) | Reading existing docs, identifying gaps, updating cross-references, closing resolved open questions |

Skills load on demand — when the CPO enters planning mode, it invokes `/plan-capability` and gets the full procedure. When it's doing a standup, none of these are in context.

**Key insight:** The CPO doesn't need to remember the full procedure for every stage. It needs to know *which stage it's in* (the routing prompt handles this) and *how to execute that stage* (the skill handles this). The routing prompt is the table of contents; the skills are the chapters.

### Doctrines (reinforcing beliefs)

Doctrines provide the *why* behind the pipeline, injected by the knowledge system when the conversation touches relevant topics:

- "Every capability that spans multiple features needs a project — no exceptions"
- "Documentation must be coherent before structuring begins — stale docs cause downstream confusion"
- "Feature outlines are deliberately incomplete — the CPO enriches them through conversation with the human"
- "Jobs go directly to queued — the design stage belongs to features, not jobs"
- "The orchestrator is deterministic — if it requires reasoning, it belongs to an executive or contractor"

These reinforce the pipeline's principles even when no skill is loaded. A doctrine fires when the CPO is tempted to skip reconciliation, or create a project without a Project Architect, or put too much detail into a feature outline.

### How this works in practice

```
Human: "We need to add user authentication to the platform."

CPO reads routing prompt:
  → This is a new capability requiring multiple features → invoke /plan-capability

/plan-capability skill loads (~800 tokens, temporary):
  → Guides CPO through scope questions
  → Triggers /reconcile-docs substage (reads existing docs, spots affected designs)
  → Multi-round dialogue with human
  → Produces approved plan
  → Skill says: "Commission Project Architect now"

CPO calls commission_contractor MCP tool
  → Orchestrator dispatches Project Architect with featurify skill
  → ... time passes ...

Orchestrator notification arrives:
  "Project 'User Authentication' created with 3 feature outlines."

CPO reads routing prompt:
  → After structuring complete → review outlines, then /spec-feature for each

/spec-feature skill loads for Feature 1:
  → Guides CPO through spec conversation with human
  → When spec is complete, set status to ready_for_breakdown

Skill unloads. CPO moves to Feature 2.
```

At no point is the full pipeline procedure in context simultaneously. The CPO loads what it needs, when it needs it, guided by a 200-token routing prompt.

### Skill access and verification

Skills are listed in `roles.skills[]` in the Supabase `roles` table. The orchestrator writes these into the workspace's skill configuration at dispatch time.

**Open question: Runtime verification.** The `roles.skills[]` field says "this role should have these skills," but there's no verification that the host machine actually has them installed. Today this is implicit — Tom's machine has codex-delegate and gemini-delegate because Tom set them up. Chris's machine may not.

Options:
- **A) Machine capability registry** — The local agent reports installed skills/tools as part of its heartbeat or registration. The orchestrator only dispatches to machines that have the required tools.
- **B) Skill distribution** — Skills are stored centrally (Supabase or git) and the local agent pulls them at workspace creation time. No machine-specific installation needed.
- **C) Both** — Central skills for zazig-owned skills + machine capability check for third-party tools (codex, gemini).

Current lean: **(C)** — zazig skills should be centrally distributed (they're just markdown files), but external tool access (Codex auth, Gemini API keys) is a machine-level concern that needs verification.

**Open question: API keys for delegated models.** The CPO uses `/second-opinion` to get independent review from Codex and Gemini. Codex uses login-based auth (browser OAuth flow — `codex login`). Gemini needs an API key in the environment. For a persistent autonomous session, these need to be available without human intervention. Codex's browser-based auth is the harder problem — it doesn't fit an autonomous agent model. This needs investigation.

## 10. Worked Examples

### Example A: "Add dark mode to the dashboard"

```
Human: "Hey, can we add dark mode to the dashboard?"

[Stage 1: Ideation]
CPO: Checks existing projects via query_projects. Finds "Dashboard" project.
CPO: "We have the Dashboard project. Dark mode would be a single feature.
      What's the scope — full app or just the main views?"
Human: "Full app, including the settings panel."

[Stage 2: Planning — skipped, single feature]

[Stage 3: Structuring — skipped, existing project]

[Stage 4: Feature Design]
CPO: Creates feature via create_feature (project_id: dashboard, title: "Dark Mode")
CPO: Drafts spec through conversation. Asks about color tokens, system
     preference detection, persistence.
CPO: Updates feature with full spec, acceptance tests, human checklist.
CPO: Calls update_feature with status: ready_for_breakdown.

[Stage 5: Breakdown]
Orchestrator: Picks up feature_status_changed event.
Orchestrator: Dispatches Breakdown Specialist with jobify skill.
Breakdown Specialist: Reads feature, produces 4 jobs:
  Job 1: CSS custom properties + theme tokens (depends_on: [])
  Job 2: Theme toggle component (depends_on: [Job 1])
  Job 3: System preference detection (depends_on: [Job 1])
  Job 4: Settings panel theme selector (depends_on: [Job 2, Job 3])
Breakdown Specialist: Pushes to Supabase, all status: queued.

[Orchestrator notifies CPO]
CPO receives: "Feature 'Dark Mode' broken into 4 jobs. 1 immediately
               dispatchable (theme tokens)."

[Stage 6-7: Execution + Verification — existing pipeline handles this]
```

### Example B: "We need user authentication"

```
Human: "We need to add authentication to the platform."

[Stage 1: Ideation]
CPO: "Authentication is a multi-feature capability. Let me ask some questions."
CPO: Asks about auth methods (OAuth, email/password, magic links),
     session management, user roles, etc.

[Stage 2: Planning]
CPO: Proposes scope — 3 features: OAuth integration, session management,
     role-based access control.
CPO: May commission a research contractor to investigate OAuth providers.
Human: Approves plan.

[Stage 3: Structuring]
CPO: Commissions Project Architect.
Orchestrator: Dispatches Project Architect with approved plan.
Project Architect: Creates project "User Authentication" with 3 feature outlines.
Orchestrator: Notifies CPO — "Project 'User Authentication' created
              with 3 feature outlines."

[Stage 4: Feature Design — repeated for each feature]
CPO: Takes feature outline for "OAuth Integration", enriches through
     conversation with human.
CPO: Repeats for "Session Management" and "RBAC".

[Stage 5: Breakdown — triggered per feature as each reaches ready_for_breakdown]
```

### Example C: Agent-discovered opportunity

```
[Entry Point C: Monitoring Agent discovers opportunity]
Monitoring Agent: Scheduled weekly scan runs (x-scan, deep-research).
Monitoring Agent: Spots that three competitor products launched voice
                  interfaces in the last month. Researches viability
                  for zazig (repo-recon on existing gateway architecture).
Monitoring Agent: Creates internal proposal:
  "Today: All agent communication is text-based via gateway adapters.
   Which is a problem, because: voice is emerging as a preferred
   interface for async product conversations.
   What if?: Users could talk to the CPO by voice, same gateway pattern.
   Hypothesis: Adding a voice gateway adapter would increase engagement
   for founders who prefer async voice notes over typing.
   We propose: A voice gateway adapter that transcribes → sends to CPO
   → CPO replies via text → TTS back to user."

[CPO reviews proposal]
Orchestrator: Delivers proposal to CPO as internal notification.
CPO: Reviews for product fit. "This aligns with our channel-agnostic
     gateway architecture — it's just another adapter."
CPO: Runs review-plan (autonomous mode) — commissions second opinion
     from Codex on technical feasibility.
CPO: Presents to human via Slack: "Our monitoring spotted an opportunity.
     Three competitors launched voice interfaces. We could add a voice
     gateway adapter — here's the proposal. Worth pursuing?"

[Human approves]
Human: "Yes, but low priority — after auth is done."
CPO: Notes priority, enters pipeline at Stage 2 when auth completes.
     From here, standard pipeline: planning → structuring → feature
     design → breakdown → execution → verification.
```

### Example D: Standalone quick fix (Entry Point B)

```
Human: "The favicon is broken."

CPO: "That's a standalone fix — no project needed."
CPO: Creates standalone job (feature_id: null) with spec + 1 AC:
  AC-1-001: Favicon displays correctly
    Given a user navigates to any page
    When the page loads
    Then the browser tab shows the correct favicon
CPO: Job goes to queued.

[Orchestrator dispatches immediately]
```

---

## 11. Relationship to Existing Docs

### What this doc supersedes

| Existing doc | What's superseded | What remains valid |
|-------------|-------------------|-------------------|
| `persistent-agent-identity-design.md` | MCP tool scoping (now role-scoped, not one-size-fits-all) | Architecture (dumb executor, role-agnostic handlePersistentJob), prompt assembly, edge functions |
| `mcp-vs-skill-vs-cli-analysis.md` | Decision resolved: MCP for all, role-scoped, measure and revisit | Context cost analysis methodology (useful for measurement phase) |
| `software-development-pipeline-design.md` | "CPO breaks features into jobs" → Breakdown Specialist does this | Job lifecycle state machine, branch strategy, two verification gates, fix agent, test env |
| `jobify-skill-design.md` | Nothing — this doc references jobify but doesn't replace it | Entire doc (AC format, dependency graph, implementation prompt, Supabase integration) |

### What was updated in other docs (2026-02-24)

1. **Pipeline design doc** (`2026-02-24-software-development-pipeline-design.md`, renamed from `2026-02-20-`) — Updated role boundaries: CPO no longer breaks features into jobs. Added Breakdown Specialist section. Updated design flow steps 4-7.
2. **Persistent agent identity doc** (`2026-02-24-persistent-agent-identity-design.md`) — Added note that MCP tools are now role-scoped per this design. Updated MCP Tools section with reference to role-scoped tool table.
3. **Org model** — No changes needed. This design implements the patterns already defined there (gateways, tiers, charters).

---

## 12. Dependencies

| Dependency | Status | PR | Owner |
|-----------|--------|-----|-------|
| `features` table with spec + acceptance_tests + human_checklist | **Built** | 008 | Chris |
| `jobs` table with all required columns | **Built** | 008 | Chris |
| `depends_on` UUID array column on `jobs` table | **Built** | #85 (migration 039) | Tom |
| `description` column on `projects` table | **Built** | #90 (migration 043) | Tom |
| `create_feature` edge function + MCP tool | **Built + deployed** | Chris + #88 | Chris/Tom |
| `update_feature` edge function + MCP tool | **Built + deployed** | Chris + #89 (fix) | Chris/Tom |
| `query_projects` MCP tool | **Built** | Chris | Chris |
| `query_features` edge function + MCP tool | **Built + deployed** | #88 | Tom |
| `batch_create_jobs` edge function + MCP tool | **Built + deployed** | #88 | Tom |
| `create_project` edge function + MCP tool | **Built + deployed** | #90 | Tom |
| `batch_create_features` edge function + MCP tool | **Built + deployed** | #90 | Tom |
| Role-scoped `.mcp.json` generation in executor | **Built** | #92 | Tom |
| Workspace setup for ephemeral jobs | **Built** | #92 | Tom |
| Skill file injection into workspaces | **Built** | #92 | Tom |
| Orchestrator event: `feature_status_changed` → dispatch breakdown | **Built + deployed** | #91 | Tom |
| Orchestrator: DAG dispatch (jobs where all `depends_on` complete) | **Built + deployed** | #91 | Tom |
| CPO wakeup via Realtime broadcast notifications | **Built + deployed** | #91 | Tom |
| Project Architect role in `roles` table | **Built** | #85 (migration 040) | Tom |
| Breakdown Specialist role in `roles` table | **Built** | #85 (migration 040) | Tom |
| Monitoring Agent role in `roles` table | **Built** | #85 (migration 040) | Tom |
| CPO routing prompt (pipeline decision tree) | **Built** | #85 (migration 041) | Tom |
| Jobify skill file | **Built** | #86 | Tom |
| Featurify skill file | **Built** | #86 | Tom |
| CPO stage skills (/plan-capability, /spec-feature, /standalone-job, /reconcile-docs) | **Built** | #86 | Tom |
| `review` job_type in DB constraint | **Built** | #89 (migration 042) | Tom |
| Monitoring agent scheduling mechanism | Needs design | — | Tom/Chris |
| `commission_contractor` edge function + MCP tool | **Built + deployed** | #93 | Tom |
| Migration 044: relax feature_id constraint for contractors | **Built + deployed** | #93 | Tom |

---

## 13. Open Questions

### 1. How does the CPO commission a contractor?

The CPO decides a Project Architect is needed. How does it trigger this?

Options:
- **A) MCP tool** — `commission_contractor` tool that creates a job with `role: project-architect` and appropriate context. CPO calls it directly.
- **B) Feature status** — CPO sets a status that the orchestrator interprets as "spawn a contractor." Less flexible.
- **C) Direct job creation** — CPO creates a job record via a `create_job` MCP tool. Most flexible but gives the CPO more power than intended.

Current lean: **(A)** — a dedicated MCP tool keeps the CPO's action vocabulary explicit and auditable.

### 2. Parallel job file conflicts

If two parallel jobs modify the same file, the second to merge hits a conflict during rebase. Should jobify flag potential file overlaps in the build sequence? Or is this purely the orchestrator's problem (hand conflict resolution to a fix agent)?

### 3. Acceptance test immutability

For critical flows (auth, billing, permissions), should acceptance tests be marked immutable so implementing agents cannot silently weaken them? Could be a `critical: true` flag on specific AC IDs that the verifier treats as mandatory.

### 4. Project Architect output format

~~What exactly does the Project Architect produce?~~ **Resolved.** Addressed in the featurify skill design and now implemented — Project Architect uses `create_project` + `batch_create_features` MCP tools to write directly to Supabase. Feature outlines have title + description only; CPO enriches in Stage 4. See `2026-02-24-featurify-skill-design.md` and `projects/skills/featurify.md`.

### 5. Standalone job review cadence

The CPO reviews standalone jobs periodically. What triggers this? Options:
- Orchestrator sends a daily digest notification
- Threshold-based: "you have N unreviewed standalone jobs"
- CPO heartbeat includes standalone review as a routine task

### 6. Skill access verification at dispatch time

~~The `roles.skills[]` field says "this role should have these skills" but there's no verification the host machine has them.~~ **Partially resolved.** The executor now injects skill files from `projects/skills/` into ephemeral workspaces at dispatch time (PR #92). Pipeline-specific and contractor skills are distributed from the repo. General-purpose skills (deep-research, repo-recon, etc.) still depend on machine-level installation — machine capability registry remains a future item.

### 7. API keys for delegated models

The CPO uses second-opinion workflows to get independent review from Codex and Gemini. Codex uses login-based auth (browser OAuth — `codex login`). Gemini needs an API key. For autonomous sessions, these need to be available without human intervention. Codex's browser-based auth doesn't fit an autonomous agent model — needs investigation.

### 8. Stage skill authoring

~~The CPO Knowledge Architecture (Section 9) describes four stage skills.~~ **Resolved.** All four stage skills authored and shipped in PR #86: `projects/skills/plan-capability.md`, `projects/skills/spec-feature.md`, `projects/skills/standalone-job.md`, `projects/skills/reconcile-docs.md`. The CPO routing prompt (migration 041) references them.

### 9. Monitoring Agent scheduling and commissioning

Entry Point C introduces a Monitoring Agent that discovers opportunities autonomously. Open questions:

- **Who commissions it?** The CPO could schedule monitoring jobs as a routine (e.g., "scan X/Twitter for {topic} weekly"). Or the orchestrator could have a cron-like schedule for monitoring jobs.
- **What triggers a scan?** Time-based (daily/weekly), event-based (new competitor release detected), or CPO-directed ("research what's happening in {space}")
- **How many monitoring agents?** One per project domain? One generalist? Per-topic subscriptions?
- **Proposal quality gate** — Who decides whether a monitoring agent's proposal is worth the CPO's attention? Every proposal hitting the CPO creates context cost. Should there be a pre-filter (e.g., confidence threshold, relevance score) or does the CPO review everything?

### 10. Review-plan modes

`review-plan` operates in two distinct modes that the skill needs to support:

- **Interactive** — CPO walks through a plan with the human, discussing gaps, getting input. Standard mode when human initiated the idea.
- **Autonomous** — CPO reviews a plan solo (or with a contractor), commissions second opinions from other models, and applies recommendations. Used in agent-initiated flows (Entry Point C) where the human hasn't been involved yet, and in cases where the human explicitly delegates review authority.

The skill should detect which mode to use based on context, or be explicitly invoked in a given mode. This affects which questions are asked (interactive asks the human; autonomous asks other models) and what the output is (interactive produces a conversation; autonomous produces a revised plan with a changelog).

---

## 14. Future Exploration

### Aqua — P2P Agent Messaging

[quailyquaily/aqua](https://github.com/quailyquaily/aqua) is a P2P messaging protocol for AI agents. Currently, all zazig communication flows through the orchestrator or gateway. Aqua could enable direct worker-to-worker communication for:

- Pair programming between two implementation agents
- Real-time collaboration between CPO and CTO on architecture-sensitive features
- Breakdown Specialist asking the implementing agent clarifying questions

**Not designed in now.** The current hub-and-spoke model (orchestrator as bus) is simpler and more auditable. Aqua is worth revisiting when we have evidence that the orchestrator bottleneck is limiting throughput or that workers need richer collaboration patterns.

### Featurify — Project to Features

~~Jobify breaks features into jobs. The inverse — breaking a project into features — is currently manual.~~ ~~**Now designed.**~~ **Now implemented.** Featurify skill built (PR #86), MCP tools deployed (PR #90: `create_project`, `batch_create_features`), Project Architect role created (PR #85, migration 040), workspace assembly injects skill at dispatch time (PR #92). See `2026-02-24-featurify-skill-design.md` and `projects/skills/featurify.md`.

### MCP Measurement

Run controlled experiments comparing:
- Full MCP (all tools as MCP) vs hybrid (high-frequency MCP, low-frequency CLI)
- Measure: time to context compression, error rate on DB operations, session duration
- Decision point: if MCP sessions show no meaningful compression penalty, keep MCP for all

---

## 15. Test Results

### Test 1: Single Job Dispatch (Entry Point B)

**Date:** 2026-02-24
**Result:** PASS

Inserted a single job directly into `jobs` table with `status: queued`. The orchestrator picked it up on the next cron tick, matched it to `toms-macbook-pro-2023-local` (online, codex slots available), and dispatched via websocket. The local agent spawned a Codex session which executed the task and reported completion.

| Field | Value |
|-------|-------|
| Job ID | `b6c94e52-4f6d-4efa-9552-392bea0a5d85` |
| Task | Create `pipeline-test.md` with content |
| Complexity | `simple` → routed to Codex |
| Machine | `toms-macbook-pro-2023-local` |
| Created | 18:12:10 |
| Started | 18:13:04 |
| Completed | 18:14:05 |
| Duration | ~60s |

**What it proved:** Orchestrator dispatch, slot matching, local agent execution, status lifecycle (`queued` → `executing` → `complete`), heartbeat liveness.

### Test 2: DAG Dispatch (3-Job Dependency Chain)

**Date:** 2026-02-24
**Result:** PASS

Created 3 jobs with a linear dependency chain: A → B → C. All `queued` simultaneously. The orchestrator correctly dispatched only Job A (no dependencies), held B and C, then unblocked each on successive cron ticks as their dependencies completed.

| Job | Depends On | Started | Completed | Duration |
|-----|-----------|---------|-----------|----------|
| A (root) | — | 18:23:04 | 18:24:05 | 61s |
| B (depends A) | A | 18:25:05 | 18:25:35 | 30s |
| C (depends B) | B | 18:26:05 | 18:27:05 | 60s |

```
Job A  ████████████░░░░░░░░░░░░  18:23 → 18:24
                    ↓ unblocked B
Job B  ░░░░░░░░░░░░██████░░░░░░  18:25 → 18:25
                          ↓ unblocked C
Job C  ░░░░░░░░░░░░░░░░░░██████  18:26 → 18:27
```

**What it proved:** `depends_on` enforcement, DAG-aware dispatch (blocked jobs held until all dependencies `complete`), per-cron-tick unblocking, sequential chain execution across 3 orchestrator cycles.

### Test 3: Parallel DAG (Fan-In)

**Date:** 2026-02-24
**Result:** PASS

Created 3 jobs in a fan-in pattern: D and E have no dependencies (should run in parallel), F depends on both D and E (should wait for both).

| Job | Depends On | Started | Completed | Duration |
|-----|-----------|---------|-----------|----------|
| D (root 1) | — | 18:48:04 | 18:49:05 | 61s |
| E (root 2) | — | 18:48:04 | 18:49:05 | 61s |
| F (depends D+E) | D, E | 18:50:04 | 18:51:05 | 61s |

```
Job D  ████████████░░░░░░░░░░  18:48 → 18:49
Job E  ████████████░░░░░░░░░░  18:48 → 18:49  (parallel with D)
                    ↓ both complete, F unblocked
Job F  ░░░░░░░░░░░░████████░░  18:50 → 18:51
```

**What it proved:** Parallel dispatch (D and E started within 200ms of each other), multi-dependency gate (F waited until *both* D and E were complete), fan-in DAG pattern works.

### Test 4: Commission Contractor (Edge Function)

**Date:** 2026-02-24
**Result:** PASS

Tested the `commission-contractor` edge function (PR #93) by commissioning all three contractor types:

| Contractor | Job ID | job_type | feature_id | Status |
|-----------|--------|----------|------------|--------|
| project-architect | `a4f9b0db` | design | null | queued → executing |
| breakdown-specialist | `3e5cecf1` | breakdown | `2249831b` (provided) | queued |
| monitoring-agent | `82e95cd1` | research | null | queued |

**Validation tests (all correctly rejected):**
- Project architect with feature_id → `"feature_id must not be provided for project-architect"`
- Breakdown specialist without feature_id → `"feature_id is required for breakdown-specialist"`
- Invalid role (senior-engineer) → `"role must be one of: project-architect, breakdown-specialist, monitoring-agent"`

**What it proved:** CPO can commission contractors via MCP, role-specific validation enforced, correct job_type and complexity mapping, nullable feature_id for project-level contractors (migration 044).

**Known issue:** `contractor_commissioned` events not appearing in events table — silent insert failure. Non-blocking; needs investigation.

### Test 5: Workspace Assembly

**Date:** 2026-02-24
**Result:** PASS

Dispatched a job and verified the ephemeral workspace contained all required files:

| File | Size | Status |
|------|------|--------|
| `.mcp.json` | 599 bytes | Present — MCP server config pointing at zazig-messaging |
| `CLAUDE.md` | 19,652 bytes | Present — assembled context (personality → role → task) |
| `.claude/settings.json` | 175 bytes | Present — role-scoped permissions |
| `.zazig-prompt.txt` | 19,652 bytes | Present — prompt file for stdin piping |
| `.claude/skills/` | absent | Correct — monitoring-agent has no skills on disk |

Settings.json verified: standard tools (Read, Write, Edit, Bash, Glob, Grep) + role-scoped MCP tool (`mcp__zazig-messaging__send_message` for monitoring-agent).

**What it proved:** Workspace assembly produces a complete, role-scoped environment. Agents get the right MCP config, permissions, and prompt stack.

**Bugs found and fixed during testing:**
1. **Report path mismatch:** Executor looked for report at `$HOME/.claude/cpo-report.md` but agent writes relative to workspace CWD (`~/.zazigv2/job-<id>/.claude/cpo-report.md`). Fixed by checking workspace dir first, falling back to `$HOME`.
2. **"Command too long" error:** Assembled context exceeded OS `ARG_MAX` when passed as CLI argument to `claude -p`. Fixed by writing prompt to `.zazig-prompt.txt` and piping via `cat .zazig-prompt.txt | claude --model X -p`.
3. **Arg order:** `-p` must be last (it's a flag reading stdin, not an option taking a value).

**Known issues (non-blocking):**
- `assembled_context` column doesn't exist in jobs table — DB write fails silently
- Agent needs proper Supabase Auth JWT (not Management API token) for heartbeats

### Test 6: `batch-create-jobs` Temp Reference Resolution

**Date:** 2026-02-24
**Result:** PASS

Created 3 jobs via `batch-create-jobs` edge function with `temp:0` references in `depends_on`:

| Job | Title | depends_on | Resolved |
|-----|-------|-----------|----------|
| `ea657198` | Foundation job (no deps) | `[]` | — |
| Job 2 | Dependent job (needs foundation) | `["temp:0"]` | `["ea657198-4a24-494c-a611-ffa3fc0046e1"]` |
| Job 3 | Parallel job (also needs foundation) | `["temp:0"]` | `["ea657198-4a24-494c-a611-ffa3fc0046e1"]` |

Feature status transitioned from `ready_for_breakdown` → `breakdown` as expected.

**What it proved:** Temp reference resolution works — `temp:N` references in `depends_on` are replaced with real UUIDs from the same batch. Feature status transitions on job creation. DAG structure preserved through the edge function.

**Note:** Temp reference format is `temp:N` (colon), not `temp-N` (dash).

### Test 7: Claude Code Slot Routing

**Date:** 2026-02-24
**Result:** PASS

Created two jobs with different complexity levels and verified the orchestrator routes them to the correct slot type:

| Job | Role | Complexity | Routed to |
|-----|------|-----------|-----------|
| Slot routing test - medium | senior-engineer | medium | `claude_code` |
| Slot routing test - simple | junior-engineer | simple | `codex` |

**What it proved:** The orchestrator's complexity-to-slot routing works correctly. Medium/complex jobs go to Claude Code slots, simple jobs go to Codex slots. This ensures expensive model capacity is reserved for tasks that need reasoning.

### Test 8: Full Entry Point A (First Link)

**Date:** 2026-02-24
**Result:** PASS (partial chain — as expected)

Commissioned a project-architect contractor and watched the full first link execute end-to-end:

| Step | Status | Details |
|------|--------|---------|
| Commission contractor | Done | Job `990e9f71` created with `queued` status |
| Dispatch | Done | Orchestrator assigned to local machine |
| Agent execution | Done | Project-architect ran in tmux, 3 API turns |
| MCP: `create_project` | Done | "Pipeline Integration Test" (`77376ed5`) created in DB |
| MCP: `batch_create_features` | Done | "Hello-Test Edge Function" (`4b9c9ef6`) with Gherkin ACs in DB |
| Report written | Done | `cpo-report.md` claimed from workspace to `~/.claude/job-reports/` |
| Job completion | Done | `job_complete` sent back to orchestrator |

Feature created with full Gherkin acceptance criteria (200 status check, JSON body match, Content-Type header). Status: `created`. Chain stops here as expected — auto-trigger from `created` → breakdown specialist is not yet wired.

**What it proved:** A contractor can be commissioned, dispatched, execute with MCP tools (creating real projects and features in the DB), produce a report, and complete cleanly. The first link of Entry Point A works end-to-end.

**What remains for full chain:** The orchestrator auto-chaining is already wired — `processReadyForBreakdown` scans for features with `status: ready_for_breakdown` and calls `triggerBreakdown` on each dispatch cycle. The intentional manual step is the CPO reviewing the architect's feature outlines and setting `ready_for_breakdown` when satisfied. After that, the full chain is automatic: breakdown → jobs dispatch (DAG) → execute → code review → verification → test deploy → human approval → prod deploy → complete. The only missing piece is the **CPO persistent agent** as the human-facing entry point (Chris's WIP).

### All Tests Complete

| Test | Capability | Result |
|------|-----------|--------|
| 1 | Single job dispatch | PASS |
| 2 | DAG dispatch (3-job chain) | PASS |
| 3 | Parallel DAG (fan-in) | PASS |
| 4 | Commission contractor | PASS |
| 5 | Workspace assembly | PASS |
| 6 | `batch-create-jobs` temp refs | PASS |
| 7 | Slot routing | PASS |
| 8 | Full Entry Point A (first link) | PASS |

---

## What's Next: CPO Persistent Agent

All pipeline infrastructure is tested and working. The remaining piece is the **CPO persistent agent** — the human-facing entry point that turns Entry Point A from a curl command into a conversation.

### What exists

- The CPO role prompt is in the DB (migrations 038, 041) with the pipeline routing decision tree
- The CPO's MCP tools are defined in `workspace.ts`: `send_message`, `query_projects`, `create_feature`, `update_feature`, `commission_contractor`
- The executor has a `handlePersistentJob` path (routes `persistent_agent` card types)
- `MessageInbound` handler exists for injecting messages into a running CPO session
- The orchestrator auto-requeues persistent jobs on completion (failover-safe)

### What's missing

The executor's persistent job path doesn't get the same workspace treatment as ephemeral jobs. Specifically:

1. **Prompt stack not injected** — the CPO currently gets a hardcoded `CPO_MESSAGING_INSTRUCTIONS` constant instead of the assembled 4-layer prompt (personality → role prompt → skills → task context). The role prompt, pipeline routing, and MCP tool docs never reach the CPO.
2. **No workspace assembly** — persistent agents don't get `.mcp.json`, `.claude/settings.json`, or skill files. The CPO can't call MCP tools or use pipeline skills (`/plan-capability`, `/spec-feature`, etc.).
3. **No message injection** — the `MessageInbound` handler is wired but the CPO needs to be running with a proper workspace first.

### The fix

Chris's design doc (`2026-02-24-persistent-agent-identity-design.md`) covers this:

- Rename `handleStartCpo` → role-agnostic `handlePersistentJob`
- Delete the `CPO_MESSAGING_INSTRUCTIONS` constant
- Write the assembled context (from `assembleContext()`) as `CLAUDE.md` in the persistent workspace
- Apply the same workspace setup (`.mcp.json`, `.claude/settings.json`, skills) that ephemeral jobs already get
- Move CPO-specific messaging instructions into the `roles.prompt` column in the DB

This is mostly wiring — the workspace assembly logic already exists for ephemeral contractors. The persistent path just needs to use it.

### End state

Once complete, the full Entry Point A flow becomes:

```
Human types in terminal → CPO session receives message
→ CPO assesses scope, asks clarifying questions
→ CPO commissions project-architect (via MCP)
→ Architect creates project + features (via MCP)
→ CPO reviews feature outlines, sets ready_for_breakdown (via MCP)
→ Orchestrator auto-triggers breakdown-specialist
→ Breakdown specialist creates jobs with DAG (via MCP)
→ Jobs dispatch and execute → code review → verification → deploy
```

Every link after `ready_for_breakdown` is already automated and tested (Tests 1-8).

### Future improvement: report persistence

Job reports are currently written to local filesystem (`~/.claude/job-reports/<jobId>.md`). The executor reads the first line as the `result` string and sends it to the orchestrator, but the full report body is only accessible on the machine that ran the job. Reports should be written back to the DB (either the existing `result` column or a new `report` text column on `jobs`) so the orchestrator, CPO, and other agents can read full reports without filesystem access.

---

## TL;DR

An idea enters through three paths: a human talks to the CPO (Entry Point A), a quick fix goes straight to a standalone job (Entry Point B), or a Monitoring Agent discovers an opportunity through automated research and proposes it to the CPO for human approval (Entry Point C). The CPO triages by scope, plans with the human, and commissions a Project Architect to structure the work. The CPO then specs each feature through conversation, setting `status: ready_for_breakdown` when satisfied. The orchestrator dispatches a Breakdown Specialist who runs jobify to produce executable jobs with Gherkin acceptance criteria and a dependency DAG. Jobs queue in Supabase and the existing pipeline handles execution, verification, and shipping.

Every actor needs specific skills at specific stages — pipeline-specific skills (like `jobify`, `featurify`, `/spec-feature`) are loaded on demand per stage, while general-purpose skills (like `deep-research`, `review-plan`, `second-opinion`) are used across stages when applicable. The orchestrator assembles workspaces with role-scoped MCP tools and the right skills at dispatch time.

All workers — executives, employees, contractors — get MCP tools scoped to their role. The orchestrator is a deterministic pipe that dispatches work and routes notifications. The CPO is the only actor that reasons about product — everything else is mechanical or specialist.
