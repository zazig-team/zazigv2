# Contractor Dispatch Routing Plan

**Date:** 2026-02-26
**Status:** Draft v3.2 — CTO reviewed, open questions answered, ready for implementation
**Authors:** Tom + CPO
**Context:** `commission_contractor` was removed (commit `299a328`) because it created conflicting jobs alongside the pipeline. This plan proposes a safer routing design.
**Reviewed by:** Codex (v2 + v3 code-level), Gemini (v2 + v3 architecture), CPO self-review (v3 gap analysis), CTO (v3.1 → v3.2 architecture review + open questions)
**Affects:** This plan, `2026-02-24-idea-to-job-pipeline-design.md`, `2026-02-24-software-development-pipeline-design.md`, `2026-02-18-orchestration-server-design.md`

---

## Why execs need to dispatch contractors

The feature pipeline handles structured work well: spec → breakdown → build → combine → verify. But execs regularly encounter work that doesn't fit that model:

**Operational tasks** — The CPO sees 9 features stuck in `combining` and needs a pipeline-technician to run SQL to unstick them. There's no feature to spec. There's no code to build. It's a one-shot operational fix that takes 30 seconds to execute. Putting it through the full pipeline (create feature → write spec → breakdown → build → combine → verify) would take hours for something that should take seconds.

**Investigations** — The CTO spots an anomaly in agent behaviour and needs a monitoring-agent to investigate. The investigation might lead to a feature, or it might confirm everything is fine. Until the investigation completes, there's nothing to spec.

**Pre-pipeline work** — A project-architect needs to structure a capability plan before features can even be created. This is upstream of the pipeline, not inside it.

**Post-pipeline fixes** — A verification-specialist finds a problem during review and needs a pipeline-technician to apply a quick database fix. The feature is in the pipeline, but the fix is operational.

These are the "things before and after the pipeline" Tom described. Without standalone dispatch, every piece of work — no matter how small or operational — must go through the full feature lifecycle. That's like requiring a planning permission application to change a lightbulb.

The capability existed via `commission_contractor` but was removed because it created conflicting jobs. The routing was broken, not the concept.

---

## What went wrong

The CPO double-dispatched: it called `update_feature(status: ready_for_breakdown)` to trigger the pipeline AND called `commission_contractor` for the same work. This created two parallel job streams for one piece of work — breakdown-specialist jobs from the pipeline AND a pipeline-technician job from direct dispatch, both competing for the same feature.

Root causes:
1. **Two independent job-creation paths** — the edge function and the orchestrator could both insert jobs with no shared transaction or awareness of each other
2. **No idempotency guard** — `commission_contractor` didn't check for existing active jobs with the same role+feature before inserting
3. **No clear routing rules in the CPO's prompt/skills** — the CPO didn't know when to use which path
4. **TOCTOU vulnerability** — even with guards, a separate edge function reading feature status and then inserting a job has a race window where the orchestrator can change state between read and insert

## Chris's input

> "Maybe in this circumstance the wrong role had the option of using the agent. Maybe the breakdown-specialist who was doing the job needs the option of chatting to another role, or passing the job to another role."

This suggests a different model: instead of execs dispatching contractors directly, pipeline agents themselves could delegate to specialists when they encounter something outside their scope.

## Tom's framing

> "Contractors are like specially equipped subagents. They have MCP access or specialist skills that execs don't have. Execs outsource small tasks to contractors rather than doing it themselves. If it's big enough, it goes through the pipeline. But there are things before and after the pipeline that benefit from an exec being able to dispatch work."

---

## The two dispatch paths

The pipeline has two legitimate entry points for work:

### Path A: Feature Pipeline (structured work)
```
Idea → Feature → Spec → ready_for_breakdown → Breakdown → Jobs → Build → Combine → Verify
```
- For work that needs a spec, breakdown, multiple jobs, and verification
- Orchestrator manages the entire lifecycle
- Full quality gates (breakdown, combine, verify)

### Path B: Standalone Jobs (operational tasks)
```
Exec → request_work MCP call → Edge function validates atomically → Job queued → Execute → Complete
```
- For one-shot operational tasks that don't require pipeline verification gates
- Synchronous feedback (accepted or rejected with reason)
- Simplified lifecycle: `queued → dispatched → executing → complete | failed`
- No breakdown, no combine, no verification gates
- Examples: run SQL to unstick something, investigate a signal, structure a plan

### What about quick engineering fixes?

