/**
 * zazigv2 — Runtime Message Validators
 *
 * These type guards validate that incoming Supabase Realtime payloads are
 * structurally valid messages before the orchestrator or local-agent acts on
 * them. All JSON arriving over the wire is untrusted — validate before use.
 *
 * Usage in local-agent:
 *   const msg = JSON.parse(raw);
 *   if (!isOrchestratorMessage(msg)) {
 *     logger.warn("Rejected invalid message", { raw });
 *     return;
 *   }
 *   // msg is now typed as OrchestratorMessage
 */

import type {
  OrchestratorMessage,
  AgentMessage,
  StartJob,
  StopJob,
  HealthCheck,
  VerifyJob,
  DeployToTest,
  TeardownTest,
  MessageInbound,
  JobUnblocked,
  StartExpertMessage,
  Heartbeat,
  JobStatusMessage,
  JobComplete,
  JobFailed,
  JobAck,
  StopAck,
  FeatureApproved,
  FeatureRejected,
  VerifyResult,
  MessageOutbound,
  DeployComplete,
  DeployFailed,
  DeployNeedsConfig,
  JobBlocked,
  DaemonShutdownNotification,
} from "./messages.js";

import { MAX_CONTEXT_BYTES, MAX_PERSONALITY_PROMPT_BYTES, PROTOCOL_VERSION } from "./index.js";

// ---------------------------------------------------------------------------
// Allowed model identifiers
// ---------------------------------------------------------------------------

const ALLOWED_MODELS = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "codex",
  "gpt-5.3-codex",
  "gpt-5.3-codex xhigh",
  "gpt-5.3-codex-spark",
]);

// ---------------------------------------------------------------------------
// Primitive helpers
// ---------------------------------------------------------------------------

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Returns true if the object's protocolVersion field matches the current
 * PROTOCOL_VERSION constant. Callers pass a pre-validated Record so we
 * can safely index into it.
 */
function hasValidProtocolVersion(v: Record<string, unknown>): boolean {
  return v.protocolVersion === PROTOCOL_VERSION;
}

// ---------------------------------------------------------------------------
// Orchestrator → Agent validators
// ---------------------------------------------------------------------------

