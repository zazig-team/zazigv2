# Pipeline Null-Branch Guard & Verifier Repo Path Fix

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix two bugs blocking the feature pipeline from progressing past `verifying` / `deploying_to_test`: (1) orchestrator sends `deploy_to_test` with `featureBranch: null`, rejected by agent validator; (2) verifier runs `claude -p` in the wrong directory, never produces a verify report.

**Architecture:** Both fixes are in existing files — one in the orchestrator edge function, one in the local agent verifier + shared validator. No new files. The orchestrator needs null guards before sending messages that require `featureBranch`. The verifier needs to resolve the actual repo checkout path from the executor's worktree conventions rather than falling back to `process.cwd()`.

**Tech Stack:** TypeScript, Supabase Edge Functions (Deno), local agent (Node.js), shared validators

**Context:** Discovered during smoke testing of feature `2e9f067c`. The job-polling plan (tasks 0-3) shipped successfully. These are the next two blockers.

---

## Bug 1: `deploy_to_test` rejected — `featureBranch` is null

### Root Cause

`initiateTestDeploy()` at `supabase/functions/orchestrator/index.ts:1743` sends `featureBranch: feature.branch` without checking for null. The feature row for `2e9f067c` has `branch = null`.

The agent-side validator at `packages/shared/src/validators.ts:159` correctly requires `featureBranch` to be a non-empty string:
```typescript
if (!isString(v.featureBranch) || v.featureBranch.length === 0) return false;
```

The message is rejected every ~7 minutes by the orchestrator's `deploying_to_test` stuck recovery poller, which re-calls `initiateTestDeploy` → same null branch → rejected again.

### Why the branch is null

The branch auto-generation happens in two places:
- `triggerBreakdown()` at line 2123 — runs when feature enters breakdown
- Breakdown completion handler at line 1023 — runs when breakdown job completes

Both use `feature.branch` and generate one if missing. But if the feature somehow bypassed breakdown (manual status change, race condition, or was created before branch generation was added), the branch stays null through `building → combining → verifying → deploying_to_test`.

The dispatch path at line 593 guards against this (`if (!featureBranch) continue`), but `initiateTestDeploy` and `triggerFeatureVerification` do not.

---

## Bug 2: Verifier runs in wrong directory

### Root Cause

The `VerifyJob` message dispatched at `orchestrator/index.ts:651-658` does NOT include `repoPath`:

```typescript
const verifyJobMsg: VerifyJob = {
  type: "verify_job",
  protocolVersion: PROTOCOL_VERSION,
  jobId: job.id,
  featureBranch: ctx.featureBranch ?? "",
  jobBranch: job.branch ?? ctx.featureBranch ?? "",
  acceptanceTests: ctx.acceptanceTests ?? "",
  // ← no repoPath
};
```

In `verifier.ts:68`, the fallback is:
```typescript
const repoDir = msg.repoPath ?? process.cwd();
```

`process.cwd()` resolves to the local-agent package directory (`packages/local-agent/`), not the actual repo checkout. The Claude reviewer session runs there, finds no feature code, can't write a meaningful report, and verification fails.

The executor handles this correctly for `start_job` via `setupJobWorkspace()` which clones/checks out the branch. The verifier has no equivalent — it needs the repo path passed in the message, resolved from the project's `repo_url` + the machine's local clone path.

---

## Task 0: Guard `initiateTestDeploy` against null branch

**Priority:** Critical — unblocks the stuck feature immediately.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts:1674-1760`

**Step 1: Add null guard after feature fetch**

In `initiateTestDeploy()`, after the feature fetch (line 1679), add a branch null check before proceeding. The orchestrator already has a pattern for auto-generating branches (line 2123). Apply the same pattern here as a safety net.

At line 1683 (after the `if (fetchErr || !feature)` block), insert:

```typescript
  // Guard: branch must exist before we can deploy. If missing, auto-generate it.
  // This shouldn't happen (triggerBreakdown sets it), but prevents permanent stuck state.
  if (!feature.branch) {
    console.warn(`[orchestrator] initiateTestDeploy: feature ${featureId} has no branch — cannot deploy`);
    return;
  }
```

The simpler approach (just return) is better than auto-generating here because by the time we're deploying, the branch should have actual code on it. Generating a new branch name at this stage would deploy an empty branch.

**Step 2: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: guard initiateTestDeploy against null feature branch"
```

---

## Task 1: Guard `triggerFeatureVerification` against null branch

**Priority:** Critical — same class of bug, different code path.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts:1558-1664`

**Step 1: Read the function**

Read `triggerFeatureVerification` at lines 1558-1664. It reads `feature.branch` at lines 1631 and 1646 without null checks.

**Step 2: Add null guard after feature fetch**

In `triggerFeatureVerification()`, after the feature fetch, add a branch check. This function is called before `initiateTestDeploy` in the pipeline, so guarding here catches the problem earlier.

Find the existing feature fetch and its error check. After the error check, add:

```typescript
  if (!feature.branch) {
    console.error(`[orchestrator] triggerFeatureVerification: feature ${featureId} has no branch — cannot verify`);
    return;
  }
