# Software Development Pipeline Design

**Date:** 2026-02-20
**Status:** Approved
**Author:** CPO + Tom (brainstorming session)

---

## Overview

The v2 pipeline replaces the Trello-driven, VP-Eng-dispatched v1 system with a fully orchestrator-driven pipeline. The orchestrator's `jobs` table in Supabase is the single source of truth. Humans interact via Slack (with CPO for strategy, directly with fix agents for testing). A web frontend provides visibility.

**Key principles:**
- Orchestrator owns all operations (dispatch, verify, deploy, notify, merge)
- CPO owns strategy only (design features, prioritize, triage rejections)
- Human involvement at two points: design (with CPO) and acceptance testing (with fix agent)
- Quality is baked in at design time via acceptance criteria, not discovered at review time

---

## Two-Level Work Structure: Features and Jobs

### Features (human-facing)

A feature is the unit of conversation between the human and CPO. It represents a user-visible piece of functionality.

**`features` table fields:**

| Column | Type | Content |
|--------|------|---------|
| `spec` | text | What the feature does, full context (markdown) |
| `acceptance_tests` | text | Automated test descriptions for the whole feature |
| `human_checklist` | text | Manual verification steps for the test server |
| `status` | enum | `design`, `building`, `verifying`, `testing`, `done`, `cancelled` |
| `project_id` | ref | Which project this belongs to |

### Jobs (machine-facing)

A job is the unit of execution. Each job belongs to a feature and represents one piece of work an agent can complete independently.

**`jobs` table fields (additions to existing schema):**

| Column | Type | Content |
|--------|------|---------|
| `feature_id` | ref | Parent feature |
| `spec` | text | Scoped spec for this job's piece |
| `acceptance_tests` | text | Automated tests for just this job |
| `sequence` | int | Order within the feature (for dependent jobs) |
| `status` | enum | Full state machine (see below) |

### Design Flow

1. Human talks to CPO in Slack about a feature idea
2. CPO asks clarifying questions, drafts feature-level spec + acceptance tests + human checklist
3. Human reviews and approves
4. CPO breaks the feature into jobs, each with scoped spec and acceptance tests
5. A job cannot move from `design` to `queued` unless `spec` and `acceptance_tests` are populated
6. Feature status moves to `building` once jobs are queued

---

## Job Lifecycle State Machine

```
                         +-----------------------------------+
                         |                                   |
  design --> queued --> dispatched --> executing --> verifying --> testing --> approved --> done
    |                                     |              |           |
    |                                     |              |           +--> rejected --> queued
    |                                     |              |                (big fail)
    |                                     +--> failed    +--> verify_failed --> queued
    |                                     (agent crash)   (tests broke)
    +--> cancelled
```

| Status | What's happening | Who owns it |
|--------|-----------------|-------------|
| `design` | CPO + Human defining spec, acceptance tests, human checklist | CPO (Slack) |
| `queued` | Fully specced, waiting for an available agent slot | Orchestrator |
| `dispatched` | Sent to a machine, awaiting ack | Orchestrator |
| `executing` | Agent is building | Agent |
| `verifying` | Rebase on feature branch, run tests, code review, lint | Orchestrator |
| `verify_failed` | Automated checks failed — auto-requeues with failure context | Orchestrator |
| `testing` | Feature deployed to test env, human notified | Human + Fix Agent |
| `approved` | Human approved — auto-merge + deploy | Orchestrator |
| `rejected` | Human rejected — feedback captured, requeued | Orchestrator |
| `done` | Merged to main, deployed to production | Terminal |
| `failed` | Agent crashed or unrecoverable error | Orchestrator |
| `cancelled` | Human or CPO killed it | Terminal |

**Key rules:**
- `verify_failed` auto-requeues with failure context attached
- `rejected` goes back to `queued` with human feedback — next agent run has that context
- Only one feature per project can be in `testing` at a time (single test env constraint)
- Features queue at the `verifying` → `testing` transition if the test env is occupied

---

## Feature Lifecycle

| Status | Meaning |
|--------|---------|
| `design` | CPO + Human defining the feature |
| `building` | Jobs are queued/executing/verifying |
| `verifying` | All jobs merged into feature branch, running full verification |
| `testing` | Deployed to test env, human testing |
| `done` | Merged to main, deployed to production |
| `cancelled` | Abandoned |

A feature moves to `verifying` when its last job merges into the feature branch. It moves to `testing` only after feature-level verification passes.

---

## Branch Strategy

