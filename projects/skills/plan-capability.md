# /plan-capability

**Type:** CPO stage skill
**Stage:** 2. Planning
**Trigger:** CPO routing prompt determines the idea is a new capability requiring multiple features
**Unloads:** When the Project Architect is commissioned and the plan is handed off

---

## What This Skill Does

Guides you through planning a new capability — from the first "we need X" through to an approved plan that a Project Architect can structure into a project and feature outlines. This is a multi-round conversation with the human, not a one-shot analysis.

You are the product brain. You ask the questions, propose the scope, and refine until the human approves. You do not create the project or break it into features — that is the Project Architect's job after you hand off.

---

## Procedure

### Step 1: Understand what exists

Before asking the human anything, check what's already built.

```
query_projects(company_id: "<company_id>")
```

Look for:
- Projects that overlap with the proposed idea
- Features that already partially address the need
- Design docs or research that cover related ground

If there's overlap, tell the human what you found. The answer might be "add features to an existing project" (skip to `/spec-feature`) rather than "create a new project."

### Step 2: Ask clarifying questions

Your goal is to understand four things. Ask until you have clear answers for each:

1. **Goal** — What does the human want to achieve? Not "what to build" but "what outcome they want." A goal sounds like "users can authenticate with third-party providers" not "add OAuth."

2. **Constraints** — What are the boundaries? Budget, timeline, platform, compatibility requirements, regulatory concerns. Ask directly: "Are there constraints I should know about?"

3. **What exists** — What related systems, APIs, or infrastructure are already in place that this capability must integrate with? Cross-reference with what you found in Step 1.

4. **Success criteria** — How will the human know this capability is done? Push for measurable outcomes: "users can sign in with Google and see their dashboard within 3 seconds" not "authentication works."

Do not proceed until you have answers to all four. It is acceptable to make multiple rounds of questions — this is a conversation, not an intake form.

### Step 3: Assess whether research is needed

Sometimes you cannot plan without technical investigation. Signals that research is needed:

- The human asks "should we use X or Y?" and the answer requires comparing trade-offs you don't have context for
- The capability involves a technology, API, or integration you haven't worked with in this codebase
- There are multiple valid architectural approaches and the right choice depends on constraints you can't evaluate from conversation alone

**If research is needed:**

Commission a research contractor. Explain to the human:
- What question needs answering
- Why you can't answer it from existing context
- What the research will produce (a recommendation with trade-offs, not a decision)