```

**Step 3: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: guard triggerFeatureVerification against null feature branch"
```

---

## Task 2: Add `repoPath` to VerifyJob dispatch in orchestrator

**Priority:** Critical — without this the verifier always runs in the wrong dir.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts:645-672`

**Step 1: Understand context**

The dispatch loop at line 645-672 constructs `verifyJobMsg` for passive verification jobs. At this point in the code, `repoUrl` is already resolved (line 572-581) and validated non-null (line 593). The agent needs a local filesystem path, not a URL.

The executor resolves local repo paths using `setupJobWorkspace()` which clones from `repoUrl`. The verifier should use the same clone. But the executor's worktree is created per-job and cleaned up after — the verifier needs its own checkout.

The cleanest fix: pass `repoUrl` in the message (renaming the field to match its meaning) and have the verifier resolve the local path. But the `VerifyJob` message already has a `repoPath` optional field. We should send `repoUrl` there so the verifier knows where the repo lives.

**However**, the verifier uses `repoPath` as a local filesystem path (`readFileSync`, `execFile` with `cwd`). Sending a URL there would break the verifier.

**Better approach:** The local agent already knows the repo checkout location from the executor's workspace. The verifier should look up the repo clone location from the local agent's repos directory (`~/.zazigv2/repos/`). This is where `setupJobWorkspace()` clones repos to.

**Simplest correct fix:** Have the orchestrator pass `repoUrl` on the VerifyJob message, and have the verifier resolve the local clone path from it. This requires:
1. Adding `repoUrl` to the VerifyJob dispatch (orchestrator)
2. Having the verifier derive the local path from the URL

But the `VerifyJob` type only has `repoPath?: string`. We can send the URL there and let the verifier handle it. But that's overloading the field semantically.

**Recommended approach:** Add the URL as `repoPath` and update the verifier to handle both URLs (by resolving to local clone) and local paths. Since the repos are already cloned at `~/.zazigv2/repos/<repo-name>/`, the verifier just needs to derive the directory name from the URL.

**Step 2: Add repoPath to the VerifyJob message in the dispatch loop**

At `orchestrator/index.ts:651-658`, add `repoPath` using the already-resolved `repoUrl`:

Change the `verifyJobMsg` construction from:

```typescript
      const verifyJobMsg: VerifyJob = {
        type: "verify_job",
        protocolVersion: PROTOCOL_VERSION,
        jobId: job.id,
        featureBranch: ctx.featureBranch ?? "",
        jobBranch: job.branch ?? ctx.featureBranch ?? "",
        acceptanceTests: ctx.acceptanceTests ?? "",
      };
```

To:

```typescript
      const verifyJobMsg: VerifyJob = {
        type: "verify_job",
        protocolVersion: PROTOCOL_VERSION,
        jobId: job.id,
        featureBranch: ctx.featureBranch ?? "",
        jobBranch: job.branch ?? ctx.featureBranch ?? "",
        acceptanceTests: ctx.acceptanceTests ?? "",
        repoPath: repoUrl!,
      };
```

This sends the git URL as `repoPath`. The verifier will need to resolve this to a local path (next task).

**Step 3: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: include repoPath in VerifyJob dispatch so verifier knows the repo"
```

---

## Task 3: Update verifier to resolve local repo path from URL

**Priority:** Critical — completes the verifier repo path fix.

**Files:**
- Modify: `packages/local-agent/src/verifier.ts:66-86`

**Step 1: Understand the repo clone convention**

Check how `setupJobWorkspace()` in `packages/local-agent/src/workspace.ts` resolves repo paths. It clones repos to a predictable location. The verifier needs to use the same convention.

Read `packages/local-agent/src/workspace.ts` to find the clone path pattern.

**Step 2: Add repo path resolution to the verifier**

The verifier receives `repoPath` which may be:
- A local filesystem path (already correct) — starts with `/`
- A git URL (from orchestrator) — starts with `https://`

Add a helper that resolves the path:

```typescript
/**
 * Resolves a repo path for verification. If the path is a URL,
 * derives the local clone directory from ~/.zazigv2/repos/.
 * If it's already a local path, returns it as-is.
 */
function resolveRepoPath(repoPathOrUrl: string): string {
  // Already a local path
  if (repoPathOrUrl.startsWith("/")) return repoPathOrUrl;

  // Git URL — derive local clone path
  // Convention: ~/.zazigv2/repos/<repo-name>/ (from workspace.ts)
  const repoName = repoPathOrUrl
    .replace(/\.git$/, "")
    .split("/")
    .pop() ?? "unknown";
  return join(homedir(), ".zazigv2", "repos", repoName);
}
```

