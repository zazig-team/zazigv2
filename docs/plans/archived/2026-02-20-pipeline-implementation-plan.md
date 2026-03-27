# Software Development Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full v2 software development pipeline: feature design → job breakdown → parallel build → job verification → feature verification → test env deploy + fix agent → human acceptance → merge + ship.

**Architecture:** Orchestrator-driven pipeline where the Supabase Edge Function manages all state transitions, verification, deployment, and agent lifecycle. Local agents execute jobs in isolated worktrees. Slack is the human interface (CPO for strategy, fix agents for testing, orchestrator for notifications).

**Runtime Model:** All exec agents (CPO, CTO, CMO) are **Claude Code sessions**, not Agent SDK bots. They run locally on a host machine and are accessible to the team via Slack (using Slack MCP). This preserves the full Claude Code toolchain — skills (brainstorming, review-plan, cardify, repo-recon), hooks, MCP servers — which the exec design relies on heavily. The Zazig Python package provides the Slack bot / Socket Mode transport layer only; it is not the exec agent runtime. Ephemeral implementation agents (engineers, researchers) are also Claude Code sessions spawned in tmux by the local agent daemon.

**Tech Stack:** TypeScript, Supabase (Postgres + Edge Functions + Realtime), Node.js (local agent), Deno (orchestrator), Slack API (notifications + fix agent)

**Design doc:** `docs/plans/2026-02-24-software-development-pipeline-design.md`

---

## Task 1: Set Up Test Framework

Before building anything, we need a real test runner. Currently the repo has no test framework — just one hand-rolled test file.

**Files:**
- Modify: `package.json` (root) — add vitest
- Modify: `packages/shared/package.json` — add test script
- Modify: `packages/local-agent/package.json` — add test script
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/local-agent/vitest.config.ts`
- Migrate: `packages/shared/src/annotations.test.ts` → vitest syntax

**Step 1: Install vitest**

```bash
npm install -D vitest @vitest/coverage-v8 --workspace=packages/shared
npm install -D vitest @vitest/coverage-v8 --workspace=packages/local-agent
```

**Step 2: Add vitest configs**

```typescript
// packages/shared/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });

// packages/local-agent/vitest.config.ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
```

**Step 3: Add test scripts to each package.json**

```json
"scripts": { "test": "vitest run", "test:watch": "vitest" }
```

**Step 4: Add root test script**

```json
"scripts": { "test": "npm run test --workspaces --if-present" }
```

**Step 5: Migrate annotations.test.ts to vitest**

Replace hand-rolled assertions with `import { describe, it, expect } from "vitest"`.

**Step 6: Run tests to verify migration**

```bash
npm test
```
Expected: All 19 annotation tests pass.

**Step 7: Commit**

```bash
git commit -m "chore: add vitest test framework across packages"
```

---

## Task 2: Schema Migration — Feature and Job Pipeline Columns

Add the new columns and status values needed for the pipeline.

**Files:**
- Create: `supabase/migrations/004_pipeline_columns.sql`

**Step 1: Write the migration**

```sql
-- Expand features table for pipeline
ALTER TABLE public.features
  DROP CONSTRAINT IF EXISTS features_status_check;
ALTER TABLE public.features
  ADD CONSTRAINT features_status_check
    CHECK (status IN ('design', 'building', 'verifying', 'testing', 'done', 'cancelled'));
ALTER TABLE public.features
  ADD COLUMN IF NOT EXISTS spec text,
  ADD COLUMN IF NOT EXISTS acceptance_tests text,
  ADD COLUMN IF NOT EXISTS human_checklist text,
  ADD COLUMN IF NOT EXISTS feature_branch text;

-- Update default status
ALTER TABLE public.features ALTER COLUMN status SET DEFAULT 'design';

-- Expand jobs table for pipeline
ALTER TABLE public.jobs
  DROP CONSTRAINT IF EXISTS jobs_status_check;
ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_status_check
    CHECK (status IN (
      'design', 'queued', 'dispatched', 'executing',
      'verifying', 'verify_failed', 'testing',
      'approved', 'rejected',
      'waiting_on_human', 'reviewing',
      'complete', 'done', 'failed', 'cancelled'
    ));
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS acceptance_tests text,
  ADD COLUMN IF NOT EXISTS sequence integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_branch text,
  ADD COLUMN IF NOT EXISTS verify_context text,
  ADD COLUMN IF NOT EXISTS rejection_feedback text;