The pipeline design doc (Entry Point B, Example D) described standalone engineering jobs like "fix the favicon." This plan narrows Entry Point B to **roles that don't require pipeline verification gates** — operational roles where the work doesn't need tests, lint, or code review.

Engineering quick fixes go through the pipeline as single-job features. The CPO creates a feature with a minimal spec, the breakdown specialist produces one job, the pipeline handles it. This is slower (minutes vs seconds) but preserves the verification gates that engineering work needs.

**Phase 1.1 optimisation:** The orchestrator can detect single-job features (breakdown produced 1 job) and skip the combine step (nothing to combine). This removes the most wasteful overhead without bypassing verification.

**The `/standalone-job` skill in the pipeline design doc is revised:** it now only applies to operational roles. See "Changes to other plans" below.

**The rule: one path per piece of work, never both. Operational work goes through Path B. Everything that requires verification gates goes through Path A.**

---

## Why the original guard-based approach was insufficient

The v1 draft proposed four guards (feature exclusion, role exclusion, idempotency, caller restrictions) on the existing `commission_contractor` edge function. Both Codex and Gemini independently identified fundamental problems with this approach:

### Design problem, not a guard problem (Gemini)

Four guards bolted onto a separate edge function treats a design problem as a guard problem. The root issue is that two independent systems (edge function and orchestrator) can both create jobs. No amount of application-level guards fully closes the gap because they can't share a transaction with the orchestrator.

### TOCTOU race conditions (Codex)

Even with Guard 1 (feature exclusion), this sequence is possible:
1. Feature X is in `created` status
2. CPO calls `commission_contractor(feature_id: X)` — guard reads status `created`, passes
3. Concurrent MCP call `update_feature(feature_id: X, status: ready_for_breakdown)` executes
4. `commission_contractor` inserts the standalone job
5. Orchestrator picks up `ready_for_breakdown`, creates breakdown job
6. Feature X now has both a standalone job AND a breakdown job — the original bug

### Caller identity gap (Codex)

Guard 4 (caller restrictions) is unenforceable. The edge function receives an HTTP request with a service role key — it has no idea which agent role called it.

### Wrapper feature side effects (Codex)

The orchestrator auto-creates a wrapper feature for any job with `feature_id = NULL`. This means standalone jobs without a feature get a synthetic feature in `building` status, which then triggers a spurious combine job when the standalone work completes.

---

## Proposed design: Dedicated edge function with atomic Postgres function

### Architecture context

The orchestrator is a **stateless Supabase Edge Function invoked by `pg_cron`** every minute. It is not a long-running server — each invocation creates a fresh Supabase client, runs one tick cycle (listen, reap, process lifecycle, dispatch), and exits. It has no HTTP router and no persistent state between invocations.

This means we cannot "add an endpoint to the orchestrator." Instead, standalone dispatch uses a **dedicated `request-work` edge function** that calls a **Postgres function** to do all validation and job insertion in a single database transaction. The TOCTOU protection comes from the atomic SQL, not from being "inside" the orchestrator process.

### How it works

```
CPO MCP call
  → request_work(role, project_id, feature_id?, context)
    → MCP server makes HTTP POST to request-work edge function
      → Edge function calls Postgres function: request_standalone_work(...)
        → Single transaction:
          1. Lock feature row (if feature_id provided) with SELECT ... FOR UPDATE
          2. Check feature is in safe state
          3. Check role is standalone-eligible
          4. Check no duplicate active jobs
          5. INSERT job with source='standalone'
        → Returns { job_id, status } or { rejected, reason }
      → Edge function returns result
    → MCP server returns result to CPO immediately

CPO receives:
  - Success: { job_id: "uuid", status: "queued" }
  - Rejection: { rejected: true, reason: "Feature is in 'building' state" }
```

### Why a Postgres function

The old `commission_contractor` edge function did validation as sequential JavaScript calls — read feature status, then check for duplicates, then insert. Between each step, state could change (TOCTOU).

A Postgres function runs all checks and the insert in a single transaction. The `SELECT ... FOR UPDATE` on the feature row prevents concurrent status changes during validation. This is the same pattern used for database constraints — the database enforces consistency, not the application.

### Why a separate edge function (not the orchestrator)

Both Codex and Gemini reviewed the orchestrator's architecture and independently concluded:
- The orchestrator's `Deno.serve` handler ignores the incoming request (`_req` parameter is unused) and runs its full tick cycle
- Routing different request types through the same function would create an inelegant dual-purpose function
- The atomic SQL provides all necessary safety guarantees regardless of which process calls it
- The orchestrator still needs to be taught about standalone jobs (via the `source` column), but it doesn't need to be the one creating them