Import `homedir` from `node:os` and `join` from `node:path` (already imported).

**Step 3: Use the resolver in `verify()`**

Change `verifier.ts:68` from:

```typescript
const repoDir = msg.repoPath ?? process.cwd();
```

To:

```typescript
const repoDir = msg.repoPath ? resolveRepoPath(msg.repoPath) : process.cwd();
```

**Step 4: Verify the repo clone exists**

After resolving the path, add an existence check before spawning the reviewer:

```typescript
if (!existsSync(repoDir)) {
  console.error(`[verifier] Repo directory not found: ${repoDir} — cannot verify jobId=${jobId}`);
  await this.sendResult(jobId, false, `Repo directory not found: ${repoDir}`);
  return;
}
```

Import `existsSync` from `node:fs` (already imported as `readFileSync` — add `existsSync` to the import).

**Step 5: Checkout the correct branch before verification**

The verifier needs to be on the right branch. Add a git checkout before spawning the reviewer:

```typescript
try {
  await this.exec("git", ["fetch", "origin"], { cwd: repoDir, timeout: 60_000 });
  await this.exec("git", ["checkout", jobBranch], { cwd: repoDir, timeout: 30_000 });
} catch (err) {
  console.warn(`[verifier] Failed to checkout ${jobBranch} in ${repoDir}: ${getExecOutput(err)}`);
  await this.sendResult(jobId, false, `Failed to checkout branch ${jobBranch}`);
  return;
}
```

Add this before the `loadReviewerPrompt()` call.

**Step 6: Commit**

```bash
git add packages/local-agent/src/verifier.ts
git commit -m "fix: resolve repo path from URL and checkout branch before verification"
```

---

## Task 4: Fix the stuck smoke test feature (data fix)

**Priority:** Immediate — unblocks the current test.

**Files:** None (DB operation)

**Step 1: Check the feature's current state**

```sql
SELECT id, status, branch, title
FROM features
WHERE id = '2e9f067c-e821-44aa-9549-303e948301ec';
```

**Step 2: If branch is null, generate it**

The feature should already have a branch from breakdown. If it's null, check what the breakdown job used:

```sql
SELECT id, branch, job_type, status
FROM jobs
WHERE feature_id = '2e9f067c-e821-44aa-9549-303e948301ec'
ORDER BY created_at;
```

If a branch exists on the jobs but not the feature, copy it:

```sql
UPDATE features
SET branch = (
  SELECT branch FROM jobs
  WHERE feature_id = '2e9f067c-e821-44aa-9549-303e948301ec'
    AND branch IS NOT NULL
  LIMIT 1
)
WHERE id = '2e9f067c-e821-44aa-9549-303e948301ec'
  AND branch IS NULL;
```

**Step 3: If the feature is stuck in `deploying_to_test`, reset to `verifying`**

```sql
UPDATE features
SET status = 'verifying'
WHERE id = '2e9f067c-e821-44aa-9549-303e948301ec'
  AND status = 'deploying_to_test';
```

The `verifying → deploying_to_test` poller will re-trigger `initiateTestDeploy` with the now-populated branch.

**Step 4: Verify in logs**

Watch `~/.zazigv2/local-agent.log` for the next `deploy_to_test` message. It should now pass validation and be handled by the test runner.

---

## Summary

| Task | What | Where | Priority |
|------|------|-------|----------|
| 0 | Guard `initiateTestDeploy` null branch | orchestrator/index.ts | Critical |
| 1 | Guard `triggerFeatureVerification` null branch | orchestrator/index.ts | Critical |
| 2 | Add `repoPath` to VerifyJob dispatch | orchestrator/index.ts | Critical |
| 3 | Verifier: resolve repo path + checkout branch | verifier.ts | Critical |
| 4 | Data fix for stuck smoke test feature | DB (manual) | Immediate |

Tasks 0-1 can be committed together (same file, same bug class). Total diff: ~30 lines orchestrator + ~40 lines verifier.

---

## Risk Notes

- **Task 3 git checkout**: The verifier will `git checkout` in a shared repo clone. If another job is running on a different branch in the same clone, this will corrupt its working tree. At current scale (1 machine, sequential verify jobs) this is safe. At scale, the verifier should use a worktree or its own clone. Flag this for the durable job queue follow-up.
- **Task 2 semantic overload**: Sending a URL in a field called `repoPath` is ugly but pragmatic. The alternative — adding a new `repoUrl` field to VerifyJob — requires a shared type change, validator update, and coordinated deploy. Not worth it for this fix. Clean up when moving to the durable queue.
- **Branch auto-generation at deploy time**: Task 0 intentionally does NOT auto-generate a branch. If we reach `deploying_to_test` with no branch, something went wrong upstream. Better to fail loudly than deploy an empty branch.
