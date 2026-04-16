import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { MasterCiMonitor, buildCiFailureSignature } from "./master-ci-monitor.js";

describe("MasterCiMonitor — Gate 1 signature dedup", () => {
  const runId = 4242;
  const headSha = "6ef2d94abc";
  const stepName = "npm run test";

  let mockExecFileAsync: Mock;
  let mockCreateFeature: Mock;
  let mockQueryActiveFixFeatures: Mock;
  let mockQueryCompletedFixFeatures: Mock;
  let mockQueryFeatureBySignature: Mock;

  const createExecMock = (failedStepName = stepName) =>
    vi.fn(async (_command: string, args: string[]) => {
      const joined = args.join(" ");

      if (joined.includes("actions/workflows/deploy-edge-functions.yml/runs?branch=master")) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{ id: runId, conclusion: "failure", head_sha: headSha }],
          }),
          stderr: "",
        };
      }

      if (joined.includes(`actions/runs/${runId}/jobs`)) {
        return {
          stdout: JSON.stringify({
            jobs: [{
              id: 1,
              name: "test",
              steps: [{ name: failedStepName, conclusion: "failure" }],
            }],
          }),
          stderr: "",
        };
      }

      if (args[0] === "run" && args[1] === "view") {
        return { stdout: "FAIL test output", stderr: "" };
      }

      return { stdout: "{}", stderr: "" };
    });

  const buildMonitor = () =>
    new MasterCiMonitor({
      owner: "zazig-team",
      repo: "zazigv2",
      execFileAsync: mockExecFileAsync,
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: mockQueryActiveFixFeatures,
      queryCompletedFixFeatures: mockQueryCompletedFixFeatures,
      queryFeatureBySignature: mockQueryFeatureBySignature,
    });

  beforeEach(() => {
    mockExecFileAsync = createExecMock();
    mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: "fix-1" } });
    mockQueryActiveFixFeatures = vi.fn().mockResolvedValue({ data: [] });
    mockQueryCompletedFixFeatures = vi.fn().mockResolvedValue({ data: [] });
    mockQueryFeatureBySignature = vi.fn().mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not create a feature when queryFeatureBySignature finds an active duplicate", async () => {
    mockQueryFeatureBySignature.mockResolvedValueOnce({ data: [{ id: "existing-fix" }] });
    const monitor = buildMonitor();

    await monitor.poll();

    expect(mockCreateFeature).not.toHaveBeenCalled();
    expect(mockQueryFeatureBySignature).toHaveBeenCalledWith({
      signature: "6ef2d94:npm-run-test",
      statuses: ["breaking_down", "building", "combining_and_pr", "ci_checking", "merging"],
    });
  });

  it("creates a feature with ci_failure_signature when queryFeatureBySignature returns empty", async () => {
    const monitor = buildMonitor();

    await monitor.poll();

    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
    expect(mockCreateFeature).toHaveBeenCalledWith(expect.objectContaining({
      ci_failure_signature: "6ef2d94:npm-run-test",
      tags: expect.arrayContaining(["master-ci-fix", "fix-generation:1"]),
    }));
  });
});