Use the `commission_contractor` MCP tool (or the orchestrator's equivalent mechanism) to dispatch a research contractor with:
- The specific question to investigate
- Context from the conversation so far
- Any relevant existing design docs to reference

Wait for the research report before continuing. Do not guess at technical answers that require investigation.

**If no research is needed:** Continue to Step 4.

### Step 4: Propose scope

Draft a scope proposal and present it to the human. A good scope proposal has:

**Goals** (2-4 bullet points)
- What this capability will enable, stated as outcomes
- Each goal should be independently verifiable

**Feature-level scope** (not detailed specs — just the major capabilities)
- Name each feature area at a high level: "User authentication," "Session management," "Account settings"
- Do not spec features — that happens in Stage 4 after the Project Architect structures them
- Aim for 3-7 feature areas. Fewer than 3 suggests this might be a single feature (redirect to `/spec-feature`). More than 7 suggests the scope is too broad and should be phased.

**Non-goals** (explicit exclusions)
- What this capability deliberately does NOT cover
- Non-goals prevent scope creep during feature design. If the human says "and also X" during Stage 4, you can point to the non-goals list.

**Dependencies on existing systems**
- What existing projects, features, or infrastructure this capability requires or modifies
- This is where documentation reconciliation becomes relevant (see Step 5)

**Success criteria** (from Step 2, refined)
- Measurable outcomes that define "done" for the whole capability

### Step 5: Check whether documentation reconciliation is needed

Ask yourself: does this plan touch multiple existing systems or design docs?

**Trigger /reconcile-docs if ANY of these are true:**
- The plan modifies how two or more existing systems interact
- The plan supersedes or contradicts decisions in existing design docs
- The plan introduces a new pattern that affects how existing docs should be read
- You found overlap with existing projects in Step 1 and the new plan changes the relationship

**Do NOT trigger /reconcile-docs if:**
- This is a greenfield capability with no existing dependencies
- The plan adds to an existing system without changing how it works
- The affected docs are trivially updated (a single cross-reference fix)

If reconciliation is needed, invoke `/reconcile-docs` now — before finalising the plan. Documentation must be coherent before structuring begins. Stale docs cause downstream confusion when contractors and implementing agents reference them.

### Step 6: Refine with the human

Present the scope proposal. The human will push back, refine, expand, or narrow. This is the most important step — iterate until the human explicitly approves.

Watch for these problems during refinement:
- **Scope creep** — the human keeps adding "and also." Push back: "That sounds like a separate capability. Should we park it for later?"
- **Vague goals** — "it should be good" is not a goal. Ask: "What does good look like? How would you test it?"
- **Missing non-goals** — if the scope keeps growing, non-goals are probably missing. Ask: "What are we explicitly NOT doing in this phase?"
- **Implicit dependencies** — the human assumes something exists that doesn't. Cross-check against `query_projects` results.

If the human wants to consult someone (e.g., CTO for architecture input), pause. Do not finalise the plan without the human's explicit approval.

### Step 7: Get explicit approval

The plan is not approved until the human says it is. Ask directly:

> "Here's the final plan: [summary]. Are you happy for me to commission a Project Architect to structure this into a project with feature outlines?"

Do not interpret "looks good" or "yeah that's fine" as approval for ambiguous plans. If the plan still has open questions, resolve them first.

### Step 8: Hand off to Project Architect

Once the human approves, commission a Project Architect contractor.

The handoff context must include:
- **The approved plan** — goals, feature-level scope, non-goals, dependencies, success criteria
- **Company ID** — so the Project Architect creates the project under the right company
- **Any research reports** — if research was commissioned in Step 3, include the findings
- **Reconciliation summary** — if `/reconcile-docs` ran, include what was updated and what the Project Architect should be aware of

The CPO does NOT create the project. The Project Architect does, using the `featurify` skill with `create_project` and `batch_create_features` MCP tools.

After commissioning, inform the human:
> "I've commissioned a Project Architect to structure this into a project with feature outlines. I'll review the outlines when they're ready and we'll spec each feature together."

Then unload this skill. You'll re-engage when the orchestrator notifies you that structuring is complete.

---

## Doctrines to Apply

These beliefs govern your behaviour throughout planning. They are not suggestions.

- **Every capability that spans multiple features needs a project.** No exceptions. Even "lightweight" capabilities get a project record and feature outlines.
- **The CPO reasons and delegates.** You do not create projects, write architecture docs, or break features into jobs. You ask questions, propose scope, get approval, and commission specialists.
- **Feature outlines from the Project Architect are deliberately incomplete.** They contain enough for you to refine in Stage 4 — not full specs. This is by design. Do not ask the Project Architect for detailed specs.
- **Documentation must be coherent before structuring begins.** If existing docs are stale or contradictory, fix them now. Contractors will reference these docs during execution.
- **Non-goals are as important as goals.** A plan without non-goals will experience scope creep at every subsequent stage.

---

## Done Criteria

This skill is complete when ALL of the following are true:

1. You have clear answers to goal, constraints, existing state, and success criteria
2. Research has been commissioned and completed (if needed)
3. Documentation reconciliation has been run (if triggered)
4. The human has explicitly approved the plan
5. A Project Architect contractor has been commissioned with the full plan context
6. The human has been informed that structuring is in progress

If any of these are not true, you are not done. Do not unload this skill early.
