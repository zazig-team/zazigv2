# Pipeline Audit Remediation Plan (Codex)

**Date:** 2026-02-26  
**Status:** Draft v1 (implementation-ready)  
**Author:** Codex  
**Input:** Independent audit findings from `2026-02-26-codex-pipeline-audit-prompt.md` execution

---

## Goals

- Remove all known silent bypass and forever-stall paths in the feature lifecycle.
- Make dispatch, verification, and test-deploy transitions idempotent under duplicate/missed Realtime messages.
- Close race windows where concurrent orchestrator ticks can corrupt state or over-advance features.
- Align tests and message contracts with the current status model.

## Non-goals

- Re-architecting the full orchestrator into a persistent worker.
- Replacing Supabase Realtime transport.
- Broad product workflow changes outside pipeline reliability and correctness.

---

## Finding Coverage

| Finding ID | Issue | Plan Item |
|---|---|---|
| F1 | Duplicate dispatch race | P0.1 |
| F2 | Slack approval status mismatch | P0.2 |
| F3 | Executor success false-positive | P0.3 |
| F4 | Deploy retry cap broken | P0.4 |
| F5 | Verify insert failure can bypass verify | P0.5 |
| F6 | Agent missing event subscriptions | P0.6 |
| F7 | Verify/deploy on machine without repo | P1.1 |
| F8 | `combining` stall if combine job insert fails | P1.2 |
| F9 | Test-env claim race | P1.3 |
| F10 | `deploy_complete` side effects on failed CAS | P0.7 |
| F11 | Verify result path does not release slot | P1.4 |
| F12 | Duplicate message handling gaps on agent | P1.5 |
| F13 | Teardown defaults to `master` | P1.6 |
| F14 | Stale orchestrator tests | P2.1 |

---

## Execution Order

1. **P0 (same day):** Stop silent corruption/stalls immediately.
2. **P1 (1-2 days):** Eliminate remaining race conditions and machine-affinity reliability gaps.
3. **P2 (1 day):** Test suite realignment and regression hardening.

---

## P0 Immediate Stabilization

### P0.1 Dispatch must be exactly-once per job (F1)

**Problem:** `dispatchQueuedJobs` can broadcast `start_job` even when CAS job update matched zero rows.  
**Changes:**
- Replace split slot/job claim with one atomic DB operation (RPC) or enforce row-count checks with explicit slot rollback.
- Only broadcast after successful atomic claim.
- Add duplicate-claim logging with job/machine IDs.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- New SQL migration for `dispatch_job_atomic` RPC (if RPC path selected)
**Acceptance:**
- Concurrent orchestrator invocations cannot dispatch the same job twice.
- Load test with parallel ticks shows max 1 active machine assignment per job.

### P0.2 Slack testing-thread routing must use `ready_to_test` (F2)

**Problem:** Slack approvals query `features.status='testing'` while pipeline uses `ready_to_test`.  
**Changes:**
- Update Slack thread matcher to `ready_to_test` (optionally accept legacy `testing` during transition).
- Add explicit test coverage for approve/reject flow on `ready_to_test`.
**Files:**
- `supabase/functions/slack-events/index.ts`
- `supabase/functions/slack-events` tests
**Acceptance:**
- Approve/reject in test thread reliably sends `feature_approved`/`feature_rejected`.
- Feature transitions `ready_to_test -> deploying_to_prod` (approve) and `ready_to_test -> building` (reject) succeed.

### P0.3 Executor must not report success without success evidence (F3)

**Problem:** Missing report currently becomes `job_complete`.  
**Changes:**
- Add explicit completion contract:
  - session exit status must be success, and
  - expected completion artifact exists (role-aware report requirement).
- If contract fails, emit `job_failed` with reason `agent_crash` or `unknown`.
**Files:**
- `packages/local-agent/src/executor.ts`
- `packages/local-agent/src/executor.test.ts`
**Acceptance:**
- Crashed/no-output sessions never emit `job_complete`.
- Existing successful jobs still complete normally.

### P0.4 Fix test-deploy retry accounting and cap (F4)

**Problem:** Retry cap uses `job_type='deploy'` counts (prod jobs), so test deploy retries can loop forever.  
**Changes:**
- Introduce explicit test-deploy attempt tracking per feature (column or dedicated table).
- Increment on each `deploying_to_test` entry.
- Enforce cap + cooldown in `processFeatureLifecycle`.
- On cap exceeded, mark feature failed with actionable error.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- SQL migration (`features` columns or `feature_test_deploy_attempts` table)
- Orchestrator tests for retry cap
**Acceptance:**
- A repeatedly failing test deploy stops after configured cap and does not loop indefinitely.

### P0.5 Verification trigger must be transactional (F5)

**Problem:** Feature can enter `verifying` without a newly inserted verify job.  
**Changes:**
- Make `triggerFeatureVerification` atomic (status transition + job insert in one transaction/RPC).
- On insert failure, feature must not remain in `verifying` without active verify job.
- Add verification generation/version marker to prevent stale old verify jobs from advancing feature.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- SQL migration/RPC for atomic verification trigger
- Orchestrator tests for stale verify-job bypass
**Acceptance:**
- No feature can advance from `verifying` based on a stale previous-cycle verify result.

### P0.6 Normalize Realtime event contract (F6)

**Problem:** Agent subscribes to only a subset of named events.  
**Changes:**
- Standardize orchestrator/slack-events outbound commands to `event: "message"` with typed payload.
- Keep temporary backward-compatible listeners while migrating.
- Ensure `job_unblocked`, `teardown_test`, and `message_inbound` are delivered in all paths.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- `supabase/functions/slack-events/index.ts`
- `packages/local-agent/src/connection.ts`
**Acceptance:**
- All orchestrator command types arrive through one canonical channel contract.
- Blocked jobs reliably resume after Slack reply.

