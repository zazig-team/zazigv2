/**
 * Deno-compatible re-export of the shared message protocol.
 *
 * The Node.js source files use `.js` extensions in relative imports (Node ESM
 * convention). Deno does not automatically rewrite `.js` → `.ts` for local
 * files, so we re-export everything here using direct `.ts` paths that Deno
 * can resolve without ambiguity.
 *
 * This file mirrors the public API of packages/shared/src/index.ts.
 */

// ---------------------------------------------------------------------------
// Re-export from messages.ts (all types + value types)
// ---------------------------------------------------------------------------

export type {
  SlotType,
  Complexity,
  CardType,
  JobStatusValue,
  AgentJobStatus,
  FailureReason,
  StartJob,
  StopJob,
  HealthCheck,
  VerifyJob,
  DeployToTest,
  OrchestratorMessage,
  Heartbeat,
  JobStatusMessage,
  JobComplete,
  JobFailed,
  JobAck,
  StopAck,
  FeatureApproved,
  FeatureRejected,
  VerifyResult,
  AgentMessage,
} from "../../../packages/shared/src/messages.ts";

// ---------------------------------------------------------------------------
// Re-export from annotations.ts
// ---------------------------------------------------------------------------

export type { CardAnnotation } from "../../../packages/shared/src/annotations.ts";
export { parseAnnotation } from "../../../packages/shared/src/annotations.ts";

// ---------------------------------------------------------------------------
// Re-export machine / job types declared inline in index.ts
// (These are defined in index.ts, not messages.ts, so we duplicate them here.)
// ---------------------------------------------------------------------------

import type { CardType, Complexity, SlotType, JobStatusValue } from "../../../packages/shared/src/messages.ts";

export interface SlotPool {
  total: number;
  inUse: number;
  available: number;
}

export interface MachineSlots {
  claude_code: SlotPool;
  codex: SlotPool;
}

export type MachineStatus = "online" | "offline" | "unknown";

export interface Machine {
  id: string;
  name: string;
  slots: MachineSlots;
  lastHeartbeat: string | null;
  status: MachineStatus;
}

export type JobType = "code" | "infra" | "design" | "research" | "docs" | "bug" | "persistent_agent";

export interface Job {
  id: string;
  cardId: string;
  cardType: CardType;
  complexity: Complexity;
  slotType: SlotType;
  jobType: JobType;
  role: string;
  machineId: string | null;
  status: JobStatusValue;
  startedAt: string | null;
  completedAt: string | null;
  result: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PROTOCOL_VERSION = 1;
export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MACHINE_DEAD_THRESHOLD_MS = 120_000;
export const RECOVERY_COOLDOWN_MS = 60_000;
export const MAX_CONTEXT_BYTES = 64_000;

// ---------------------------------------------------------------------------
// Re-export validators
// (validators.ts imports from "./index.js" which would be circular in Deno;
//  we inline the validators here to avoid the chain.)
// ---------------------------------------------------------------------------

import type {
  OrchestratorMessage,
  AgentMessage,
  StartJob as _StartJob,
  StopJob as _StopJob,
  HealthCheck as _HealthCheck,
  VerifyJob as _VerifyJob,
  DeployToTest as _DeployToTest,
  Heartbeat as _Heartbeat,
  JobStatusMessage as _JobStatusMessage,
  JobComplete as _JobComplete,
  JobFailed as _JobFailed,
  JobAck as _JobAck,
  StopAck as _StopAck,
  FeatureApproved as _FeatureApproved,
  FeatureRejected as _FeatureRejected,
  VerifyResult as _VerifyResult,
} from "../../../packages/shared/src/messages.ts";

// ---------------------------------------------------------------------------
// Primitive helpers (local to this file)
// ---------------------------------------------------------------------------

function _isString(v: unknown): v is string {
  return typeof v === "string";
}

function _isNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function _isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function _hasValidVersion(v: Record<string, unknown>): boolean {
  return v.protocolVersion === PROTOCOL_VERSION;
}

const ALLOWED_MODELS = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
  "codex",
]);

// ---------------------------------------------------------------------------
// Orchestrator → Agent validators
// ---------------------------------------------------------------------------

export function isStartJob(v: unknown): v is _StartJob {
  if (!_isObject(v) || v.type !== "start_job") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.cardId) || v.cardId.length === 0) return false;
  if (!["code", "infra", "design", "research", "docs"].includes(v.cardType as string)) return false;
  if (!["simple", "medium", "complex"].includes(v.complexity as string)) return false;
  if (!["claude_code", "codex"].includes(v.slotType as string)) return false;
  if (!_isString(v.model) || !ALLOWED_MODELS.has(v.model)) return false;
  const hasContext = _isString(v.context);
  const hasContextRef = _isString(v.contextRef) && (v.contextRef as string).length > 0;
  if (!hasContext && !hasContextRef) return false;
  if (hasContext && (v.context as string).length > MAX_CONTEXT_BYTES) return false;
  if (v.role !== undefined && (!_isString(v.role) || (v.role as string).length === 0)) return false;
  return true;
}

