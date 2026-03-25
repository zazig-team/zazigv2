# Review: Pipeline Lifecycle Fix Plan

Reviewed: 2026-02-26
Source: `docs/plans/2026-02-26-pipeline-lifecycle-fix-plan.md`
Reviewers: CTO (walkthrough), Codex gpt-5.3-codex (2 rounds), Gemini gemini-2.5-pro (1 round)

## Verdict

The plan is directionally correct and Task 1 should ship immediately to unblock the pipeline. However, three gaps were found that affect production reliability. Two are in the plan itself (notification spam, infinite retry loop), one is systemic (failed job catch-up missing across the entire lifecycle poller). All three were validated by Codex against the actual code. The plan should be amended before executing Tasks 2-4.

## One-Way Doors

| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| Rolling back deploying_to_test → verifying | Task 3 | HARD TO REVERSE (operationally) | Creates retry loop if root cause is persistent. Need max-retry guard. |
| Adding `notified_at` column to jobs | Gap 2 fix | Low | Schema change, but additive and nullable — easy to add, annoying to remove |

## Dependency Map

| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| `features.updated_at` column + trigger | Migration 003 | CONFIRMED — exists |
| `context.target = "prod"` on prod deploy jobs | handleFeatureApproved (line 1891) | CONFIRMED — exists |
| `triggerFeatureVerification` CAS guard | Line 1562-1566 | CONFIRMED — safe |
| `initiateTestDeploy` env-busy guard | Line 1685-1691 | CONFIRMED — exists but has ordering bug |
| Chris's logging changes merged | Commits 77e83d7, 3c6158d | CONFIRMED — merged to master |

## Key Trade-offs

