import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VerifyJob } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";

// Mock branches module
vi.mock("./branches.js", () => ({
  rebaseOnBranch: vi.fn(),
  mergeJobIntoFeature: vi.fn(),
  WORKTREE_BASE: "/tmp/worktrees",
}));

// Mock fs functions used in verify()
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  };
});

import { existsSync } from "node:fs";
import { rebaseOnBranch, mergeJobIntoFeature } from "./branches.js";
import { JobVerifier, type ExecFn, parseVerifyReport } from "./verifier.js";
import type { SendFn } from "./executor.js";

const mockedRebase = vi.mocked(rebaseOnBranch);
const mockedMerge = vi.mocked(mergeJobIntoFeature);
const mockedExistsSync = vi.mocked(existsSync);

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

/**
 * The verify flow now runs these exec calls before reaching the fallback
 * verification logic (rebase/test/lint/typecheck/merge):
 *   1. git worktree prune (best-effort, may fail)
 *   2. git fetch origin <jobBranch>
 *   3. git worktree remove --force (stale cleanup, may fail)
 *   4. git worktree add
 * After verification (in finally):
 *   5. git worktree remove --force (cleanup)
 *
 * Tests that care about fallback exec calls (npm test/lint/typecheck) need
 * to account for these 4 setup calls + 1 cleanup call.
 */
const SETUP_EXEC_CALLS = 4; // prune, fetch, stale-remove, add

describe("JobVerifier", () => {
  let send: ReturnType<typeof vi.fn>;
  let exec: ReturnType<typeof vi.fn>;
  let verifier: JobVerifier;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedExistsSync.mockReturnValue(true);
    send = vi.fn().mockResolvedValue(undefined);
    exec = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    verifier = new JobVerifier("machine-1", send as unknown as SendFn, undefined, exec as unknown as ExecFn);
  });

  it("sends passing VerifyResult when all steps succeed", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob());

    expect(mockedRebase).toHaveBeenCalledWith(
      expect.stringContaining("verify-job-123"),
      "job/api-endpoint",
      "feature/auth",
    );
    // Setup calls + test + lint + typecheck + cleanup
    expect(exec).toHaveBeenCalledTimes(SETUP_EXEC_CALLS + 3 + 1);
    expect(mockedMerge).toHaveBeenCalledWith(
      expect.stringContaining("verify-job-123"),
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
    // Only setup + cleanup exec calls, no npm calls
    expect(exec).toHaveBeenCalledTimes(SETUP_EXEC_CALLS + 1);
    expect(mockedMerge).not.toHaveBeenCalled();
  });

  it("sends failing VerifyResult when tests fail", async () => {
    mockedRebase.mockResolvedValue({ success: true });

    // Setup calls succeed, then npm test fails
    for (let i = 0; i < SETUP_EXEC_CALLS; i++) {
      exec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    }
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

    // Setup calls succeed, then npm test succeeds, then lint fails
    for (let i = 0; i < SETUP_EXEC_CALLS; i++) {
      exec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    }
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

    // Setup calls succeed, test succeeds, lint succeeds, typecheck fails
    for (let i = 0; i < SETUP_EXEC_CALLS; i++) {
      exec.mockResolvedValueOnce({ stdout: "", stderr: "" });
    }
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
      expect.stringContaining("verify-job-123"),
      "job/api-endpoint",
      "feature/auth",
    );
    // Verify the fetch used /custom/repo
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["-C", "/custom/repo", "fetch", "origin", "job/api-endpoint"],
      expect.objectContaining({ cwd: "/custom/repo", timeout: 60_000 }),
    );
  });

  it("runs npm test, lint, and typecheck with correct arguments and timeouts", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob());

    const worktreePath = expect.stringContaining("verify-job-123");

    // After SETUP_EXEC_CALLS, the fallback runs npm test, lint, typecheck
    expect(exec).toHaveBeenNthCalledWith(
      SETUP_EXEC_CALLS + 1,
      "npm",
      ["test"],
      expect.objectContaining({ cwd: worktreePath, timeout: 300_000 }),
    );
    expect(exec).toHaveBeenNthCalledWith(
      SETUP_EXEC_CALLS + 2,
      "npm",
      ["run", "lint"],
      expect.objectContaining({ cwd: worktreePath, timeout: 60_000 }),
    );
    expect(exec).toHaveBeenNthCalledWith(
      SETUP_EXEC_CALLS + 3,
      "npm",
      ["run", "typecheck"],
      expect.objectContaining({ cwd: worktreePath, timeout: 60_000 }),
    );
  });

  it("defaults repoDir to process.cwd() when repoPath is not provided", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob({ repoPath: undefined }));

    // The fetch should use process.cwd() as repoDir
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["-C", process.cwd(), "fetch", "origin", "job/api-endpoint"],
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  it("skips duplicate verify for the same jobId", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    // Start two verifications concurrently for the same job
    const p1 = verifier.verify(makeVerifyJob());
    const p2 = verifier.verify(makeVerifyJob());
    await Promise.all([p1, p2]);

    // send should only be called once — the second was deduped
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("returns early when repo directory does not exist", async () => {
    mockedExistsSync.mockReturnValue(false);

    await verifier.verify(makeVerifyJob());

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: false,
        testOutput: expect.stringContaining("Repo directory not found"),
      }),
    );
    expect(exec).not.toHaveBeenCalled();
  });

  it("fetches only the needed branch, not all refs", async () => {
    mockedRebase.mockResolvedValue({ success: true });
    mockedMerge.mockResolvedValue({ success: true });

    await verifier.verify(makeVerifyJob({ jobBranch: "job/specific-branch" }));

    // The fetch call should include the specific branch
    expect(exec).toHaveBeenCalledWith(
      "git",
      ["-C", "/tmp/test-repo", "fetch", "origin", "job/specific-branch"],
      expect.objectContaining({ timeout: 60_000 }),
    );
  });
});

describe("parseVerifyReport", () => {
  it("returns null for empty content", () => {
    expect(parseVerifyReport("")).toBeNull();
  });

  it("returns null when no status line", () => {
    expect(parseVerifyReport("some random text\nno status here")).toBeNull();
  });

  it("parses pass status", () => {
    const content = "# Verify Report\nstatus: pass\nchecks:\n  tests: pass";
    expect(parseVerifyReport(content)).toEqual({ status: "pass", failureReason: undefined });
  });

  it("parses fail status with failure_reason", () => {
    const content = "status: fail\nfailure_reason: Tests failed — 3 assertions";
    expect(parseVerifyReport(content)).toEqual({
      status: "fail",
      failureReason: "Tests failed — 3 assertions",
    });
  });

  it("parses fail status without failure_reason", () => {
    const content = "status: fail\nchecks:\n  tests: fail";
    expect(parseVerifyReport(content)).toEqual({ status: "fail", failureReason: undefined });
  });

  it("ignores extra whitespace around status value", () => {
    const content = "status: pass  \n";
    expect(parseVerifyReport(content)).toEqual({ status: "pass", failureReason: undefined });
  });
});
