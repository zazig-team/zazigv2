# Pipeline Design Gap Analysis: Trello Replacement Coverage

**Date:** 2026-02-20
**Author:** Tom + Claude
**Status:** Draft
**Reviews:** `2026-02-24-software-development-pipeline-design.md` vs `2026-02-19-orchestrator-trello-replacement-requirements.md`

---

## Purpose

The pipeline design (`2026-02-20`) describes the execution pipeline — how features flow through jobs, branches, verification, and testing to production. The Trello replacement requirements (`2026-02-19`) define what the orchestrator's task system must do to replace Trello as source of truth for task management, agent routing, and observability.

This doc identifies what's missing from the pipeline design when viewed through the lens of the Trello replacement requirements, plus additional flags on the pipeline design itself.

---

## Gaps: Trello Requirements Not Covered by Pipeline Design

### 1. Tag / Control Signal System

The Trello requirements define 12+ labels that drive all agent routing: `urgent`, `blocked`, `needs-human`, `codex-first`, `claude-ok`, `design`, `research`, `tech-review`, `team`, `cpo-generated`, `bug-scan`, `assigned-{user}`. The pipeline design's `jobs` table has no equivalent — no `tags`, no `token_budget`, no `priority`. The logic that decides which machine, which model, and which execution pattern to use is entirely absent from the schema.

### 2. Complexity / Token Budget Routing

The CLAUDE.md references DB-backed complexity routing and CPO enriching jobs with `complexity` (simple/medium/complex) and `card-type` (code/infra/design/research/docs). None of this appears in the pipeline design's `jobs` schema. Codex vs. Claude routing — a meaningful cost-control lever — is also absent.

### 3. Gate System

The Trello requirements define a formal `GateState`: type, classification (mechanical vs. architecture), reviewer role, timeout, auto-clearable. This captures the tech-review pattern where a human reviewer must weigh in before work proceeds, with auto-clear for mechanical reviews after a timeout. The pipeline design has automated `verifying` states but no concept of a human-reviewer gate mid-pipeline.

### 4. CTO Role — Dropped

Related to the above: the pipeline design defines Orchestrator, CPO, Fix Agent, and Human. There is no CTO. The Trello requirements describe CTO scanning all boards for `tech-review` tasks and writing classification comments. Whether this is intentionally cut or an omission is unclear.

### 5. Task Timestamps and Staleness

The requirements define `created_at`, `updated_at` (server-managed), `status_changed_at`, and `gate_registered_at`. These are needed for gate timeout calculation, stale job detection, and standup reporting. The pipeline design has none.

### 6. Activity Log / TaskEvent Schema

The requirements define an append-only `TaskEvent` log (comment, status_change, tag_change, gate_event, assignment) with `structured_data` for machine-parseable inter-agent protocol. The pipeline design mentions that "failure context" is attached on requeue and "feedback" is captured on rejection, but there is no schema for how this is stored or communicated between agents.

### 7. Batch Query API / Board Snapshot

Agents need a single-call project snapshot at startup (dispatch), for standup (CPO), and for cross-project scans (dashboard). The pipeline design defines no query API surface.

### 8. Cross-Project Queries

The pipeline design is single-project scoped. The requirements describe CPO reading across all projects for standup and CTO scanning all projects for tech-review tasks. No multi-project query pattern is defined.

### 9. Archive / Retention

The pipeline design has `done` and `cancelled` as terminal states. There is no auto-archive after 24h, no retention policy, and no `archived` state excluded from default queries.

### 10. Batch Task Creation API (Cardify Equivalent)

The pipeline design says CPO "breaks the feature into jobs" but doesn't define the API surface for this. The requirements define a batch creation endpoint with idempotency (`POST /api/v1/tasks/batch`). Without this, the CPO→job creation path is undefined.

### 11. Nightly Automated Scans

`done-archiver` and `nightly-bug-scan` have no equivalent. The requirements describe these as orchestrator config (scheduled tasks + dedup key on task creation). The pipeline design doesn't address scheduled operations.

### 12. Priority Ordering Within Queues

The requirements define `priority: int` for ordering within a status column. The pipeline design has `sequence: int` on jobs (job ordering within a feature) but no feature-level priority. If two features are both queued, dispatch order is undefined.

---

## Additional Flags: Pipeline Design Issues

### Flag 1: Parallel Jobs + Merge Conflicts Unhandled

Jobs run in parallel and merges into the feature branch are sequential. But if two parallel jobs modify the same file, the second merge is a conflict, not just a rebase. There is no conflict resolution strategy. This is likely to hit regularly for jobs that touch shared utilities or config.

### Flag 2: Test Env Queue Ordering Undefined

"Only one feature on the test env at a time" and "features queue at the verifying → testing transition." Undefined:
- Queue ordering: FIFO? Priority-based?
- Maximum queue depth / backpressure
- Timeout on testing if the human is unavailable for days

