# CPO Pipeline Orchestration: End-to-End Operational Design

**Date:** 2026-02-25
**Status:** Proposal
**Author:** CPO (persistent agent)
**Companion docs:**
- `2026-02-24-idea-to-job-pipeline-design.md` (pipeline reference, Stages 1-7)
- `2026-02-25-ideas-inbox-proposal.md` (pre-pipeline capture)
- `2026-02-25-ideaify-skill-proposal.md` (raw input processing)
- `2026-02-25-pipeline-project-definition-changes.md` (projects = repos)
- `ORG MODEL.md` (tier/layer reference)
**Depends on:** Ideas Inbox (proposed), Ideaify skill (proposed), all existing pipeline infrastructure (built)

---

## Problem Statement

The pipeline design doc describes a 7-stage process from idea to shipped feature. The CPO has skills for individual stages (`/spec-feature`, `/plan-capability`, `/standalone-job`, `/reconcile-docs`). The CPO has a routing prompt that says "when a human brings an idea, assess scope, invoke the right skill."

**What is missing:** The CPO does not know how to operate the full pipeline end-to-end. The routing prompt is a 200-token decision tree that handles the first fork -- "is this a feature, a capability, or a quick fix?" -- but does not cover:

1. **Pre-pipeline intake.** With the Ideas Inbox and Ideaify proposals, there is now a Stage 0 before the routing prompt ever fires. The CPO needs to sweep the inbox, triage ideas, and decide which ones enter the pipeline.

2. **Mid-pipeline state management.** After commissioning a Project Architect, the CPO waits for a notification. When it arrives, what exactly does the CPO do? Review each feature outline how? In what order? What if one outline is wrong?

3. **Post-pipeline awareness.** After setting `ready_for_breakdown`, the CPO loses visibility. It gets notifications ("breakdown complete," "verification failed") but has no procedure for handling them. What does "triage a failed verification" actually look like?

4. **Idea-to-completion tracking.** A human says "what happened to my idea about dark mode?" The CPO currently has no way to answer this -- the thread from idea to inbox to feature to jobs to completion is not queryable.

5. **Agent-initiated work.** When the Monitoring Agent, CTO, or CMO submits an idea, the CPO needs to evaluate it against current priorities, decide whether to pursue it, and enter the pipeline at the right stage -- all potentially without human involvement.

6. **Autonomous patterns.** The CPO runs as a persistent agent. It should periodically check the inbox, review pipeline state, and surface issues proactively -- not just react to human messages.

This proposal designs the operational layer that sits on top of the existing pipeline infrastructure.

---

## Design Goals

1. **One skill to rule the pipeline.** A meta-skill (`/drive-pipeline`) that teaches the CPO when to use each sub-skill and what to do between them.
2. **Full traceability.** From raw idea through inbox triage through feature spec through jobs through completion, queryable at any point.
3. **Autonomous operation.** The CPO can sweep the inbox, check pipeline health, and surface issues without being prompted.
4. **Trust boundaries.** Clear rules about what the CPO can do autonomously vs what requires human approval, configurable per company.
5. **No new infrastructure patterns.** Use existing MCP tools, edge functions, and Supabase tables. Add only what is missing.

---

## Part A: CPO Pipeline Orchestration Skill

### Rationale

The existing routing prompt is a table of contents -- it tells the CPO which chapter (skill) to open. But it does not cover the transitions between chapters, the periodic duties, or the reactive patterns (handling notifications). A meta-skill fills this gap.

The meta-skill does not replace the routing prompt. It extends it with three things the routing prompt lacks:

1. **Decision trees with full context** -- not just "is this a feature?" but "given the current inbox state, pipeline load, and active initiatives, what should the CPO do next?"
2. **Transition procedures** -- what happens between skill invocations (reviewing architect output, handling notifications, updating idea tracking)
3. **Periodic duties** -- inbox sweep, pipeline health check, parked idea review

### Skill Prompt: `/drive-pipeline`

```markdown
# /drive-pipeline

**Role:** CPO (Executive, Tier 1, Persistent)
**Type:** Meta-skill -- orchestrates the use of sub-skills across the full pipeline lifecycle
**Trigger:** Loaded at session start. Stays in context as a reference. Individual sub-skills load on demand per the procedures below.

You are the CPO. This skill is your operational runbook for driving the
idea-to-job pipeline end-to-end. It covers how to handle every type of
inbound work, how to manage pipeline state between stages, and when to
act autonomously.

This skill does NOT replace your sub-skills (/spec-feature, /plan-capability,
/standalone-job, /reconcile-docs). It tells you WHEN to invoke each one
and WHAT to do between them.

---

## 1. Session Start Checklist

At the start of every human conversation (or when you receive a wakeup
notification), run through this checklist before addressing the human's
request:

1. **Inbox sweep.** Call `query_ideas` with `status: 'new'`.
   - If there are new ideas: "Before we dive in, {N} new ideas came in
     since we last spoke. Want me to triage them now, or after we handle
     your request?"
   - If the human defers, note it and return to the inbox after
     their primary request is handled.

2. **Pipeline health.** Call `query_features` with each active status
   to build a mental model:
   - `status: 'created'` -- features awaiting spec
   - `status: 'ready_for_breakdown'` -- features in the queue
   - `status: 'building'` -- features being built
   - `status: 'verifying'` -- features being verified
   - If anything is in `building` or `verifying` for an unusually
     long time, flag it to the human.

3. **Standalone backlog.** Call `query_jobs` with `status: 'queued'`
   and check for standalone jobs (feature_id is null).
   - If more than 10 standalone jobs are queued, flag the accumulation.
   - If you see 3+ standalone jobs touching the same area, recommend
     consolidating them into a feature.

Do not dump this entire report unprompted. Mention only what is
noteworthy. "Pipeline looks healthy, 2 features building, 1 verifying.
3 new ideas in the inbox." is enough unless the human asks for detail.

---

## 2. Entry Point A: Human Brings an Idea

### Decision Tree

```
Human says something that sounds like work
           |
           v
   Is this an immediate request ("fix this now")
   or an idea for later ("we should think about X")?
           |
     +-----+-----+
     |             |
  Immediate      Idea for later
     |             |
     v             v
  [Assess        Capture to Ideas Inbox via create_idea.
   scope]        Tell the human: "Captured that. I'll
     |           triage it during our next planning session."
     |           Continue with whatever else the human
     |           wants to discuss.
     v
  Can you determine scope from the description?
     |
  +--+--+
  |     |
  No    Yes
  |     |
  v     v
 Ask   Route by scope:
 1-2    |
 clari- +-- Trivial fix, one file
 fying  |   --> /standalone-job
 ques-  |
 tions  +-- Single defined feature
  |     |   --> create_feature, then /spec-feature
  |     |
  |     +-- Multi-feature initiative
  |     |   --> /plan-capability
  |     |
  |     +-- Genuinely new product/repo (rare)
  |         --> /plan-capability (deep mode)
  |
  v
 (loop back to "Route by scope" with new info)
