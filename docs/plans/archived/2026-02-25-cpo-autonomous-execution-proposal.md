# CPO Autonomous Execution Model

**Date:** 2026-02-25
**Status:** Proposal
**Authors:** Tom + Claude (brainstorming session)
**Companion docs:** `2026-02-24-idea-to-job-pipeline-design.md` (pipeline reference), `ORG MODEL.md` (tier/layer reference), `2026-02-25-terminal-first-cpo-design.md` (terminal interface)
**Affects:** CPO role prompt, stage skills (`spec-feature`, `plan-capability`), CPO workspace `CLAUDE.md`, potential new `self-assess` skill

---

## Problem

The CPO asks permission at every stage transition. In practice, a typical CPO session looks like this:

```
CPO: *finishes reviewing feature outline*
CPO: "Should I write the full spec?"
Human: "Yes."

CPO: *finishes drafting spec*
CPO: "Should I set this to ready_for_breakdown?"
Human: "Yes."

CPO: *gets second opinion back*
CPO: "Should I proceed?"
Human: "Yes."
```

Every "Should I?" is a wasted human interrupt. The answer is almost always "yes" because the CPO is asking about the obvious next step in a well-defined pipeline. The human is babysitting micro-decisions instead of focusing on the decisions that actually require human judgment.

The current behaviour stems from two sources:

1. **The spec-feature skill explicitly says "Only set the status after the human confirms"** (Step 7). Similar gates exist in `plan-capability` (Step 7: "The plan is not approved until the human says it is").
2. **The CPO's domain beliefs lean conservative**: "Prefer proven approaches. Accept calculated risks only with strong evidence." This combines with the model's natural tendency to seek confirmation, creating a double-cautious agent that asks permission for everything.

The result: a pipeline that is technically autonomous but behaviourally dependent. The CPO has the tools to proceed but not the instruction to use them.

### What the human actually wants

Tom's words: "It needs to know that as much as possible it should be proceeding if it hasn't heard from me... Hey this is what I'm doing, I'm gonna get on and do this unless you tell me otherwise... forgiveness not permission kind of approach... if it can run its own assessment to be sure that it's ready that would be really really useful."

This maps to a specific operating model: **proceed with the default action, inform the human, and only pause for genuinely novel or high-impact decisions.** The human retains veto power but exercises it reactively, not proactively.

---

## 1. The Autonomous Execution Framework

### Design principle

Every CPO action falls into one of three categories. The category determines whether the CPO proceeds silently, informs and proceeds, or pauses and asks. The categories are defined by two dimensions: **reversibility** (can the decision be undone?) and **impact** (how much does it change the trajectory of work?).

```
                        Low Impact              High Impact
                   ┌───────────────────┬───────────────────┐
  Reversible       │  PROCEED          │  INFORM & PROCEED │
                   │  (silent)         │  (tell, don't ask)│
                   ├───────────────────┼───────────────────┤
  Irreversible     │  INFORM & PROCEED │  PAUSE & ASK      │
  or expensive     │  (tell, don't ask)│  (genuine decision)│
                   └───────────────────┴───────────────────┘
```

### Category 1: PROCEED (no announcement needed)

These are internal working actions. The human sees them happening in the terminal but the CPO does not narrate or seek approval.

| Action | Why it's safe |
|--------|---------------|
| Querying pipeline state (`query_projects`, `query_features`) | Read-only, zero side effects |
| Writing or updating a spec draft | Reversible, the human will review the output |
| Running a second opinion on its own work | Internal quality step, no state change |
| Reviewing breakdown output when notified | Observation, not action |
| Writing reports and updating `.claude/cpo-report.md` | Internal state, human can read at leisure |
| Sweeping the ideas inbox | Triage is reversible -- nothing is deleted |
| Running self-assessment checklists | Internal reasoning, no side effects |
| Iterating on a spec in a self-review loop | Produces better output, fully reversible |

### Category 2: INFORM AND PROCEED (tell the human, do not ask)

These actions change state or commit resources, but are either reversible or are the obvious next step in an established workflow. The CPO announces what it is doing with a brief statement and continues without waiting for a response. The human can interrupt if needed.

| Action | Communication pattern | Why inform-only |
|--------|----------------------|-----------------|
| Setting a feature to `ready_for_breakdown` after spec passes self-assessment | "Spec passes quality checks. Setting to ready_for_breakdown." | One-way door, but it is the defined next step after a complete spec. If the spec is good, this always happens. |
| Commissioning a Project Architect | "Plan approved. Commissioning Project Architect to structure into features." | Reversible (features can be deleted), and is the defined next step after plan approval. |
| Commissioning a Breakdown Specialist (if manually triggered) | "Feature spec complete. Commissioning breakdown." | Same as above -- defined pipeline progression. |
| Promoting an idea to a feature | "This idea has clear scope. Creating as feature under project X." | Reversible (feature can be cancelled), low cost. |
| Starting a planning conversation for a multi-feature initiative | "This looks like a multi-feature capability. Starting planning." | No state change yet, just conversation mode. |
| Making priority calls within the existing roadmap | "Reprioritising: Feature A before Feature B based on dependency analysis." | Within CPO mandate, reversible. |
| Running `/second-opinion` as part of self-assessment | "Running second opinion on this spec before proceeding." | Quality step, no state change. |