export function isStopJob(v: unknown): v is _StopJob {
  if (!_isObject(v) || v.type !== "stop_job") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.reason)) return false;
  return true;
}

export function isHealthCheck(v: unknown): v is _HealthCheck {
  if (!_isObject(v) || v.type !== "health_check") return false;
  if (!_hasValidVersion(v)) return false;
  if (v.correlationId !== undefined && !_isString(v.correlationId)) return false;
  return true;
}

export function isVerifyJob(v: unknown): v is _VerifyJob {
  if (!_isObject(v) || v.type !== "verify_job") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.featureBranch) || v.featureBranch.length === 0) return false;
  if (!_isString(v.jobBranch) || v.jobBranch.length === 0) return false;
  if (!_isString(v.acceptanceTests)) return false;
  if (v.repoPath !== undefined && (!_isString(v.repoPath) || v.repoPath.length === 0)) return false;
  return true;
}

export function isDeployToTest(v: unknown): v is _DeployToTest {
  if (!_isObject(v) || v.type !== "deploy_to_test") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.featureId) || v.featureId.length === 0) return false;
  if (!_isString(v.featureBranch) || v.featureBranch.length === 0) return false;
  if (!_isString(v.projectId) || v.projectId.length === 0) return false;
  return true;
}

export function isOrchestratorMessage(v: unknown): v is OrchestratorMessage {
  if (!_isObject(v) || !_isString(v.type)) return false;
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

export function isHeartbeat(v: unknown): v is _Heartbeat {
  if (!_isObject(v) || v.type !== "heartbeat") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  if (!_isObject(v.slotsAvailable)) return false;
  if (!_isNumber(v.slotsAvailable.claude_code) || (v.slotsAvailable.claude_code as number) < 0) return false;
  if (!_isNumber(v.slotsAvailable.codex) || (v.slotsAvailable.codex as number) < 0) return false;
  if (v.correlationId !== undefined && !_isString(v.correlationId)) return false;
  return true;
}

export function isJobStatusMessage(v: unknown): v is _JobStatusMessage {
  if (!_isObject(v) || v.type !== "job_status") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  const agentStatuses = ["executing", "reviewing", "complete", "failed"];
  if (!_isString(v.status) || !agentStatuses.includes(v.status)) return false;
  if (v.output !== undefined && !_isString(v.output)) return false;
  return true;
}

export function isJobComplete(v: unknown): v is _JobComplete {
  if (!_isObject(v) || v.type !== "job_complete") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  if (!_isString(v.result)) return false;
  if (v.pr !== undefined && !_isString(v.pr)) return false;
  if (v.report !== undefined && !_isString(v.report)) return false;
  return true;
}

const VALID_FAILURE_REASONS = new Set(["agent_crash", "ci_failure", "timeout", "unknown"]);

export function isJobFailed(v: unknown): v is _JobFailed {
  if (!_isObject(v) || v.type !== "job_failed") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  if (!_isString(v.error)) return false;
  if (!_isString(v.failureReason) || !VALID_FAILURE_REASONS.has(v.failureReason)) return false;
  return true;
}

export function isJobAck(v: unknown): v is _JobAck {
  if (!_isObject(v) || v.type !== "job_ack") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isStopAck(v: unknown): v is _StopAck {
  if (!_isObject(v) || v.type !== "stop_ack") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isFeatureApproved(v: unknown): v is _FeatureApproved {
  if (!_isObject(v) || v.type !== "feature_approved") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.featureId) || v.featureId.length === 0) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isFeatureRejected(v: unknown): v is _FeatureRejected {
  if (!_isObject(v) || v.type !== "feature_rejected") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.featureId) || v.featureId.length === 0) return false;
  if (!_isString(v.feedback)) return false;
  if (!_isString(v.severity) || !["small", "big"].includes(v.severity)) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  return true;
}

export function isVerifyResult(v: unknown): v is _VerifyResult {
  if (!_isObject(v) || v.type !== "verify_result") return false;
  if (!_hasValidVersion(v)) return false;
  if (!_isString(v.jobId) || v.jobId.length === 0) return false;
  if (!_isString(v.machineId) || v.machineId.length === 0) return false;
  if (typeof v.passed !== "boolean") return false;
  if (!_isString(v.testOutput)) return false;
  if (v.reviewSummary !== undefined && !_isString(v.reviewSummary)) return false;
  return true;
}

export function isAgentMessage(v: unknown): v is AgentMessage {
  if (!_isObject(v) || !_isString(v.type)) return false;
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