### Caller identity stays at the MCP layer

The MCP server knows the caller's role (it has `ZAZIG_ROLE` in env). It controls which agents can call `request_work` via the existing `mcp_tools` allow-list, and validates the `role` parameter against per-caller restrictions before forwarding to the edge function.

---

## Validation rules (inside Postgres function)

All checks run in a single database transaction with row-level locking where needed.

### Feature lock

If the request includes a `feature_id`, lock the feature row and check its status:

```sql
-- Inside request_standalone_work() function:
SELECT status INTO v_feature_status
FROM features WHERE id = p_feature_id
FOR UPDATE;  -- prevents concurrent status changes

-- ALLOW if status IN ('created', 'design', 'speccing', 'complete', 'cancelled', 'failed')
-- REJECT otherwise
-- Exception: pipeline-technician and verification-specialist can target any feature
```

States explained:
- `created`, `design`, `speccing` — feature is not yet in the pipeline, standalone operational work is safe
- `complete`, `cancelled`, `failed` — terminal states, no pipeline work running
- Everything else — pipeline is active, standalone work would conflict

This is forward-compatible: any new status is blocked by default (not in the allow-list).

### Role eligibility

Only roles that don't require pipeline verification gates:

**Standalone-eligible:**
- `pipeline-technician` — operational SQL, pipeline fixes
- `monitoring-agent` — investigation, research
- `verification-specialist` — on-demand verification outside the normal flow
- `project-architect` — plan structuring (always standalone, never in feature pipeline)

**NOT standalone-eligible** (orchestrator auto-dispatches these as part of the pipeline):
- `breakdown-specialist` — auto-dispatched by `triggerBreakdown`
- `senior-engineer` / `engineer` — auto-dispatched by breakdown or rejection fixes
- `job-combiner` — auto-dispatched by `triggerCombining`
- `reviewer` — auto-dispatched by `triggerFeatureVerification`
- `code-reviewer` — auto-dispatched by `handleJobComplete`
- `deployer` — auto-dispatched by `handleFeatureApproved`

### Idempotency

No active job with the same role targeting the same feature (or same role + project if no feature):

```sql
-- Inside Postgres function:
SELECT id INTO v_existing FROM jobs
WHERE role = p_role
AND feature_id IS NOT DISTINCT FROM p_feature_id  -- handles NULL = NULL correctly
AND project_id = p_project_id
AND status IN ('queued', 'dispatched', 'executing')
LIMIT 1;

IF v_existing IS NOT NULL THEN
  RETURN jsonb_build_object('rejected', true, 'reason', 'Active job already exists');
END IF;
```

Note: `IS NOT DISTINCT FROM` is the standard Postgres way to compare values where NULLs should be treated as equal. This avoids the sentinel UUID workaround from v3.

---

## Standalone job lifecycle

Standalone jobs follow a simplified lifecycle. No verification, no combining, no wrapper features.

```
queued → dispatched → executing → complete
                          |
                          → failed
```

| Status | What's happening | Who owns it |
|--------|-----------------|-------------|
| `queued` | Created by edge function, waiting for machine slot | Orchestrator |
| `dispatched` | Sent to a machine, awaiting ack | Orchestrator |
| `executing` | Agent is working | Agent |
| `complete` | Work done, result stored in job record | Terminal |
| `failed` | Agent crashed or unrecoverable error | Terminal |

### What the orchestrator skips for standalone jobs

The `source = 'standalone'` column acts as a **top-level guard** in multiple orchestrator code paths. Everywhere the orchestrator handles job lifecycle, standalone jobs short-circuit pipeline-specific behaviour:

| Orchestrator function | Pipeline behaviour | Standalone behaviour |
|---|---|---|
| `dispatchQueuedJobs()` | Auto-creates wrapper feature for `feature_id = NULL` jobs | **Skip** — standalone jobs stay featureless |
| `dispatchQueuedJobs()` | Requires `repo_url` + `featureBranch` for dispatch | **Skip for NO_CODE_CONTEXT roles** — dispatch without git context |
| `handleJobComplete()` | Triggers code review dispatch | **Skip** — mark complete, release slot, done |
| `handleJobComplete()` | Checks `all_feature_jobs_complete` | **Skip** — not a pipeline job |
| `handleJobComplete()` | Triggers combining | **Skip** — nothing to combine |
| `handleJobFailed()` | Marks feature as `failed` | **Skip** — don't touch feature status |
| `all_feature_jobs_complete()` RPC | Counts all jobs on a feature | **Exclude** standalone jobs from count (WHERE source = 'pipeline') |

