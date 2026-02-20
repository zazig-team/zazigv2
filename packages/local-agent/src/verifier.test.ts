import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifyJob } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";

// Mock branches module
vi.mock("./branches.js", () => ({
  rebaseOnBranch: vi.fn(),
  mergeJobIntoFeature: vi.fn(),
}));

import { rebaseOnBranch, mergeJobIntoFeature } from "./branches.js";
import { JobVerifier, type ExecFn } from "./verifier.js";
import type { SendFn } from "./executor.js";

const mockedRebase = vi.mocked(rebaseOnBranch);
const mockedMerge = vi.mocked(mergeJobIntoFeature);

function makeVerifyJob(overrides?: Partial<VerifyJob>): VerifyJob {
  return {
    type: "verify_job",
    protocolVersion: PROTOCOL_VERSION,
    jobId: "job-123",
    featureBranch: "feature/auth",
    jobBranch: "job/api-endpoint",
    acceptanceTests: "npm test",
    repoPath: "/tmp/test-repo",
    ...overrides,
  };
}

describe("JobVerifier", () => {
  let send: ReturnType<typeof vi.fn>;
  let exec: ReturnType<typeof vi.fn>;
  let verifier: JobVerifier;

  beforeEach(() => {
    vi.clearAllMocks();
    send = vi.fn().mockResolvedValue(undefined);
    exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    verifier = new JobVerifier("machine-1", send as unknown as SendFn, exec as unknown as ExecFn);
  });

  it("sends passing VerifyResult when all steps succeed", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob());

    expect(mockedRebase).toHaveBeenCalledWith(
      "/tmp/test-repo",
      "job/api-endpoint",
      "feature/auth",
    );
    expect(exec).toHaveBeenCalledTimes(3); // test, lint, typecheck
    expect(mockedMerge).toHaveBeenCalledWith(
      "/tmp/test-repo",
      "job/api-endpoint",
      "feature/auth",
    );

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "verify_result",
        protocolVersion: PROTOCOL_VERSION,
        jobId: "job-123",
        machineId: "machine-1",
        passed: true,
      }),
    );
  });

  it("sends failing VerifyResult when rebase fails", async () => {
    mockedRebase.mockResolvedValue({ success: false, error: "Merge conflict" });

    await verifier.verify(makeVerifyJob());

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "verify_result",
        jobId: "job-123",
        passed: false,
        testOutput: expect.stringContaining("Rebase failed"),
      }),
    );
    expect(exec).not.toHaveBeenCalled();
    expect(mockedMerge).not.toHaveBeenCalled();
  });

  it("sends failing VerifyResult when tests fail", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    exec.mockRejectedValueOnce({
      stdout: "FAIL test.ts",
      stderr: "Error: assertion",
    });

    await verifier.verify(makeVerifyJob());

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Tests failed"),
      }),
    );
    expect(mockedMerge).not.toHaveBeenCalled();
  });

  it("sends failing VerifyResult when lint fails", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    exec
      .mockResolvedValueOnce({ stdout: "all tests pass", stderr: "" })
      .mockRejectedValueOnce({ stdout: "lint error", stderr: "" });

    await verifier.verify(makeVerifyJob());

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Lint failed"),
      }),
    );
    expect(mockedMerge).not.toHaveBeenCalled();
  });

  it("sends failing VerifyResult when typecheck fails", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    exec
      .mockResolvedValueOnce({ stdout: "all tests pass", stderr: "" })
      .mockResolvedValueOnce({ stdout: "lint ok", stderr: "" })
      .mockRejectedValueOnce({ stdout: "TS2345: type error", stderr: "" });

    await verifier.verify(makeVerifyJob());

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Typecheck failed"),
      }),
    );
    expect(mockedMerge).not.toHaveBeenCalled();
  });

  it("sends failing VerifyResult when merge fails after checks pass", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({
      success: false,
      error: "Merge conflict in feature",
    });

    await verifier.verify(makeVerifyJob());

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Merge failed"),
      }),
    );
  });

  it("uses repoPath from VerifyJob when provided", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob({ repoPath: "/custom/repo" }));

    expect(mockedRebase).toHaveBeenCalledWith(
      "/custom/repo",
      "job/api-endpoint",
      "feature/auth",
    );
    expect(exec).toHaveBeenCalledWith(
      "npm",
      ["test"],
      expect.objectContaining({ cwd: "/custom/repo" }),
    );
  });

  it("runs npm test, lint, and typecheck with correct arguments and timeouts", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob());

    expect(exec).toHaveBeenNthCalledWith(
      1,
      "npm",
      ["test"],
      expect.objectContaining({ cwd: "/tmp/test-repo", timeout: 300_000 }),
    );
    expect(exec).toHaveBeenNthCalledWith(
      2,
      "npm",
      ["run", "lint"],
      expect.objectContaining({ cwd: "/tmp/test-repo", timeout: 60_000 }),
    );
    expect(exec).toHaveBeenNthCalledWith(
      3,
      "npm",
      ["run", "typecheck"],
      expect.objectContaining({ cwd: "/tmp/test-repo", timeout: 60_000 }),
    );
  });

  it("defaults repoDir to process.cwd() when repoPath is not provided", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob({ repoPath: undefined }));

    expect(mockedRebase).toHaveBeenCalledWith(
      process.cwd(),
      "job/api-endpoint",
      "feature/auth",
    );
  });
});