- **Pollers over persistent listener:** Gains simplicity (no new infrastructure). Loses latency (up to 60s per missed transition) and creates O(n) queries per tick. Correct trade-off for now.
- **Timeout rollback over data persistence (Task 3):** Gains immediate unblocking. Loses precision (can't complete the transition properly without testUrl/machineId). Correct trade-off but needs retry cap.
- **Separate commits per task:** Gains rollback granularity. Risks partial deployment if Task 1 ships but Task 3 doesn't.

## Open Questions — Resolved

| Question | Answer | Source |
|----------|--------|--------|
| Does `features.updated_at` exist with auto-trigger? | Yes — migration 003 | CTO code check |
| Does `context.target = "prod"` exist on prod deploy jobs? | Yes — line 1891 | CTO code check |
| Is `checkUnblockedJobs` conclusion correct? | Yes | Codex + Gemini |

## Gaps Found

### Gap 1: Failed job catch-up is missing (systemic)

**Severity:** High
**Validated by:** Codex (both rounds)

`handleJobFailed` (line 1085) is the ONLY path that marks a feature as `failed`. It runs via Realtime broadcast. If the broadcast is missed (same 4-second window), the feature stays stuck forever — the pollers skip it (correct) but never mark it failed (incorrect).

This affects ALL lifecycle stages, not just the new pollers. The existing breakdown and building pollers have the same gap (lines 2261, 2338 — "handleJobFailed will mark the feature as failed" assumes the broadcast was received).

**Fix:** Add one central failed-job catch-up block at the TOP of `processFeatureLifecycle`:

```typescript
// --- 0. Failed job catch-up (all stages) ---
// If any feature has a failed job but the feature itself isn't marked failed,
// the JobFailed broadcast was missed. Mark the feature failed now.
const { data: nonFailedFeatures } = await supabase
  .from("features")
  .select("id")
  .not("status", "in", '("complete","failed","cancelled")')
  .limit(100);

for (const feature of (nonFailedFeatures ?? []) as { id: string }[]) {
  const { data: failedJob } = await supabase
    .from("jobs")
    .select("id, role, job_type, result")
    .eq("feature_id", feature.id)
    .eq("status", "failed")
    .limit(1);

  if (failedJob && failedJob.length > 0) {
    const job = failedJob[0];
    const errorDetail = `${job.role ?? job.job_type} job failed (catch-up): ${(job.result ?? "unknown error").slice(0, 200)}`;
    await supabase
      .from("features")
      .update({ status: "failed", error: errorDetail })
      .eq("id", feature.id)
      .not("status", "in", '("failed","complete","cancelled")'); // CAS
    console.warn(`[orchestrator] processFeatureLifecycle: feature ${feature.id} has failed job ${job.id} — marking feature failed (catch-up)`);
  }
}
```

**Consideration:** This is aggressive — it will fail features even during `building` when one job fails but others are still running. The existing `handleJobFailed` already does this (line 1133 has no CAS by status), so this is consistent. But worth noting.

### Gap 2: CPO notification spam in Task 2

**Severity:** Medium
**Validated by:** Codex

Task 2 calls `notifyCPO` on every cron tick (~60s) for features stuck in `verifying` with a failed active verification job. `notifyCPO` is non-idempotent. The CPO gets the same message every minute forever.

**Fix options (Codex recommendation: option B):**

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Check `feature.error` before notifying | Simple | Overloads a column for dedupe |
| B | Add `notified_at` to verify job after first notification | Clean separation | Schema change |
| C | Just mark the feature as failed instead of notifying | Simplest | Changes lifecycle semantics |

**Recommended:** Option C + Gap 1 fix. If the verify job failed, mark the feature as failed (handled by Gap 1's central catch-up). Remove the CPO notification from the poller entirely — the failed-job catch-up already handles it, and the feature status change itself is the notification trigger. This eliminates the spam problem and the need for a new column.

### Gap 3: Infinite retry loop (Task 3 + Task 2 interaction)

**Severity:** High
**Validated by:** Codex

Task 3 rolls back `deploying_to_test → verifying` after 5 minutes. Task 2's poller then sees the (still-complete) verify job and calls `initiateTestDeploy` again. If the root cause is persistent (no machine, ordering bug), the feature bounces every 5 minutes forever.

**Fix:** Add a retry counter. After N failed deploy attempts, mark the feature as `failed` instead of rolling back to `verifying`.

```typescript
// In Task 3's rollback block, after the rollback:
const { data: deployAttempts } = await supabase
  .from("jobs")
  .select("id")
  .eq("feature_id", feature.id)
  .eq("job_type", "deploy")
  .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString()) // last hour
  .limit(10);

const attempts = deployAttempts?.length ?? 0;
if (attempts >= 3) {
  // Too many deploy attempts — fail the feature
  await supabase
    .from("features")
    .update({ status: "failed", error: `Deploy to test failed after ${attempts} attempts in the last hour` })
    .eq("id", feature.id);
  console.error(`[orchestrator] Feature ${feature.id} failed after ${attempts} deploy attempts`);
} else {
  // Roll back to verifying for retry
  // ... existing rollback code ...
}
```

Alternative: count rollback events rather than deploy jobs, but deploy job count is simpler and already queryable.

## Suggested Revisions

1. **Add Gap 1 fix as Task 0** — central failed-job catch-up at the top of `processFeatureLifecycle`. This fixes a systemic issue across ALL stages, not just the new ones.

2. **Remove CPO failure notification from Task 2** — the Gap 1 fix handles this. When the poller finds a failed verify job, the central catch-up marks the feature as failed. No notification spam, no new column needed.

3. **Add retry cap to Task 3** — max 3 deploy attempts per hour. After that, mark the feature as `failed` with a descriptive error. Notify CPO once.

4. **Add to follow-up items:** Fix `initiateTestDeploy` ordering bug (check machine before setting status). This is the root cause of Task 3's existence — without it, the 5-minute timeout rollback would rarely trigger.

5. **Ship order:** Task 0 (failed catch-up) → Task 1 (combining→verifying) → test with a real feature → Tasks 2-4.