export function isStartJob(v: unknown): v is StartJob {
  if (!isObject(v) || v.type !== "start_job") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || !/^[a-zA-Z0-9_-]{1,128}$/.test(v.jobId)) return false;
  if (!isString(v.cardId) || v.cardId.length === 0) return false;
  if (!["code", "infra", "design", "research", "docs", "persistent_agent", "verify", "breakdown", "combine", "merge", "deploy_to_test", "deploy_to_prod", "review", "bug", "feature_test"].includes(v.cardType as string)) return false;
  if (!["simple", "medium", "complex"].includes(v.complexity as string)) return false;
  if (!["claude_code", "codex"].includes(v.slotType as string)) return false;
  if (!isString(v.model) || !ALLOWED_MODELS.has(v.model)) return false;
  if (!isString(v.projectId) || v.projectId.length === 0) return false;
  if (v.repoUrl !== undefined && v.repoUrl !== null && (!isString(v.repoUrl) || v.repoUrl.length === 0)) return false;
  if (v.featureBranch !== undefined && v.featureBranch !== null && (!isString(v.featureBranch) || v.featureBranch.length === 0)) return false;
  // Either promptStackMinusSkills (new path) or context/contextRef (legacy) must be present.
  const hasPromptStack = isString(v.promptStackMinusSkills) && (v.promptStackMinusSkills as string).length > 0;
  const hasContext = isString(v.context);
  const hasContextRef = isString(v.contextRef) && v.contextRef.length > 0;
  if (!hasPromptStack && !hasContext && !hasContextRef) return false;
  // Guard against oversized inline context payloads (Supabase Realtime limit).
  // Using character count as a conservative proxy: worst-case UTF-16 encoding
  // means 1 char ≤ 4 bytes, so length > MAX_CONTEXT_BYTES already exceeds the limit.
  if (hasContext && (v.context as string).length > MAX_CONTEXT_BYTES) return false;
  // role is optional; if present it must be a non-empty string
  if (v.role !== undefined && (!isString(v.role) || v.role.length === 0)) return false;
  // personalityPrompt is optional; if present: non-empty, within size budget
  if (v.personalityPrompt !== undefined && (!isString(v.personalityPrompt) || v.personalityPrompt.length === 0 || v.personalityPrompt.length > MAX_PERSONALITY_PROMPT_BYTES)) return false;
  // subAgentPrompt is optional; if present: non-empty, within size budget
  if (v.subAgentPrompt !== undefined && (!isString(v.subAgentPrompt) || v.subAgentPrompt.length === 0 || v.subAgentPrompt.length > MAX_PERSONALITY_PROMPT_BYTES)) return false;
  // dependencyBranches is optional; if present must be a non-empty array of non-empty strings
  if (v.dependencyBranches !== undefined) {
    if (!Array.isArray(v.dependencyBranches) || v.dependencyBranches.length === 0) return false;
    if (!v.dependencyBranches.every((b: unknown) => isString(b) && (b as string).length > 0)) return false;
  }
  // roleMcpTools is optional; if present must be an array of non-empty strings (empty array is valid)
  if (v.roleMcpTools !== undefined) {
    if (!Array.isArray(v.roleMcpTools)) return false;
    if (!v.roleMcpTools.every((t: unknown) => isString(t) && (t as string).length > 0)) return false;
  }
  // companyProjects is optional; if present it must be an array of { name, repo_url } objects
  if (v.companyProjects !== undefined) {
    if (!Array.isArray(v.companyProjects)) return false;
    if (!v.companyProjects.every((p: unknown) =>
      isObject(p)
      && isString(p.name) && p.name.length > 0
      && (p.repo_url === null || (isString(p.repo_url) && p.repo_url.length > 0))
    )) {
      return false;
    }
  }
  return true;
}

export function isStopJob(v: unknown): v is StopJob {
  if (!isObject(v) || v.type !== "stop_job") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.reason)) return false;
  return true;
}

export function isHealthCheck(v: unknown): v is HealthCheck {
  if (!isObject(v) || v.type !== "health_check") return false;
  if (!hasValidProtocolVersion(v)) return false;
  // correlationId is optional; if present it must be a string
  if (v.correlationId !== undefined && !isString(v.correlationId)) return false;
  return true;
}

export function isVerifyJob(v: unknown): v is VerifyJob {
  if (!isObject(v) || v.type !== "verify_job") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.featureBranch) || v.featureBranch.length === 0) return false;
  if (!isString(v.jobBranch) || v.jobBranch.length === 0) return false;
  if (!isString(v.acceptanceTests)) return false;
  if (v.repoPath !== undefined && (!isString(v.repoPath) || v.repoPath.length === 0)) return false;
  return true;
}

export function isDeployToTest(v: unknown): v is DeployToTest {
  if (!isObject(v) || v.type !== "deploy_to_test") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobType) || !["feature", "standalone"].includes(v.jobType)) return false;
  // featureId required for feature deploys, standaloneJobId required for standalone deploys
  if (v.jobType === "feature" && (!isString(v.featureId) || v.featureId.length === 0)) return false;
  if (v.jobType === "standalone" && (!isString(v.standaloneJobId) || v.standaloneJobId.length === 0)) return false;
  if (!isString(v.featureBranch) || v.featureBranch.length === 0) return false;
  if (!isString(v.projectId) || v.projectId.length === 0) return false;
  if (v.changeSummary !== undefined && !isString(v.changeSummary)) return false;
  if (v.repoPath !== undefined && !isString(v.repoPath)) return false;
  return true;
}

