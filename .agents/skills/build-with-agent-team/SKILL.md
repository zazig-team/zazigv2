---
name: build-with-agent-team
description: Coordinate a multi-agent build using Codex Agent Teams. Spawns a team with shared task list, contract-first pattern, mandatory Codex review. Use when a task crosses architectural layers (data/service/view) or needs parallel work. Invoke with /build-with-agent-team [plan-path] [num-agents] — or just describe what to build inline.
---

# Build with Agent Team

Coordinate a parallel multi-agent build using Codex's Agent Teams feature. The team lead orchestrates teammates via a shared task list, enforcing contract-first delivery so layers integrate cleanly.

## When to Use

- Task crosses architectural layers (data model + service/ViewModel + UI/view)
- Card has the `team` label in Trello
- Work is genuinely parallelizable across 2-5 agents with clear boundaries
- Building a feature that needs coordinated frontend + backend + data changes

## When NOT to Use

- Single-concern task (one file, one layer) — use a solo agent
- Research or investigation — use a subagent
- Quick fix or mechanical change — use codex-delegate
- The task can be done sequentially in one session without coordination overhead

## Prerequisites

- tmux installed (`brew install tmux`)
- Agent Teams enabled in `~/.Codex/settings.json`:
  ```json
  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
  ```

## Arguments

- `$ARGUMENTS[0]` (optional): Path to plan document. If omitted, use the user's message as the plan.
- `$ARGUMENTS[1]` (optional): Number of agents (2-5). If omitted, determined from plan analysis.
- If a single number is passed, treat it as num-agents (no plan file).

**All of these work:**
```
/build-with-agent-team ./plans/my-feature.md 3
/build-with-agent-team ./plans/my-feature.md
/build-with-agent-team 3
/build-with-agent-team
```

When no plan path is given, the user's surrounding message IS the plan. Extract the requirements from conversation context.

## Workflow

### Step 1: Read and Analyze the Plan

**If a plan path was provided:** Read the plan document at that path.
**If no plan path:** Use the user's message and recent conversation context as the plan. Summarize what you understand the build to be and confirm with the user before proceeding.

Understand:
- What components need to be built
- Technology boundaries (data layer, service layer, UI layer, config)
- Dependencies between components (what must exist before what)
- File ownership boundaries (which files belong to which agent)

### Step 2: Define Contracts BEFORE Spawning

This is the most critical step. **Agents that build in parallel will diverge on interfaces, response shapes, and naming conventions without upfront contracts.**

For each boundary between agents, define:

- **Data ↔ Service**: Model schemas, field names/types, Firestore paths, query interfaces
- **Service ↔ UI**: ViewModel protocols, published properties, method signatures
- **API contracts**: Endpoint URLs, request/response JSON shapes, error formats
- **Shared types**: Enums, constants, configuration keys

Write these contracts as part of the task descriptions so every agent has them.

### Step 3: Create the Team

```
TeamCreate:
  team_name: "{feature-name}-team"
  description: "Building {feature description}"
```

### Step 4: Create Tasks with Dependencies

Create tasks using TaskCreate with explicit dependency chains via `blockedBy`:

```
Task A (upstream — data/schema agent):
  - Define models, schemas, Firestore rules, migrations
  - No blockers — starts immediately
  - Deliverable: contracts (schemas, interfaces) for downstream agents

Task B (mid — service/ViewModel agent):
  - Business logic, ViewModels, API endpoints
  - blockedBy: [A] — waits for data contracts
  - Receives: data schemas from Task A
  - Deliverable: service interfaces for UI agent

Task C (downstream — UI/view agent):
  - Views, components, navigation
  - blockedBy: [B] — waits for service contracts
  - Receives: ViewModel protocols from Task B

Task D (optional — config/infra agent):
  - Firebase config, security rules, Cloud Functions
  - blockedBy: depends on what it needs
```

Not every team needs all roles. Choose based on the plan.

### Step 5: Spawn Agents with Contract-First Pattern

Spawn the **upstream agent first** using the Task tool with `team_name` and `subagent_type: "general-purpose"`:

