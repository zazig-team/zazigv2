/**
 * verifier.ts — Job Verification Pipeline
 *
 * After an agent completes a job, the orchestrator dispatches a VerifyJob message.
 * The JobVerifier loads the reviewer role prompt from Supabase and starts a Claude
 * Code session to run verification. If the role prompt is unavailable, falls back
 * to hardcoded inline verification steps (rebase, test, lint, typecheck, merge).
 *
 * Role-driven flow:
 *   1. Load reviewer prompt from DB (roles table)
 *   2. Spawn a Claude Code session (claude -p) with the prompt + verify context
 *   3. Read .claude/verify-report.md written by the reviewer
 *   4. Parse pass/fail and send VerifyResult to orchestrator
 *
 * Fallback flow (no DB / no role row):
 *   1. Rebase the job branch on the feature branch
 *   2. Run `npm test` (5 min timeout)
 *   3. Run `npm run lint` (1 min timeout)
 *   4. Run `npm run typecheck` (1 min timeout)
 *   5. If all pass → merge job branch into feature branch
 *   6. Send VerifyResult back to orchestrator
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SupabaseClient } from "@supabase/supabase-js";
import { rebaseOnBranch, mergeJobIntoFeature, WORKTREE_BASE } from "./branches.js";
import type { VerifyJob } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { SendFn } from "./executor.js";

const defaultExec = promisify(execFile);

/** Timeout for running acceptance tests. */
const TEST_TIMEOUT_MS = 5 * 60_000;

/** Timeout for lint and typecheck steps. */
const LINT_TIMEOUT_MS = 60_000;

/** Timeout for the Claude reviewer session (10 min). */
const REVIEWER_SESSION_TIMEOUT_MS = 10 * 60_000;

/** Path to the verify report relative to repo root. */
const VERIFY_REPORT_PATH = ".claude/verify-report.md";

/**
 * Resolves a repo path for verification. If the path is a URL,
 * derives the local bare clone directory from ~/.zazigv2/repos/.
 * If it's already a local path, returns it as-is.
 */
function resolveRepoPath(repoPathOrUrl: string): string {
  if (repoPathOrUrl.startsWith("/")) return repoPathOrUrl;
  const repoName = repoPathOrUrl
    .replace(/\.git$/, "")
    .split("/")
    .pop() ?? "unknown";
  return join(homedir(), ".zazigv2", "repos", repoName);
}

export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

export class JobVerifier {
  private readonly exec: ExecFn;
  private readonly inFlightVerifies = new Set<string>();

  constructor(
    private readonly machineId: string,
    private readonly send: SendFn,
    private readonly supabase?: SupabaseClient,
    exec?: ExecFn,
  ) {
    this.exec = exec ?? (defaultExec as unknown as ExecFn);
  }

  async verify(msg: VerifyJob): Promise<void> {
    const { jobId, featureBranch, jobBranch } = msg;

    // Dedup: skip if this job is already being verified
    if (this.inFlightVerifies.has(jobId)) {
      console.log(`[verifier] Skipping duplicate verify for jobId=${jobId}`);
      return;
    }
    this.inFlightVerifies.add(jobId);

    try {
      await this.verifyInner(msg);
    } finally {
      this.inFlightVerifies.delete(jobId);
    }
  }