describe("MasterCiMonitor — Gate 2 (newer green commit skips feature creation)", () => {
  const runId = 9000;
  const headSha = "aabbccddee";
  const stepName = "npm run test";

  const createExecMock = () =>
    vi.fn(async (_command: string, args: string[]) => {
      const joined = args.join(" ");

      if (joined.includes("actions/workflows/deploy-edge-functions.yml/runs?branch=master")) {
        return {
          stdout: JSON.stringify({
            workflow_runs: [{ id: runId, conclusion: "failure", head_sha: headSha }],
          }),
          stderr: "",
        };
      }

      if (joined.includes(`actions/runs/${runId}/jobs`)) {
        return {
          stdout: JSON.stringify({
            jobs: [{ id: 1, name: "test", steps: [{ name: stepName, conclusion: "failure" }] }],
          }),
          stderr: "",
        };
      }

      if (args[0] === "run" && args[1] === "view") {
        return { stdout: "FAIL test output", stderr: "" };
      }

      return { stdout: "{}", stderr: "" };
    });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does NOT call createFeature when queryLatestCiRunForStep returns success for a different commit", async () => {
    const mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: "fix-1" } });
    const mockQueryLatestCiRunForStep = vi.fn().mockResolvedValue({ conclusion: "success", headSha: "abc1234" });

    const monitor = new MasterCiMonitor({
      owner: "zazig-team",
      repo: "zazigv2",
      execFileAsync: createExecMock(),
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryFeatureBySignature: vi.fn().mockResolvedValue({ data: [] }),
      queryLatestCiRunForStep: mockQueryLatestCiRunForStep,
    });

    await monitor.poll();

    expect(mockCreateFeature).not.toHaveBeenCalled();
    expect(mockQueryLatestCiRunForStep).toHaveBeenCalledWith({
      stepName,
      currentRunId: runId,
      ownerRepo: "zazig-team/zazigv2",
    });
  });

  it("continues to Gate 1 when queryLatestCiRunForStep returns failure for a different commit", async () => {
    const mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: "fix-1" } });
    const mockQueryLatestCiRunForStep = vi.fn().mockResolvedValue({ conclusion: "failure", headSha: "abc1234" });

    const monitor = new MasterCiMonitor({
      owner: "zazig-team",
      repo: "zazigv2",
      execFileAsync: createExecMock(),
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryFeatureBySignature: vi.fn().mockResolvedValue({ data: [] }),
      queryLatestCiRunForStep: mockQueryLatestCiRunForStep,
    });

    await monitor.poll();

    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
  });

  it("continues to Gate 1 when queryLatestCiRunForStep returns success for the SAME commit (same-commit contradiction)", async () => {
    const mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: "fix-1" } });
    const mockQueryLatestCiRunForStep = vi.fn().mockResolvedValue({ conclusion: "success", headSha: headSha });

    const monitor = new MasterCiMonitor({
      owner: "zazig-team",
      repo: "zazigv2",
      execFileAsync: createExecMock(),
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryFeatureBySignature: vi.fn().mockResolvedValue({ data: [] }),
      queryLatestCiRunForStep: mockQueryLatestCiRunForStep,
    });

    await monitor.poll();

    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
  });

  it("continues to Gate 1 when queryLatestCiRunForStep returns null conclusion", async () => {
    const mockCreateFeature = vi.fn().mockResolvedValue({ data: { id: "fix-1" } });
    const mockQueryLatestCiRunForStep = vi.fn().mockResolvedValue({ conclusion: null, headSha: null });

    const monitor = new MasterCiMonitor({
      owner: "zazig-team",
      repo: "zazigv2",
      execFileAsync: createExecMock(),
      createFeature: mockCreateFeature,
      queryActiveFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryCompletedFixFeatures: vi.fn().mockResolvedValue({ data: [] }),
      queryFeatureBySignature: vi.fn().mockResolvedValue({ data: [] }),
      queryLatestCiRunForStep: mockQueryLatestCiRunForStep,
    });

    await monitor.poll();

    expect(mockCreateFeature).toHaveBeenCalledTimes(1);
  });
});

describe("buildCiFailureSignature", () => {
  it("slugifies step names and uses the first 7 chars of the sha", () => {
    const cases = [
      { headSha: "6ef2d94abc", stepName: "npm run test", expected: "6ef2d94:npm-run-test" },
      {
        headSha: "6ef2d94abc",
        stepName: "Deploy all edge functions",
        expected: "6ef2d94:deploy-all-edge-functions",
      },
      { headSha: "6ef2d94abc", stepName: " Build & Deploy ", expected: "6ef2d94:build-deploy" },
      { headSha: "6ef2d94abc", stepName: "Run   tests!!!", expected: "6ef2d94:run-tests" },
    ];

    for (const testCase of cases) {
      expect(buildCiFailureSignature(testCase.headSha, testCase.stepName)).toBe(testCase.expected);
    }
  });
});
