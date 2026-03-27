import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifyJob } from "@zazigv2/shared";
import { JobVerifier, type BranchOps, type JobVerifierOptions, type RunCommand } from "./verifier.js";

const baseVerifyJob: VerifyJob = {
  type: "verify_job",
  protocolVersion: 1,
  jobId: "job-123",
  featureBranch: "feature/auth",
  jobBranch: "job/auth-endpoint",
  acceptanceTests: "Auth endpoint returns 200",
};

function makeVerifier(overrides?: {
  branchOps?: Partial<BranchOps>;
  runCommand?: RunCommand;
  send?: JobVerifierOptions["send"];
}) {
  const branchOps: BranchOps = {
    rebaseOnBranch: vi.fn().mockResolvedValue({ success: true }),
    mergeJobIntoFeature: vi.fn().mockResolvedValue({ success: true }),
    ...overrides?.branchOps,
  } as BranchOps;

  const runCommand: RunCommand = overrides?.runCommand ?? vi.fn()
    .mockResolvedValueOnce({ stdout: "tests ok", stderr: "" })
    .mockResolvedValueOnce({ stdout: "lint ok", stderr: "" })
    .mockResolvedValueOnce({ stdout: "typecheck ok", stderr: "" });

  const send: JobVerifierOptions["send"] = overrides?.send ?? vi.fn(async () => undefined);

  const verifier = new JobVerifier({
    repoDir: "/tmp/repo",
    machineId: "machine-1",
    send,
    branchOps,
    runCommand,
  });

  return { verifier, branchOps, runCommand, send };
}

describe("JobVerifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rebases, runs checks, merges, and reports success", async () => {
    const { verifier, branchOps, runCommand, send } = makeVerifier();

    await verifier.verify(baseVerifyJob);

    expect(branchOps.rebaseOnBranch).toHaveBeenCalledWith(
      "/tmp/repo",
      "job/auth-endpoint",
      "feature/auth",
    );
    expect(runCommand).toHaveBeenNthCalledWith(1, "npm", ["test"], expect.any(Object));
    expect(runCommand).toHaveBeenNthCalledWith(2, "npm", ["run", "lint"], expect.any(Object));
    expect(runCommand).toHaveBeenNthCalledWith(3, "npm", ["run", "typecheck"], expect.any(Object));
    expect(branchOps.mergeJobIntoFeature).toHaveBeenCalledWith(
      "/tmp/repo",
      "job/auth-endpoint",
      "feature/auth",
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "verify_result",
        jobId: "job-123",
        machineId: "machine-1",
        passed: true,
      }),
    );
  });

  it("reports failure when rebase fails", async () => {
    const { verifier, branchOps, runCommand, send } = makeVerifier({
      branchOps: {
        rebaseOnBranch: vi.fn().mockResolvedValue({ success: false, error: "conflict" }),
      },
    });

    await verifier.verify(baseVerifyJob);

    expect(branchOps.rebaseOnBranch).toHaveBeenCalledOnce();
    expect(runCommand).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Rebase failed"),
      }),
    );
  });

  it("reports failure when tests fail and skips merge", async () => {
    const runCommand = vi.fn<RunCommand>()
      .mockRejectedValueOnce({ message: "test failed", stdout: "stdout", stderr: "stderr" });
    const { verifier, branchOps, send } = makeVerifier({ runCommand });

    await verifier.verify(baseVerifyJob);

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(branchOps.mergeJobIntoFeature).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Tests failed"),
      }),
    );
  });

  it("reports failure when lint fails and skips merge", async () => {
    const runCommand = vi.fn<RunCommand>()
      .mockResolvedValueOnce({ stdout: "tests ok", stderr: "" })
      .mockRejectedValueOnce({ message: "lint failed", stderr: "lint output" });
    const { verifier, branchOps, send } = makeVerifier({ runCommand });

    await verifier.verify(baseVerifyJob);

    expect(runCommand).toHaveBeenCalledTimes(2);
    expect(branchOps.mergeJobIntoFeature).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Lint failed"),
      }),
    );
  });
});
