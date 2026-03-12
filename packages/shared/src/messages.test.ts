import { describe, it, expect } from 'vitest';
import { FEATURE_STATUSES, JOB_STATUSES } from "./messages.js";
import type { StartExpertMessage } from "./messages.js";
import {
  isVerifyJob,
  isDeployToTest,
  isFeatureApproved,
  isFeatureRejected,
  isVerifyResult,
  isStartExpert,
  isMessageInbound,
  isMessageOutbound,
  isOrchestratorMessage,
  isAgentMessage,
} from "./validators.js";

describe("Pipeline statuses", () => {
  it("FEATURE_STATUSES contains all expected values", () => {
    expect(FEATURE_STATUSES).toEqual(["created", "breaking_down", "building", "combining_and_pr", "verifying", "merging", "complete", "cancelled", "failed"]);
  });

  it("JOB_STATUSES contains key pipeline states", () => {
    expect(JOB_STATUSES).toContain("queued");
    expect(JOB_STATUSES).toContain("executing");
    expect(JOB_STATUSES).toContain("complete");
    expect(JOB_STATUSES).toContain("failed");
    expect(JOB_STATUSES).toContain("cancelled");
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
    jobType: "feature",
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
    machineId: "machine-1",
  };

  it("returns true for a valid message", () => {
    expect(isFeatureApproved(validFeatureApproved)).toBe(true);
  });

  it("rejects missing featureId", () => {
    const { featureId: _featureId, ...invalid } = validFeatureApproved;
    expect(isFeatureApproved(invalid)).toBe(false);
  });

  it("rejects missing machineId", () => {
    const { machineId: _machineId, ...invalid } = validFeatureApproved;
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
    machineId: "machine-1",
  };

  it("returns true for a valid message", () => {
    expect(isFeatureRejected(validFeatureRejected)).toBe(true);
  });

  it("rejects invalid severity", () => {
    expect(isFeatureRejected({ ...validFeatureRejected, severity: "medium" })).toBe(false);
  });

  it("rejects missing machineId", () => {
    const { machineId: _machineId, ...invalid } = validFeatureRejected;
    expect(isFeatureRejected(invalid)).toBe(false);
  });
});

describe("isVerifyResult", () => {
  const validPassingVerifyResult = {
    type: "verify_result",
    protocolVersion: 1,
    jobId: "job-123",
    machineId: "machine-1",
    passed: true,
    testOutput: "All tests passed",
  };

  const validFailingVerifyResult = {
    type: "verify_result",
    protocolVersion: 1,
    jobId: "job-124",
    machineId: "machine-1",
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

  it("rejects missing machineId", () => {
    const { machineId: _machineId, ...invalid } = validPassingVerifyResult;
    expect(isVerifyResult(invalid)).toBe(false);
  });
});

describe("isMessageInbound", () => {
  const validMessageInbound = {
    type: "message_inbound",
    protocolVersion: 1,
    conversationId: "slack:T123:C456:1234.5678",
    from: "@tom",
    text: "Hey, can you check the build?",
  };

  it("returns true for a valid message", () => {
    expect(isMessageInbound(validMessageInbound)).toBe(true);
  });

  it("accepts empty text", () => {
    expect(isMessageInbound({ ...validMessageInbound, text: "" })).toBe(true);
  });

  it("rejects missing conversationId", () => {
    const { conversationId: _conversationId, ...invalid } = validMessageInbound;
    expect(isMessageInbound(invalid)).toBe(false);
  });

  it("rejects empty conversationId", () => {
    expect(isMessageInbound({ ...validMessageInbound, conversationId: "" })).toBe(false);
  });

  it("rejects missing from", () => {
    const { from: _from, ...invalid } = validMessageInbound;
    expect(isMessageInbound(invalid)).toBe(false);
  });

  it("rejects wrong protocolVersion", () => {
    expect(isMessageInbound({ ...validMessageInbound, protocolVersion: 999 })).toBe(false);
  });
});

describe("isStartExpert", () => {
  const validStartExpert: StartExpertMessage = {
    type: "start_expert",
    protocolVersion: 1,
    session_id: "session-123",
    project_id: "project-123",
    repo_url: "https://github.com/acme/project.git",
    branch: "master",
    model: "claude-opus-4-1",
    brief: "Investigate production issue",
    role: { prompt: "You are an expert engineer." },
  };

  it("returns true for a valid message with repo and branch", () => {
    expect(isStartExpert(validStartExpert)).toBe(true);
  });

  it("rejects non-string branch when provided", () => {
    expect(isStartExpert({ ...validStartExpert, branch: 123 })).toBe(false);
  });
});

describe("isMessageOutbound", () => {
  const validMessageOutbound = {
    type: "message_outbound",
    protocolVersion: 1,
    jobId: "job-123",
    machineId: "machine-1",
    conversationId: "slack:T123:C456:1234.5678",
    text: "Build looks good!",
  };

  it("returns true for a valid message", () => {
    expect(isMessageOutbound(validMessageOutbound)).toBe(true);
  });

  it("accepts empty text", () => {
    expect(isMessageOutbound({ ...validMessageOutbound, text: "" })).toBe(true);
  });

  it("rejects missing jobId", () => {
    const { jobId: _jobId, ...invalid } = validMessageOutbound;
    expect(isMessageOutbound(invalid)).toBe(false);
  });

  it("rejects missing machineId", () => {
    const { machineId: _machineId, ...invalid } = validMessageOutbound;
    expect(isMessageOutbound(invalid)).toBe(false);
  });

  it("rejects missing conversationId", () => {
    const { conversationId: _conversationId, ...invalid } = validMessageOutbound;
    expect(isMessageOutbound(invalid)).toBe(false);
  });

  it("rejects wrong protocolVersion", () => {
    expect(isMessageOutbound({ ...validMessageOutbound, protocolVersion: 999 })).toBe(false);
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
        jobType: "feature",
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
        machineId: "machine-1",
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
        machineId: "machine-1",
      }),
    ).toBe(true);
  });

  it("isOrchestratorMessage accepts message_inbound", () => {
    expect(
      isOrchestratorMessage({
        type: "message_inbound",
        protocolVersion: 1,
        conversationId: "slack:T123:C456:1234.5678",
        from: "@tom",
        text: "Hello",
      }),
    ).toBe(true);
  });

  it("isAgentMessage accepts message_outbound", () => {
    expect(
      isAgentMessage({
        type: "message_outbound",
        protocolVersion: 1,
        jobId: "job-123",
        machineId: "machine-1",
        conversationId: "slack:T123:C456:1234.5678",
        text: "Reply",
      }),
    ).toBe(true);
  });

  it("isAgentMessage accepts verify_result", () => {
    expect(
      isAgentMessage({
        type: "verify_result",
        protocolVersion: 1,
        jobId: "job-123",
        machineId: "machine-1",
        passed: true,
        testOutput: "ok",
      }),
    ).toBe(true);
  });
});
