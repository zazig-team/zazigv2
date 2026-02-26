# Pipeline Lifecycle Fix Plan (v3)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the stuck pipeline by adding missing catch-up pollers for every feature lifecycle transition that currently depends solely on Realtime broadcasts, and fix the systemic gap where missed `JobFailed` broadcasts leave features stuck forever.

**Architecture:** The orchestrator is a stateless edge function invoked by cron every ~60s. It listens to Realtime for 4 seconds per tick. Any broadcast missed in that window is lost. `processFeatureLifecycle` exists as a catch-up poller but only covers 2 of 5 transitions and has no failure catch-up. We add the missing transitions and a central failed-job catch-up.

**Tech Stack:** TypeScript, Supabase Edge Functions, Supabase Realtime, PostgreSQL

**Reviewed by:** Codex gpt-5.3-codex (2 rounds, code-level), Gemini gemini-2.5-pro (1 round, plan-level), CTO (gap analysis + synthesis)

**Review doc:** `docs/plans/2026-02-26-pipeline-lifecycle-fix-plan-review.md`

---

## Critical Safety Rules

### 1. Latest Job Only

**All pollers MUST query the latest job by `created_at`, not just any matching job.**

Features can be rejected and reset to `building` (line 2017) while old complete combine/verify/deploy jobs remain in the DB. New jobs are created for the retry cycle. If a poller matches a stale old job, it will incorrectly advance the feature, skipping the current cycle's work.

Every job query in the pollers below uses `.order("created_at", { ascending: false }).limit(1)`.

*(Finding: Codex round 1)*

### 2. No Notification in Pollers

**Pollers MUST NOT call `notifyCPO` for failure conditions.** `notifyCPO` is non-idempotent (line 1305). Since pollers run every ~60s, calling it for failures produces infinite notification spam. The central failed-job catch-up (Task 0) handles failures by marking the feature as `failed` — this is the correct signal.

*(Finding: CTO gap analysis, validated Codex round 2)*

---

## Ship Order

```
Task 0 (failed catch-up) → Task 1 (combining→verifying) → TEST WITH REAL FEATURE → Tasks 2-4
```

Task 0 fixes a systemic gap affecting ALL lifecycle stages. Task 1 unblocks the immediate pipeline stall Chris identified. Test before shipping the remaining tasks.

---

## Task 0: Central failed-job catch-up

**Priority:** Critical — systemic gap affecting all lifecycle stages.

**Problem:** `handleJobFailed` (line 1085) is the ONLY path that marks a feature as `failed` (line 1133). It runs via Realtime broadcast. If the `JobFailed` broadcast is missed (same 4-second window), the feature stays stuck forever — pollers correctly won't advance it, but nothing marks it failed either.

The existing pollers have the same gap (line 2261: "handleJobFailed will mark the feature as failed" — assumes the broadcast was received).

*(Finding: CTO gap analysis, validated Codex round 2 — executor writes `jobs.status='failed'` directly to DB at executor.ts:1200 before broadcasting)*

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts:2228` (insert at top of `processFeatureLifecycle`, before the existing breakdown→building block)

**Step 1: Add the central failed-job catch-up block**

Insert at the top of `processFeatureLifecycle`, before the existing `// --- 1. breakdown → building ---` block:

