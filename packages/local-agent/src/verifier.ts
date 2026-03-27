import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { promisify } from "node:util";
import type { VerifyJob, VerifyResult } from "@zazigv2/shared";
import { mergeJobIntoFeature, rebaseOnBranch } from "./branches.js";

const execFileAsync = promisify(execFile);

export type SendVerifyResultFn = (msg: VerifyResult) => Promise<void>;

export interface BranchOps {
  rebaseOnBranch: typeof rebaseOnBranch;
  mergeJobIntoFeature: typeof mergeJobIntoFeature;
}

export type RunCommand = (
  file: string,
  args: string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<{ stdout: string; stderr: string }>;

export interface JobVerifierOptions {
  repoDir: string;
  machineId: string;
  send: SendVerifyResultFn;
  branchOps?: BranchOps;
  runCommand?: RunCommand;
}

function getErrorOutput(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return String(error);
  }

  const stdout = "stdout" in error && typeof error.stdout === "string" ? error.stdout : "";
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : "";
  const message = "message" in error && typeof error.message === "string" ? error.message : String(error);

  return [message, stdout, stderr].filter((part) => part.trim().length > 0).join("\n");
}

const defaultRunCommand: RunCommand = async (file, args, options) => {
  const { stdout, stderr } = await execFileAsync(file, args, options);
  return {
    stdout: typeof stdout === "string" ? stdout : String(stdout ?? ""),
    stderr: typeof stderr === "string" ? stderr : String(stderr ?? ""),
  };
};

export class JobVerifier {
  private readonly repoDir: string;
  private readonly machineId: string;
  private readonly send: SendVerifyResultFn;
  private readonly branchOps: BranchOps;
  private readonly runCommand: RunCommand;

  constructor(options: JobVerifierOptions) {
    this.repoDir = options.repoDir;
    this.machineId = options.machineId;
    this.send = options.send;
    this.branchOps = options.branchOps ?? { rebaseOnBranch, mergeJobIntoFeature };
    this.runCommand = options.runCommand ?? defaultRunCommand;
  }

  async verify(msg: VerifyJob): Promise<void> {
    const { jobId, featureBranch, jobBranch, acceptanceTests } = msg;
    const workDir = msg.repoPath ?? this.repoDir;

    const rebaseResult = await this.branchOps.rebaseOnBranch(workDir, jobBranch, featureBranch);
    if (!rebaseResult.success) {
      await this.sendResult(jobId, false, `Rebase failed:\n${rebaseResult.error ?? "unknown rebase error"}`);
      return;
    }

    const testStep = await this.runStep(workDir, "npm", ["test"], "tests");
    if (!testStep.success) {
      await this.sendResult(jobId, false, `Tests failed:\n${testStep.output}`);
      return;
    }

    const lintStep = await this.runStep(workDir, "npm", ["run", "lint"], "lint");
    if (!lintStep.success) {
      await this.sendResult(jobId, false, `Lint failed:\n${lintStep.output}`);
      return;
    }

    const typecheckStep = await this.runStep(workDir, "npm", ["run", "typecheck"], "typecheck");
    if (!typecheckStep.success) {
      await this.sendResult(jobId, false, `Typecheck failed:\n${typecheckStep.output}`);
      return;
    }

    const mergeResult = await this.branchOps.mergeJobIntoFeature(workDir, jobBranch, featureBranch);
    if (!mergeResult.success) {
      await this.sendResult(jobId, false, `Merge failed:\n${mergeResult.error ?? "unknown merge error"}`);
      return;
    }

    const verificationOutput = [
      `Acceptance tests:\n${acceptanceTests}`,
      `Tests:\n${testStep.output}`,
      `Lint:\n${lintStep.output}`,
      `Typecheck:\n${typecheckStep.output}`,
      "Merge: success",
    ].join("\n\n");

    await this.sendResult(jobId, true, verificationOutput, "Verification checks passed and merged");
  }

  private async runStep(
    cwd: string,
    file: string,
    args: string[],
    label: string,
  ): Promise<{ success: boolean; output: string }> {
    try {
      const { stdout, stderr } = await this.runCommand(file, args, {
        cwd,
        encoding: "utf8",
        timeout: 300_000,
      });

      const output = [stdout, stderr].filter((part) => part.trim().length > 0).join("\n");
      return { success: true, output: output || `${label} completed` };
    } catch (error) {
      return {
        success: false,
        output: getErrorOutput(error),
      };
    }
  }

  private async sendResult(
    jobId: string,
    passed: boolean,
    testOutput: string,
    reviewSummary?: string,
  ): Promise<void> {
    await this.send({
      type: "verify_result",
      protocolVersion: 1,
      jobId,
      machineId: this.machineId,
      passed,
      testOutput,
      ...(reviewSummary ? { reviewSummary } : {}),
    });
  }
}
