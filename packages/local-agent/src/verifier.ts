/**
 * verifier.ts — Job Verification Pipeline
 *
 * After an agent completes a job, the orchestrator dispatches a VerifyJob message.
 * The JobVerifier runs verification inline (not in a separate tmux session):
 *   1. Rebase the job branch on the feature branch
 *   2. Run `npm test` (5 min timeout)
 *   3. Run `npm run lint` (1 min timeout)
 *   4. Run `npm run typecheck` (1 min timeout)
 *   5. If all pass → merge job branch into feature branch
 *   6. Send VerifyResult back to orchestrator
 *   7. On failure at any step → send VerifyResult { passed: false }
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rebaseOnBranch, mergeJobIntoFeature } from "./branches.js";
import type { VerifyJob } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { SendFn } from "./executor.js";

const defaultExec = promisify(execFile);

/** Timeout for running acceptance tests. */
const TEST_TIMEOUT_MS = 5 * 60_000;

/** Timeout for lint and typecheck steps. */
const LINT_TIMEOUT_MS = 60_000;

export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

export class JobVerifier {
  private readonly exec: ExecFn;

  constructor(
    private readonly machineId: string,
    private readonly send: SendFn,
    exec?: ExecFn,
  ) {
    this.exec = exec ?? (defaultExec as unknown as ExecFn);
  }

  async verify(msg: VerifyJob): Promise<void> {
    const { jobId, featureBranch, jobBranch } = msg;
    const repoDir = msg.repoPath ?? process.cwd();

    console.log(
      `[verifier] Starting verification — jobId=${jobId}, ` +
        `jobBranch=${jobBranch}, featureBranch=${featureBranch}, repoDir=${repoDir}`,
    );

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
    console.log(`[verifier] Verification passed — jobId=${jobId}`);
    await this.sendResult(jobId, true, "All checks passed");
  }

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

function getExecOutput(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const stdout = "stdout" in err ? String(err.stdout ?? "") : "";
    const stderr = "stderr" in err ? String(err.stderr ?? "") : "";
    return `${stdout}\n${stderr}`.trim();
  }
  return String(err);
}