### Category 3: PAUSE AND ASK (genuine decision point)

These actions are irreversible, high-impact, or contradict previous human guidance. The CPO presents the situation, its recommendation, and explicitly waits for a response.

| Action | Why pause |
|--------|-----------|
| Creating a genuinely new project (implies new repo) | Structural decision with long-term implications |
| Rejecting or parking a human's idea | Human originated the idea -- they should decide its fate |
| Changing roadmap priorities significantly | Contradicts previous human-approved ordering |
| Any decision that contradicts previous human guidance | Self-explanatory -- human said X, CPO wants to do Y |
| Anything involving external communication or money | Irreversible, high-consequence |
| Scope changes that expand beyond the approved plan | "We agreed on A, B, C -- now I think we also need D" |
| Architectural implications the CPO spots but CTO owns | Cross-role boundary -- escalate, don't decide |
| Cancelling a feature that is already in breakdown or later | Work has been done, cancellation wastes it |

### The "contradicts human guidance" heuristic

This is the most important safety rail. If the human has expressed a preference, opinion, or decision about a topic, the CPO should not autonomously override it -- even if the CPO disagrees. The CPO should present its reasoning and ask. This prevents the failure mode where the CPO makes a chain of individually reasonable autonomous decisions that collectively diverge from what the human intended.

---

## 2. Self-Assessment Protocol

### The problem with "is this ready?"

Today, the CPO drafts a spec and asks the human "Is this ready?" This outsources quality assessment to the human. The CPO should assess readiness itself and only involve the human for subjective or strategic judgment -- not for checklist verification.

### Self-Assessment Checklist

Before setting any feature to `ready_for_breakdown`, the CPO runs this checklist internally. Every item must pass.

**Spec completeness:**
- [ ] Overview section exists and explains what and why in one paragraph
- [ ] Detailed Requirements section exists with numbered, specific requirements
- [ ] Every requirement is testable -- no vague language ("handles errors gracefully" is rejected; "returns HTTP 429 with retry-after header when rate limit exceeded" is accepted)
- [ ] Scope Boundaries section exists with explicit in-scope and out-of-scope lists
- [ ] Dependencies section exists with concrete references (table names, API endpoints, feature IDs -- not "depends on auth")
- [ ] Constraints section exists if relevant (omitted is acceptable for simple features)

**Acceptance criteria completeness:**
- [ ] At least one acceptance criterion per detailed requirement
- [ ] Criteria are feature-level (user experience), not job-level (implementation detail)
- [ ] No Gherkin -- that is jobify's job
- [ ] Failure cases are included (not just "it works" but "it doesn't break in these ways")
- [ ] Each criterion is independently verifiable

**Human checklist completeness:**
- [ ] At least one manual verification item
- [ ] Items require human judgment (not things an automated test can check)
- [ ] Items are specific enough to verify ("Dark mode colours look correct on sidebar" not "looks good")

**Self-containment test:**
- [ ] A Breakdown Specialist reading ONLY the spec, ACs, and checklist -- with no conversation history -- could decompose this feature into jobs without asking any questions

This last check is the single most important quality gate. If the spec is not self-contained, the Breakdown Specialist will produce bad jobs and the whole pipeline degrades.

### Second opinion as validation

After the checklist passes, the CPO runs `/second-opinion` on the spec. The second opinion prompt should specifically ask:

> "You are reviewing a feature spec that is about to enter an automated breakdown pipeline. A Breakdown Specialist will read this spec with no other context and decompose it into implementation jobs. Review the spec for: (1) ambiguity that would cause different interpretations, (2) missing requirements that the spec implies but does not state, (3) scope boundaries that are unclear, (4) acceptance criteria that are not testable. Be specific about what is wrong and how to fix it."

If the second opinion identifies issues rated as "would cause a bad breakdown," the CPO fixes them and re-runs the checklist. If the second opinion identifies only minor issues or stylistic suggestions, the CPO proceeds.

### Decision tree after self-assessment

```
Draft spec complete
    │
    ▼
Run self-assessment checklist
    │
    ├── Any item fails → Fix it, re-run checklist
    │
    ▼
All items pass
    │
    ▼
Run /second-opinion
    │
    ├── Critical issues found → Fix, re-run checklist
    │
    ▼
No critical issues
    │
    ▼
INFORM: "Spec passes quality checks. Setting to ready_for_breakdown."
    │
    ▼
update_feature(status: ready_for_breakdown)
```

