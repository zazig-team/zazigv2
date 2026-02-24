# Idea to Job Pipeline Design

**Date:** 2026-02-24
**Status:** Draft
**Authors:** Tom + Claude (brainstorming session)
**Reviewed by:** Codex (gpt-5.3) and Gemini (3.1 Pro) — second opinions on MCP tooling
**Supersedes:** Portions of `2026-02-24-software-development-pipeline-design.md` (stages 1-5), `2026-02-24-persistent-agent-identity-design.md` (MCP tool scoping), `2026-02-24-mcp-vs-skill-vs-cli-analysis.md` (decision: MCP for all, role-scoped)
**Companion docs:** `2026-02-24-jobify-skill-design.md` (breakdown detail), `ORG MODEL.md` (tier/layer reference)

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

---

## 1. Pipeline Stages

Seven stages, two entry points.

```
ENTRY POINT A: Through CPO (full pipeline)
  Human → CPO conversation → triage by scope

ENTRY POINT B: Standalone (quick fixes, bypass CPO)
  Human → orchestrator → single orphan job

─────────────────────────────────────────────────────

[1] IDEATION         Human has an idea, talks to CPO
[2] PLANNING         CPO + Human refine scope, decide project vs feature
[3] STRUCTURING      Project Architect creates project + feature outlines
[4] FEATURE DESIGN   CPO + Human spec each feature (AC, checklist)
[5] BREAKDOWN        Breakdown Specialist runs jobify → jobs in Supabase
[6] EXECUTION        Orchestrator dispatches jobs to workers
[7] VERIFICATION     Two gates (job verify, feature verify) → ship
```

### Entry Point A: Through CPO

The standard path. Human talks to CPO via gateway (terminal, Slack, web UI, voice — channel-agnostic per org model). CPO triages by scope:

- **Single feature, existing project** → skip to Stage 4
- **New capability requiring multiple features** → Stage 2 (planning) → Stage 3 (structuring)
- **Whole new product/workstream** → Stage 2 (deep planning, possibly research) → Stage 3

### Entry Point B: Standalone

For quick fixes, small tasks, and anything too small for a project or feature. Human (or CPO) creates a standalone job directly — `feature_id: null`, tagged `standalone`, goes straight to `queued`. Still requires spec + at least 1 Gherkin acceptance criterion (the schema gate enforces this).

The CPO reviews standalone jobs periodically to ensure they don't accumulate into an untracked shadow backlog.

### Stage Ownership

| Stage | Owner | Output |
|-------|-------|--------|
| 1. Ideation | Human + CPO | Raw idea, conversation context |
| 2. Planning | CPO + Human | Approved plan (scope, goals, constraints) |
| 3. Structuring | Project Architect (contractor) | Project record + feature outlines in Supabase |
| 4. Feature Design | CPO + Human | Fully specced feature (spec, AC, human checklist) |
| 5. Breakdown | Breakdown Specialist (contractor) | Jobs in Supabase (`queued`, with `depends_on` DAG) |
| 6. Execution | Orchestrator + Workers | Code on branches |
| 7. Verification & Ship | Orchestrator + Human | Merged, deployed, done |

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

## 9. Worked Examples

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

### Example C: Standalone quick fix

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

## 10. Relationship to Existing Docs

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

## 11. Dependencies

| Dependency | Status | Owner |
|-----------|--------|-------|
| `features` table with spec + acceptance_tests + human_checklist | Exists | Chris |
| `jobs` table with all required columns | Exists | Chris |
| `depends_on` UUID array column on `jobs` table | Needs migration | Chris |
| `create_feature` edge function | Built (in agent-mcp-server.ts) | Chris |
| `update_feature` edge function | Built (in agent-mcp-server.ts) | Chris |
| `query_projects` MCP tool | Built (in agent-mcp-server.ts) | Chris |
| `batch_create_jobs` MCP tool | Needs building | Chris |
| Role-scoped `.mcp.json` generation in executor | Needs building | Chris |
| Workspace setup for ephemeral jobs | Needs building | Chris |
| Orchestrator event: `feature_status_changed` | Needs building | Chris |
| Orchestrator: dispatch jobs where all `depends_on` are complete | Needs building | Chris |
| Project Architect role in `roles` table | Needs creating | Tom/Chris |
| Breakdown Specialist role in `roles` table | Needs creating | Tom/Chris |
| CPO wakeup via `MessageInbound` internal events | Needs building | Chris |

---

## 12. Open Questions

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

What exactly does the Project Architect produce? A structured JSON project plan? Markdown? Direct Supabase records? The feature outlines need enough detail for the CPO to refine but not so much that the contractor is doing the CPO's job.

### 5. Standalone job review cadence

The CPO reviews standalone jobs periodically. What triggers this? Options:
- Orchestrator sends a daily digest notification
- Threshold-based: "you have N unreviewed standalone jobs"
- CPO heartbeat includes standalone review as a routine task

---

## 13. Future Exploration

### Aqua — P2P Agent Messaging

[quailyquaily/aqua](https://github.com/quailyquaily/aqua) is a P2P messaging protocol for AI agents. Currently, all zazig communication flows through the orchestrator or gateway. Aqua could enable direct worker-to-worker communication for:

- Pair programming between two implementation agents
- Real-time collaboration between CPO and CTO on architecture-sensitive features
- Breakdown Specialist asking the implementing agent clarifying questions

**Not designed in now.** The current hub-and-spoke model (orchestrator as bus) is simpler and more auditable. Aqua is worth revisiting when we have evidence that the orchestrator bottleneck is limiting throughput or that workers need richer collaboration patterns.

### Featurify — Project to Features

Jobify breaks features into jobs. The inverse — breaking a project into features — is currently manual (Project Architect + CPO review). A `featurify` skill could automate the Project Architect's work, similar to how jobify automates the Breakdown Specialist's work. Same pattern: read project, produce feature outlines, push to Supabase.

### MCP Measurement

Run controlled experiments comparing:
- Full MCP (all tools as MCP) vs hybrid (high-frequency MCP, low-frequency CLI)
- Measure: time to context compression, error rate on DB operations, session duration
- Decision point: if MCP sessions show no meaningful compression penalty, keep MCP for all

---

## TL;DR

An idea enters through the CPO (or as a standalone quick fix). The CPO triages by scope, plans with the human, and commissions a Project Architect to structure the work. The CPO then specs each feature through conversation, setting `status: ready_for_breakdown` when satisfied. The orchestrator dispatches a Breakdown Specialist who runs jobify to produce executable jobs with Gherkin acceptance criteria and a dependency DAG. Jobs queue in Supabase and the existing pipeline handles execution, verification, and shipping.

All workers — executives, employees, contractors — get MCP tools scoped to their role. The orchestrator is a deterministic pipe that dispatches work and routes notifications. The CPO is the only actor that reasons about product — everything else is mechanical or specialist.