export function isTeardownTest(v: unknown): v is TeardownTest {
  if (!isObject(v) || v.type !== "teardown_test") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.repoPath) || v.repoPath.length === 0) return false;
  return true;
}

export function isMessageInbound(v: unknown): v is MessageInbound {
  if (!isObject(v) || v.type !== "message_inbound") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.conversationId) || v.conversationId.length === 0) return false;
  if (!isString(v.from) || v.from.length === 0) return false;
  if (!isString(v.text)) return false;
  return true;
}

export function isJobUnblocked(v: unknown): v is JobUnblocked {
  if (!isObject(v) || v.type !== "job_unblocked") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.answer)) return false;
  return true;
}

export function isStartExpert(v: unknown): v is StartExpertMessage {
  if (!isObject(v) || v.type !== "start_expert") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.session_id) || v.session_id.length === 0) return false;
  if (!isString(v.model) || v.model.length === 0) return false;
  if (!isString(v.brief)) return false;
  if (!isObject(v.role)) return false;
  if (!isString(v.role.prompt)) return false;
  // Optional fields
  if (v.project_id !== undefined && (!isString(v.project_id) || v.project_id.length === 0)) return false;
  if (v.repo_url !== undefined && (!isString(v.repo_url) || v.repo_url.length === 0)) return false;
  if (v.branch !== undefined && (!isString(v.branch) || v.branch.length === 0)) return false;
  if (v.display_name !== undefined && !isString(v.display_name)) return false;
  if (v.company_name !== undefined && !isString(v.company_name)) return false;
  return true;
}

export function isOrchestratorMessage(v: unknown): v is OrchestratorMessage {
  if (!isObject(v) || !isString(v.type)) return false;
  switch (v.type) {
    case "start_job":       return isStartJob(v);
    case "stop_job":        return isStopJob(v);
    case "health_check":    return isHealthCheck(v);
    case "verify_job":      return isVerifyJob(v);
    case "deploy_to_test":    return isDeployToTest(v);
    case "teardown_test":     return isTeardownTest(v);
    case "message_inbound":   return isMessageInbound(v);
    case "job_unblocked":     return isJobUnblocked(v);
    case "start_expert":      return isStartExpert(v);
    default:                  return false;
  }
}

// ---------------------------------------------------------------------------
// Agent → Orchestrator validators
// ---------------------------------------------------------------------------

export function isHeartbeat(v: unknown): v is Heartbeat {
  if (!isObject(v) || v.type !== "heartbeat") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!isObject(v.slotsAvailable)) return false;
  if (!isNumber(v.slotsAvailable.claude_code) || v.slotsAvailable.claude_code < 0) return false;
  if (!isNumber(v.slotsAvailable.codex) || v.slotsAvailable.codex < 0) return false;
  // correlationId is optional; if present it must be a string
  if (v.correlationId !== undefined && !isString(v.correlationId)) return false;
  return true;
}

/**
 * Validates a JobStatusMessage from the local agent.
 * Only agent-reportable statuses are accepted (AgentJobStatus).
 * The DB-only states `queued` and `dispatched` are intentionally excluded.
 */
export function isJobStatusMessage(v: unknown): v is JobStatusMessage {
  if (!isObject(v) || v.type !== "job_status") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  // Only AgentJobStatus values — agents must never send `queued` or `dispatched`.
  const agentStatuses = ["executing", "reviewing", "blocked", "complete", "failed"];
  if (!isString(v.status) || !agentStatuses.includes(v.status)) return false;
  if (v.output !== undefined && !isString(v.output)) return false;
  return true;
}

export function isJobComplete(v: unknown): v is JobComplete {
  if (!isObject(v) || v.type !== "job_complete") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!isString(v.result)) return false;
  if (v.pr !== undefined && !isString(v.pr)) return false;
  if (v.report !== undefined && !isString(v.report)) return false;
  return true;
}