The human is never asked "is this ready?" The CPO assesses readiness itself and informs the human of the result. If the human disagrees, they can intervene -- the terminal shows everything in real time.

---

## 3. Ralph Loops for Self-Validation

### What is a Ralph loop?

The Ralph Wiggum Loop is a pattern from the AI coding community (originated by Geoffrey Huntley, formalised by Boris Cherny at Anthropic in late 2025). The core idea: run an AI agent in an iterative loop where it attempts a task, checks the result against concrete criteria, and feeds failures back as input for the next attempt. Progress persists in files, not in the agent's context window.

The canonical implementation is a bash loop:
```bash
while :; do cat PROMPT.md | claude-code ; done
```

Each iteration spawns a fresh agent with clean context. The agent sees its previous work through the filesystem (git history, progress files, state files). When the stop condition is met, the loop exits.

### Ralph loops for the CPO: Spec quality iteration

The CPO's version of a Ralph loop is not about code -- it is about spec quality. The loop:

1. **Draft** -- CPO writes the initial spec based on conversation with the human
2. **Assess** -- CPO runs the self-assessment checklist (Section 2)
3. **Review** -- CPO runs `/second-opinion` on the spec
4. **Improve** -- CPO incorporates feedback, fixes identified issues
5. **Re-assess** -- CPO re-runs the checklist
6. **Exit condition** -- Checklist passes AND second opinion has no critical issues

```
┌──────────────────────────────────────────────┐
│              RALPH LOOP: SPEC QUALITY         │
│                                               │
│   ┌─────────┐    ┌──────────┐    ┌────────┐ │
│   │  Draft   │───▶│  Assess  │───▶│ Review │ │
│   │  (write) │    │(checklist)│   │(2nd op)│ │
│   └─────────┘    └──────────┘    └────────┘ │
│        ▲                              │      │
│        │         ┌──────────┐         │      │
│        └─────────│ Improve  │◀────────┘      │
│                  │(fix issues)│               │
│                  └──────────┘                │
│                                               │
│   EXIT: checklist passes + no critical issues │
│   MAX ITERATIONS: 3                           │
└──────────────────────────────────────────────┘
```

### Iteration limits and stagnation detection

The CPO's Ralph loop has a hard cap of **3 iterations**. If the spec does not pass after 3 rounds of draft-assess-review-improve, something is fundamentally wrong with the requirements -- not the spec. At that point, the CPO should PAUSE AND ASK the human:

> "I've iterated on this spec 3 times and it's still not passing quality checks. The remaining issues are: [list]. These may indicate unclear requirements rather than a spec writing problem. Can we revisit the requirements?"

Stagnation detection: if two consecutive iterations produce the same set of failing checklist items, the loop exits early (the CPO is not making progress).

### Docker sandbox question

Tom asked: "Should we be running Ralph loops in a Docker sandbox?"

The motivation is context isolation -- running the self-review in a separate agent process so it does not pollute the CPO's main conversation context. This is a valid concern. The CPO's context window is its most precious resource. A long self-review loop that generates thousands of tokens of internal reasoning could crowd out the conversation history the CPO needs for strategic decisions.

**Analysis of options:**

| Option | Mechanism | Context impact | Complexity |
|--------|-----------|----------------|------------|
| **In-session loop** | CPO runs the checklist and second opinion in its own conversation | High -- all reasoning stays in context | Zero -- works today |
| **Sub-agent loop** | Claude Code sub-agent runs the review in a separate context | Medium -- sub-agent results return as summary | Low -- Claude Code supports this natively |
| **Docker sandbox** | Separate container running a review agent, communicating via files | Zero -- completely isolated context | High -- needs container orchestration, file sharing |
| **Separate Claude session** | Orchestrator spawns a review contractor | Zero -- separate agent, separate context | Medium -- uses existing contractor pattern |

**Recommendation: Sub-agent for now, contractor pattern later.**

The sub-agent approach works immediately in Claude Code. The CPO spawns a sub-agent (Task tool) with the spec and the assessment checklist. The sub-agent returns a structured report. Only the report enters the CPO's context, not the sub-agent's full reasoning chain.

For the future, the review could become a lightweight contractor -- the CPO commissions a "Spec Reviewer" contractor that runs the assessment checklist and second opinion, then returns a pass/fail report. This uses the existing contractor infrastructure and achieves full context isolation.

Docker is overkill for this use case. The security and isolation benefits of Docker apply to code execution (untrusted code, filesystem access, network calls). A spec review involves only text analysis -- no security risk, no filesystem mutation. The contractor pattern provides sufficient isolation without the operational complexity of container orchestration.