```
Task tool:
  name: "data-agent"
  team_name: "{feature-name}-team"
  subagent_type: "general-purpose"
  prompt: |
    You are the data/schema agent for {feature}.

    YOUR FILES (only touch these):
    {explicit file list}

    CONTRACT YOU MUST DELIVER:
    {what downstream agents need from you}

    SPEC:
    {relevant sections from the plan}

    When done, mark your task as completed and send a message to
    the team lead with your delivered contracts.
```

**Wait for the upstream agent to deliver contracts** before spawning downstream agents. This is the contract-first pattern — upstream delivers schemas/interfaces, then downstream builds against them.

When upstream completes, spawn the next agent(s) with the contracts included in their prompt.

### Step 6: Coordinate

As team lead, you:
- **DO NOT write code yourself** — you coordinate only (delegate mode)
- Monitor task completion via TaskList
- Relay contracts from upstream to downstream agents via SendMessage
- Mediate if agents need to negotiate interface changes
- Unblock stuck agents with guidance
- Track progress and surface issues

### Step 7: Integration Check

After all teammates complete:
1. Read TaskList to confirm all tasks are completed
2. Review the files each agent touched — verify no overlapping edits
3. Check that contracts are honored (upstream schemas match downstream usage)
4. Run the build if applicable (e.g., XcodeBuildMCP for Swift, npm/bun for JS)
5. Run tests if they exist

### Step 8: Codex Delegate Review (Mandatory)

This is a **mandatory quality gate**. Before writing the report, run an independent review:

```bash
codex-delegate investigate --dir "{project-dir}" "Review the changes made by the agent team for {feature}. Check: 1) Do the data models match the service layer usage? 2) Does the UI correctly bind to ViewModels? 3) Are there any integration gaps between layers? 4) Any security or performance concerns?"
```

Include the Codex findings in the report. If Codex finds real issues, fix them (via a teammate or new task) before completing.

### Step 9: Shut Down and Clean Up

1. Send shutdown_request to all teammates via SendMessage
2. Wait for shutdown confirmations
3. TeamDelete to clean up the team and task list

### Step 10: Write Report

Write `{project-dir}/.Codex/cpo-report.md` with:

```markdown
# CPO Report — {Feature Name}

## Summary
{What was built, one paragraph}

## Agent Team Summary
- **Team composition**: {roles and models used}
- **Contract chain**: {upstream → mid → downstream, what was passed}
- **Files per teammate**:
  - data-agent: {file list}
  - service-agent: {file list}
  - ui-agent: {file list}
- **Agent Teams value assessment**: {honest — did parallel work save time vs. sequential? Were there integration issues?}

## Codex Review
{Codex findings verbatim, plus resolution status}

## Changes
{File-by-file summary of what changed}

## Testing
{What was tested, what passed, what needs manual verification}

## Decisions Made
{Any architectural or design decisions the team made during the build}
```

## Key Rules

- **Team lead never writes code** — coordinate only, delegate mode
- **Contracts before agents** — never spawn downstream without upstream contracts
- **File ownership is exclusive** — no two agents edit the same file
- **Codex review is mandatory** — not optional, not skippable
- **Max 5 agents** — more than 5 creates coordination overhead that exceeds the parallelism benefit
- **Agent Team counts as 1 tmux slot** — max 2 Agent Teams running simultaneously
- **Kill stale teams** — if an agent is stuck for >10 minutes, investigate and unblock or replace

## Anti-Patterns

| Anti-Pattern | Why It Fails | Do This Instead |
|---|---|---|
| Spawn all agents simultaneously | They diverge on interfaces | Contract-first: upstream → downstream |
| Lead writes "just a small fix" | Scope creep, defeats delegation | Create a task, assign to teammate |
| Vague file ownership | Merge conflicts, overwrites | Explicit file lists per agent |
| Skip Codex review | Integration bugs ship | Always run, even if it looks clean |
| Too many agents (>5) | Coordination cost > parallelism gain | Combine related concerns |
| No contracts defined | Agents guess at interfaces | Write contracts in Step 2 |