### P0.7 Gate `deploy_complete` side effects on successful CAS (F10)

**Problem:** Slack/event side effects execute even when feature row was not updated.  
**Changes:**
- Require row-count check on `deploying_to_test -> ready_to_test` CAS update.
- If no row matched, exit after warning; do not post Slack message, do not log status change.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- Orchestrator tests for duplicate/stale deploy_complete message
**Acceptance:**
- Duplicate or late `deploy_complete` cannot create false “ready for testing” notifications.

---

## P1 Race and Robustness Hardening

### P1.1 Ensure verify/deploy can run on any online machine (F7)

**Problem:** `verifier` and `test-runner` assume repo already exists locally.  
**Changes:**
- Reuse `RepoManager.ensureRepo` (or shared helper) from verifier/test-runner before worktree creation.
- Preserve bare-repo + worktree model everywhere.
**Files:**
- `packages/local-agent/src/verifier.ts`
- `packages/local-agent/src/test-runner.ts`
- `packages/local-agent/src/branches.ts` (shared helper extraction if needed)
**Acceptance:**
- Fresh machine with no local repo can process verify/deploy without false `deploy_needs_config`.

### P1.2 Prevent `combining` orphan state on combine insert failure (F8)

**Problem:** Feature can remain `combining` forever with no combine job.  
**Changes:**
- Make combining transition + combine-job insert atomic; or rollback status to `building` on insert failure.
- Add catch-up detector: `combining` feature with no active/latest combine job gets repaired.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- SQL RPC/migration if atomic path selected
**Acceptance:**
- No indefinite `combining` state caused by failed combine job creation.

### P1.3 Serialize test-env claims per project (F9)

**Problem:** concurrent `initiateTestDeploy` calls can both claim free test env.  
**Changes:**
- Add project-scoped atomic claim RPC (row lock/advisory lock).
- Move env-free check + status update into one transaction.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- SQL migration for claim RPC
**Acceptance:**
- At most one feature per project can be in `deploying_to_test`/`ready_to_test` due to orchestrator claims.

### P1.4 Release slot counters on verify_result path (F11)

**Problem:** verify_result path does not call `releaseSlot`.  
**Changes:**
- Call `releaseSlot` in both pass and fail branches where verify jobs settle.
- Guard against double-release with CAS/state checks.
**Files:**
- `supabase/functions/orchestrator/index.ts`
- Orchestrator tests for slot accounting on verify_result
**Acceptance:**
- Slot counters remain accurate without waiting for heartbeat correction.

### P1.5 Add local-agent command dedupe guards (F12)

**Problem:** duplicate `start_job` and `deploy_to_test` deliveries can collide.  
**Changes:**
- `start_job`: if `activeJobs` already has `jobId`, ignore duplicate and re-ack.
- `deploy_to_test`: add in-flight feature lock/TTL in `TestRunner`.
- Add idempotent handling logs.
**Files:**
- `packages/local-agent/src/executor.ts`
- `packages/local-agent/src/test-runner.ts`
- Relevant tests
**Acceptance:**
- Duplicate broadcasts do not create duplicate sessions/worktrees/deploy attempts.

### P1.6 Resolve teardown branch dynamically (F13)

**Problem:** teardown defaults to `master`, which fails in `main` repos.  
**Changes:**
- Resolve default branch from bare repo HEAD (`symbolic-ref HEAD`, fallback `main`/`master`).
- Optionally include branch in `teardown_test` message payload for deterministic teardown.
**Files:**
- `packages/local-agent/src/test-runner.ts`
- `packages/shared/src/messages.ts` + validators (if payload extended)
- `supabase/functions/orchestrator/index.ts` (if sending branch)
**Acceptance:**
- Teardown succeeds on both `main` and `master` repositories.

---

## P2 Test and Regression Suite Alignment

### P2.1 Refresh stale lifecycle tests and add race regressions (F14)

**Problem:** tests still assert legacy statuses (`testing`, `done`) and miss current race conditions.  
**Changes:**
- Update orchestrator tests to current statuses: `ready_to_test`, `deploying_to_prod`, `complete`.
- Add dedicated tests for:
  - duplicate dispatch race,
  - stale verify result bypass prevention,
  - deploy retry cap behavior,
  - deploy_complete CAS side-effect guard,
  - missing event-name delivery regressions.
**Files:**
- `supabase/functions/orchestrator/orchestrator.test.ts`
- `supabase/functions/slack-events` tests
- `packages/local-agent` tests
**Acceptance:**
- Test suite fails on old broken behaviors and passes on fixed pipeline.

---

## Implementation Notes

- Prefer additive migrations and feature flags for P0/P1 DB changes.
- Keep backward-compatible event listeners during rollout; remove legacy paths in a follow-up cleanup PR.
- Add explicit structured logs for every CAS no-op to distinguish legitimate idempotency from silent drops.

---

## Rollout Plan

1. Ship **P0.1-P0.7** behind focused PRs; deploy orchestrator + slack-events together.
2. Monitor for 24 hours:
   - duplicate dispatch count,
   - `ready_to_test` dwell time,
   - `deploying_to_test` retry counts,
   - orphan `combining`/`verifying` feature counts.
3. Ship **P1.1-P1.6**.
4. Ship **P2.1** and enforce as CI gate.

---

## Success Criteria

- Zero features stuck in `ready_to_test` due to Slack routing mismatch.
- Zero duplicate active executions for the same job ID.
- Zero silent success completions without valid completion artifact/exit success.
- `deploying_to_test` retries cap correctly and fail deterministically when exhausted.
- No feature advances from stale verification data.
- Blocked-job unblocks and teardown commands are reliably delivered.
