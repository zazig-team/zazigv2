/**
 * zazigv2 — Shared Message Protocol
 *
 * This file is the contract between the cloud orchestrator and local agent daemons.
 * All messages are exchanged over Supabase Realtime websockets.
 *
 * Two directions:
 *   Orchestrator → Local Agent  (commands: dispatch work, stop jobs, health checks)
 *   Local Agent  → Orchestrator (reports: heartbeats, job progress, job results)
 *
 * Each message family is a discriminated union on the `type` field.
 * Every message carries a `protocolVersion` field for schema version negotiation.
 * Receivers should reject messages whose protocolVersion does not match PROTOCOL_VERSION.
 */

// ---------------------------------------------------------------------------
// Shared enums / value types
// ---------------------------------------------------------------------------

/** Which execution slot type a job occupies on a local machine. */
export type SlotType = "claude_code" | "codex";

/** CPO-assigned complexity of a Trello card; drives slot type + model tier selection. */
export type Complexity = "simple" | "medium" | "complex";

/**
 * Category of work described by a Trello card.
 * Determines which execution agent and reviewer the orchestrator selects.
 */
export type CardType = "code" | "infra" | "design" | "research" | "docs";

/**
 * Lifecycle status values for a job in the orchestrator's job queue (DB model).
 *
 *   queued → dispatched → executing → reviewing → complete
 *                                              ↘ failed
 *
 * NOTE: `queued` and `dispatched` are DB-only states that the local agent never
 * sends over the wire. Use `AgentJobStatus` for the set of statuses an agent
 * may report in a JobStatusMessage.
 */
export type JobStatusValue =
  | "queued"
  | "dispatched"
  | "executing"
  | "reviewing"
  | "complete"
  | "failed";

/**
 * Subset of JobStatusValue that the local agent is allowed to send in a
 * JobStatusMessage. The orchestrator-only states `queued` and `dispatched`
 * are intentionally excluded — agents must never emit those values over the
 * wire.
 */
export type AgentJobStatus = "executing" | "reviewing" | "complete" | "failed";

/**
 * Structured failure reason for JobFailed messages.
 * Enables the orchestrator to apply different recovery strategies per failure category:
 *   agent_crash  → re-queue immediately on a healthy machine
 *   ci_failure   → move to Needs Human for triage
 *   timeout      → re-queue with extended timeout or move to Needs Human
 *   unknown      → log and move to Needs Human
 */
export type FailureReason = "agent_crash" | "ci_failure" | "timeout" | "unknown";

// ---------------------------------------------------------------------------
// Orchestrator → Local Agent messages
// ---------------------------------------------------------------------------

/**
 * Tells the local agent to start executing a card.
 * The agent should spin up the appropriate tmux/CLI process using the
 * provided model and context, and report progress via JobStatusMessage / JobComplete / JobFailed.
 *
 * Context delivery: either `context` (inline) or `contextRef` (URL to fetch) must be provided.
 * When `contextRef` is present the agent should fetch the full context payload from that URL
 * (e.g. Supabase Storage presigned URL) rather than using the inline `context` field.
 * This handles large card payloads that would exceed Supabase Realtime per-message limits.
 */
export interface StartJob {
  type: "start_job";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Unique job identifier (assigned by the orchestrator). */
  jobId: string;
  /** Trello card ID being worked. */
  cardId: string;
  /** Category of work — determines which execution agent to spin up. */
  cardType: CardType;
  /** Complexity annotation — determines model tier. */
  complexity: Complexity;
  /** Which machine slot type this job should occupy. */
  slotType: SlotType;
  /** Model identifier to pass to the execution agent (e.g. "claude-opus-4-6", "codex"). */
  model: string;
  /**
   * Inline card context (description, repo info, instructions) for the agent prompt.
   * Optional when `contextRef` is provided; required otherwise.
   * Must not exceed MAX_CONTEXT_BYTES when present.
   */
  context?: string;
  /**
   * URL reference to the full context payload (e.g. Supabase Storage presigned URL).
   * Used for large context payloads that would exceed Supabase Realtime per-message limits.
   * When present, the agent MUST fetch context from this URL and ignore the inline `context`.
   * Optional when `context` is provided; required otherwise.
   */
  contextRef?: string;
  /**
   * Agent role for this job (e.g. "cpo", "engineer", "reviewer").
   * Used by the executor to load role-specific operating manual + memory into agent context.
   * Only present for role-based jobs (persistent agents, specialized reviewers).
   */
  role?: string;
}

/**
 * Instructs the local agent to terminate a running job immediately.
 * The agent should kill the tmux session / process and release the slot.
 */
export interface StopJob {
  type: "stop_job";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Job to terminate. */
  jobId: string;
  /** Human-readable reason for the stop (logged for observability). */
  reason: string;
}

/**
 * Liveness probe sent by the orchestrator.
 * The local agent should respond with a Heartbeat message.
 * An optional correlationId may be included so the Heartbeat response can
 * echo it back for round-trip latency correlation.
 */
export interface HealthCheck {
  type: "health_check";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Optional round-trip correlation token. Echoed back in the Heartbeat response. */
  correlationId?: string;
}

export const FEATURE_STATUSES = ["design", "building", "verifying", "testing", "done", "cancelled"] as const;
export type FeatureStatus = typeof FEATURE_STATUSES[number];

export const JOB_STATUSES = [
  "design",
  "queued",
  "dispatched",
  "executing",
  "verifying",
  "verify_failed",
  "testing",
  "approved",
  "rejected",
  "waiting_on_human",
  "reviewing",
  "complete",
  "done",
  "failed",
  "cancelled",
] as const;
export type PipelineJobStatus = typeof JOB_STATUSES[number];