-- Atomic slot release function (fixes known P0 race condition)
CREATE OR REPLACE FUNCTION public.release_slot(
  p_machine_id uuid,
  p_slot_type text
) RETURNS void AS $$
BEGIN
  IF p_slot_type = 'claude_code' THEN
    UPDATE public.machines SET slots_claude_code = slots_claude_code + 1 WHERE id = p_machine_id;
  ELSIF p_slot_type = 'codex' THEN
    UPDATE public.machines SET slots_codex = slots_codex + 1 WHERE id = p_machine_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to check if all jobs for a feature are complete
CREATE OR REPLACE FUNCTION public.all_feature_jobs_complete(p_feature_id uuid)
RETURNS boolean AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.jobs
    WHERE feature_id = p_feature_id
      AND status NOT IN ('done', 'complete', 'cancelled')
  );
$$ LANGUAGE sql STABLE;
```

**Step 2: Apply migration locally**

```bash
supabase db push
```

**Step 3: Commit**

```bash
git commit -m "feat: add pipeline columns to features and jobs tables"
```

---

## Task 3: Shared Protocol — New Pipeline Types and Messages

Update the shared protocol to support the full pipeline state machine.

**Files:**
- Modify: `packages/shared/src/messages.ts` — new types, new messages
- Create: `packages/shared/src/messages.test.ts` — tests for new validators
- Modify: `packages/shared/src/validators.ts` — new type guards
- Modify: `packages/shared/src/index.ts` — re-export new types

**Step 1: Write failing tests for new types and validators**

```typescript
// packages/shared/src/messages.test.ts
import { describe, it, expect } from "vitest";
import {
  isVerifyJob, isDeployToTest, isFeatureApproved, isFeatureRejected,
  FEATURE_STATUSES, JOB_STATUSES
} from "./index.js";

describe("pipeline status enums", () => {
  it("feature statuses include all pipeline states", () => {
    expect(FEATURE_STATUSES).toEqual([
      "design", "building", "verifying", "testing", "done", "cancelled"
    ]);
  });
  it("job statuses include all pipeline states", () => {
    expect(JOB_STATUSES).toContain("verifying");
    expect(JOB_STATUSES).toContain("verify_failed");
    expect(JOB_STATUSES).toContain("testing");
    expect(JOB_STATUSES).toContain("approved");
    expect(JOB_STATUSES).toContain("rejected");
  });
});

describe("VerifyJob message", () => {
  it("validates a correct VerifyJob", () => {
    expect(isVerifyJob({
      type: "verify_job",
      protocolVersion: 1,
      jobId: "abc",
      featureBranch: "feature/auth",
      jobBranch: "job/api-endpoint",
      acceptanceTests: "test that POST /auth returns 200"
    })).toBe(true);
  });
  it("rejects missing featureBranch", () => {
    expect(isVerifyJob({
      type: "verify_job",
      protocolVersion: 1,
      jobId: "abc"
    })).toBe(false);
  });
});

describe("DeployToTest message", () => {
  it("validates a correct DeployToTest", () => {
    expect(isDeployToTest({
      type: "deploy_to_test",
      protocolVersion: 1,
      featureId: "abc",
      featureBranch: "feature/auth",
      projectId: "xyz"
    })).toBe(true);
  });
});

describe("FeatureApproved message", () => {
  it("validates a correct FeatureApproved", () => {
    expect(isFeatureApproved({
      type: "feature_approved",
      protocolVersion: 1,
      featureId: "abc"
    })).toBe(true);
  });
});

