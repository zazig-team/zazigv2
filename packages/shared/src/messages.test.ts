import { describe, it, expect } from 'vitest';
import { FEATURE_STATUSES, JOB_STATUSES } from "./messages.js";
import {
  isVerifyJob,
  isDeployToTest,
  isFeatureApproved,
  isFeatureRejected,
  isVerifyResult,
  isOrchestratorMessage,
  isAgentMessage,
} from "./validators.js";

describe("Pipeline statuses", () => {
  it("FEATURE_STATUSES contains all expected values", () => {
    expect(FEATURE_STATUSES).toEqual(["design", "building", "verifying", "testing", "done", "cancelled"]);
  });

  it("JOB_STATUSES contains key pipeline states", () => {
    expect(JOB_STATUSES).toContain("verifying");
    expect(JOB_STATUSES).toContain("verify_failed");
    expect(JOB_STATUSES).toContain("testing");
    expect(JOB_STATUSES).toContain("approved");
    expect(JOB_STATUSES).toContain("rejected");
  });
});

describe("isVerifyJob", () => {
  const validVerifyJob = {
    type: "verify_job",
    protocolVersion: 1,
    jobId: "job-123",
    featureBranch: "feature/my-branch",
    jobBranch: "job/my-branch",
    acceptanceTests: "npm test",
  };

  it("returns true for a valid message", () => {
    expect(isVerifyJob(validVerifyJob)).toBe(true);
  });

  it("rejects missing featureBranch", () => {
    const { featureBranch: _featureBranch, ...invalid } = validVerifyJob;
    expect(isVerifyJob(invalid)).toBe(false);
  });

  it("rejects wrong protocolVersion", () => {
    expect(isVerifyJob({ ...validVerifyJob, protocolVersion: 999 })).toBe(false);
  });
});

describe("isDeployToTest", () => {
  const validDeployToTest = {
    type: "deploy_to_test",
    protocolVersion: 1,
    featureId: "feature-1",
    featureBranch: "feature/test-branch",
    projectId: "project-1",
  };

  it("returns true for a valid message", () => {
    expect(isDeployToTest(validDeployToTest)).toBe(true);
  });

  it("rejects missing featureId", () => {
    const { featureId: _featureId, ...invalid } = validDeployToTest;
    expect(isDeployToTest(invalid)).toBe(false);
  });
});

describe("isFeatureApproved", () => {
  const validFeatureApproved = {
    type: "feature_approved",
    protocolVersion: 1,
    featureId: "feature-1",
  };

  it("returns true for a valid message", () => {
    expect(isFeatureApproved(validFeatureApproved)).toBe(true);
  });

  it("rejects missing featureId", () => {
    const { featureId: _featureId, ...invalid } = validFeatureApproved;
    expect(isFeatureApproved(invalid)).toBe(false);
  });
});

describe("isFeatureRejected", () => {
  const validFeatureRejected = {
    type: "feature_rejected",
    protocolVersion: 1,
    featureId: "feature-1",
    feedback: "Needs better naming",
    severity: "small",
  };

  it("returns true for a valid message", () => {
    expect(isFeatureRejected(validFeatureRejected)).toBe(true);
  });

  it("rejects invalid severity", () => {
    expect(isFeatureRejected({ ...validFeatureRejected, severity: "medium" })).toBe(false);
  });
});

describe("isVerifyResult", () => {
  const validPassingVerifyResult = {
    type: "verify_result",
    protocolVersion: 1,
    jobId: "job-123",
    passed: true,
    testOutput: "All tests passed",
  };

  const validFailingVerifyResult = {
    type: "verify_result",
    protocolVersion: 1,
    jobId: "job-124",
    passed: false,
    testOutput: "1 test failed",
    reviewSummary: "Fix flaky integration test",
  };

  it("returns true for a valid passing message", () => {
    expect(isVerifyResult(validPassingVerifyResult)).toBe(true);
  });

  it("returns true for a valid failing message", () => {
    expect(isVerifyResult(validFailingVerifyResult)).toBe(true);
  });

  it("rejects missing testOutput", () => {
    const { testOutput: _testOutput, ...invalid } = validPassingVerifyResult;
    expect(isVerifyResult(invalid)).toBe(false);
  });
});

describe("union validators", () => {
  it("isOrchestratorMessage accepts verify_job", () => {
    expect(
      isOrchestratorMessage({
        type: "verify_job",
        protocolVersion: 1,
        jobId: "job-123",
        featureBranch: "feature/my-branch",
        jobBranch: "job/my-branch",
        acceptanceTests: "npm test",
      }),
    ).toBe(true);
  });

  it("isOrchestratorMessage accepts deploy_to_test", () => {
    expect(
      isOrchestratorMessage({
        type: "deploy_to_test",
        protocolVersion: 1,
        featureId: "feature-1",
        featureBranch: "feature/my-branch",
        projectId: "project-1",
      }),
    ).toBe(true);
  });

  it("isAgentMessage accepts feature_approved", () => {
    expect(
      isAgentMessage({
        type: "feature_approved",
        protocolVersion: 1,
        featureId: "feature-1",
      }),
    ).toBe(true);
  });

  it("isAgentMessage accepts feature_rejected", () => {
    expect(
      isAgentMessage({
        type: "feature_rejected",
        protocolVersion: 1,
        featureId: "feature-1",
        feedback: "Needs stronger error handling",
        severity: "big",
      }),
    ).toBe(true);
  });

  it("isAgentMessage accepts verify_result", () => {
    expect(
      isAgentMessage({
        type: "verify_result",
        protocolVersion: 1,
        jobId: "job-123",
        passed: true,
        testOutput: "ok",
      }),
    ).toBe(true);
  });
});