  private async verifyInner(msg: VerifyJob): Promise<void> {
    const { jobId, featureBranch, jobBranch } = msg;
    const repoDir = msg.repoPath ? resolveRepoPath(msg.repoPath) : process.cwd();

    console.log(
      `[verifier] Starting verification — jobId=${jobId}, ` +
        `jobBranch=${jobBranch}, featureBranch=${featureBranch}, repoDir=${repoDir}`,
    );

    if (!existsSync(repoDir)) {
      console.error(`[verifier] Repo directory not found: ${repoDir} — cannot verify jobId=${jobId}`);
      await this.sendResult(jobId, false, `Repo directory not found: ${repoDir}`);
      return;
    }

    // Fetch latest refs and create a worktree for verification.
    // The repo at repoDir is a bare clone — we need a worktree for a working tree.
    const verifyWorktreePath = join(WORKTREE_BASE, `verify-${jobId}`);
    try {
      // Prune stale worktree bookkeeping before creating a new one
      try {
        await this.exec("git", ["-C", repoDir, "worktree", "prune"], { cwd: repoDir, timeout: 10_000 });
      } catch { /* best effort */ }
      // Clean up stale worktree from a previous failed run BEFORE fetching —
      // if the stale worktree has this branch checked out, fetch will fail.
      try {
        await this.exec("git", ["-C", repoDir, "worktree", "remove", "--force", verifyWorktreePath], { cwd: repoDir, timeout: 10_000 });
      } catch { /* doesn't exist — fine */ }
      // Fetch only the needed branch — fetching all refs breaks concurrent
      // verify jobs because git refuses to update a checked-out branch's ref.
      await this.exec("git", ["-C", repoDir, "fetch", "origin", jobBranch], { cwd: repoDir, timeout: 60_000 });
      mkdirSync(WORKTREE_BASE, { recursive: true });
      await this.exec("git", ["-C", repoDir, "worktree", "add", verifyWorktreePath, jobBranch], { cwd: repoDir, timeout: 30_000 });
    } catch (err) {
      console.warn(`[verifier] Failed to create verify worktree for ${jobBranch} in ${repoDir}: ${getExecOutput(err)}`);
      await this.sendResult(jobId, false, `Failed to checkout branch ${jobBranch}`);
      return;
    }

    console.log(`[verifier] Created verify worktree at ${verifyWorktreePath} (branch: ${jobBranch})`);

    try {
      // 1. Try to load reviewer role prompt from DB
      const reviewerPrompt = await this.loadReviewerPrompt();

      if (reviewerPrompt) {
        // Role-driven verification: spawn a Claude session with the prompt
        await this.runRoleDrivenVerification(reviewerPrompt, msg, verifyWorktreePath);
      } else {
        // Fallback: hardcoded inline verification steps
        console.log(`[verifier] Using fallback inline verification for jobId=${jobId}`);
        await this.runFallbackVerification(msg, verifyWorktreePath);
      }
    } finally {
      // Clean up the verify worktree
      try {
        await this.exec("git", ["-C", repoDir, "worktree", "remove", "--force", verifyWorktreePath], { cwd: repoDir, timeout: 10_000 });
        console.log(`[verifier] Cleaned up verify worktree for jobId=${jobId}`);
      } catch {
        console.warn(`[verifier] Failed to clean up verify worktree at ${verifyWorktreePath}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Role-driven verification (Claude session)
  // ---------------------------------------------------------------------------

  /**
   * Loads the reviewer role prompt from the roles table.
   * Returns null if the DB is unavailable or the row doesn't exist.
   */
  private async loadReviewerPrompt(): Promise<string | null> {
    if (!this.supabase) {
      console.warn("[verifier] No Supabase client — cannot load reviewer prompt");
      return null;
    }

    try {
      const { data: role, error } = await this.supabase
        .from("roles")
        .select("prompt")
        .eq("name", "reviewer")
        .single();

      if (error || !role?.prompt) {
        console.warn(`[verifier] Could not load reviewer role: ${error?.message ?? "no row found"}`);
        return null;
      }

      console.log("[verifier] Loaded reviewer role prompt from DB");
      return role.prompt;
    } catch (err) {
      console.warn(`[verifier] Failed to load reviewer role: ${String(err)}`);
      return null;
    }
  }

  /**
   * Runs verification by spawning a Claude Code session with the reviewer prompt.
   * The session receives the role prompt as system context and the verify job
   * details as the task. The reviewer writes .claude/verify-report.md.
   */
  private async runRoleDrivenVerification(
    reviewerPrompt: string,
    msg: VerifyJob,
    repoDir: string,
  ): Promise<void> {
    const { jobId } = msg;

    // Build context for the reviewer: role prompt + verify job details
    const verifyContext = JSON.stringify({
      type: msg.acceptanceTests ? "feature_verification" : "standalone_verification",
      featureBranch: msg.featureBranch,
      jobBranch: msg.jobBranch,
      acceptanceTests: msg.acceptanceTests || undefined,
    });

    const sessionPrompt = `${reviewerPrompt}\n\n---\n\n## Verification Task\n\n${verifyContext}`;

    console.log(`[verifier] Spawning reviewer session — jobId=${jobId}, repoDir=${repoDir}`);

    try {
      // Run claude -p with the assembled prompt, in the repo directory.
      // Unset CLAUDECODE so nested sessions aren't blocked by the
      // "cannot launch inside another Claude Code session" detection.
      // Use sh -c with positional arg ($1) to safely pass the prompt
      // without shell injection risk.
      await this.exec(
        "sh",
        ["-c", 'unset CLAUDECODE; exec claude -p "$1" --model claude-sonnet-4-6', "--", sessionPrompt],
        { cwd: repoDir, timeout: REVIEWER_SESSION_TIMEOUT_MS },
      );
    } catch (err) {
      console.warn(`[verifier] Reviewer session exited with error for jobId=${jobId}: ${getExecOutput(err)}`);
      // Don't return — the reviewer may have written a report before erroring
    }

    // Read .claude/verify-report.md
    const report = this.readVerifyReport(repoDir);

    if (report) {
      const passed = report.status === "pass";
      console.log(`[verifier] Report parsed — jobId=${jobId}, status=${report.status}`);
      await this.sendResult(
        jobId,
        passed,
        report.failureReason ?? (passed ? "All checks passed" : "Verification failed — see report"),
      );
    } else {
      // No report found — treat as failure
      console.warn(`[verifier] No verify report found for jobId=${jobId}`);
      await this.sendResult(jobId, false, "Reviewer did not produce a verify report");
    }
  }

  /**
   * Reads and parses .claude/verify-report.md from the repo directory.
   * Returns null if the file doesn't exist or can't be parsed.
   */
  private readVerifyReport(repoDir: string): VerifyReport | null {
    const reportPath = join(repoDir, VERIFY_REPORT_PATH);
    try {
      const content = readFileSync(reportPath, "utf-8");
      return parseVerifyReport(content);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Fallback: inline hardcoded verification
  // ---------------------------------------------------------------------------

  private async runFallbackVerification(msg: VerifyJob, repoDir: string): Promise<void> {
    const { jobId, featureBranch, jobBranch } = msg;

    // 1. Rebase job branch on feature branch
    const rebaseResult = await rebaseOnBranch(repoDir, jobBranch, featureBranch);
    if (!rebaseResult.success) {
      await this.sendResult(jobId, false, `Rebase failed: ${rebaseResult.error}`);
      return;
    }

    // 2. Run npm test
    try {
      await this.exec("npm", ["test"], { cwd: repoDir, timeout: TEST_TIMEOUT_MS });
    } catch (err: unknown) {
      const output = getExecOutput(err);
      await this.sendResult(jobId, false, `Tests failed:\n${output}`);
      return;
    }

    // 3. Run lint
    try {
      await this.exec("npm", ["run", "lint"], { cwd: repoDir, timeout: LINT_TIMEOUT_MS });
    } catch (err: unknown) {
      const output = getExecOutput(err);
      await this.sendResult(jobId, false, `Lint failed:\n${output}`);
      return;
    }

    // 4. Run typecheck
    try {
      await this.exec("npm", ["run", "typecheck"], { cwd: repoDir, timeout: LINT_TIMEOUT_MS });
    } catch (err: unknown) {
      const output = getExecOutput(err);
      await this.sendResult(jobId, false, `Typecheck failed:\n${output}`);
      return;
    }

    // 5. Merge job branch into feature branch
    const mergeResult = await mergeJobIntoFeature(repoDir, jobBranch, featureBranch);
    if (!mergeResult.success) {
      await this.sendResult(jobId, false, `Merge failed: ${mergeResult.error}`);
      return;
    }

    // 6. All checks passed
    console.log(`[verifier] Fallback verification passed — jobId=${jobId}`);
    await this.sendResult(jobId, true, "All checks passed");
  }

  // ---------------------------------------------------------------------------
  // Send result
  // ---------------------------------------------------------------------------

  private async sendResult(
    jobId: string,
    passed: boolean,
    testOutput: string,
  ): Promise<void> {
    console.log(
      `[verifier] Sending result — jobId=${jobId}, passed=${passed}`,
    );
    await this.send({
      type: "verify_result",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
      passed,
      testOutput,
    });
  }
}

// ---------------------------------------------------------------------------
// Verify report parsing
// ---------------------------------------------------------------------------

interface VerifyReport {
  status: "pass" | "fail";
  failureReason?: string;
}

/**
 * Parses a verify-report.md file content into structured data.
 * Looks for `status: pass` or `status: fail` line.
 * Looks for `failure_reason: ...` line.
 */
export function parseVerifyReport(content: string): VerifyReport | null {
  const statusMatch = content.match(/^status:\s*(pass|fail)\s*$/m);
  if (!statusMatch) return null;

  const status = statusMatch[1] as "pass" | "fail";
  const failureMatch = content.match(/^failure_reason:\s*(.+)$/m);
  const failureReason = failureMatch?.[1]?.trim() || undefined;

  return { status, failureReason };
}

function getExecOutput(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const stdout = "stdout" in err ? String(err.stdout ?? "") : "";
    const stderr = "stderr" in err ? String(err.stderr ?? "") : "";
    return `${stdout}\n${stderr}`.trim();
  }
  return String(err);
}