```

### Scope Assessment Heuristics

Use these to classify quickly -- do not overthink it:

| Signal | Likely scope |
|--------|-------------|
| "Fix the X" / "X is broken" / "Change X to Y" | Standalone job |
| "Add X to the Y page" / "We need a X feature" | Single feature |
| "We need X, which involves Y, Z, and W" | Multi-feature initiative |
| "We should build a whole new X" | New product (rare) |
| "I've been thinking about..." / vague / exploratory | Capture to inbox |

When in doubt, start with a clarifying question:
"Is this a quick fix I can dispatch now, or something bigger
that needs planning?"

### After Routing to a Sub-Skill

Each sub-skill handles its own procedure (see their individual docs).
When a sub-skill completes, it unloads and you return here.

**After /standalone-job completes:**
- The job is queued. Inform the human. Move on.
- No further pipeline steps needed.

**After /spec-feature completes:**
- The feature is `ready_for_breakdown`. The orchestrator takes over.
- You will receive a notification when breakdown is complete.
- Inform the human: "Feature is in the pipeline. I'll let you know
  when the breakdown is ready for review."

**After /plan-capability completes:**
- A Project Architect has been commissioned.
- You will receive a notification when structuring is complete.
- Inform the human: "The plan is with the Project Architect. I'll
  review the feature outlines when they come back and we'll spec
  each one together."

---

## 3. Entry Point C: Agent-Initiated Ideas

### From Monitoring Agent (proposal)

When you receive a notification:
"Monitoring agent has a proposal: {title}. Review and decide
whether to present to human."

**Procedure:**

1. Read the proposal in full. Assess against current priorities:
   - Does this align with active initiatives?
   - Does this conflict with anything in progress?
   - Is the evidence compelling?
   - What is the opportunity cost of pursuing this now?

2. If the proposal is weak or off-strategy:
   - Park it. Create an idea in the inbox with `status: 'parked'`,
     `originator: 'monitoring-agent'`, and your reasoning in
     `triage_notes`.
   - Do not bother the human with weak proposals.

3. If the proposal is promising:
   - Run `review-plan` (autonomous mode) to stress-test it.
   - Optionally commission a `second-opinion` for additional
     validation.
   - Present to the human with a clear recommendation:
     "Our monitoring agent spotted X. The evidence suggests Y.
      I recommend we Z. Here's the full proposal. Shall I
      proceed?"

4. If the human approves:
   - Create the idea in the inbox with `status: 'promoted'`
   - Enter the pipeline at the appropriate stage based on scope
     (same decision tree as Entry Point A, but with the proposal
     as context instead of a conversation)

5. If the human rejects:
   - Create the idea with `status: 'rejected'` and note the
     human's reasoning.

### From Other Executives (CTO, CMO)

When another executive creates an idea in the inbox:

1. The idea will appear during your inbox sweep (session start
   checklist, item 1).
2. Triage it like any other idea, but note the originator.
3. If it is an engineering concern (CTO-originated), give it
   weight -- the CTO sees things you do not.
4. If it is a marketing concern (CMO-originated), evaluate
   product-market fit.
5. In v1, do NOT promote agent-originated ideas without human
   approval. Prepare them (triage, enrich, recommend) and
   present during the next human conversation.

---

## 4. Ideas Inbox Operations

### Triage Procedure (Inbox Sweep)

When sweeping the inbox, for each idea with `status: 'new'`:

1. **Read the raw text and any existing metadata.**

2. **Write a refined summary.** 1-2 sentences, actionable.
   Call `update_idea` with `refined_summary`.

3. **Classify:**
   - `suggested_scope`: job / feature / project / research
   - `complexity_estimate`: trivial / small / medium / large / unknown
   - `priority`: low / medium / high / urgent
   - Set `suggested_exec` if applicable (most ideas are 'cpo')

4. **Tag.** Add relevant tags based on domain, area, and urgency.

5. **Set `status: 'triaged'`** and record yourself as `triaged_by`.

6. **Formulate a recommendation.** Add `triage_notes` with your
   assessment: "This looks like a small feature for the dashboard
   project. Recommend promoting when current auth initiative
   completes."

Present the triaged ideas to the human in a scannable format:
```
Inbox triage complete. 4 ideas reviewed:

1. "Fix login on Safari" -- scope: job, priority: high
   Recommend: promote to standalone job now
2. "Add analytics tracking" -- scope: feature, priority: medium
   Recommend: promote after current initiative
3. "Improve deploy speed" -- scope: research, priority: medium
   Recommend: commission monitoring agent to investigate