describe("FeatureRejected message", () => {
  it("validates a correct FeatureRejected", () => {
    expect(isFeatureRejected({
      type: "feature_rejected",
      protocolVersion: 1,
      featureId: "abc",
      feedback: "Button color is wrong",
      severity: "small"
    })).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/shared && npx vitest run
```
Expected: FAIL — imports don't exist yet.

**Step 3: Add new types to messages.ts**

```typescript
// New status enums
export const FEATURE_STATUSES = [
  "design", "building", "verifying", "testing", "done", "cancelled"
] as const;
export type FeatureStatus = typeof FEATURE_STATUSES[number];

export const JOB_STATUSES = [
  "design", "queued", "dispatched", "executing",
  "verifying", "verify_failed", "testing",
  "approved", "rejected",
  "waiting_on_human", "reviewing",
  "complete", "done", "failed", "cancelled"
] as const;
export type PipelineJobStatus = typeof JOB_STATUSES[number];

// New orchestrator → agent messages
export interface VerifyJob {
  type: "verify_job";
  protocolVersion: number;
  jobId: string;
  featureBranch: string;
  jobBranch: string;
  acceptanceTests: string;
  repoPath: string;
}

export interface DeployToTest {
  type: "deploy_to_test";
  protocolVersion: number;
  featureId: string;
  featureBranch: string;
  projectId: string;
}

// New agent → orchestrator messages
export interface FeatureApproved {
  type: "feature_approved";
  protocolVersion: number;
  featureId: string;
}

export interface FeatureRejected {
  type: "feature_rejected";
  protocolVersion: number;
  featureId: string;
  feedback: string;
  severity: "small" | "big";
}

export interface VerifyResult {
  type: "verify_result";
  protocolVersion: number;
  jobId: string;
  passed: boolean;
  testOutput: string;
  reviewSummary?: string;
}
```

**Step 4: Add validators to validators.ts**

```typescript
export function isVerifyJob(msg: unknown): msg is VerifyJob {
  return isObject(msg) && msg.type === "verify_job"
    && typeof msg.protocolVersion === "number"
    && typeof msg.jobId === "string"
    && typeof msg.featureBranch === "string"
    && typeof msg.jobBranch === "string"
    && typeof msg.acceptanceTests === "string";
}

export function isDeployToTest(msg: unknown): msg is DeployToTest {
  return isObject(msg) && msg.type === "deploy_to_test"
    && typeof msg.protocolVersion === "number"
    && typeof msg.featureId === "string"
    && typeof msg.featureBranch === "string"
    && typeof msg.projectId === "string";
}

export function isFeatureApproved(msg: unknown): msg is FeatureApproved {
  return isObject(msg) && msg.type === "feature_approved"
    && typeof msg.protocolVersion === "number"
    && typeof msg.featureId === "string";
}

export function isFeatureRejected(msg: unknown): msg is FeatureRejected {
  return isObject(msg) && msg.type === "feature_rejected"
    && typeof msg.protocolVersion === "number"
    && typeof msg.featureId === "string"
    && typeof msg.feedback === "string"
    && (msg.severity === "small" || msg.severity === "big");
}

export function isVerifyResult(msg: unknown): msg is VerifyResult {
  return isObject(msg) && msg.type === "verify_result"
    && typeof msg.protocolVersion === "number"
    && typeof msg.jobId === "string"
    && typeof msg.passed === "boolean"
    && typeof msg.testOutput === "string";
}
```

**Step 5: Export from index.ts**

**Step 6: Run tests**

```bash
cd packages/shared && npx vitest run
```
Expected: All pass.

**Step 7: Commit**

```bash
git commit -m "feat: add pipeline protocol types and validators"
```

---

## Task 4: Branch Management Module

A pure utility module that handles all git operations for the pipeline: creating feature/job branches, rebasing, merging, cleanup.

**Files:**
- Create: `packages/local-agent/src/branches.ts`
- Create: `packages/local-agent/src/branches.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/local-agent/src/branches.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileAsync } from "./branches.js";
import {
  createFeatureBranch,
  createJobBranch,
  rebaseOnBranch,
  mergeJobIntoFeature,
  mergeFeatureIntoMain,
  cleanupBranches,
  createWorktree,
  removeWorktree
} from "./branches.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// These tests run against a real temporary git repo
let repoDir: string;

beforeEach(() => {
  repoDir = mkdtempSync(join(tmpdir(), "branch-test-"));
  // Init a git repo with an initial commit
  // (implementation in test setup)
});

afterEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe("createFeatureBranch", () => {
  it("creates a branch named feature/{name} from main", async () => {
    const branch = await createFeatureBranch(repoDir, "auth-system");
    expect(branch).toBe("feature/auth-system");
  });
});

describe("createJobBranch", () => {
  it("creates a branch named job/{name} from the feature branch", async () => {
    await createFeatureBranch(repoDir, "auth-system");
    const branch = await createJobBranch(repoDir, "feature/auth-system", "api-endpoint");
    expect(branch).toBe("job/api-endpoint");
  });
});

describe("mergeJobIntoFeature", () => {
  it("merges job branch into feature branch", async () => {
    // Setup: create feature branch, create job branch, make a commit on job branch
    // Then merge
    const result = await mergeJobIntoFeature(repoDir, "job/api-endpoint", "feature/auth-system");
    expect(result.success).toBe(true);
  });
});

describe("rebaseOnBranch", () => {
  it("rebases source branch onto target", async () => {
    const result = await rebaseOnBranch(repoDir, "feature/auth-system", "main");
    expect(result.success).toBe(true);
  });
});

describe("createWorktree", () => {
  it("creates a worktree at the expected path", async () => {
    const worktreePath = await createWorktree(repoDir, "feature/auth-system");
    expect(worktreePath).toContain("auth-system");
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd packages/local-agent && npx vitest run src/branches.test.ts
```

**Step 3: Implement branches.ts**

```typescript
// packages/local-agent/src/branches.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);
const WORKTREE_BASE = join(process.env.HOME ?? "~", "Documents/GitHub/.worktrees");

interface MergeResult {
  success: boolean;
  error?: string;
}

async function git(repoDir: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args]);
  return stdout.trim();
}

export async function createFeatureBranch(repoDir: string, featureName: string): Promise<string> {
  const branch = `feature/${featureName}`;
  await git(repoDir, "checkout", "main");
  await git(repoDir, "pull", "--ff-only", "origin", "main");
  await git(repoDir, "checkout", "-b", branch);
  await git(repoDir, "push", "-u", "origin", branch);
  return branch;
}

export async function createJobBranch(
  repoDir: string,
  featureBranch: string,
  jobName: string
): Promise<string> {
  const branch = `job/${jobName}`;
  await git(repoDir, "checkout", featureBranch);
  await git(repoDir, "pull", "--ff-only", "origin", featureBranch);
  await git(repoDir, "checkout", "-b", branch);
  await git(repoDir, "push", "-u", "origin", branch);
  return branch;
}

export async function rebaseOnBranch(
  repoDir: string,
  sourceBranch: string,
  targetBranch: string
): Promise<MergeResult> {
  try {
    await git(repoDir, "checkout", sourceBranch);
    await git(repoDir, "fetch", "origin", targetBranch);
    await git(repoDir, "rebase", `origin/${targetBranch}`);
    return { success: true };
  } catch (err: any) {
    await git(repoDir, "rebase", "--abort").catch(() => {});
    return { success: false, error: err.message };
  }
}

export async function mergeJobIntoFeature(
  repoDir: string,
  jobBranch: string,
  featureBranch: string
): Promise<MergeResult> {
  try {
    await git(repoDir, "checkout", featureBranch);
    await git(repoDir, "merge", "--no-ff", jobBranch, "-m", `merge: ${jobBranch} into ${featureBranch}`);
    await git(repoDir, "push", "origin", featureBranch);
    return { success: true };
  } catch (err: any) {
    await git(repoDir, "merge", "--abort").catch(() => {});
    return { success: false, error: err.message };
  }
}

export async function mergeFeatureIntoMain(
  repoDir: string,
  featureBranch: string
): Promise<MergeResult> {
  try {
    await git(repoDir, "checkout", "main");
    await git(repoDir, "pull", "--ff-only", "origin", "main");
    await git(repoDir, "merge", "--no-ff", featureBranch, "-m", `merge: ${featureBranch} into main`);
    await git(repoDir, "push", "origin", "main");
    return { success: true };
  } catch (err: any) {
    await git(repoDir, "merge", "--abort").catch(() => {});
    return { success: false, error: err.message };
  }
}

export async function cleanupBranches(repoDir: string, branches: string[]): Promise<void> {
  for (const branch of branches) {
    await git(repoDir, "push", "origin", "--delete", branch).catch(() => {});
    await git(repoDir, "branch", "-D", branch).catch(() => {});
  }
}

export async function createWorktree(repoDir: string, branch: string): Promise<string> {
  const slug = branch.replace(/\//g, "-");
  const worktreePath = join(WORKTREE_BASE, slug);
  await execFileAsync("mkdir", ["-p", WORKTREE_BASE]);
  await git(repoDir, "worktree", "add", worktreePath, branch);
  return worktreePath;
}

export async function removeWorktree(repoDir: string, worktreePath: string): Promise<void> {
  await git(repoDir, "worktree", "remove", worktreePath, "--force").catch(() => {});
}
```

**Step 4: Run tests**

```bash
cd packages/local-agent && npx vitest run src/branches.test.ts
```

**Step 5: Commit**

```bash
git commit -m "feat: add branch management module for pipeline"
```

---

## Task 5: Job Verification Pipeline

After an agent completes a job, the orchestrator triggers verification: rebase job branch on feature branch, run acceptance tests, run code review. If pass → merge into feature branch. If fail → requeue.

**Files:**
- Create: `packages/local-agent/src/verifier.ts` — runs on the local agent machine
- Create: `packages/local-agent/src/verifier.test.ts`
- Modify: `packages/local-agent/src/executor.ts` — after job complete, trigger verification
- Modify: `supabase/functions/orchestrator/index.ts` — handle VerifyResult, manage feature lifecycle

**Step 1: Write failing tests for verifier**

```typescript
// packages/local-agent/src/verifier.test.ts
import { describe, it, expect, vi } from "vitest";
import { JobVerifier } from "./verifier.js";

describe("JobVerifier", () => {
  it("runs acceptance tests and returns pass/fail", async () => {
    // Test with a mock repo that has passing tests
  });

  it("rebases job branch on feature branch before testing", async () => {
    // Verify rebase is called
  });

  it("merges job branch into feature branch on pass", async () => {
    // Verify merge happens
  });

  it("sends verify_failed on test failure", async () => {
    // Verify failure path
  });

  it("checks if all feature jobs are complete after merge", async () => {
    // Verify feature completion check
  });
});
```

**Step 2: Implement verifier.ts**

The `JobVerifier` class:
1. Receives a `VerifyJob` message from the orchestrator
2. Rebases the job branch on the feature branch
3. Runs `npm test` (acceptance tests)
4. Runs `npm run lint && npm run typecheck`
5. If all pass → merges job branch into feature branch
6. Sends `VerifyResult` back to orchestrator
7. Orchestrator checks if all jobs for the feature are done → triggers feature verification

```typescript
// packages/local-agent/src/verifier.ts
import { rebaseOnBranch, mergeJobIntoFeature } from "./branches.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { VerifyJob, VerifyResult, SendFn } from "./index.js";

const execFileAsync = promisify(execFile);

export class JobVerifier {
  constructor(
    private repoDir: string,
    private send: SendFn
  ) {}

  async verify(msg: VerifyJob): Promise<void> {
    const { jobId, featureBranch, jobBranch, acceptanceTests, repoPath } = msg;
    const workDir = repoPath || this.repoDir;

    // 1. Rebase job branch on feature branch
    const rebase = await rebaseOnBranch(workDir, jobBranch, featureBranch);
    if (!rebase.success) {
      await this.sendResult(jobId, false, `Rebase failed: ${rebase.error}`);
      return;
    }

    // 2. Run tests
    let testOutput: string;
    try {
      const { stdout, stderr } = await execFileAsync("npm", ["test"], {
        cwd: workDir,
        timeout: 300_000 // 5 min timeout for tests
      });
      testOutput = stdout + stderr;
    } catch (err: any) {
      await this.sendResult(jobId, false, `Tests failed:\n${err.stdout}\n${err.stderr}`);
      return;
    }

    // 3. Run lint + typecheck
    try {
      await execFileAsync("npm", ["run", "lint"], { cwd: workDir, timeout: 60_000 });
      await execFileAsync("npm", ["run", "typecheck"], { cwd: workDir, timeout: 60_000 });
    } catch (err: any) {
      await this.sendResult(jobId, false, `Lint/typecheck failed:\n${err.stdout}\n${err.stderr}`);
      return;
    }

    // 4. Merge job branch into feature branch
    const merge = await mergeJobIntoFeature(workDir, jobBranch, featureBranch);
    if (!merge.success) {
      await this.sendResult(jobId, false, `Merge failed: ${merge.error}`);
      return;
    }

    // 5. Report success
    await this.sendResult(jobId, true, testOutput);
  }

  private async sendResult(jobId: string, passed: boolean, testOutput: string): Promise<void> {
    const msg: VerifyResult = {
      type: "verify_result",
      protocolVersion: 1,
      jobId,
      passed,
      testOutput
    };
    await this.send(msg);
  }
}
```

**Step 3: Run tests**

```bash
cd packages/local-agent && npx vitest run src/verifier.test.ts
```

**Step 4: Commit**

```bash
git commit -m "feat: add job verification pipeline"
```

---

## Task 6: Feature Verification in Orchestrator

When the orchestrator receives a passing `VerifyResult` and all jobs for the feature are merged, trigger feature-level verification: rebase feature branch on main, run all tests.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` — add `handleVerifyResult`, `triggerFeatureVerification`, feature lifecycle tracking

**Step 1: Write the orchestrator handler**

Add to `orchestrator/index.ts`:

```typescript
async function handleVerifyResult(supabase: SupabaseClient, msg: VerifyResult): Promise<void> {
  const { jobId, passed, testOutput } = msg;

  if (!passed) {
    // Requeue the job with failure context
    await supabase.from("jobs").update({
      status: "verify_failed",
      verify_context: testOutput,
      machine_id: null
    }).eq("id", jobId);
    // verify_failed jobs get requeued on next dispatch cycle
    // (add to dispatchQueuedJobs: also pick up verify_failed jobs)
    return;
  }

  // Job passed — mark as done
  await supabase.from("jobs").update({ status: "done" }).eq("id", jobId);

  // Check if all jobs for this feature are complete
  const { data: job } = await supabase.from("jobs")
    .select("feature_id").eq("id", jobId).single();
  if (!job?.feature_id) return;

  const { data: allDone } = await supabase.rpc("all_feature_jobs_complete", {
    p_feature_id: job.feature_id
  });

  if (allDone) {
    await triggerFeatureVerification(supabase, job.feature_id);
  }
}

async function triggerFeatureVerification(supabase: SupabaseClient, featureId: string): Promise<void> {
  // Update feature status
  await supabase.from("features").update({ status: "verifying" }).eq("id", featureId);

  // The feature verification runs as a special job dispatched to a machine
  // It rebases the feature branch on main and runs all tests
  const { data: feature } = await supabase.from("features")
    .select("feature_branch, project_id, company_id, acceptance_tests")
    .eq("id", featureId).single();

  if (!feature) return;

  // Dispatch a verification job (uses existing dispatch machinery)
  await supabase.from("jobs").insert({
    company_id: feature.company_id,
    project_id: feature.project_id,
    feature_id: featureId,
    role: "reviewer",
    job_type: "code",
    complexity: "simple",
    slot_type: "claude_code",
    status: "queued",
    context: JSON.stringify({
      type: "feature_verification",
      featureBranch: feature.feature_branch,
      acceptanceTests: feature.acceptance_tests
    }),
    branch: feature.feature_branch
  });
}
```

**Step 2: Update dispatch to handle verify_failed requeue**

In `dispatchQueuedJobs`, change the status filter:
```typescript
// Before: .eq("status", "queued")
// After:  .in("status", ["queued", "verify_failed"])
```

**Step 3: Commit**

```bash
git commit -m "feat: add feature verification lifecycle to orchestrator"
```

---

## Task 7: Test Environment Deployment + Queue

When feature verification passes, deploy to the single test env per project. Manage the queue so only one feature at a time is on test.

**Files:**
- Create: `packages/local-agent/src/deployer.ts` — deploys a branch to a test environment
- Create: `packages/local-agent/src/deployer.test.ts`
- Modify: `supabase/functions/orchestrator/index.ts` — test env queue logic

**Step 1: Write failing tests**

```typescript
// packages/local-agent/src/deployer.test.ts
import { describe, it, expect } from "vitest";
import { TestEnvDeployer } from "./deployer.js";

describe("TestEnvDeployer", () => {
  it("deploys a branch to the test environment", async () => {
    // Test deployment to a configurable test env
  });

  it("reports deployment success/failure", async () => {
    // Test status reporting
  });
});
```

**Step 2: Implement deployer.ts**

The deployer is project-specific — different projects deploy differently (Netlify, Supabase, etc.). The module provides a generic interface with project-specific adapters.

```typescript
// packages/local-agent/src/deployer.ts
export interface DeployResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface DeployAdapter {
  deploy(branch: string, projectId: string): Promise<DeployResult>;
}

export class NetlifyAdapter implements DeployAdapter {
  async deploy(branch: string, projectId: string): Promise<DeployResult> {
    // netlify deploy --branch={branch} --site={siteId}
    // Returns the deploy URL
  }
}

export class SupabaseAdapter implements DeployAdapter {
  async deploy(branch: string, projectId: string): Promise<DeployResult> {
    // supabase functions deploy from the branch
    // Returns the project URL
  }
}

export class TestEnvDeployer {
  constructor(private adapters: Map<string, DeployAdapter>) {}

  async deploy(branch: string, projectId: string, projectType: string): Promise<DeployResult> {
    const adapter = this.adapters.get(projectType);
    if (!adapter) return { success: false, error: `No deploy adapter for ${projectType}` };
    return adapter.deploy(branch, projectId);
  }
}
```

**Step 3: Add test env queue to orchestrator**

```typescript
// In orchestrator/index.ts

async function promoteToTesting(supabase: SupabaseClient, featureId: string): Promise<void> {
  const { data: feature } = await supabase.from("features")
    .select("project_id, company_id, feature_branch, human_checklist")
    .eq("id", featureId).single();
  if (!feature) return;

  // Check if another feature is already in testing for this project
  const { data: testing } = await supabase.from("features")
    .select("id")
    .eq("project_id", feature.project_id)
    .eq("status", "testing")
    .limit(1);

  if (testing && testing.length > 0) {
    // Queue — feature stays in "verifying" until the test env is free
    // The orchestrator checks for queued features each cycle
    return;
  }

  // Deploy to test env
  await supabase.from("features").update({ status: "testing" }).eq("id", featureId);

  // Broadcast deploy command to a machine
  // (Machine deploys and spawns fix agent — see Task 8)
}
```

**Step 4: Commit**

```bash
git commit -m "feat: add test environment deployer and queue management"
```

---

## Task 8: Slack Notifications from Orchestrator

Direct Slack notifications when features hit key states — no CPO relay.

**Files:**
- Create: `packages/shared/src/slack.ts` — Slack notification client
- Create: `packages/shared/src/slack.test.ts`

**Step 1: Write failing tests**

```typescript
// packages/shared/src/slack.test.ts
import { describe, it, expect, vi } from "vitest";
import { SlackNotifier, formatTestingMessage } from "./slack.js";

describe("formatTestingMessage", () => {
  it("formats a testing notification with checklist", () => {
    const msg = formatTestingMessage({
      featureTitle: "Real-time job status",
      testUrl: "https://test.example.com",
      humanChecklist: "- [ ] Dashboard shows status\n- [ ] Notifications work"
    });
    expect(msg).toContain("Real-time job status");
    expect(msg).toContain("test.example.com");
    expect(msg).toContain("Dashboard shows status");
  });
});
```

**Step 2: Implement slack.ts**

```typescript
// packages/shared/src/slack.ts
export interface SlackConfig {
  botToken: string;
  defaultChannel: string;
}

export function formatTestingMessage(params: {
  featureTitle: string;
  testUrl: string;
  humanChecklist: string;
}): string {
  return [
    `*Feature ready for testing: "${params.featureTitle}"*`,
    `Deployed to: ${params.testUrl}`,
    "",
    "*Checklist:*",
    params.humanChecklist,
    "",
    'Reply "ship it" to approve or describe any issues.'
  ].join("\n");
}

export class SlackNotifier {
  constructor(private config: SlackConfig) {}

  async notify(channel: string, text: string, threadTs?: string): Promise<string> {
    const resp = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        channel,
        text,
        ...(threadTs ? { thread_ts: threadTs } : {})
      })
    });
    const data = await resp.json();
    return data.ts; // message timestamp (for threading)
  }
}
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat: add Slack notification module for pipeline events"
```

---

## Task 9: Fix Agent Spawning

When a feature enters `testing`, the orchestrator spawns a fix agent connected to the Slack thread. The fix agent is an ephemeral Claude Code session working on the feature branch.

**Files:**
- Create: `packages/local-agent/src/fix-agent.ts`
- Create: `packages/local-agent/src/fix-agent.test.ts`
- Modify: `packages/local-agent/src/executor.ts` — add fix agent handling

**Step 1: Write failing tests**

```typescript
// packages/local-agent/src/fix-agent.test.ts
import { describe, it, expect, vi } from "vitest";
import { FixAgentManager } from "./fix-agent.js";

describe("FixAgentManager", () => {
  it("spawns a fix agent on a feature branch", async () => {
    // Verify tmux session created with correct branch
  });

  it("cleans up fix agent when feature leaves testing", async () => {
    // Verify tmux session killed
  });

  it("only allows one fix agent per feature", async () => {
    // Verify idempotency
  });
});
```

**Step 2: Implement fix-agent.ts**

```typescript
// packages/local-agent/src/fix-agent.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWorktree, removeWorktree } from "./branches.js";

const execFileAsync = promisify(execFile);

interface ActiveFixAgent {
  featureId: string;
  sessionName: string;
  worktreePath: string;
  slackThreadTs: string;
}

export class FixAgentManager {
  private activeAgents = new Map<string, ActiveFixAgent>();

  constructor(private repoDir: string) {}

  async spawn(params: {
    featureId: string;
    featureBranch: string;
    slackThreadTs: string;
    slackChannel: string;
  }): Promise<void> {
    if (this.activeAgents.has(params.featureId)) return; // idempotent

    const sessionName = `fix-${params.featureId.slice(0, 8)}`;

    // Create worktree on feature branch
    const worktreePath = await createWorktree(this.repoDir, params.featureBranch);

    // Spawn Claude Code session with Slack context
    const prompt = [
      "You are a fix agent. A human is testing this feature on the test server.",
      "They will describe issues in this Slack thread. Fix them on the current branch.",
      "After each fix, commit and push so the test server auto-redeploys.",
      "Keep changes minimal. Only fix what the human reports."
    ].join(" ");

    await execFileAsync("tmux", [
      "new-session", "-d", "-s", sessionName,
      "-c", worktreePath,
      `claude --model claude-sonnet-4-6 "${prompt}"`
    ]);

    this.activeAgents.set(params.featureId, {
      featureId: params.featureId,
      sessionName,
      worktreePath,
      slackThreadTs: params.slackThreadTs
    });
  }

  async cleanup(featureId: string): Promise<void> {
    const agent = this.activeAgents.get(featureId);
    if (!agent) return;

    // Kill tmux session
    await execFileAsync("tmux", ["kill-session", "-t", agent.sessionName]).catch(() => {});

    // Remove worktree
    await removeWorktree(this.repoDir, agent.worktreePath);

    this.activeAgents.delete(featureId);
  }

  isActive(featureId: string): boolean {
    return this.activeAgents.has(featureId);
  }
}
```

**Step 3: Run tests, commit**

```bash
git commit -m "feat: add fix agent spawning for testing phase"
```

---

## Task 10: Approval + Ship (Merge to Main)

When the human approves a feature, the orchestrator merges the feature branch to main, deploys to production, and cleans up everything.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` — `handleFeatureApproved`, `handleFeatureRejected`
- Modify: `packages/local-agent/src/executor.ts` — handle cleanup commands

**Step 1: Add orchestrator handlers**

```typescript
async function handleFeatureApproved(supabase: SupabaseClient, featureId: string): Promise<void> {
  const { data: feature } = await supabase.from("features")
    .select("feature_branch, project_id, company_id")
    .eq("id", featureId).single();
  if (!feature) return;

  // 1. Update feature status
  await supabase.from("features").update({ status: "done" }).eq("id", featureId);

  // 2. Mark all jobs as done
  await supabase.from("jobs").update({ status: "done" })
    .eq("feature_id", featureId);

  // 3. Broadcast cleanup command to machine
  //    Machine will: merge feature branch to main, cleanup branches/worktrees, kill fix agent

  // 4. Check test env queue — promote next feature if waiting
  const { data: nextFeature } = await supabase.from("features")
    .select("id")
    .eq("project_id", feature.project_id)
    .eq("status", "verifying")
    .order("updated_at", { ascending: true })
    .limit(1);

  if (nextFeature && nextFeature.length > 0) {
    await promoteToTesting(supabase, nextFeature[0].id);
  }
}

async function handleFeatureRejected(
  supabase: SupabaseClient,
  featureId: string,
  feedback: string,
  severity: "small" | "big"
): Promise<void> {
  if (severity === "small") {
    // Small fix — fix agent handles it in-thread
    // No state change needed, fix agent is already running
    // Just log the feedback
    await supabase.from("events").insert({
      company_id: (await getFeatureCompany(supabase, featureId)),
      event_type: "feature_feedback",
      detail: { featureId, feedback, severity }
    });
    return;
  }

  // Big rejection — feature goes back to building
  await supabase.from("features").update({
    status: "building"
  }).eq("id", featureId);

  // Create a fix job with the feedback
  const { data: feature } = await supabase.from("features")
    .select("company_id, project_id, feature_branch, spec")
    .eq("id", featureId).single();
  if (!feature) return;

  await supabase.from("jobs").insert({
    company_id: feature.company_id,
    project_id: feature.project_id,
    feature_id: featureId,
    role: "engineer",
    job_type: "bug",
    complexity: "medium",
    slot_type: "claude_code",
    status: "queued",
    context: `Fix rejected feature.\n\nOriginal spec:\n${feature.spec}\n\nFeedback:\n${feedback}`,
    branch: feature.feature_branch,
    rejection_feedback: feedback
  });

  // Cleanup fix agent — will be respawned when feature returns to testing
  // Broadcast cleanup to machine
}
```

**Step 2: Commit**

```bash
git commit -m "feat: add feature approval and rejection handling"
```

---

## Task Dependency Summary

```
Task 1: Test framework          (no deps)
Task 2: Schema migration        (no deps)
Task 3: Protocol types          (depends on Task 1)
Task 4: Branch management       (depends on Task 1)
Task 5: Job verification        (depends on Tasks 3, 4)
Task 6: Feature verification    (depends on Task 5)
Task 7: Test env deployment     (depends on Task 6)
Task 8: Slack notifications     (depends on Task 1)
Task 9: Fix agent spawning      (depends on Tasks 4, 8)
Task 10: Approval + ship        (depends on Tasks 7, 9)
```

**Parallel lanes:**
- Lane A: Tasks 1 → 3 → 5 → 6 → 7 → 10
- Lane B: Task 2 (can run in parallel with lane A)
- Lane C: Tasks 1 → 4 (merges into lane A at Task 5)
- Lane D: Tasks 1 → 8 → 9 (merges into lane A at Task 10)