### When to use Ralph loops

Not every spec needs a Ralph loop. The decision tree:

```
Is this a complex feature with multiple subsystems?
  ├── Yes → Run Ralph loop (draft, assess, review, improve)
  └── No
      │
      Is this a feature with non-obvious edge cases?
        ├── Yes → Run single assessment + second opinion
        └── No → Run checklist only, proceed if passes
```

Simple features (add a button, change a colour) do not need multi-round self-validation. Complex features (authentication system, pipeline infrastructure) benefit from it. The CPO should use judgment about which level of self-assessment is appropriate.

---

## 4. Communication Patterns

### The "inform and proceed" template

When the CPO takes an autonomous action in Category 2, it uses this pattern:

```
[Brief statement of what is happening]. [One-sentence reason if not obvious].
```

Examples:

- "Spec passes quality checks. Setting to ready_for_breakdown and the orchestrator will dispatch breakdown."
- "Plan approved. Commissioning Project Architect to structure into 4 feature outlines."
- "Second opinion flagged two ambiguities. Fixing those now and re-running assessment."
- "All 3 features specced. Setting the last one to ready_for_breakdown. I'll review the breakdown output when it arrives."
- "This idea maps directly to an existing project. Creating as a feature under Dashboard."

**What NOT to do:**
- "I'm about to set this to ready_for_breakdown. Is that okay?" (asking permission for the obvious next step)
- "Should I proceed with commissioning the architect?" (asking when the answer is always yes)
- "I think the spec is ready but let me know if you want to review it first." (deferring quality judgment to the human)

### The "pause and ask" template

When the CPO encounters a Category 3 decision, it uses this pattern:

```
[State the situation]. [Present the options]. [Give your recommendation with reasoning].
[Explicitly ask for a decision].
```

Examples:

- "This capability would require a new repository -- it's architecturally separate from the existing dashboard. I'd recommend a new project for it, but this is a significant structural decision. Do you want to proceed with a new project, or should we explore fitting it into the existing repo?"
- "I've been looking at the roadmap and think Feature X should come before Feature Y -- X is a dependency that would make Y faster. But you originally prioritised Y first. Should I reorder?"
- "The monitoring agent proposed adding WebSocket support. My assessment is it's viable but would need 3-4 features and touches the real-time infrastructure. Worth pursuing, or park it for now?"

### Interrupt window design

The terminal-first design (companion doc) means the human sees everything the CPO does in real time. The inform-and-proceed pattern works because:

1. The human sees the CPO's announcement in the terminal output
2. The human can type in the input panel at any time to redirect
3. If the human types nothing, the CPO proceeds
4. If the human types "wait" or "stop" or "hold on", the CPO pauses

This is functionally equivalent to how experienced Claude Code users work: auto-approve is on, the agent runs, and the user interrupts when needed. The Anthropic research (Feb 2026) found this is the natural progression -- experienced users shift from approving individual actions to monitoring and intervening.

The key constraint: the CPO must give the human enough time to read the announcement before taking the action. In practice, this means the inform statement and the action should be in the same turn (the human sees both), not that the CPO should wait N seconds. The terminal scroll is the interrupt window.

---

## 5. Safety Rails and Audit Trail

### Failure modes and mitigations

| Failure mode | Description | Mitigation |
|--------------|-------------|------------|
| **Runaway chain** | CPO makes a sequence of autonomous decisions that collectively go off track | Contradicts-human-guidance heuristic; periodic check-in after every 3 autonomous actions |
| **Bad spec enters pipeline** | Self-assessment passes but spec has a fundamental flaw | Second opinion catches most of these; Breakdown Specialist will also flag impossible specs; verification gate catches implementation errors |
| **Wrong priority call** | CPO autonomously reorders roadmap incorrectly | This is Category 3 (pause and ask) unless the reordering is trivial dependency resolution |
| **Context drift** | CPO loses track of what the human originally wanted after long autonomous work | Periodic summary: after 3+ autonomous actions, CPO restates what it is working toward |
| **Premature ready_for_breakdown** | CPO sets status before spec is actually complete | Self-assessment checklist is the primary gate; self-containment test is the key check |

### CPO Action Log

Every Category 2 (inform and proceed) action should be logged to a structured audit file. This serves two purposes: the human can review what the CPO did autonomously, and the CPO can reference its own recent actions to detect runaway chains.

**Location:** `.claude/cpo-action-log.md` in the CPO workspace.

**Format:**
```markdown
## 2026-02-25T14:30:00Z
Action: Set feature "Dark Mode" (feat-abc-123) to ready_for_breakdown
Category: INFORM_AND_PROCEED
Reason: Spec passed self-assessment checklist (8/8) and second opinion (no critical issues)
Reversible: No (one-way door, but orchestrator picks it up)

## 2026-02-25T14:25:00Z
Action: Commissioned Project Architect for "User Authentication" initiative
Category: INFORM_AND_PROCEED
Reason: Plan approved by human in conversation
Reversible: Yes (features can be deleted)
```