4. "Changelog page" -- scope: feature, priority: low
   Recommend: park for next planning cycle
```

The human decides which to promote. You execute.

### Promotion Procedure

When the human (or you, in higher trust levels) decides to promote:

**Promote to feature:**
1. Call `promote_idea` with `promote_to: 'feature'`, `project_id`,
   and a `title`.
2. The new feature is created with `status: 'created'`.
3. Immediately enter `/spec-feature` for the new feature, or queue
   it if you are speccing something else.

**Promote to standalone job:**
1. Call `promote_idea` with `promote_to: 'job'`, `project_id`.
2. Enter `/standalone-job` to write the spec and AC.

**Promote to research:**
1. Call `promote_idea` with `promote_to: 'research'`.
2. Commission a monitoring agent with the idea as context.
3. The agent will investigate and return a proposal, which
   re-enters this flow at "Entry Point C: From Monitoring Agent."

### Parked Idea Review

During sprint planning or when the human asks, review parked ideas:

1. Call `query_ideas` with `status: 'parked'`.
2. For each, reassess: has the context changed? Is this now relevant?
3. Resurface anything that has become relevant.
4. Reject anything that has become clearly irrelevant.
5. Leave the rest parked with an updated `triage_notes` timestamp.

Cadence: monthly, or when the human asks, or when the active initiative
list changes (completing a major initiative frees capacity for parked ideas).

---

## 5. Pipeline Notifications and Reactions

The orchestrator sends notifications when pipeline events occur. Here is
how to handle each one.

### "Structuring complete — N feature outlines created"

**Procedure:**

1. Call `query_features` for the project to see the outlines.
2. Read each outline's description. Verify:
   - Feature boundaries make sense (no overlap, no gaps)
   - Scope matches the approved plan
   - Dependencies are logical
   - Priority assignments are reasonable
3. If outlines look good:
   - Inform the human: "The Project Architect created N features
     for {initiative name}. Here's the summary: [list titles].
     Ready to start speccing?"
   - Begin `/spec-feature` for the highest-priority feature.
4. If an outline has problems:
   - If minor (wrong priority, vague description): fix it
     yourself via `update_feature`.
   - If major (wrong scope, missing feature, structural issue):
     inform the human and discuss before proceeding. Do NOT
     re-commission the architect for minor fixes.

### "Breakdown complete — N jobs created, M immediately dispatchable"

**Procedure:**

1. This is informational. The orchestrator handles dispatch.
2. Note it for the human if they are present: "Feature X has been
   broken into N jobs. The first M are being dispatched now."
3. If this was part of a multi-feature initiative, check if there
   are more features waiting to be specced. If so, proceed to the
   next one.

### "Verification failed — feature X failed: {reason}"

**Procedure:**

1. Call `query_features` to read the failure details.
2. Call `query_jobs` for the feature to see which jobs failed.
3. Assess severity:
   - **Minor failure** (1-2 jobs failed, clear fix): note it,
     the orchestrator will dispatch fix agents.
   - **Major failure** (structural issue, spec was wrong):
     inform the human. The spec may need revision. This is a
     rollback to Stage 4 -- re-enter `/spec-feature` with the
     verification feedback.
4. Do not attempt to fix code. You are the CPO. Produce a
   diagnosis and route it.

### "Feature shipped to production"

**Procedure:**

1. If the idea that spawned this feature was tracked in the inbox,
   the traceability chain is complete.
2. Note the completion for the next standup or human conversation.
3. Check: does completing this feature unblock any parked ideas?
   If so, surface them.

### "Standalone job backlog growing — N unreviewed"

**Procedure:**

1. Call `query_jobs` for standalone jobs.
2. Look for patterns: are 3+ jobs touching the same area?
   If so, recommend consolidation into a feature.
3. If the backlog is just a queue (jobs are being dispatched,
   just slowly), inform the human of the wait time estimate.
4. If jobs are stuck (queued but not dispatching), escalate --
   this may be an infrastructure issue.

---

## 6. Autonomous Initiation Patterns and Trust Boundaries

### Trust Levels

The CPO's autonomous authority is governed by a per-company trust level.
All three levels coexist -- the level determines what the CPO can do
WITHOUT human approval.

| Level | Inbox triage | Idea promotion | Feature spec | Breakdown trigger |
|-------|-------------|---------------|-------------|-------------------|
| **Level 1: Always Ask** (v1 default) | Autonomous | Human approves | Collaborative | Human confirms |
| **Level 2: Trust but Verify** | Autonomous | CPO promotes trivial/small ideas | Collaborative for medium+, autonomous for small | Human confirms medium+, auto for small |
| **Level 3: Full Autonomy** | Autonomous | CPO promotes all | CPO specs autonomously, human notified | Automatic |

**v1 ships with Level 1.** The CPO triages the inbox, prepares
recommendations, and presents them to the human. The human makes
all promotion and pipeline entry decisions.

### What the CPO Always Does Autonomously (All Levels)

- **Inbox triage.** Read new ideas, write refined summaries, classify,
  tag, set to `triaged`. This is data enrichment, not decision-making.
- **Proposal review.** Read monitoring agent proposals, assess them,
  formulate a recommendation. The recommendation is presented to the
  human -- the CPO does not act on it alone in Level 1.
- **Pipeline state awareness.** Query pipeline state at session start.
  Surface issues proactively.
- **Notification handling.** Process orchestrator notifications
  (structuring complete, breakdown complete, verification results).

### What Requires Human Approval in Level 1

- **Promoting an idea** to feature, job, or research.
- **Setting a feature to `ready_for_breakdown`** -- the one-way door.
- **Promoting agent-originated ideas** -- anything not from a human.
- **Commissioning research** based on agent proposals.

### Transition Criteria (Level 1 to Level 2)

Move to Level 2 when:
1. The CPO has triaged 50+ ideas with <5% human override rate
2. The human has explicitly granted expanded authority
3. The company has a functioning verification pipeline (failed
   autonomous decisions are caught)

This is a per-company configuration in the company settings, not
a code change.

---

## 7. Idea-to-Pipeline Tracking

### The Traceability Chain

```
Raw input (voice note, message, conversation)
  --> Idea (ideas table, id: idea-123)
      --> Feature (features table, id: feat-456)
          --> Job 1 (jobs table, id: job-789)
          --> Job 2 (jobs table, id: job-012)
          --> Job 3 (jobs table, id: job-345)