```typescript
  // --- 0. Failed job catch-up (all stages) ---
  // If the JobFailed broadcast was missed, the feature is stuck forever because
  // handleJobFailed (line 1085) is the only path that marks features as failed.
  // This catch-up finds features with failed jobs that weren't marked failed.
  const { data: activeFeatures, error: activeErr } = await supabase
    .from("features")
    .select("id")
    .not("status", "in", '("complete","failed","cancelled","created","ready_for_breakdown")')
    .limit(100);

  if (activeErr) {
    console.error("[orchestrator] processFeatureLifecycle: error querying active features for failed catch-up:", activeErr.message);
  }

  for (const feature of (activeFeatures ?? []) as { id: string }[]) {
    const { data: failedJob } = await supabase
      .from("jobs")
      .select("id, role, job_type, result")
      .eq("feature_id", feature.id)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (failedJob && failedJob.length > 0) {
      const job = failedJob[0] as { id: string; role: string | null; job_type: string; result: string | null };
      const errorDetail = `${job.role ?? job.job_type} job failed (catch-up): ${(job.result ?? "unknown error").slice(0, 200)}`;

      const { data: updated } = await supabase
        .from("features")
        .update({ status: "failed", error: errorDetail })
        .eq("id", feature.id)
        .not("status", "in", '("failed","complete","cancelled")') // CAS guard
        .select("id");

      if (updated && updated.length > 0) {
        console.warn(`[orchestrator] processFeatureLifecycle: feature ${feature.id} has failed job ${job.id} — marked feature failed (catch-up)`);
      }
    }
  }
```

**Note on aggressiveness:** This will fail a feature even if only one of several building jobs has failed while others are still running. This is consistent with the existing `handleJobFailed` behaviour (line 1133 — no status CAS, marks feature failed immediately on any job failure). If we want to soften this later (e.g. only fail on combine/verify/deploy job failures, not individual building jobs), that's a separate change to both this catch-up AND `handleJobFailed`.

**Step 2: Update JSDoc**

Change the docstring above `processFeatureLifecycle` to include:

```typescript
 *   0. Failed job catch-up: marks features failed when JobFailed broadcast was missed
```

**Step 3: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: add central failed-job catch-up to processFeatureLifecycle"
```

---

## Task 1: Add `combining → verifying` catch-up poller

**Priority:** Critical — this is the immediate blocker Chris identified.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` (insert after existing building→combining block in `processFeatureLifecycle`)

**Step 1: Add the combining→verifying catch-up block**

Insert after the existing building→combining block (after line 2349), before the closing `}` of `processFeatureLifecycle`:

```typescript
  // --- 3. combining → verifying ---
  // Features stuck in 'combining' where the latest combine job is already complete.
  // Uses latest job by created_at to avoid advancing on stale jobs from prior rejection cycles.
  const { data: combiningFeatures, error: combineErr } = await supabase
    .from("features")
    .select("id")
    .eq("status", "combining")
    .limit(50);

  if (combineErr) {
    console.error("[orchestrator] processFeatureLifecycle: error querying combining features:", combineErr.message);
  }

  for (const feature of (combiningFeatures ?? []) as { id: string }[]) {
    const { data: latestCombine } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("feature_id", feature.id)
      .eq("job_type", "combine")
      .order("created_at", { ascending: false })
      .limit(1);

    if (latestCombine && latestCombine.length > 0 && latestCombine[0].status === "complete") {
      console.log(`[orchestrator] processFeatureLifecycle: combine done for feature ${feature.id} — triggering verification`);
      await triggerFeatureVerification(supabase, feature.id);
    }
    // Failed combine jobs are handled by Task 0's central catch-up — no action needed here.
  }
```

**Step 2: Verify the CAS guard in `triggerFeatureVerification` (line 1562-1566)**

No code change needed. The existing `.not("status", "in", '("verifying","deploying_to_test","ready_to_test","deploying_to_prod","complete","cancelled")')` guard prevents double-fire. `combining` is not in the exclusion list, so it will transition. If already past `combining`, the update returns 0 rows and exits early.

**Step 3: Update JSDoc**

Add to the docstring:

```typescript
 *   combining → verifying: the latest combine job is complete
```