The CPO should append to this log for every Category 2 action. The log is human-readable and can be reviewed at any time via the terminal or by reading the file directly.

### Runaway chain detection

After every **3 consecutive Category 2 actions without human input**, the CPO should pause and provide a brief summary:

> "Quick checkpoint: I've been working autonomously for a bit. Here's what I've done: [list of last 3 actions]. Here's what I'm about to do: [next action]. Let me know if you want to redirect, otherwise I'll continue."

This is not asking permission -- it is a checkpoint. If the human says nothing, the CPO continues. It prevents the failure mode where the CPO chains 10 autonomous decisions without the human realising the trajectory has drifted.

### Retroactive halt and revert

The human can always halt the CPO. Mechanisms:

- **Type "stop" or "wait" in the terminal** -- CPO pauses immediately
- **Type "revert [action]"** -- CPO undoes the most recent autonomous action if possible (e.g., cancel a feature, re-set status)
- **Read the action log** -- Human reviews what happened and decides what to keep/revert

For irreversible actions (like setting `ready_for_breakdown` after the orchestrator has already dispatched a Breakdown Specialist), the CPO should explain what can and cannot be undone:

> "The Breakdown Specialist has already been dispatched for this feature. I can't undo that, but if the breakdown output is wrong, we can discard the jobs and re-spec."

### Pipeline-level safety

The autonomous execution model adds CPO-level autonomy but does not change the pipeline's existing safety gates:

1. **Breakdown quality gate** -- Breakdown Specialist produces jobs; if they are bad, the verification gate catches them
2. **Job verification gate** -- Each job is verified after execution
3. **Feature verification gate** -- The entire feature is verified after all jobs complete
4. **Human testing gate** -- Human tests on the test server before production deployment
5. **Human approval for production** -- Nothing ships to production without human sign-off

The CPO's autonomy affects stages 1-4 of the pipeline (ideation through feature design). Stages 5-7 (breakdown, execution, verification) are already automated and have their own quality gates. The CPO making faster decisions at stages 1-4 does not reduce safety at stages 5-7.

---

## 6. Implementation: Where the Changes Go

### Option analysis

Four implementation options were considered. The recommendation is **Option D (autonomy configuration) with elements of A and B** as the initial delivery mechanism.

| Option | What changes | Pros | Cons |
|--------|-------------|------|------|
| **A: Role prompt changes** | Add autonomous execution instructions to `roles.prompt` | Simple, immediate | Permanent context cost (~300 tokens), inflexible |
| **B: Skill-level instructions** | Each skill ends with "proceed to next step" instead of "ask the human" | Localised, only loaded when relevant | Each skill is independent, no unified framework |
| **C: Pipeline orchestration skill** | A meta-skill that defines the pipeline flow with explicit "proceed" at each transition | Unified framework | Large context cost when loaded, overlaps with routing prompt |
| **D: Autonomy configuration** | Configurable autonomy level (Always Ask / Trust but Verify / Full Autonomy) | Flexible, human-tunable | Requires new configuration mechanism |

### Recommended approach: Layered implementation

**Layer 1: Role prompt (permanent, ~200 tokens)**

Add an "Operating Mode" section to the CPO's role prompt that establishes the default mindset. This is always in context and sets the baseline behaviour.

```markdown
## Operating Mode

You operate on a "forgiveness not permission" basis. When the next step
in a workflow is obvious and well-defined, proceed and inform the human.
Do not ask permission for routine pipeline progression.

Three categories govern your actions:
- PROCEED: Internal work (querying, drafting, self-review). Just do it.
- INFORM AND PROCEED: State changes and resource commits (setting
  ready_for_breakdown, commissioning contractors). Tell the human what
  you are doing, do not ask.
- PAUSE AND ASK: Novel, irreversible, or high-impact decisions
  (new projects, rejecting ideas, changing roadmap priorities,
  contradicting previous human guidance). Present options, recommend,
  wait for response.

When in doubt about which category applies, default to INFORM AND PROCEED
rather than PAUSE AND ASK. The human can always interrupt.

Run self-assessment before any one-way-door action. Do not ask the human
"is this ready?" -- assess it yourself.
```

**Layer 2: Skill-level changes (loaded on demand)**

Modify the existing skills to replace permission-seeking with proceed-and-inform behaviour.

**`/spec-feature` changes:**

Current Step 7:
> "Before setting the status, confirm explicitly: 'I'm about to mark this feature as ready for breakdown...' Only set the status after the human confirms."