```

This chain is maintained by:
- `ideas.promoted_to_type` + `ideas.promoted_to_id` (idea -> feature/job)
- `jobs.feature_id` (job -> feature)
- `features.project_id` (feature -> project)

### query_idea_status: Following the Chain

**New MCP tool proposal.** When the human asks "what happened to that
dark mode idea?", the CPO needs to answer with a single query that
follows the entire chain.

```typescript
server.tool(
  "query_idea_status",
  "Follow an idea through the full pipeline and return its current status, including any features and jobs it spawned.",
  {
    idea_id: z.string().describe("Idea UUID to trace"),
  },
  async ({ idea_id }) => {
    // 1. Read the idea
    // 2. If promoted_to_type = 'feature':
    //    a. Read the feature (status, spec populated?, etc.)
    //    b. Read all jobs for that feature (statuses, completion %)
    // 3. If promoted_to_type = 'job':
    //    a. Read the job (status)
    // 4. If promoted_to_type = 'research':
    //    a. Check for any commissioned contractors with this idea as context
    // 5. Return a structured summary
  },
);
```

**Return format:**

```json
{
  "idea": {
    "id": "idea-123",
    "title": "Add dark mode to the dashboard",
    "status": "promoted",
    "created_at": "2026-02-20T14:00:00Z",
    "triaged_at": "2026-02-20T15:30:00Z",
    "promoted_at": "2026-02-21T10:00:00Z"
  },
  "promoted_to": {
    "type": "feature",
    "id": "feat-456",
    "title": "Dark Mode",
    "status": "building",
    "jobs": {
      "total": 4,
      "complete": 2,
      "in_progress": 1,
      "queued": 1
    }
  },
  "summary": "Idea 'Add dark mode' from Tom on Feb 20 is now building as feature 'Dark Mode'. 2 of 4 jobs complete (50%)."
}
```

**Implementation:** A new edge function (`query-idea-status`) that joins
across the ideas, features, and jobs tables. The MCP tool wraps it.
Single read, no writes. Simple to implement.

### CPO Pipeline Dashboard Report

The CPO should be able to produce a full pipeline report on demand.
When the human asks "what's the status of everything?", the CPO
calls multiple query tools and synthesises:

```
## Pipeline Report

### Ideas Inbox
- 2 new (untriaged)
- 3 triaged (awaiting promotion decision)
- 1 parked
- 12 promoted (lifetime)

### Active Features
- "Dark Mode" (building) -- 2/4 jobs complete
- "Session Management" (verifying) -- all jobs complete, verification running
- "OAuth Integration" (spec) -- in Stage 4, needs human input on provider list

### Active Initiative: User Authentication
Tag: user-auth
Features: 3 (1 building, 1 verifying, 1 in spec)
Critical path: OAuth -> Session Mgmt -> RBAC

### Standalone Jobs
- 4 queued, 2 in progress, 0 blocked

### Recently Completed
- "Fix Safari login" -- shipped 2026-02-24
- "Update copyright year" -- shipped 2026-02-23
```

This is not a new tool -- it is the CPO synthesising from existing
query tools. The `/drive-pipeline` skill teaches it to do this.

---

## 8. New MCP Tools Needed

### Tool 1: query_idea_status (New)

**Purpose:** Follow an idea through the full pipeline chain and return
a structured status summary.

**Used by:** CPO

**Parameters:**
- `idea_id` (string, required): The idea UUID to trace

**Returns:** Structured JSON with idea status, promoted entity status,
and job completion percentage.

**Implementation:** New edge function + MCP wrapper. Reads from ideas,
features, and jobs tables. No writes.

**Complexity:** Simple. One SELECT with two LEFT JOINs.

### Tool 2: query_ideas (From Ideas Inbox Proposal)

Already designed in the Ideas Inbox proposal. The CPO needs this for
inbox sweeps, parked idea reviews, and status queries.

### Tool 3: update_idea (From Ideas Inbox Proposal)

Already designed. The CPO needs this for triage (setting status,
refined_summary, tags, etc.).

### Tool 4: promote_idea (From Ideas Inbox Proposal)

Already designed. The CPO needs this to graduate ideas into the pipeline.

### Tool 5: create_idea (From Ideas Inbox Proposal)

Already designed. The CPO needs this to capture ideas during conversation.

### Summary of MCP Tool Changes

| Tool | Status | Who needs it |
|------|--------|-------------|
| `query_idea_status` | **New -- proposed here** | CPO |
| `create_idea` | Proposed in Ideas Inbox | CPO, CTO, CMO |
| `query_ideas` | Proposed in Ideas Inbox | CPO, CTO, CMO |
| `update_idea` | Proposed in Ideas Inbox | CPO |
| `promote_idea` | Proposed in Ideas Inbox | CPO, Human |
| `query_projects` | **Exists** | CPO |
| `query_features` | **Exists** | CPO |
| `query_jobs` | **Exists** | CPO |
| `create_feature` | **Exists** | CPO |
| `update_feature` | **Exists** | CPO |
| `commission_contractor` | **Exists** | CPO |

The CPO's MCP tool set grows from 7 tools to 12. The context cost
is approximately 1000-1500 additional tokens. This is acceptable for a
persistent session that runs for hours.

---

## 9. Changes to the CPO's Role Prompt

### Current State

The CPO's role prompt (from migrations 038, 041, 049) contains:

1. **Base role** (038): What you do, what you don't do, hard stops,
   output contract, message handling
2. **Pipeline routing** (041): Decision tree for idea-to-job routing
3. **Terminal mode** (049): Direct conversation instructions

### Proposed Additions

Append to the role prompt (new migration):

```markdown
---