const VALID_FAILURE_REASONS = new Set([
  "agent_crash",
  "ci_failure",
  "timeout",
  "unknown",
  "daemon_heartbeat_gap",
  "stuck_no_output",
]);

export function isJobFailed(v: unknown): v is JobFailed {
  if (!isObject(v) || v.type !== "job_failed") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!isString(v.error)) return false;
  if (!isString(v.failureReason) || !VALID_FAILURE_REASONS.has(v.failureReason)) return false;
  return true;
}

export function isJobAck(v: unknown): v is JobAck {
  if (!isObject(v) || v.type !== "job_ack") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isStopAck(v: unknown): v is StopAck {
  if (!isObject(v) || v.type !== "stop_ack") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isFeatureApproved(v: unknown): v is FeatureApproved {
  if (!isObject(v) || v.type !== "feature_approved") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isFeatureRejected(v: unknown): v is FeatureRejected {
  if (!isObject(v) || v.type !== "feature_rejected") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.feedback)) return false;
  if (!isString(v.severity) || !["small", "big"].includes(v.severity)) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isMessageOutbound(v: unknown): v is MessageOutbound {
  if (!isObject(v) || v.type !== "message_outbound") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!isString(v.conversationId) || v.conversationId.length === 0) return false;
  if (!isString(v.text)) return false;
  return true;
}

export function isVerifyResult(v: unknown): v is VerifyResult {
  if (!isObject(v) || v.type !== "verify_result") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (typeof v.passed !== "boolean") return false;
  if (!isString(v.testOutput)) return false;
  if (v.reviewSummary !== undefined && !isString(v.reviewSummary)) return false;
  return true;
}

export function isDeployComplete(v: unknown): v is DeployComplete {
  if (!isObject(v) || v.type !== "deploy_complete") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!isString(v.testUrl) || v.testUrl.length === 0) return false;
  if (typeof v.ephemeral !== "boolean") return false;
  return true;
}

export function isDeployFailed(v: unknown): v is DeployFailed {
  if (!isObject(v) || v.type !== "deploy_failed") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!isString(v.error)) return false;
  return true;
}

export function isDeployNeedsConfig(v: unknown): v is DeployNeedsConfig {
  if (!isObject(v) || v.type !== "deploy_needs_config") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isJobBlocked(v: unknown): v is JobBlocked {
  if (!isObject(v) || v.type !== "job_blocked") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!isString(v.reason) || v.reason.length === 0) return false;
  return true;
}

export function isDaemonShutdownNotification(v: unknown): v is DaemonShutdownNotification {
  if (!isObject(v) || v.type !== "daemon_shutdown_notification") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.machineId) || v.machineId.length === 0) return false;
  if (!Array.isArray(v.affectedJobIds)) return false;
  if (!v.affectedJobIds.every((jobId: unknown) => isString(jobId))) return false;
  return true;
}

export function isAgentMessage(v: unknown): v is AgentMessage {
  if (!isObject(v) || !isString(v.type)) return false;
  switch (v.type) {
    case "heartbeat":           return isHeartbeat(v);
    case "job_status":          return isJobStatusMessage(v);
    case "job_complete":        return isJobComplete(v);
    case "job_failed":          return isJobFailed(v);
    case "job_ack":             return isJobAck(v);
    case "stop_ack":            return isStopAck(v);
    case "feature_approved":    return isFeatureApproved(v);
    case "feature_rejected":    return isFeatureRejected(v);
    case "verify_result":       return isVerifyResult(v);
    case "message_outbound":    return isMessageOutbound(v);
    case "deploy_complete":     return isDeployComplete(v);
    case "deploy_failed":       return isDeployFailed(v);
    case "deploy_needs_config": return isDeployNeedsConfig(v);
    case "job_blocked":         return isJobBlocked(v);
    case "daemon_shutdown_notification": return isDaemonShutdownNotification(v);
    default:                    return false;
  }
}