Proposed Step 7:
> "Before setting the status, run the self-assessment checklist. If all items pass, run /second-opinion. If no critical issues, inform the human: 'Spec passes quality checks. Setting to ready_for_breakdown.' Then set the status. Do not ask for permission -- the self-assessment is the quality gate."

Current Step 6:
> "Ask: 'Does this capture everything? Anything to add, change, or remove?'"

Proposed Step 6:
> "Present the complete package to the human. The human may comment, redirect, or say nothing. If the human provides feedback, incorporate it. If the human says nothing or confirms, proceed to self-assessment (Step 7). Do not interpret silence as 'wait' -- interpret it as 'proceed.'"

**`/plan-capability` changes:**

Current Step 7:
> "The plan is not approved until the human says it is. Ask directly: 'Here's the final plan... Are you happy for me to commission a Project Architect?'"

Proposed Step 7:
> "Present the final plan summary. If the human has been actively engaged in the planning conversation and has not raised objections to the current scope, inform: 'Plan looks solid. Commissioning Project Architect to structure this.' If the human has expressed uncertainty or the scope changed significantly in the last round, pause: 'The scope shifted in our last exchange. Want to confirm the final version before I commission the architect?'"

**Layer 3: Autonomy configuration (future)**

A per-company setting in the `persistent_agents` table or a company-level config:

```sql
ALTER TABLE persistent_agents ADD COLUMN autonomy_level TEXT
  DEFAULT 'trust_but_verify'
  CHECK (autonomy_level IN ('always_ask', 'trust_but_verify', 'full_autonomy'));
```

| Level | Behaviour |
|-------|-----------|
| `always_ask` | Current behaviour. CPO asks permission at every stage transition. For new users building trust. |
| `trust_but_verify` (default) | Proposed behaviour. CPO proceeds autonomously for Category 1 and 2 actions, pauses for Category 3. Human can interrupt at any time. |
| `full_autonomy` | CPO proceeds for all categories except those that involve external communication, money, or contradicting explicit human guidance. For hands-off operation. |

The autonomy level is read by the CPO at session start and shapes its operating mode. In `trust_but_verify`, the role prompt's "Operating Mode" section is active. In `always_ask`, the CPO adds "ask the human before any state change" to its operating constraints. In `full_autonomy`, the CPO expands Category 2 to include most of Category 3.

**This configuration layer is NOT needed for the initial implementation.** The role prompt and skill changes deliver the core behaviour. The configuration layer is a future enhancement for when multiple companies use zazig with different trust levels.

---

## 7. Example Scenarios

### Scenario 1: Single feature, current vs proposed

**Current behaviour:**
```
Human: "Add dark mode to the dashboard."
CPO: *queries projects, finds Dashboard project*
CPO: "I found the Dashboard project. Should I create a feature for dark mode?"
Human: "Yes."
CPO: *creates feature*
CPO: "Let me ask some questions about the scope..."
  [conversation about colours, system preference, persistence]
CPO: "I've drafted a spec. Would you like to review it?"
Human: "Looks good."
CPO: "Should I write the acceptance criteria?"
Human: "Yes."
CPO: *writes ACs*
CPO: "Here are the acceptance criteria. Shall I also write the human checklist?"
Human: "Yes."
CPO: *writes checklist*
CPO: "Everything is drafted. Should I set this to ready_for_breakdown?"
Human: "Yes."
CPO: "Are you sure? Once I set it, it enters the automated pipeline."
Human: "Yes, do it."
```

**Human interrupts required: 6**

**Proposed behaviour:**
```
Human: "Add dark mode to the dashboard."
CPO: *queries projects, finds Dashboard project*
CPO: "Dashboard project exists. Creating a dark mode feature under it.
      Let me ask some questions about the scope..."
  [conversation about colours, system preference, persistence]
CPO: "I have enough to draft the spec. Writing it now."
CPO: *writes spec, ACs, human checklist*
CPO: "Here is the complete package:
      [spec summary]
      [AC summary]
      [human checklist summary]

      Running self-assessment now."
CPO: *runs checklist -- all pass*
CPO: *runs second opinion -- no critical issues*
CPO: "Spec passes quality checks. Setting to ready_for_breakdown."
CPO: *sets status*
```

**Human interrupts required: 0 (human participated in scope conversation but was never asked for permission)**

### Scenario 2: Multi-feature initiative, current vs proposed

**Current behaviour:**
```
Human: "We need user authentication."
CPO: "This is a multi-feature capability. Should I start planning?"
Human: "Yes."
  [planning conversation]
CPO: "Here is the plan. Should I commission a Project Architect?"
Human: "Yes."
  [... time passes ...]
CPO: "Project Architect created 3 features. Should I start speccing them?"
Human: "Yes."
  [spec conversation for feature 1]
CPO: "Feature 1 spec is ready. Should I set to ready_for_breakdown?"
Human: "Yes."
  [repeat for features 2 and 3]
```