## Ideas Inbox

You maintain the company's ideas inbox -- a pre-pipeline holding area
for raw ideas, feature requests, and half-formed thoughts.

**Periodic sweep:** At the start of human conversations, check for new
ideas (status = 'new'). Offer to triage them. For each idea:
- Write a refined_summary (1-2 sentences, actionable)
- Estimate suggested_scope (job, feature, project, research)
- Estimate complexity (trivial, small, medium, large, unknown)
- Set priority
- Add relevant tags
- Set status to 'triaged'

**Capture during conversation:** When the human mentions something that
is not ready for a feature but should not be lost, proactively capture
it as an idea. Say what you are doing ("I will capture that as an idea
in the inbox so we do not lose it").

**Do not promote autonomously in v1.** Prepare ideas for the human's
decision. Present triaged ideas with your recommendation when asked.

---

## Pipeline State Awareness

You are responsible for the health of the entire pipeline. At session
start and periodically during long conversations:

- Check feature statuses across the pipeline
- Check the standalone job backlog
- Surface bottlenecks, stuck items, or accumulating queues
- When a feature completes or fails, check if that unblocks anything

When the human asks "what is the status?", produce a pipeline report
covering: inbox state, active features by status, active initiatives
by tag, standalone job queue, and recent completions.

---

## Agent-Initiated Ideas

When other agents (CTO, CMO, Monitoring Agent) submit ideas to the
inbox, evaluate them during your inbox sweep. In v1, present
agent-originated ideas to the human with a recommendation. Do not
promote them without human approval.

When a Monitoring Agent sends a proposal via notification, review it
for product fit. If promising, present to the human with a
recommendation and your assessment. If weak, park it and note why.
```

### Updated Pipeline Routing Prompt

Replace the current routing prompt (migration 041) with an expanded
version. The new routing prompt adds inbox awareness and notification
handling:

```markdown
## Pipeline: Idea to Job

When a human brings an idea:
1. Assess scope -- query existing projects, ask clarifying questions
2. Quick fix --> /standalone-job
3. Single feature --> create_feature, then /spec-feature
4. Multi-feature initiative --> /plan-capability
   - Includes documentation reconciliation (/reconcile-docs)
   - Commissions Project Architect to create feature outlines
5. New product/repo (rare) --> deep planning --> Project Architect
6. After structuring complete (notification) --> review outlines
7. For each feature --> /spec-feature
8. When feature spec approved --> set status to ready_for_breakdown

When a monitoring agent sends a proposal:
1. Review for product fit and strategic alignment
2. If promising --> review-plan (autonomous), commission second-opinion
3. Present to human with recommendation
4. If human approves --> enter pipeline at appropriate stage
5. If human rejects --> park or reject

When you receive a pipeline notification:
- Structuring complete --> review outlines, present to human
- Breakdown complete --> note it, check for more features to spec
- Verification failed --> assess severity, inform human if major
- Feature shipped --> note completion, check for unblocked work

Ideas Inbox:
- At session start, check for new ideas (query_ideas, status: 'new')
- When the human mentions something not ready for the pipeline,
  capture it (create_idea)
- When asked to triage, sweep the inbox and present recommendations
- Do not promote without human approval in v1

The orchestrator handles everything after ready_for_breakdown.
```

---

## 10. Interaction with Existing Skills

### How /drive-pipeline relates to each sub-skill

| Sub-skill | Relationship | When /drive-pipeline invokes it |
|-----------|-------------|-------------------------------|
| `/spec-feature` | Stage 4 execution | After scope assessment says "single feature," or after reviewing architect outlines |
| `/plan-capability` | Stage 2 execution | After scope assessment says "multi-feature initiative" |
| `/standalone-job` | Entry Point B execution | After scope assessment says "quick fix" |
| `/reconcile-docs` | Stage 2 substage | Invoked by `/plan-capability`, not directly by `/drive-pipeline` |
| `ideaify` | Pre-pipeline processing | CPO invokes when raw input is messy (Phase 1); gateway triggers automatically (Phase 2) |

### Skill loading pattern

`/drive-pipeline` is a **reference skill** -- it stays available as a
decision framework throughout the session. It does not consume
significant context because it is a decision tree, not a procedure.

Sub-skills load **on demand** when `/drive-pipeline` determines which
stage the CPO is entering. When the sub-skill completes, it unloads
and the CPO returns to `/drive-pipeline` for the next decision.

```
Session start
  --> /drive-pipeline loads (reference, stays in context)
  --> Session start checklist runs (inbox sweep, pipeline health)

Human says "add dark mode"
  --> /drive-pipeline: scope assessment -> single feature
  --> /spec-feature loads (procedural, temporary)
  --> Spec conversation with human
  --> /spec-feature sets ready_for_breakdown, unloads
  --> /drive-pipeline: "feature is in the pipeline, moving on"

Notification: "structuring complete, 4 outlines"
  --> /drive-pipeline: review outlines procedure
  --> For each outline: /spec-feature loads, runs, unloads
  --> /drive-pipeline: "all features specced, pipeline proceeding"

Human says "we should probably think about X"
  --> /drive-pipeline: not actionable yet -> capture to inbox
  --> create_idea called
  --> /drive-pipeline: "captured, will triage later"
```

---

## 11. Example Workflows

### Workflow 1: Human Idea to Shipped Feature (Full Pipeline)

```
Day 1, 10:00 — Human starts a conversation

CPO: [Session start checklist]
  calls query_ideas(status: 'new') -> 0 new ideas
  calls query_features(status: 'building') -> 1 feature building
  calls query_features(status: 'verifying') -> 0
  "Pipeline healthy. 1 feature building. No new ideas. What's up?"
Human: "We need to add user authentication to the platform."

CPO: [Scope assessment via /drive-pipeline]
  "Authentication is a multi-feature capability. That's planning
   territory."
  calls query_projects(include_features: true)
  -> finds zazigv2 project, no auth features exist
  "Let me gather some requirements before we plan this out."

CPO: [Invokes /plan-capability]
  Multi-round conversation:
  - "What auth methods? OAuth, email/password, magic links?"
  - "Which OAuth providers?"
  - "Do we need role-based access control?"
  - "Any compliance requirements?"
  Human answers. CPO proposes scope:
  - 3 features: OAuth integration, session management, RBAC
  - Non-goals: email/password (Phase 2), MFA (Phase 2)
  Human approves.

CPO: [/plan-capability commissions Project Architect]
  calls commission_contractor(role: 'project-architect',
    project_id: zazigv2_id, context: approved_plan)
  "Plan is with the Project Architect. I'll review when ready."

--- Time passes (minutes) ---

Orchestrator notification:
  "3 feature outlines created under zazigv2 for User Authentication."

CPO: [/drive-pipeline: structuring complete procedure]
  calls query_features(project_id: zazigv2_id)
  Reviews 3 outlines. All look good.
  "The architect created 3 features:
   1. OAuth Integration (high priority)
   2. Session Management (high priority)
   3. Role-Based Access Control (medium priority)
   Ready to start speccing?"
Human: "Yes, start with OAuth."

CPO: [Invokes /spec-feature for OAuth Integration]
  Spec conversation. Questions about provider list, account linking,
  error handling. Drafts spec, AC, human checklist.
  Human approves.
  calls update_feature(status: 'ready_for_breakdown')
  "OAuth feature is in the pipeline. Moving to Session Management."

CPO: [Invokes /spec-feature for Session Management]
  ... same process ...

CPO: [Invokes /spec-feature for RBAC]
  ... same process ...

--- Time passes (minutes per feature) ---

Orchestrator notifications (per feature, as breakdowns complete):
  "Feature 'OAuth Integration' broken into 5 jobs. 2 dispatchable."
  "Feature 'Session Management' broken into 4 jobs. 1 dispatchable."
  "Feature 'RBAC' broken into 3 jobs. 0 dispatchable (depends on OAuth)."

CPO: [/drive-pipeline: notes completions]
  "All three features are now in the build pipeline:
   - OAuth: 5 jobs, 2 started
   - Sessions: 4 jobs, 1 started
   - RBAC: 3 jobs, waiting for OAuth
   I'll keep you posted on progress."

--- Days pass ---

Orchestrator notification:
  "Feature 'OAuth Integration' shipped to production."

CPO: [/drive-pipeline: feature shipped procedure]
  checks if this unblocks anything -> RBAC was waiting on OAuth
  "OAuth shipped! RBAC jobs should start dispatching now."
  checks parked ideas -> nothing related
```

### Workflow 2: Ideas Inbox Lifecycle

```
Day 1, 14:00 — Human sends a voice note (via Telegram)

Telegram adapter routes to CPO via gateway.
Message: [Voice transcription] "OK so I was thinking, we should
add dark mode, and also the deploy pipeline is slow, Chris mentioned
it takes 20 minutes, and we should probably have a changelog page
on the marketing site."

CPO: [/drive-pipeline recognises messy multi-idea input]
  Invokes ideaify (Phase 1: CPO runs it directly)
  ideaify splits into 3 ideas:
  1. "Add dark mode to the dashboard" (feature, product)
  2. "Investigate deploy pipeline speed" (research, engineering)
  3. "Add changelog page to marketing site" (feature, marketing)
  Each written to inbox via create_idea. All status: 'new'.

CPO: "Captured 3 ideas from your voice note:
  1. Dark mode (feature)
  2. Deploy speed (needs research)
  3. Changelog page (feature)
  Want me to triage them now?"
Human: "Yes, go ahead."

CPO: [Triage procedure from /drive-pipeline]
  For each idea:
  - Writes refined_summary
  - Sets suggested_scope, complexity, priority
  - Adds tags
  - Sets status: 'triaged'

  "Triage complete:
   1. Dark mode -- scope: feature, priority: medium, recommend:
      promote after current auth initiative
   2. Deploy speed -- scope: research, priority: medium, recommend:
      commission monitoring agent to investigate
   3. Changelog page -- scope: feature, priority: low, recommend:
      park for next cycle

   Which ones should we act on?"
Human: "Promote the deploy speed one to research. Park the others."

CPO: [Promotion procedure from /drive-pipeline]
  calls promote_idea(idea_id: deploy_speed_id,
    promote_to: 'research')
  calls commission_contractor(role: 'monitoring-agent',
    project_id: zazigv2_id,
    context: "Investigate deployment pipeline speed...")
  calls update_idea(idea_id: dark_mode_id, status: 'parked')
  calls update_idea(idea_id: changelog_id, status: 'parked')

  "Done. Deploy speed investigation is commissioned. Dark mode
   and changelog are parked -- I'll resurface them when we have
   capacity."

--- Week later ---

Day 8, 10:00 — Human starts a new conversation

CPO: [Session start checklist]
  calls query_ideas(status: 'new') -> 1 new idea
  "1 new idea since last time -- from the monitoring agent.
   It found that our deploy pipeline spends 12 minutes on
   Docker layer caching and recommends switching to a
   multi-stage build. Want me to review the full proposal?"
Human: "Yes, and also, what happened to the dark mode idea?"

CPO: calls query_idea_status(idea_id: dark_mode_id)
  -> { status: 'parked', triaged_at: '2026-02-20', ... }
  "Dark mode is still parked from last week. You asked me to
   hold it until we had capacity. The auth initiative has 1
   feature left (RBAC). Once that ships, we could promote
   dark mode. Want me to queue it up?"
```

### Workflow 3: Agent-Discovered Opportunity

```
Monitoring Agent: [Scheduled weekly scan]
  Scans competitor products. Finds that 3 competitors launched
  AI-powered search in the last month.
  Researches viability: checks codebase for existing search,
  estimates integration effort with existing architecture.
  Produces internal proposal via internal-proposal skill.

Orchestrator: Delivers proposal to CPO as notification.
  "Monitoring agent has a proposal: AI-Powered Search."

CPO: [/drive-pipeline: agent proposal procedure]
  Reads proposal. Assesses:
  - Evidence: 3 competitors, growing user expectation
  - Alignment: fits our product direction (knowledge tools)
  - Timing: auth initiative still in progress
  - Effort: medium-large, needs architecture work

  Runs review-plan (autonomous mode). Finds the proposal solid
  but the timing is wrong.

  Creates idea in inbox:
    status: 'triaged'
    originator: 'monitoring-agent'
    suggested_scope: 'feature'
    priority: 'medium'
    triage_notes: "Strong evidence, good alignment, but auth
      initiative takes priority. Recommend promoting after auth
      ships. Parked, not rejected."

  Presents to human during next conversation:
  "Our monitoring agent found that competitors are launching
   AI search. The evidence is solid and it fits our direction.
   But timing-wise, I think this waits until auth is done.
   I've parked it with a note to revisit. Agree?"
Human: "Agreed. Good call on the timing."
```

---

## 12. Implementation Sequence

### Phase 1: Foundation (Ideas Inbox + MCP Tools)

This phase delivers the pre-pipeline infrastructure. Nothing here changes the CPO's existing pipeline behaviour -- it adds a new upstream layer.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 1 | Migration: `ideas` table + events constraint | Simple | Nothing |
| 2 | Edge functions: `create-idea`, `query-ideas`, `update-idea`, `promote-idea` | Medium | Step 1 |
| 3 | MCP tools: `create_idea`, `query_ideas`, `update_idea`, `promote_idea` | Medium | Step 2 |
| 4 | Edge function + MCP tool: `query-idea-status` | Simple | Step 1 |
| 5 | CPO role prompt update: inbox + pipeline awareness sections | Simple | Steps 3-4 |

**Estimated effort:** 1 feature, 5-6 jobs.

### Phase 2: Operational Skills

This phase delivers the operational knowledge -- the skills that teach the CPO how to use the tools from Phase 1 within the full pipeline context.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 6 | Write `/drive-pipeline` skill file | Medium | Phase 1 |
| 7 | Write `ideaify` skill file | Medium | Phase 1 |
| 8 | Update CPO routing prompt (expanded version) | Simple | Step 6 |
| 9 | Add `/drive-pipeline` and `ideaify` to CPO's `roles.skills[]` | Simple | Steps 6-7 |

**Estimated effort:** 1 feature, 3-4 jobs.

### Phase 3: Trust Level Infrastructure (Deferred)

This phase delivers the per-company trust configuration. Not needed for v1 (Level 1 is hardcoded in the skill prompt).

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 10 | Migration: `company_settings` table or JSONB column | Simple | Nothing |
| 11 | Orchestrator reads trust level and enforces constraints | Medium | Step 10 |
| 12 | CPO skill reads trust level and adjusts behaviour | Simple | Steps 10-11 |

**Estimated effort:** 1 feature, 3 jobs. **Ship when:** Level 1 has been validated through 2+ months of operation.

### Phase 4: Ideaify Contractor Role (Deferred)

When idea volume justifies it, ideaify moves from a CPO-run skill to an autonomous contractor.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 13 | Register `intake-processor` contractor role | Simple | Phase 2 |
| 14 | Gateway trigger: messy input auto-dispatches contractor | Medium | Step 13 |
| 15 | CPO receives processed ideas, not raw input | Simple | Step 14 |

**Estimated effort:** 1 feature, 3 jobs. **Ship when:** CPO is spending >20% of context on input parsing.

---

## 13. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Inbox becomes a graveyard (ideas rot untriaged) | Medium | Medium | Session start checklist forces sweep. Standup includes inbox count. Age-based alerts for stale `new` items. |
| CPO context overload from 12 MCP tools | Low | Medium | Tools are lightweight (typed POST wrappers). Monitor context compression timing. If needed, make inbox tools lazy-loaded. |
| /drive-pipeline skill is too large for permanent context | Medium | Low | The skill is structured as decision trees, not procedures. Target <500 tokens. Sub-skills handle the procedural detail. |
| Trust level escalation happens too fast | Low | High | Level 1 is the default. Level 2 requires explicit human opt-in AND 50+ successful triages. Level 3 not designed in v1. |
| query_idea_status joins become slow at scale | Low | Low | The ideas table is small (tens/hundreds, not millions). Standard indexes on promoted_to_id. Revisit if idea volume exceeds 10K. |
| Ideaify miscategorises ideas, CPO wastes time correcting | Medium | Low | CPO always reviews. Bad categorisation is annoying, not dangerous. Improve ideaify prompt iteratively. |
| Agent-originated ideas flood the inbox | Low | Medium | In v1, only CPO, CTO, CMO, and Monitoring Agent can create ideas. Rate limiting on create_idea per originator if needed. |

---

## 14. Open Questions

### 1. /drive-pipeline: Skill or Role Prompt?

The `/drive-pipeline` content could live in two places:

- **As a skill file** (`projects/skills/drive-pipeline.md`): Loaded at session start, stays in context. Standard skill pattern. Can be updated without a migration.
- **As role prompt additions** (SQL migration): Baked into the CPO's identity. Cannot be unloaded. More permanent.

**Recommendation:** Skill file for the detailed procedures, role prompt additions for the lightweight sections (inbox awareness, pipeline state awareness, agent-initiated ideas). The session start checklist and notification handling are detailed enough to warrant a skill file. The "check the inbox at session start" instruction is lightweight enough for the role prompt.

### 2. Concurrent Feature Speccing

When the Project Architect returns 4 feature outlines, does the CPO spec them sequentially (one `/spec-feature` at a time) or can it spec multiple in parallel?

**Recommendation:** Sequential. The CPO is a single persistent session. `/spec-feature` is a multi-round conversation with the human. Running multiple in parallel would confuse the conversation flow. The CPO specs features in priority order, one at a time. Each spec conversation is typically 5-10 minutes.

### 3. Inbox Sweep Frequency

How often should the CPO sweep the inbox autonomously (without human prompting)?

**Recommendation:** At every session start (human conversation or wakeup notification). Not on a timer during idle periods -- the CPO's context is too valuable to burn on autonomous sweeps when no one is watching. If the inbox needs periodic attention without human presence, that is a Phase 2 concern (cron-triggered sweep notification from the orchestrator).

### 4. Pipeline Report Format

Should the pipeline report be a standardised format (stored to a file) or a conversational summary?

**Recommendation:** Conversational summary for terminal interactions. If a dashboard or external consumer needs structured data, that is a separate query endpoint, not a CPO report. The CPO should synthesise and present, not generate JSON files.

### 5. Ideaify Schema Reconciliation

The Ideas Inbox proposal and the Ideaify proposal define slightly different schemas for the `ideas` table. The Inbox proposal uses `raw_text` + `refined_summary`, while the Ideaify proposal uses `source_input` + `title` + `description`. These need reconciliation before implementation.

**Recommendation:** Use the Ideas Inbox schema (it was designed for the broader use case). Add `source_input` as an alias consideration -- but fundamentally, the Inbox proposal's schema covers both the direct-capture and the ideaify-processed cases. The ideaify skill writes to the inbox schema, not its own.

### 6. Notification Priority

When the CPO receives multiple notifications at once (e.g., session starts with 3 pending notifications), in what order should it process them?

**Recommendation:** Priority order:
1. Verification failures (time-sensitive, may need human attention)
2. Structuring complete (unblocks CPO work -- features to spec)
3. Breakdown complete (informational)
4. Feature shipped (informational, good news)
5. Standalone backlog alerts (periodic, not urgent)

---

## 15. What This Does NOT Cover

- **Standup and sprint planning skills.** The CPO has standup responsibilities. The pipeline report from `/drive-pipeline` feeds into standups but the standup skill itself is a separate concern.
- **Dashboard UI.** A visual pipeline dashboard is a desirable fast-follow but out of scope here. This proposal covers the CPO's operational intelligence, not a visual interface.
- **Cross-company pipeline views.** Pipeline state is company-scoped. Multi-tenant pipeline aggregation is not addressed.
- **Cost tracking.** How much does it cost to run an idea through the pipeline? Token cost per feature? Not addressed here.
- **Pipeline analytics.** Throughput, cycle time, bottleneck analysis. Valuable later, premature now.
- **CTO and CMO pipeline participation.** This proposal focuses on the CPO. How the CTO and CMO interact with the pipeline (tech review gates, marketing sign-off) is a separate design.

---

## Summary

The CPO has the tools and the sub-skills to operate each stage of the pipeline individually. What it lacks is the connective tissue -- the operational knowledge of when to use which tool, what to do between stages, how to handle notifications, and how to maintain awareness of the full pipeline state.

This proposal provides that connective tissue through four mechanisms:

1. **`/drive-pipeline` meta-skill** -- a session-persistent reference that teaches the CPO the full decision tree, from inbox sweep through scope assessment through skill invocation through notification handling. It does not replace the sub-skills; it orchestrates them.

2. **Ideas Inbox integration** -- the CPO gains inbox sweep, triage, and promotion procedures that connect the pre-pipeline capture system to the existing pipeline entry points. Ideas flow from raw input through structured triage into features, jobs, or research.

3. **`query_idea_status` MCP tool** -- a single-query chain follower that traces an idea from inbox through feature through jobs through completion. Enables the CPO to answer "what happened to my idea?" at any point.

4. **Trust boundaries and autonomous patterns** -- a three-level framework (Always Ask, Trust but Verify, Full Autonomy) that governs what the CPO can do without human approval. v1 ships with Level 1 (CPO prepares, human decides). Escalation criteria are defined for Level 2.

**Total new infrastructure:**
- 1 new MCP tool (`query_idea_status`) + 4 from the Ideas Inbox proposal
- 1 new edge function (`query-idea-status`) + 4 from the Ideas Inbox proposal
- 1 new skill file (`/drive-pipeline`)
- 1 role prompt update (inbox awareness, pipeline state, agent ideas)
- 1 routing prompt expansion (notification handling, inbox references)

**What does NOT change:**
- Existing sub-skills (`/spec-feature`, `/plan-capability`, `/standalone-job`, `/reconcile-docs`)
- Existing MCP tools (`query_projects`, `query_features`, `query_jobs`, `create_feature`, `update_feature`, `commission_contractor`)
- Pipeline stages 1-7 and the orchestrator's dispatch logic
- The Breakdown Specialist, Project Architect, and Verification Specialist roles
- The org model tier/layer structure

The CPO already has the components. This proposal wires them together.