### Flag 3: "Big Reject" Path Underspecified

"Human rejects (big) → feature → building, feedback attached, CPO triages." Undefined:
- What happens to job branches already merged into the feature branch?
- Is the feature branch reset, deleted, recreated?
- Does CPO modify existing jobs or create new ones?
- Do previously-passed jobs get re-queued or treated as done?

This is a realistic scenario and needs a defined path.

### Flag 4: Fix Agent Re-Verification Cycle Missing from State Machine

The fix agent pushes fixes during testing. The doc says "the feature re-enters verification before returning to testing status." But this `testing → verifying → testing` cycle does not appear in the state machine or feature lifecycle diagram. The orchestrator needs an explicit trigger to re-run verification after a fix agent push.

### Flag 5: "Code Review" in Verification Is Undefined

Job verification lists "code review" alongside lint and typecheck as an automated step. Who or what performs it? An LLM call, static analysis, or something else? What does it check? What is the pass/fail criterion? This is listed as equivalent to lint but is orders of magnitude more complex to implement reliably.

### Flag 6: Job Sequence/Dependency Enforcement Undefined

The `jobs` table has `sequence: int` described as "order within the feature (for dependent jobs)." The branch strategy says jobs run in parallel. These conflict: if job 2 depends on job 1's output, the orchestrator must hold job 2 until job 1 merges. The enforcement mechanism is not described.

### Flag 7: No Fast Path for Jobs Created Outside CPO Design Flow

The only way jobs are created is CPO design → human approval → CPO breaks into jobs. No path exists for:
- Bugs discovered during testing that need a new job
- Hotfixes to production
- Security patches or dependency updates

The Trello system had VP-Eng and automated tools creating cards directly. Everything flowing through full CPO design may be too slow for some categories of work.

### Flag 8: Rebase Conflicts Not Distinguished from Test Failures

Feature verification: "rebase feature branch on main, run ALL tests. Fail → identify failing job, requeue it." A rebase conflict is not a test failure — you cannot identify a failing job from a conflict. These two failure modes need separate handling, and conflict resolution may require human intervention or a defined merge strategy.

### Flag 9: Heartbeat Depth — Machine-Level vs Job-Level Health

The orchestrator design specifies 30s heartbeats from local agents, with machines marked dead after 2 minutes. But heartbeats are machine-level only — "this machine is online." There's no per-job health reporting. A machine can be online with an agent session stuck at a permission prompt or frozen mid-execution. This is a known v1 antipattern ("tmux has-session as sole health check").

The local agent needs to report per-job health in its heartbeats: last activity timestamp, agent status (executing/idle/stuck), last tool call age. The orchestrator makes restart decisions based on richer data. Without this, the orchestrator has the same blind spot as v1's Supervisor.

### Flag 10: Cron Scheduling Not Addressed

The orchestrator only supports card-driven (poll-based) job dispatch. Multiple features need scheduled triggers: market researcher daily scan (product intelligence pipeline), nightly done-archiver, nightly bug-scan. A cron scheduler should be specced once in the orchestrator design. Proposed: cloud-side cron trigger creates a standard job on schedule, local agent executes it like any other job. If no machine is online at trigger time, job queues until one connects.

### Flag 11: CPO Runtime Ambiguity

The orchestrator design says "Zazig Python package stays for Slack bot / Agent SDK layer" but also describes CPO running on local machines managed by the local agent daemon (which "spins up tmux sessions, CLI processes"). Whether CPO is Claude Code (with Slack MCP) or Agent SDK (Slack-native) is not specified. This affects whether Claude Code skills are available to CPO — all planning workflows (brainstorming, review-plan, cardify) and the product intelligence pipeline depend on skills. Must resolve before building CPO-related features.

---

## Summary

| Category | Count |
|----------|-------|
| Gaps (Trello requirements missing from pipeline design) | 12 |
| Additional flags (design issues in pipeline doc itself) | 11 |

The pipeline design is solid on the happy path. It needs significant work on:

1. **Schema** — add `tags`, `complexity`, `token_budget`, `priority`, timestamps to `jobs`/`features`
2. **Routing** — define how tags + complexity drive dispatch decisions (model, pattern, machine selection)
3. **Query API** — define the board-snapshot endpoint and cross-project query surface
4. **Failure paths** — big reject branch cleanup, rebase-conflict vs. test-failure distinction, fix-agent re-verification cycle
5. **Gate system** — decide whether tech-review gating and CTO role are in scope or deliberately removed
6. **Operational plumbing** — archive/retention, nightly scans, scheduled tasks

The two documents should be reconciled into a unified design before implementation starts. Highest priority to resolve first: `jobs` schema (add routing metadata), failure state handling (big reject), and clarification on whether automated code review is LLM-based or static-analysis-based.