**Implementation note:** The `source` column must be added to the `JobRow` TypeScript interface and every relevant `SELECT` clause in the orchestrator. Codex identified the specific locations: `dispatchQueuedJobs` (line 407), `handleJobComplete` (lines 851-1083), `handleJobFailed` (lines 1129-1141).

### Non-code roles and git context

The orchestrator requires `repo_url` and `featureBranch` for dispatch (line 593-598). The executor requires `msg.repoUrl` to clone a repo and create a worktree (line 299-306). Neither is needed for operational roles.

**Orchestrator-side:** Add a `NO_CODE_CONTEXT` role list. For these roles, skip the `repo_url` / `featureBranch` gate and construct a `StartJob` message without git fields.

**Executor-side (critical — Codex finding):** The executor ALSO needs a branch for NO_CODE_CONTEXT jobs. Currently, `msg.repoUrl.split("/")` on line 299 would crash on an empty string. The executor needs a code path that runs non-code agents in a scratch workspace at `~/.zazigv2/{company_id}-{role}-{job_id}/` with just MCP tools and a prompt, no git worktree. Directory is cleaned up after job completion.

`NO_CODE_CONTEXT` roles for v1: `pipeline-technician`, `monitoring-agent`, `project-architect`.

`verification-specialist` is NOT in this list — it needs repo access to review code.

---

## MCP tool: `request_work`

Replaces `commission_contractor`. Available to CPO and CTO via `mcp_tools` allow-list.

### Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `role` | Yes | Which contractor role to request. Must be standalone-eligible. |
| `project_id` | Yes | Which project this work belongs to. |
| `feature_id` | No | Target a specific feature (subject to feature lock). |
| `context` | Yes | What the work is, why it's needed, and any relevant details. This becomes the job's `context` field. |

### Returns (synchronous)

**Success:**
```json
{
  "job_id": "uuid",
  "role": "pipeline-technician",
  "status": "queued",
  "message": "Job created and queued for dispatch."
}
```

**Rejection:**
```json
{
  "rejected": true,
  "reason": "Feature 'Dark Mode' is in 'building' state. Use the pipeline for work on active features."
}
```

### Spec and acceptance criteria

The pipeline design doc mentions a schema gate requiring spec + Gherkin AC for jobs. Codex confirmed this gate exists only in the `batch-create-jobs` edge function (application-level validation on the breakdown path), not as a database constraint. The `spec` field on jobs maps to the `context` column in the database — there is no separate `spec` column on the jobs table.

Standalone jobs created via `request_work` populate the `context` column directly. No schema gate changes needed — the gate only runs in the breakdown path, which standalone jobs never touch.

### Caller restrictions (MCP layer)

| Caller | Can request work? | Restricted to roles |
|---|---|---|
| CPO | Yes | All standalone-eligible roles |
| CTO | Yes | All standalone-eligible roles |
| Verification-specialist | Yes | `pipeline-technician` only |
| All others | No | N/A |

Enforced in two places:
1. **`mcp_tools` allow-list** — controls which agents see the `request_work` tool at all
2. **MCP server parameter validation** — checks the `role` parameter against per-caller restrictions before forwarding to the edge function

---

## Standalone job visibility

The CPO needs to see standalone jobs when monitoring the pipeline. Without visibility, standalone work becomes a shadow backlog.

### Query support

The existing `query_jobs` MCP tool (or equivalent) gains a `source` filter:
- `query_jobs(source: 'pipeline')` — pipeline jobs only
- `query_jobs(source: 'standalone')` — standalone jobs only
- `query_jobs()` — all jobs (default, backwards compatible)

### CPO review cadence

The pipeline design doc says "CPO reviews standalone jobs periodically to ensure they don't accumulate into an untracked shadow backlog." This is enforced via the orchestrator notification system:
- When 3+ standalone jobs are active simultaneously, orchestrator sends notification to CPO
- When a standalone job has been `executing` for more than 30 minutes, orchestrator sends notification (likely stuck)

---

## Chris's idea: Inter-agent delegation

Chris suggested that pipeline agents (like breakdown-specialist) should be able to delegate to other roles. This is a different pattern from standalone dispatch — it's intra-pipeline delegation.

### When this would be useful

- Breakdown-specialist encounters a feature that needs architectural review before it can be decomposed → delegates to project-architect
- Senior-engineer hits a blocker that needs DB investigation → delegates to pipeline-technician
- Verification-specialist finds a failure that needs a quick fix → delegates to senior-engineer