**Human permission requests: 5 (start planning, commission architect, start speccing, ready_for_breakdown x3)**

**Proposed behaviour:**
```
Human: "We need user authentication."
CPO: "This is a multi-feature capability. Let me ask some questions..."
  [planning conversation]
CPO: "Plan looks solid. Commissioning Project Architect to structure into features."
CPO: *commissions architect*
  [... time passes ...]
CPO: "Project Architect created 3 features: OAuth Integration, Session Management,
      Permission Model. Starting with OAuth Integration. Here's what's in the outline..."
  [spec conversation for feature 1]
CPO: "Spec passes quality checks. Setting OAuth Integration to ready_for_breakdown.
      Moving to Session Management next."
  [spec conversation for feature 2]
CPO: "Spec passes quality checks. Setting Session Management to ready_for_breakdown.
      Moving to Permission Model next."
  [spec conversation for feature 3]
CPO: "Spec passes quality checks. Setting Permission Model to ready_for_breakdown.
      All 3 features are now in the pipeline. I'll review the breakdown output
      when it arrives."
```

**Human permission requests: 0 (human participated in planning and spec conversations but was never asked for permission)**

### Scenario 3: Genuine decision point

```
Human mentioned last week: "Let's focus on the dashboard first."

[Monitoring agent submits proposal for a mobile app]

CPO: "I received a proposal from the monitoring agent for a mobile app.
      It looks viable -- there's clear demand signal from user research.
      However, this would require a new project and would divert attention
      from the dashboard work you prioritised.

      My recommendation: park this for now and revisit after the dashboard
      features ship. The demand signal isn't going anywhere.

      What would you like to do? Options:
      1. Park it (my recommendation)
      2. Pursue it alongside dashboard work
      3. Reprioritise -- dashboard can wait"
```

**This is Category 3: the CPO pauses because it would contradict previous human guidance.**

### Scenario 4: Ralph loop in action

```
CPO: "Writing the spec for OAuth Integration now."
CPO: *drafts spec*
CPO: *runs self-assessment checklist*
CPO: "Self-assessment: 7/8 items pass. Issue: Requirement 4 ('handle token refresh')
      is not specific enough to be testable. Improving."
CPO: *rewrites requirement 4 with specific refresh scenarios*
CPO: *re-runs checklist -- 8/8 pass*
CPO: *runs second opinion*
CPO: "Second opinion flagged: scope boundary between OAuth feature and Session
      Management feature is ambiguous around token storage. Clarifying."
CPO: *adds explicit scope boundary for token storage*
CPO: *re-runs checklist -- 8/8 pass*
CPO: "Spec passes quality checks on second iteration. Setting to ready_for_breakdown."
```

**The human never had to review the spec for completeness. The CPO assessed it, improved it, and proceeded.**

---

## 8. Configuration Model

### Initial delivery (no configuration needed)

The initial implementation changes the CPO's role prompt and skills to use the `trust_but_verify` model by default. No database changes, no configuration UI. This is a prompt engineering change that can be deployed by updating the CPO's `roles.prompt` and the skill files.

### Future: per-company autonomy setting

When zazig serves multiple companies with different trust levels, the autonomy configuration becomes relevant:

```
Company config:
  autonomy_level: always_ask | trust_but_verify | full_autonomy

Compiled into CPO role prompt at startup:
  always_ask      → "Always ask the human before taking any action that changes state."
  trust_but_verify → [Operating Mode section from Layer 1]
  full_autonomy   → "Proceed with all actions. Pause only for actions that
                     contradict explicit human guidance, involve external
                     communication, or involve financial commitments."
```

### Human override at runtime

Regardless of the configured autonomy level, the human can override at any time:

- **"Be more autonomous"** -- CPO shifts up one level for the rest of the session
- **"Ask me before doing X"** -- CPO adds a specific action to Category 3 for the session
- **"Go ahead, I'll check in later"** -- CPO shifts to full_autonomy for the current task
- **"Wait"** / **"Stop"** -- CPO pauses immediately regardless of autonomy level

These runtime overrides do not persist across sessions. They are conversational agreements, not configuration changes.

---

## 9. Relationship to Existing Architecture

### Compatibility with the pipeline design

The autonomous execution model does not change the pipeline's architecture. It changes the CPO's behaviour within the existing pipeline:

- **Stages 1-4** (ideation through feature design): CPO operates more autonomously, asking fewer permission questions
- **Stages 5-7** (breakdown through verification): No change -- these are already automated
- **Entry Points A, B, C**: No change to the entry point structure

### Compatibility with the org model

The CPO's charter already includes "Product strategy and roadmap ownership" and "Card prioritisation" in its mandate. Autonomous execution is within the CPO's constitutional authority. The interdictions (never write code, never make architecture decisions, never dispatch implementation agents) remain unchanged and continue to bound the CPO's autonomous actions.