**Step 4: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: add combining→verifying catch-up poller to processFeatureLifecycle"
```

---

## Task 2: Add `verifying → deploying_to_test` catch-up poller

**Priority:** High — next stage after combining→verifying.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` (append to `processFeatureLifecycle`, after Task 1's block)

**Step 1: Add the verifying→deploying_to_test catch-up block**

```typescript
  // --- 4. verifying → deploying_to_test ---
  // Features stuck in 'verifying' where the latest verify job is already complete and passed.
  // Failed verify jobs are handled by Task 0's central catch-up.
  const { data: verifyingFeatures, error: verifyErr } = await supabase
    .from("features")
    .select("id")
    .eq("status", "verifying")
    .limit(50);

  if (verifyErr) {
    console.error("[orchestrator] processFeatureLifecycle: error querying verifying features:", verifyErr.message);
  }

  for (const feature of (verifyingFeatures ?? []) as { id: string }[]) {
    const { data: latestVerify } = await supabase
      .from("jobs")
      .select("id, status, context, result")
      .eq("feature_id", feature.id)
      .eq("job_type", "verify")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!latestVerify || latestVerify.length === 0) continue;
    const job = latestVerify[0] as { id: string; status: string; context: string; result: string | null };
    if (job.status !== "complete") continue;
    // Failed jobs are caught by Task 0. Non-terminal jobs are still running — skip.

    let ctx: { type?: string } = {};
    try { ctx = JSON.parse(job.context); } catch { /* ignore */ }

    if (ctx.type === "active_feature_verification") {
      const passed = job.result?.startsWith("PASSED");
      if (passed) {
        console.log(`[orchestrator] processFeatureLifecycle: active verify PASSED for feature ${feature.id} — initiating test deploy`);
        await initiateTestDeploy(supabase, feature.id);
      }
      // If active verification completed but didn't pass, the feature stays in 'verifying'.
      // Task 0 won't catch this because the job status is 'complete', not 'failed'.
      // This is a legitimate stuck state that needs CPO attention — but we do NOT notify
      // here because the poller runs every 60s and notifyCPO is non-idempotent.
      // The live path (handleJobComplete line 985) handles notification. If that was missed,
      // the feature will show up in the CPO's status dashboard as stuck in 'verifying'.
    } else {
      // Passive verification: always proceed to deploy
      console.log(`[orchestrator] processFeatureLifecycle: passive verify done for feature ${feature.id} — initiating test deploy`);
      await initiateTestDeploy(supabase, feature.id);
    }
  }
```

Changes from v2:
- **Removed CPO notification on active verification failure** — prevents infinite notification spam. Task 0 handles actual job failures. A "completed but not passed" active verification is a legitimate stuck state visible in the dashboard. *(Gap 2 fix)*
- Simplified: no `company_id` needed on the feature query since we're not calling `notifyCPO`

Note: `initiateTestDeploy` (line 1674) already has its own env-busy guard. No additional CAS needed.

**Step 2: Update JSDoc**

```typescript
 *   verifying → deploying_to_test: the latest verify job is complete and passed
```

**Step 3: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: add verifying→deploying_to_test catch-up poller"
```

---

## Task 3: Add `deploying_to_test` stuck recovery with retry cap

**Priority:** High — a stuck `deploying_to_test` feature blocks ALL other features via the env-busy gate at line 1685.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` (append to `processFeatureLifecycle`)

**Step 1: Add the deploying_to_test recovery block**

This transition is different — `handleDeployComplete` needs `testUrl`, `machineId`, and `ephemeral` from the broadcast payload, which aren't stored on the job. We can't complete the transition, but we **must not leave the system wedged**.

Recovery strategy: roll back to `verifying` after 5 minutes so the next poller tick can retry. But cap retries at 3 per hour to prevent infinite bounce loops.

*(Gap 3 fix: Codex validated that Task 3 rollback + Task 2 re-advance creates infinite retry loop when root cause is persistent)*

```typescript
  // --- 5. deploying_to_test — stuck recovery with retry cap ---
  // Features stuck in 'deploying_to_test' for too long. This can happen if:
  //   a) The DeployComplete broadcast was missed (4s window)
  //   b) initiateTestDeploy set the status before confirming machine availability (bug at line 1704)
  //   c) The deploy failed silently
  // A stuck deploying_to_test blocks ALL other features via the env-busy gate.
  // Recovery: roll back to 'verifying' after 5 minutes. After 3 attempts in an hour, fail the feature.
  const DEPLOY_STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  const DEPLOY_MAX_RETRIES = 3;
  const DEPLOY_RETRY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
  const deployStuckCutoff = new Date(Date.now() - DEPLOY_STUCK_THRESHOLD_MS).toISOString();
  const deployRetryWindowStart = new Date(Date.now() - DEPLOY_RETRY_WINDOW_MS).toISOString();

  const { data: stuckDeploying, error: deployErr } = await supabase
    .from("features")
    .select("id, company_id")
    .eq("status", "deploying_to_test")
    .lt("updated_at", deployStuckCutoff)
    .limit(50);

  if (deployErr) {
    console.error("[orchestrator] processFeatureLifecycle: error querying deploying_to_test features:", deployErr.message);
  }

  for (const feature of (stuckDeploying ?? []) as { id: string; company_id: string }[]) {
    // Count how many times we've already rolled back (approximated by deploy job count in the last hour)
    const { data: recentDeploys } = await supabase
      .from("jobs")
      .select("id")
      .eq("feature_id", feature.id)
      .eq("job_type", "deploy")
      .gte("created_at", deployRetryWindowStart);

    const attempts = recentDeploys?.length ?? 0;

    if (attempts >= DEPLOY_MAX_RETRIES) {
      // Too many attempts — fail the feature
      console.error(`[orchestrator] processFeatureLifecycle: feature ${feature.id} stuck in deploying_to_test after ${attempts} deploy attempts in the last hour — marking failed`);
      await supabase
        .from("features")
        .update({ status: "failed", error: `Deploy to test failed after ${attempts} attempts in the last hour. Likely persistent issue (no machine available or deploy script failing).` })
        .eq("id", feature.id)
        .eq("status", "deploying_to_test"); // CAS guard
    } else {
      // Roll back to verifying for retry
      console.warn(`[orchestrator] processFeatureLifecycle: feature ${feature.id} stuck in deploying_to_test for >5min — rolling back to verifying (attempt ${attempts + 1}/${DEPLOY_MAX_RETRIES})`);

      const { error: rollbackErr } = await supabase
        .from("features")
        .update({ status: "verifying" })
        .eq("id", feature.id)
        .eq("status", "deploying_to_test"); // CAS guard

      if (!rollbackErr) {
        await notifyCPO(
          supabase,
          feature.company_id,
          `Feature ${feature.id} was stuck in deploying_to_test for >5 minutes. Rolled back to verifying for retry (attempt ${attempts + 1}/${DEPLOY_MAX_RETRIES}).`,
        );
      }
    }
  }
```

Changes from v2:
- **Added retry cap** — max 3 deploy attempts per hour, then mark feature as `failed` *(Gap 3 fix)*
- CPO notification here is acceptable (not spam) because it only fires once per 5-minute stuck period, and max 3 times

**Step 2: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: add deploying_to_test stuck recovery with retry cap"
```

---

## Task 4: Add `deploying_to_prod → complete` catch-up poller

**Priority:** Medium — same pattern, uses latest job.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` (append to `processFeatureLifecycle`)

**Step 1: Add the deploying_to_prod→complete catch-up block**

```typescript
  // --- 6. deploying_to_prod → complete ---
  // Features stuck in 'deploying_to_prod' where the latest prod deploy job is complete.
  // Deploy jobs for test vs prod are distinguished by context.target.
  // Failed deploy jobs are handled by Task 0's central catch-up.
  const { data: prodDeployFeatures, error: prodErr } = await supabase
    .from("features")
    .select("id")
    .eq("status", "deploying_to_prod")
    .limit(50);

  if (prodErr) {
    console.error("[orchestrator] processFeatureLifecycle: error querying deploying_to_prod features:", prodErr.message);
  }

  for (const feature of (prodDeployFeatures ?? []) as { id: string }[]) {
    const { data: latestDeploy } = await supabase
      .from("jobs")
      .select("id, status, context")
      .eq("feature_id", feature.id)
      .eq("job_type", "deploy")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!latestDeploy || latestDeploy.length === 0) continue;
    const job = latestDeploy[0] as { id: string; status: string; context: string };
    if (job.status !== "complete") continue;

    // Verify this is a prod deploy, not a test deploy
    let ctx: { target?: string } = {};
    try { ctx = JSON.parse(job.context); } catch { /* ignore */ }
    if (ctx.target !== "prod") continue;

    console.log(`[orchestrator] processFeatureLifecycle: prod deploy done for feature ${feature.id} — marking complete`);
    await handleProdDeployComplete(supabase, feature.id);
  }
```

`handleProdDeployComplete` (line 1907) already has a CAS guard (`.eq("status", "deploying_to_prod")`), so double-fire is safe.

**Step 2: Update JSDoc to list all transitions**

Final docstring:

```typescript
/**
 * Polls for features whose lifecycle transitions were missed because the
 * executor writes job status directly to the DB and the orchestrator's 4s
 * Realtime window may not catch the broadcast.
 *
 * Handles:
 *   0. Failed job catch-up: marks features failed when JobFailed broadcast was missed
 *   1. breakdown → building: all breakdown jobs for the feature are complete
 *   2. building → combining: all implementation jobs are complete
 *   3. combining → verifying: the latest combine job is complete
 *   4. verifying → deploying_to_test: the latest verify job is complete and passed
 *   5. deploying_to_test: stuck recovery (5min timeout, max 3 retries/hour)
 *   6. deploying_to_prod → complete: the latest prod deploy job is complete
 */
```

**Step 3: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: add deploying_to_prod→complete catch-up poller"
```

---

## Task 5: `checkUnblockedJobs` — No change needed

The orchestrator flow is:
1. Listen for Realtime (4s) — process `JobComplete` → `handleJobComplete` → `checkUnblockedJobs`
2. Run `processFeatureLifecycle`
3. Run `dispatchQueuedJobs`

Steps 1-3 happen in the same invocation. Unblocked jobs are dispatched in the same cron tick. Confirmed by Codex and Gemini.

---

## Summary

| Task | What | Priority | Type |
|------|------|----------|------|
| 0 | Central failed-job catch-up | Critical | Systemic fix — all stages |
| 1 | combining → verifying | Critical | Self-healing poller |
| 2 | verifying → deploying_to_test | High | Self-healing poller |
| 3 | deploying_to_test recovery | High | Timeout rollback with retry cap |
| 4 | deploying_to_prod → complete | Medium | Self-healing poller |
| 5 | checkUnblockedJobs | — | No change needed |

Total diff: ~150 lines of TypeScript, all in `processFeatureLifecycle`.

---

## Follow-up Items (not in scope for this fix)

1. **Persist deploy payload on job result:** Have the local agent write `testUrl`, `machineId`, `ephemeral` to the job result field. Enables Task 3 to fully complete the transition instead of rolling back. *(Gemini)*
2. **Index `features.status` and `jobs.status`:** Pollers query these every tick. Verify indexes exist. *(Gemini)*
3. **Add tests for `processFeatureLifecycle`:** Currently zero test coverage. *(Codex)*
4. **Extract to separate file:** Orchestrator is 2772 lines. Extract lifecycle pollers into `lifecycle-poller.ts`. *(Gemini)*
5. **Fix `initiateTestDeploy` ordering bug:** Sets `deploying_to_test` before confirming machine availability (line 1704). Root cause of many Task 3 stuck states. *(Codex)*
6. **Durable messaging:** Replace 4-second Realtime window with DB outbox or persistent worker. Root cause of all catch-up poller requirements. *(Both reviewers)*
7. **Active verification "completed but not passed" handling:** Currently creates a silent stuck state in `verifying`. Needs a dedicated status or timeout. Deferred because it's a product decision (what should happen when verification fails?).

---

## Not In Scope

- **Concurrent execution issue:** Needs diagnostic data from Chris's logs. Run a test feature first.
- **Contractor dispatch routing:** Separate plan at `2026-02-26-contractor-dispatch-routing-plan.md`. Blocked on pipeline stability.