### How it could work

**Option 1: Job dependency chain** — The pipeline agent creates a new job via `batch_create_jobs` with a `depends_on` pointing to the current job. The orchestrator handles sequencing. This already works for breakdown-specialist creating engineering jobs.

**Option 2: MCP tool for delegation** — A `delegate_to_role` MCP tool that creates a new job, marks the current job as `blocked`, and resumes the original agent when the delegated job completes.

**Option 3: Continuation passing** (Codex suggestion) — The delegating agent writes partial work to a well-known location (job's `result` field or a branch file), then completes. A new job is created for the same role with context that includes the delegation result.

### Agent resumption problem (Codex finding)

Option 2 has a fundamental issue: when a Claude Code agent gets "blocked," its session must either stay alive (consuming a machine slot indefinitely) or exit and resume later (which requires session persistence the executor doesn't support). Current agents run to completion in a single session — there is no pause/resume capability. This makes Option 2 significantly harder than it appears and should not be underestimated in Phase 2 design.

### Recommendation for v1

Don't build inter-agent delegation yet. The standalone dispatch model solves the immediate double-dispatch problem. No Phase 1 design decisions foreclose Phase 2 — the `source` column is orthogonal to delegation, and a future `delegate_to_role` tool would use a different mechanism entirely.

Note: Option 1 (dependency chain via `batch_create_jobs`) already works today as a workaround for basic sequential delegation.

---

## Implementation

### Deliverable 1: Safe standalone dispatch (ship now)

This is the minimum required to safely restore the CPO's ability to commission operational work.

1. **Postgres function: `request_standalone_work()`**
   - Accepts: company_id, project_id, feature_id?, role, context
   - Single transaction: feature lock (SELECT FOR UPDATE) → role check → idempotency check → INSERT job
   - Returns JSONB: `{ job_id, status }` or `{ rejected, reason }`
   - Deployed via Supabase migration

2. **Edge function: `request-work`**
   - Accepts HTTP POST with parameters
   - Calls `request_standalone_work()` Postgres function
   - Returns result to caller
   - Replaces the old `commission-contractor` edge function (which still exists in the codebase and should be deleted)

3. **Jobs table: add `source` column**
   ```sql
   ALTER TABLE jobs ADD COLUMN source TEXT NOT NULL DEFAULT 'pipeline';
   -- Values: 'pipeline' (default for existing jobs), 'standalone'
   ```
   - Add `source` to `JobRow` TypeScript interface
   - Add `source` to all relevant SELECT clauses in orchestrator

4. **Orchestrator changes:**
   - `dispatchQueuedJobs()`: skip wrapper feature creation when `source = 'standalone'`
   - `dispatchQueuedJobs()`: for `NO_CODE_CONTEXT` roles, skip `repo_url` / `featureBranch` gate, construct `StartJob` without git fields
   - `handleJobComplete()`: **top-level guard** — if `source = 'standalone'`, mark complete, release slot, return. Skip all pipeline-specific behaviour (code review, combine trigger, feature status checks).
   - `handleJobFailed()`: if `source = 'standalone'`, don't mark feature as failed. Note: `agent_crash` re-queue preserves the existing row so `source = 'standalone'` survives — verify this explicitly in implementation.
   - `all_feature_jobs_complete()` RPC: add `AND (source IS NULL OR source = 'pipeline')` to exclude standalone jobs from blocking feature progress

5. **Executor changes (critical):**
   - Add code path for NO_CODE_CONTEXT jobs: skip repo clone, skip worktree, run agent in scratch workspace at `~/.zazigv2/{company_id}-{role}-{job_id}/` with MCP tools and prompt only
   - Handle `StartJob` messages where `repoUrl` / `featureBranch` are null/empty without crashing
   - Clean up scratch workspace directory after job completion (in both complete and failed paths)

6. **MCP tool: `request_work`**
   - New tool in `agent-mcp-server.ts`
   - Wrapped in `guardedHandler`
   - Per-caller role validation before forwarding to edge function
   - Makes HTTP POST to `request-work` edge function, returns result

7. **Single-job fast-track (moved from Deliverable 2 per CTO review):**
   - Orchestrator detects `COUNT(jobs) = 1` for a feature after breakdown completes and skips the combine step (nothing to combine)
   - Removes the main latency objection for engineering quick fixes going through the pipeline

8. **Migration 057: New functionality**
   - Add `source` column to jobs table
   - Create `request_standalone_work()` Postgres function
   - Update `all_feature_jobs_complete()` to filter by `source = 'pipeline'`

9. **Migration 058: Cleanup**
   - Update `mcp_tools`: replace `commission_contractor` with `request_work` for CPO, CTO, verification-specialist
   - Remove stale `commission_contractor` from all roles' `mcp_tools`
   - Delete or disable the `commission-contractor` edge function

### Deliverable 2: Visibility and experience (ship next)

Improves the standalone dispatch experience but is not safety-critical.

1. **Query support:** Update `query_jobs` to accept optional `source` filter
2. **Notifications:** Orchestrator sends CPO notification when 3+ standalone jobs active or when one is stuck >30 min
3. **Prompt/skill changes:** Add routing rules to CPO skills, revise `/standalone-job` skill

### Phase 2: Inter-agent delegation (future)

1. Design around the agent resumption constraint (likely Option 3: continuation passing)
2. Orchestrator support for delegation chains
3. Context passing between agents

---

## Changes to other plans

This plan revises elements of three existing design docs. Apply when this plan is approved.

### `2026-02-24-idea-to-job-pipeline-design.md`

**Entry Point B revision:**
- Current: "Human (or CPO) creates a standalone job directly — `feature_id: null`, tagged `standalone`, goes straight to `queued`."
- Revised: "CPO calls `request_work` MCP tool → `request-work` edge function validates atomically and creates job. Standalone jobs are operational only (pipeline-technician, monitoring-agent, verification-specialist, project-architect). Engineering quick fixes go through Path A as single-job features."

**Example D revision:**
- Current: CPO creates standalone engineering job for favicon fix
- Revised: CPO creates a minimal feature with `/spec-feature`. Breakdown specialist produces one job. Pipeline handles verification. Single-job features skip combine (Phase 1.1 optimisation).

**`/standalone-job` skill revision:**
- Current: creates any standalone job with spec + Gherkin AC
- Revised: creates operational standalone jobs only, uses `request_work` for dispatch, does not require Gherkin AC

**Section 12 (CPO MCP tools) revision:**
- Remove `commission_contractor` from tool list
- Add `request_work` with parameter description

### `2026-02-24-software-development-pipeline-design.md`

**Role Boundaries — CPO section:**
- Current: "Commission contractors (Project Architect, research) when needed"
- Revised: "Request standalone operational work via `request_work` (pipeline-technician, monitoring-agent, verification-specialist, project-architect) when needed"

### `2026-02-18-orchestration-server-design.md`

**Orchestrator responsibilities update:**
- Note that standalone job dispatch uses a dedicated `request-work` edge function, not the orchestrator edge function
- Orchestrator handles standalone jobs in its lifecycle processing (skip pipeline behaviours based on `source` column)
- Document the `NO_CODE_CONTEXT` role concept

---

## DB inconsistency to fix immediately

Migration 056 seeds `commission_contractor` in the `mcp_tools` for CPO and verification-specialist, but the MCP tool is removed from code. The `commission-contractor` edge function also still exists in `supabase/functions/` and is callable with the service role key.

Cleanup is handled by **migration 058** (split from new functionality in 057 per CTO review — prevents a rollback of new features from also rolling back the cleanup):
- Remove `commission_contractor` from all roles' `mcp_tools`
- Add `request_work` to CPO, CTO, verification-specialist `mcp_tools`
- Delete or disable the `commission-contractor` edge function

---

## How this solves the double-dispatch problem

The original bug: the CPO called both `update_feature(status: ready_for_breakdown)` AND `commission_contractor` for the same work, creating two parallel job streams (pipeline + standalone) competing for the same feature.

This plan prevents that through three layers:

**Layer 1: Role restriction (eliminates work-type collisions).** Standalone-eligible roles (pipeline-technician, monitoring-agent, verification-specialist, project-architect) never do the same kind of work as pipeline roles (engineer, breakdown-specialist, job-combiner, etc.). Even if both paths happen to be active on the same feature, they can't produce conflicting code — standalone roles don't produce code at all. This is the most important protection. The original collision was two job streams both trying to implement the same feature. That's now structurally impossible.

**Layer 2: Feature lock (prevents targeting active pipeline features).** Standalone dispatch is rejected if the target feature is in any pipeline-active state. The CPO can't commission a monitoring-agent investigation on a feature that's already being built. Only pipeline-technician and verification-specialist can target active features — and those are operational roles fixing problems in the pipeline, not competing with it.

**Layer 3: Atomic validation (prevents race conditions).** The Postgres function uses `SELECT ... FOR UPDATE` on the feature row, then validates and inserts in a single transaction. This closes the TOCTOU race that made the old edge function guards bypassable — there's no window between the check and the insert where state can change.

**Edge case: standalone job created before pipeline starts.** If the CPO requests standalone work on a feature in `created` state, then later pushes that same feature into the pipeline, both exist simultaneously. This is safe — the standalone job is operational (not engineering) and doesn't interact with the pipeline's code branches or verification gates.

---

## Open questions for CTO — ANSWERED

1. **Engineering quick fixes: single-job feature through the pipeline, or fast-track bypass?**
   **CTO answer: Through the pipeline. No bypass.** The pipeline's value is verification gates. Bypassing them for "quick" fixes creates unverified code. The combine skip for single-job features removes the only wasteful step. **Move Phase 1.1 (single-job combine skip) into Deliverable 1** — this closes the latency objection at launch.

2. **Non-code roles: scratch workspace format?**
   **CTO answer: `~/.zazigv2/{company_id}-{role}-{job_id}/`** — mirrors persistent agent workspace pattern, includes `job_id` to avoid collision between concurrent same-role jobs, reuses `setupJobWorkspace()` for MCP tools + CLAUDE.md assembly, cleaned up after job completion.

---

## CTO Review (v3.1 → v3.2)

**Reviewed:** 2026-02-26
**Verdict:** Ready to execute. Architecture is sound.

### Architecture assessment

The Postgres function + dedicated edge function design is correct. `SELECT ... FOR UPDATE` inside a single transaction closes the TOCTOU race. The dedicated `request-work` edge function avoids making the orchestrator dual-purpose. Caller identity enforcement at the MCP layer is clean. No new attack surface.

All claims validated against the codebase:
- `dispatchQueuedJobs` wrapper feature creation: confirmed (orchestrator/index.ts:432-453)
- `handleJobComplete` 8 distinct pipeline paths: confirmed (orchestrator/index.ts:851-1083)
- `handleJobFailed` feature cascade: confirmed (orchestrator/index.ts:1122-1140)
- Executor crash on null `repoUrl`: confirmed (executor.ts:299)
- `all_feature_jobs_complete` has no source filter: confirmed (migration 030)
- `commission-contractor` edge function still exists: confirmed
- `source` column does not exist on jobs table: confirmed
- `NO_CODE_CONTEXT` is new — not in any source file yet

### One-way doors

| Decision | Severity | Notes |
|----------|----------|-------|
| `source` column on `jobs` table | ONE-WAY DOOR | Every future jobs query must consider source. Acceptable permanent complexity. |
| Engineering work through pipeline only | HARD TO REVERSE | Once CPO skills learn this routing, changing it means retraining prompts + skills. Correct decision. |
| Role eligibility list | REVERSIBLE | Can add roles to standalone-eligible later. |

### Revisions applied (v3.2)

1. **Moved Phase 1.1 (single-job combine skip) from Deliverable 2 to Deliverable 1.** Removes the latency objection for engineering quick fixes at launch.
2. **Split migrations.** 057 for new functionality (source column, `request_standalone_work()`, `all_feature_jobs_complete` update). 058 for cleanup (mcp_tools swap, edge function deletion). Prevents a rollback of new features from also rolling back cleanup.
3. **Specified scratch workspace path format:** `~/.zazigv2/{company_id}-{role}-{job_id}/` with cleanup on completion.
4. **Added source preservation note on `agent_crash` re-queue.** `handleJobFailed` re-queues on `agent_crash` — the re-queue path only changes `status` so `source` survives, but this must be verified explicitly in implementation.

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `source` column missed in a future SELECT | Medium | Add to `JobRow` TypeScript interface — compiler catches missing references |
| Scratch workspace cleanup fails (disk fills) | Low | Cleanup in both complete and failed paths. Cron fallback for orphaned dirs. |
| CPO calls old `commission_contractor` via cached tools | Low | Migration 058 removes from `mcp_tools`. Edge function deletion prevents silent success. |

### Security note

No new attack surface. One pre-existing concern: `execute_sql` in the pipeline-technician's `mcp_tools` is the most dangerous tool in the system. Standalone dispatch makes it easier to invoke (CPO can now request a pipeline-technician at any time). Worth a future review of what `execute_sql` can actually run — out of scope for this plan.

---

## Appendix A: Gap analysis (v2 → v3)

Eight gaps identified during CPO self-review of v2:

| # | Gap | Resolution |
|---|-----|-----------|
| 1 | `/standalone-job` skill relationship undefined | Skill revised to operational-only, calls `request_work` as final step |
| 2 | Spec + AC fields missing from `request_work` | Schema gate is application code in breakdown path only, not a DB constraint. No changes needed. `context` column is sufficient. |
| 3 | No feedback mechanism for rejected requests | Synchronous edge function call — immediate accept/reject response |
| 4 | Entry Point B engineering jobs blocked | Deliberate: engineering goes through pipeline as single-job features. Phase 1.1 skips combine for single-job features. |
| 5 | Standalone job lifecycle states undefined | Defined: `queued → dispatched → executing → complete/failed`. No verify, no combine. |
| 6 | `design` status missing from feature lock allow-list | Added `design` to allow-list alongside `created`, `speccing` |
| 7 | Non-code role dispatch is a blocker | `NO_CODE_CONTEXT` role list in orchestrator + executor scratch workspace path |
| 8 | Standalone job visibility/querying undefined | `source` column on jobs table + filter on `query_jobs` + notifications (Deliverable 2) |

## Appendix B: Findings addressed (v3 → v3.1)

Findings from Codex + Gemini v3 reviews:

| # | Finding | Severity | Resolution |
|---|---------|----------|-----------|
| 1 | Orchestrator is a stateless edge function, not a persistent server | CRITICAL | Replaced "orchestrator endpoint" with dedicated `request-work` edge function + Postgres function |
| 2 | MCP server cannot reach an "orchestrator endpoint" | CRITICAL | MCP server calls the `request-work` edge function URL (same pattern as existing MCP → edge function calls) |
| 3 | Wrapper feature skip leaves jobs stuck at git context gate | HIGH | Coupled with NO_CODE_CONTEXT skip — both must be implemented together |
| 4 | Executor crashes on empty repoUrl | HIGH | Added executor-side changes as explicit implementation step |
| 5 | handleJobComplete has 5+ pipeline behaviours beyond combine | HIGH | Top-level `source = 'standalone'` guard in handleJobComplete — short-circuit all pipeline behaviour |
| 6 | `source` column needs broad diff across orchestrator | HIGH | Explicitly noted: add to JobRow interface + all relevant SELECTs |
| 7 | COALESCE sentinel UUID is non-idiomatic | MEDIUM | Replaced with `IS NOT DISTINCT FROM` |
| 8 | `all_feature_jobs_complete` RPC doesn't filter by source | MEDIUM | Added `source = 'pipeline'` filter to RPC |
| 9 | Feature lock + insert must be single transaction | MEDIUM | Postgres function with `SELECT ... FOR UPDATE` ensures atomicity |
| 10 | Schema gate is application code, not DB constraint | MEDIUM | Corrected description — no schema gate changes needed |
| 11 | commission-contractor edge function still exists | LOW | Added to cleanup migration |
| 12 | Migration 056 inconsistency confirmed | LOW | Already in plan as migration 057 |
| G1 | Split into two deliverables | RECOMMENDED | Implementation section now has Deliverable 1 (safety) + Deliverable 2 (experience) |
| G2 | Single-job feature fast-track | RECOMMENDED | Added as Phase 1.1 optimisation |
| G3 | Rename "produces code" to "requires verification gates" | MINOR | Updated boundary criterion language |
| G4 | Add orchestration server doc to revision list | MINOR | Added as third doc in "Changes to other plans" |

## Appendix C: Second opinion summaries (v2)

### Codex review (code-level, against actual orchestrator)
- Identified TOCTOU race between edge function guard reads and job insertion
- Found Guard 4 (caller restrictions) unenforceable — edge function has no caller identity
- Discovered orchestrator auto-creates wrapper features for `feature_id = NULL` jobs, causing spurious combine triggers
- Identified missing roles from exclusion list: `code-reviewer`, `deployer`, `engineer`
- Flagged Entry Point B conflict: pipeline design doc describes standalone `senior-engineer` fixes, but plan excluded that role
- Recommended CAS-style atomic insert or moving logic into orchestrator
- Noted agent resumption problem makes inter-agent delegation Option 2 harder than it appears

### Gemini review (architecture-level)
- Core thesis: "This is a design problem being treated as a guard problem"
- Proposed intent-based model: CPO expresses intent, orchestrator is sole dispatcher
- Feature-level lock simpler than path-level guards
- Guards don't compose well at scale — need routing policy, not more guards
- Agreed inter-agent delegation is premature but is the right long-term direction
