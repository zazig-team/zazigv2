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
  Heartbeat,
  JobStatusMessage,
  JobComplete,
  JobFailed,
  JobAck,
  StopAck,
  FeatureApproved,
  FeatureRejected,
  VerifyResult,
} from "./messages.js";

import { MAX_CONTEXT_BYTES, PROTOCOL_VERSION } from "./index.js";

// ---------------------------------------------------------------------------
// Allowed model identifiers
// ---------------------------------------------------------------------------

const ALLOWED_MODELS = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "codex",
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
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (!isString(v.cardId) || v.cardId.length === 0) return false;
  if (!["code", "infra", "design", "research", "docs"].includes(v.cardType as string)) return false;
  if (!["simple", "medium", "complex"].includes(v.complexity as string)) return false;
  if (!["claude_code", "codex"].includes(v.slotType as string)) return false;
  if (!isString(v.model) || !ALLOWED_MODELS.has(v.model)) return false;
  // Either context (inline) or contextRef (URL) must be present — not both undefined.
  const hasContext = isString(v.context);
  const hasContextRef = isString(v.contextRef) && v.contextRef.length > 0;
  if (!hasContext && !hasContextRef) return false;
  // Guard against oversized inline context payloads (Supabase Realtime limit).
  // Using character count as a conservative proxy: worst-case UTF-16 encoding
  // means 1 char ≤ 4 bytes, so length > MAX_CONTEXT_BYTES already exceeds the limit.
  if (hasContext && (v.context as string).length > MAX_CONTEXT_BYTES) return false;
  // role is optional; if present it must be a non-empty string
  if (v.role !== undefined && (!isString(v.role) || v.role.length === 0)) return false;
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
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.featureBranch) || v.featureBranch.length === 0) return false;
  if (!isString(v.projectId) || v.projectId.length === 0) return false;
  return true;
}

export function isOrchestratorMessage(v: unknown): v is OrchestratorMessage {
  if (!isObject(v) || !isString(v.type)) return false;
  switch (v.type) {
    case "start_job":       return isStartJob(v);
    case "stop_job":        return isStopJob(v);
    case "health_check":    return isHealthCheck(v);
    case "verify_job":      return isVerifyJob(v);
    case "deploy_to_test":  return isDeployToTest(v);
    default:                return false;
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
  const agentStatuses = ["executing", "reviewing", "complete", "failed"];
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

const VALID_FAILURE_REASONS = new Set(["agent_crash", "ci_failure", "timeout", "unknown"]);

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
  return true;
}

export function isFeatureRejected(v: unknown): v is FeatureRejected {
  if (!isObject(v) || v.type !== "feature_rejected") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.featureId) || v.featureId.length === 0) return false;
  if (!isString(v.feedback)) return false;
  if (!isString(v.severity) || !["small", "big"].includes(v.severity)) return false;
  return true;
}

export function isVerifyResult(v: unknown): v is VerifyResult {
  if (!isObject(v) || v.type !== "verify_result") return false;
  if (!hasValidProtocolVersion(v)) return false;
  if (!isString(v.jobId) || v.jobId.length === 0) return false;
  if (typeof v.passed !== "boolean") return false;
  if (!isString(v.testOutput)) return false;
  if (v.reviewSummary !== undefined && !isString(v.reviewSummary)) return false;
  return true;
}

export function isAgentMessage(v: unknown): v is AgentMessage {
  if (!isObject(v) || !isString(v.type)) return false;
  switch (v.type) {
    case "heartbeat":         return isHeartbeat(v);
    case "job_status":        return isJobStatusMessage(v);
    case "job_complete":      return isJobComplete(v);
    case "job_failed":        return isJobFailed(v);
    case "job_ack":           return isJobAck(v);
    case "stop_ack":          return isStopAck(v);
    case "feature_approved":  return isFeatureApproved(v);
    case "feature_rejected":  return isFeatureRejected(v);
    case "verify_result":     return isVerifyResult(v);
    default:                  return false;
  }
}
