# Pipeline Remediation Plan v2

**Date:** 2026-02-26
**Status:** Implementation-ready
**Source:** CTO review of Codex audit findings, validated against current source

---

## Scope

Fix every confirmed bug in the pipeline. No refactors, no protocol rewrites, no speculative hardening. Each item is a discrete, testable change.

## Already Fixed (skip these)

- Verifier repo path resolution (commit `d110029`)
- Test-runner repo path resolution + worktree checkout (commit `2fd0ccb`)
- Null branch guards on initiateTestDeploy and triggerFeatureVerification (commit `26825f7`)
- Lifecycle catch-up pollers (commits `2f9293d` through `7139fe0`)
- Job-polling fallback for missed Realtime dispatches (commit `df011b1`)

---

## Phase 1 — Stop Silent Corruption (do first)

### 1.1 Dispatch must check CAS row count before broadcasting

**Bug:** `dispatchQueuedJobs` broadcasts `start_job` even when the CAS job update matched zero rows — two orchestrator ticks can dispatch the same job.

**Fix:** After the existing `.update().eq("id", jobId).eq("status", "queued")` call, check the response row count. If zero rows updated, skip the broadcast and log a duplicate-claim warning. No RPC needed.

**File:** `supabase/functions/orchestrator/index.ts` — `dispatchQueuedJobs` function

**Test:** Two concurrent orchestrator invocations targeting the same queued job — only one broadcast emitted.

---

### 1.2 Slack approval routing: `testing` → `ready_to_test`

**Bug:** `slack-events/index.ts` line 163 queries `.eq("status", "testing")`. That status doesn't exist. Features waiting for approval are in `ready_to_test`. Approval/rejection never matches.

**Fix:** Change the query to `.eq("status", "ready_to_test")`.

**File:** `supabase/functions/slack-events/index.ts` — line 163

**Test:** Post approve/reject in a Slack test thread. Feature transitions `ready_to_test → deploying_to_prod` (approve) or `ready_to_test → building` (reject).

---

### 1.3 Gate `deploy_complete` side effects on successful CAS

**Bug:** When the orchestrator receives `deploy_complete`, it posts Slack notifications and logs status changes even when the feature row was not actually updated (stale/duplicate message).

**Fix:** After the `.update().eq("status", "deploying_to_test")` CAS, check row count. If zero, log a warning and return — do not post to Slack, do not emit events.

**File:** `supabase/functions/orchestrator/index.ts` — `deploy_complete` handler

**Test:** Send duplicate `deploy_complete` messages. Only one Slack notification, zero errors.

---

### 1.4 Fix test-deploy retry cap

**Bug:** Retry cap for test deploys counts `job_type='deploy'` (prod jobs), so test deploy retries loop forever.

**Fix:** Add a `test_deploy_attempts` integer column to the `features` table (default 0). Increment it each time the feature enters `deploying_to_test`. Check the cap in `processFeatureLifecycle` before calling `initiateTestDeploy`. On cap exceeded, mark feature as `cancelled` with reason.

**Files:**
- SQL migration: add `test_deploy_attempts` column to `features`
- `supabase/functions/orchestrator/index.ts` — `initiateTestDeploy` and `processFeatureLifecycle`

**Test:** Feature that fails test deploy 3 times stops retrying and is marked cancelled.

---

### 1.5 Verification trigger must be transactional

**Bug:** `triggerFeatureVerification` can set a feature to `verifying` but fail to insert the verify job, leaving the feature stuck.

**Fix:** Wrap the status update and job insert in a single Supabase transaction. If the job insert fails, the status update rolls back. Use Supabase's `.rpc()` with a short stored procedure that does both in one transaction, OR use the pattern: insert the job first, then update the status — if the insert fails, the status never changes.

Simpler path (no RPC): Insert the verify job first with status `queued`. Only if insert succeeds, update the feature to `verifying`. If insert fails, feature stays in its current status and the catch-up poller retries next cycle.

**File:** `supabase/functions/orchestrator/index.ts` — `triggerFeatureVerification`

**Test:** Simulate job insert failure. Feature must not remain in `verifying` without an active verify job.

---

### 1.6 `handleVerifyResult` must release slot

**Bug:** `handleVerifyResult` (around line 1370) handles verification results but never calls `releaseSlot()`. Both pass and fail branches leak the slot. `handleJobComplete` and `handleJobFailed` both release correctly — this function doesn't.

**Fix:** Add `await releaseSlot(supabase, jobId, msg.machineId)` at the end of `handleVerifyResult`, after all pass/fail logic but before return.

**File:** `supabase/functions/orchestrator/index.ts` — `handleVerifyResult`

**Test:** Run a verification job. After result is processed, machine slot count returns to pre-job value.

---

### 1.7 Fix non-atomic slot release

**Bug:** `releaseSlot` (line 2867) does a read-modify-write: reads current slot count, then writes count+1. Two concurrent releases read the same value and both write N+1 instead of N+2.