### Compatibility with the terminal-first design

The terminal-first design is what makes autonomous execution safe. The human sees everything in real time. The "inform and proceed" pattern leverages the terminal's visibility -- the CPO announces what it is doing, and the human can interrupt by typing. This would not work in the Slack-based design (where messages are queued and the human has no real-time visibility into the CPO's reasoning).

### Compatibility with charters

The charter system provides the constitutional boundary. The autonomy model provides the operational style within that boundary. They do not conflict:

- **Charter says:** "CPO owns product strategy and feature design"
- **Autonomy model says:** "Proceed with feature design decisions without asking"
- **Charter says:** "CPO must never make architecture decisions"
- **Autonomy model says:** "If the CPO spots an architecture implication, PAUSE AND ASK (Category 3)"

---

## 10. Rollout Plan

### Phase 1: Prompt changes (immediate)

1. Update CPO `roles.prompt` with the Operating Mode section
2. Update `/spec-feature` skill: replace Step 6 and Step 7 with autonomous versions
3. Update `/plan-capability` skill: replace Step 7 with conditional proceed/pause logic
4. Add self-assessment checklist to `/spec-feature` as a new Step 6.5

**Effort:** Prompt/skill file updates only. No code changes. Can be done in one session.

### Phase 2: Self-assessment skill (next session)

1. Create `/self-assess` skill that codifies the checklist and second opinion flow
2. Reference from `/spec-feature` -- "Before setting ready_for_breakdown, invoke /self-assess"
3. Define the Ralph loop iteration logic and limits

**Effort:** New skill file + cross-reference in existing skills. No code changes.

### Phase 3: Action log (next session)

1. Define the action log format
2. Add action log writing to the CPO's operating mode instructions
3. Add runaway chain detection (checkpoint after 3 autonomous actions)

**Effort:** Prompt changes + convention for the log file location.

### Phase 4: Autonomy configuration (future)

1. Add `autonomy_level` column to `persistent_agents` table
2. Compile autonomy level into the CPO's role prompt at startup
3. Add runtime override commands

**Effort:** Migration + prompt compilation logic. Needed only when serving multiple companies.

---

## Open Questions

### 1. Self-assessment as skill vs inline instructions

Should the self-assessment checklist be a separate skill (`/self-assess`) that loads on demand, or inline instructions within `/spec-feature`?

**Case for separate skill:** Reusable across different contexts (spec review, plan review, idea triage). Keeps `/spec-feature` focused on the conversation flow.

**Case for inline:** One fewer skill to load. The checklist is specific to spec-feature's output and may not generalise well.

**Current lean:** Inline within `/spec-feature` for Phase 1. Extract to separate skill if we find other contexts that need self-assessment.

### 2. Second opinion cost and latency

Running `/second-opinion` on every spec adds latency (30-60 seconds) and API cost (Codex or Gemini call). Is this acceptable for every feature, or should it be reserved for complex features?

**Current lean:** Run it for every feature. The cost is negligible compared to the cost of a bad spec entering the pipeline and producing bad jobs. Latency is acceptable because the human is not waiting -- the CPO is working autonomously.

### 3. Checkpoint frequency

"After every 3 consecutive Category 2 actions" is arbitrary. Should this be configurable? Should it be based on time rather than action count?

**Current lean:** Fixed at 3 for now. Adjust based on experience. Time-based checkpoints are harder to implement (the CPO does not have a clock concept) and less meaningful (3 actions in 5 minutes is different from 3 actions over 2 hours).

### 4. How does the human know what autonomy level is active?

In the terminal-first design, the CPO should announce its operating mode at session start or when it changes:

> "Operating in trust-but-verify mode. I'll proceed with routine pipeline actions and inform you. I'll pause for significant decisions. Say 'be more autonomous' or 'ask me about everything' to adjust."

This is a UX question for the terminal design, not an architecture question.

---

## Summary

The CPO should operate on a "forgiveness not permission" basis. This proposal defines:

1. **Three action categories** (proceed, inform-and-proceed, pause-and-ask) based on reversibility and impact
2. **A self-assessment protocol** that replaces "is this ready?" with an internal quality checklist
3. **Ralph loops for spec quality** -- iterative draft-assess-review-improve cycles with hard limits
4. **Communication templates** for each category that inform without blocking
5. **Safety rails** including an action log, runaway chain detection, and retroactive halt capability
6. **A layered implementation** starting with prompt changes (zero code), graduating to configuration (when needed)
7. **Compatibility** with the existing pipeline, org model, charter system, and terminal-first design

The core behavioural change: the CPO stops asking "Should I do the obvious next thing?" and starts saying "I'm doing the obvious next thing."