```
main
 |
 +---> feature/{feature-name}              <-- feature branch (integration point)
         |
         +---> job/{job-name}              <-- job 1 works here
         |      +-- verified --> merge into feature branch
         |
         +---> job/{job-name}              <-- job 2 works here
         |      +-- verified --> merge into feature branch
         |
         +---> job/{job-name}              <-- job 3 works here
                +-- verified --> merge into feature branch
```

1. Orchestrator creates `feature/{name}` branch from main when feature moves to `building`
2. Each job gets a `job/{name}` branch off the feature branch
3. Agent works in its job branch (isolated worktree)
4. **Job verification:** rebase job branch on feature branch, run job's tests, code review. Pass → auto-merge into feature branch
5. Jobs run in parallel — merges into the feature branch are sequential (first done merges first, next rebases on updated feature branch)
6. **Feature verification:** once all jobs merged, rebase feature branch on main, run ALL tests
7. Pass → deploy to test env, notify human
8. Human approves → merge feature branch to main, deploy to prod

### Two Verification Gates

| Gate | When | What runs | Failure action |
|------|------|-----------|----------------|
| **Job verify** | Each job completes | Job's acceptance tests + lint + typecheck + code review | Requeue that job |
| **Feature verify** | All jobs merged into feature branch | ALL tests + rebase on main | Identify failing job, requeue it |

---

## Test Environment

- One test environment per project, replica of production
- Only one feature on the test env at a time
- Features queue up if the test env is occupied
- Test env watches the feature branch — pushes auto-redeploy

### What Happens When a Feature Hits Testing

The orchestrator:
1. Deploys the feature branch to the test env
2. Spawns a fix agent attached to the feature branch and connected to a Slack thread
3. Sends a Slack notification directly: feature name, test env URL, human checklist

### Fix Agent

The fix agent is always present while a feature is in `testing`. It is:
- A code-capable agent (Claude Agent SDK, engineer role)
- Working on the same feature branch deployed to test
- Connected to the Slack thread for the feature
- Ephemeral — cleaned up when the feature leaves `testing`

If the human finds a small issue, they talk to the fix agent directly in the thread. The agent pushes fixes, the test env auto-redeploys, and the human verifies in real time.

After fixes, the feature re-enters verification (rebase on main, run all tests) before returning to `testing` status.

### Human Approval

- "Ship it" → orchestrator merges feature branch to main, deploys to prod, cleans up fix agent + branches + worktrees. Next feature in queue gets deployed to test env.
- Small issue → talk to fix agent in thread, iterate in real time
- Big issue (feature fundamentally wrong) → feature goes back to `building` with feedback, CPO triages whether it needs redesign

---

## Role Boundaries

### Orchestrator (operations)

Owns the entire mechanical pipeline:
- Job dispatch to machines
- All verification (rebase, tests, code review, lint)
- Test env deployment
- Fix agent lifecycle
- Slack notifications (direct, not via CPO)
- Merge to main and production deploy
- Branch and worktree management
- Test env queue management

### CPO (strategy)

Only involved for human-facing decisions:
- Design features with the human (spec, acceptance tests, human checklist)
- Break features into jobs
- Prioritize the queue ("pause X, ship Y first")
- Status summaries ("what's the pipeline look like?")
- Triage big rejections (feature needs redesign)

CPO never dispatches agents, deploys, merges, or sends operational notifications.

### Fix Agent (tactical)

Ephemeral code agent for interactive fix sessions:
- Spawned by orchestrator when feature enters `testing`
- Works on the feature branch
- Responds to human in Slack thread
- Cleaned up when feature leaves `testing`

### Human

Involved at two points:
1. **Design** — works with CPO to define features and acceptance criteria
2. **Acceptance testing** — tests on the test server, approves or rejects

Can optionally request active collaboration on specific features (CPO can flag a feature for more human involvement at design time).

---

## Automation Summary

| Trigger | Orchestrator action |
|---------|-------------------|
| Job status → `queued` | Find machine with available slot, dispatch |
| Agent reports complete | Job status → `verifying`, run job verification |
| Job verification passes | Merge job branch into feature branch. Last job? → feature verification |
| Job verification fails | Job status → `verify_failed`, requeue with context |
| Feature verification passes | Deploy to test env (if available), spawn fix agent, notify via Slack |
| Feature verification fails | Identify broken job, requeue it |
| Human says "ship it" | Merge feature branch to main, deploy to prod, clean up everything |
| Human rejects (small) | Fix agent handles in-thread |
| Human rejects (big) | Feature → `building`, feedback attached, CPO triages |
| Feature done | Next queued feature gets the test env |