**Fix:** Replace the read-then-write with a single SQL update: `UPDATE machines SET slots_X = slots_X + 1 WHERE id = $1`. This can be done via Supabase `.rpc()` with a trivial stored procedure, or by using a raw SQL call if the Supabase client supports it.

**Files:**
- SQL migration: create `release_slot` RPC function
- `supabase/functions/orchestrator/index.ts` — `releaseSlot` function

**Test:** Two jobs finish simultaneously on the same machine. Slot count increments by 2, not 1.

---

## Phase 2 — Race and Robustness Hardening

### 2.1 Add missing event listeners on the agent

**Bug:** The orchestrator broadcasts `job_unblocked` (line 1231), `message_inbound` (line 1358), and `teardown_test` (line 1830). The agent only listens for `message`, `start_job`, `verify_job`, and `deploy_to_test`. The three missing events are logged by the catch-all debug listener but never processed.

**Fix:** Add three new `.on("broadcast", { event: "..." })` listeners in `connection.ts` that call `this.handleIncomingPayload(payload.payload)` — same pattern as the existing listeners.

**File:** `packages/local-agent/src/connection.ts` — after line 276

**Test:** Orchestrator sends `teardown_test`. Agent processes it (visible in logs as handled, not just debug-logged).

---

### 2.2 Prevent `combining` orphan on insert failure

**Bug:** Feature enters `combining` but the combine job insert fails — feature stuck forever.

**Fix:** Same pattern as 1.5: insert the combine job first, then update feature status. If insert fails, feature stays in `building` and catch-up poller retries.

**File:** `supabase/functions/orchestrator/index.ts` — `triggerCombining`

**Test:** Simulate combine job insert failure. Feature stays in `building`, not orphaned in `combining`.

---

### 2.3 Serialize test-env claims per project

**Bug:** Two concurrent `initiateTestDeploy` calls can both see the test env as free and both claim it.

**Fix:** Add a Postgres advisory lock scoped to the project ID inside `initiateTestDeploy`. Acquire at the start, release after the status update. Only the first caller proceeds; the second sees the env as busy and exits.

**Files:**
- SQL migration: advisory lock helper RPC (optional — can use `pg_advisory_xact_lock` directly via `.rpc()`)
- `supabase/functions/orchestrator/index.ts` — `initiateTestDeploy`

**Test:** Two concurrent deploy attempts for same project. Only one feature enters `deploying_to_test`.

---

### 2.4 Agent command dedup guards

**Bug:** Duplicate `start_job` and `deploy_to_test` deliveries (from Realtime retries or catch-up pollers) can spawn duplicate sessions/worktrees.

**Fix:**
- `start_job`: Check if `activeJobs` map already has the `jobId`. If yes, log and ignore.
- `deploy_to_test`: Add an in-flight lock (Set of feature IDs) in `TestRunner`. If feature ID is already in-flight, log and ignore.

**Files:**
- `packages/local-agent/src/executor.ts`
- `packages/local-agent/src/test-runner.ts`

**Test:** Send duplicate `start_job` for same job ID. Only one tmux session created.

---

### 2.5 Resolve teardown branch from HEAD

**Bug:** Teardown defaults to `master`. Repos using `main` fail.

**Fix:** Before creating the teardown worktree, resolve the default branch: `git -C <bare-repo> symbolic-ref HEAD` → parse branch name. Fallback chain: parsed name → `main` → `master`.

**File:** `packages/local-agent/src/test-runner.ts` — `runTeardown`

**Test:** Teardown succeeds on a repo where default branch is `main`.

---

## Phase 3 — Test Suite

### 3.1 Fix stale test assertions

**Bug:** Orchestrator tests reference `"testing"` and `"done"` statuses that no longer exist.

**Fix:** Update all test assertions to use current statuses: `ready_to_test`, `deploying_to_prod`, `complete`. Add regression tests for:
- Duplicate dispatch (1.1)
- Deploy retry cap (1.4)
- Stale verify result bypass (1.5)
- deploy_complete CAS guard (1.3)

**Files:**
- `supabase/functions/orchestrator/orchestrator.test.ts`
- `supabase/functions/slack-events/` tests

**Test:** Test suite passes and correctly fails when old broken behaviors are reintroduced.

---

## Execution Order

```
Phase 1 (stop corruption):
  1.2 (one-liner) → 1.3 → 1.1 → 1.6 → 1.7 → 1.4 → 1.5

Phase 2 (harden):
  2.1 (agent listeners) → 2.5 → 2.4 → 2.2 → 2.3

Phase 3 (tests):
  3.1
```

Start with 1.2 because it's the simplest win — Slack approvals are completely broken. Then 1.3 and 1.1 because they prevent state corruption. Then the slot fixes (1.6, 1.7). Then the items needing a migration (1.4, 1.5).

## Deployment

- Phase 1 changes to orchestrator + slack-events: deploy together as one edge function push
- Phase 1 changes to local-agent: rebuild + restart daemon
- SQL migrations: deploy before edge functions
- Monitor for 24h: duplicate dispatch count, `ready_to_test` dwell time, orphan features in `combining`/`verifying`
- Then Phase 2, then Phase 3