/**
 * Tells the local agent to verify a completed job output.
 * Used for post-implementation validation against acceptance criteria.
 */
export interface VerifyJob {
  type: "verify_job";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Unique job identifier (assigned by the orchestrator). */
  jobId: string;
  /** Feature branch under review. */
  featureBranch: string;
  /** Job-specific working branch to verify. */
  jobBranch: string;
  /** Acceptance tests the verifier should run/evaluate. */
  acceptanceTests: string;
  /** Optional repository path on disk to use for verification. */
  repoPath?: string;
}

/**
 * Tells the local agent to deploy a feature branch to a test environment.
 * Used after verification to make the feature available for review/testing.
 */
export interface DeployToTest {
  type: "deploy_to_test";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Feature identifier being deployed. */
  featureId: string;
  /** Branch to deploy to test environment. */
  featureBranch: string;
  /** Target project/environment identifier. */
  projectId: string;
}

/** Union of all messages the orchestrator sends to a local agent. */
export type OrchestratorMessage = StartJob | StopJob | HealthCheck | VerifyJob | DeployToTest;

// ---------------------------------------------------------------------------
// Local Agent → Orchestrator messages
// ---------------------------------------------------------------------------

/**
 * Periodic liveness signal sent by the local agent every 30 seconds.
 * If the orchestrator does not receive a heartbeat for 2 minutes it marks
 * the machine as dead and re-queues any In Progress cards assigned to it.
 */
export interface Heartbeat {
  type: "heartbeat";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Stable machine identifier (matches the `machines` table in Supabase). */
  machineId: string;
  /**
   * Number of free slots per slot type on this machine at time of heartbeat.
   * Example: { claude_code: 1, codex: 0 }
   */
  slotsAvailable: Record<SlotType, number>;
  /**
   * Echo of the HealthCheck.correlationId that triggered this heartbeat, if any.
   * Allows the orchestrator to measure round-trip latency.
   */
  correlationId?: string;
}

/**
 * Progress update for an in-flight job.
 * Sent whenever the job transitions to a new status phase.
 * May include an optional partial output or status detail.
 *
 * NOTE: Only AgentJobStatus values may be sent here. The DB-only states
 * `queued` and `dispatched` must never appear in this message.
 */
export interface JobStatusMessage {
  type: "job_status";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  jobId: string;
  /** New status value for this job (agent-reportable states only). */
  status: AgentJobStatus;
  /** Optional partial output or status message for observability. */
  output?: string;
}

/**
 * Sent when a job finishes successfully.
 * The orchestrator will move the Trello card to Review and release the slot.
 */
export interface JobComplete {
  type: "job_complete";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  jobId: string;
  /**
   * The machine that completed this job.
   * Allows the orchestrator to release the slot without a DB lookup.
   */
  machineId: string;
  /** Summary of what was produced (e.g. commit message, diff stats). */
  result: string;
  /** Pull request URL if the job opened a PR. */
  pr?: string;
  /** CPO-readable completion report (markdown). */
  report?: string;
}

/**
 * Sent when a job fails unrecoverably (e.g. agent crashed, CI failed, timed out).
 * The orchestrator will move the card back to Up Next (or Needs Human) and release the slot.
 */
export interface JobFailed {
  type: "job_failed";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  jobId: string;
  /**
   * The machine that was running this job.
   * Allows the orchestrator to release the slot without a DB lookup.
   */
  machineId: string;
  /** Error description for logging and card annotation. */
  error: string;
  /** Structured failure category for orchestrator recovery strategy selection. */
  failureReason: FailureReason;
}

/**
 * Delivery confirmation sent by the agent when a StartJob message is received.
 * The orchestrator uses this to confirm the job was received before expecting
 * further JobStatusMessage / JobComplete / JobFailed updates.
 */
export interface JobAck {
  type: "job_ack";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** The job being acknowledged. */
  jobId: string;
  /** The machine that received the job. */
  machineId: string;
}

/**
 * Delivery confirmation sent by the agent when a StopJob message is received.
 * The orchestrator uses this to confirm the stop was received before expecting
 * slot release.
 */
export interface StopAck {
  type: "stop_ack";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** The job whose stop was acknowledged. */
  jobId: string;
  /** The machine that received the stop. */
  machineId: string;
}

/**
 * Sent by the local agent when a feature is approved after review/testing.
 * The orchestrator can advance the feature workflow to completion.
 */
export interface FeatureApproved {
  type: "feature_approved";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Feature identifier that was approved. */
  featureId: string;
}

/**
 * Sent by the local agent when a feature is rejected after review/testing.
 * The orchestrator should route feedback back into the implementation cycle.
 */
export interface FeatureRejected {
  type: "feature_rejected";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Feature identifier that was rejected. */
  featureId: string;
  /** Human-readable rejection feedback. */
  feedback: string;
  /** Rejection severity used for orchestration policy decisions. */
  severity: "small" | "big";
}

/**
 * Sent by the local agent after running a VerifyJob request.
 * Includes pass/fail outcome and test output for orchestrator decisions.
 */
export interface VerifyResult {
  type: "verify_result";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Job identifier that was verified. */
  jobId: string;
  /** True when verification passed all required checks. */
  passed: boolean;
  /** Raw verification/test output. */
  testOutput: string;
  /** Optional high-level review summary for humans/orchestrator logs. */
  reviewSummary?: string;
}

/** Union of all messages a local agent sends to the orchestrator. */
export type AgentMessage =
  | Heartbeat
  | JobStatusMessage
  | JobComplete
  | JobFailed
  | JobAck
  | StopAck
  | FeatureApproved
  | FeatureRejected
  | VerifyResult;
