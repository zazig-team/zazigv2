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
export type CardType = "code" | "infra" | "design" | "research" | "docs" | "verify" | "breakdown" | "combine" | "merge" | "deploy_to_test" | "deploy_to_prod" | "review" | "bug" | "persistent_agent" | "feature_test";

/**
 * Lifecycle status values for a job in the orchestrator's job queue (DB model).
 *
 *   queued → dispatched → executing → reviewing → complete
 *                           ↘ blocked (needs human input)
 *   Plus: failed, cancelled
 *
 * NOTE: `queued` and `dispatched` are DB-only states that the local agent never
 * sends over the wire. Use `AgentJobStatus` for the set of statuses an agent
 * may report in a JobStatusMessage.
 */
export type JobStatusValue =
  | "queued"
  | "dispatched"
  | "executing"
  | "blocked"
  | "reviewing"
  | "complete"
  | "failed"
  | "cancelled";

/**
 * Subset of JobStatusValue that the local agent is allowed to send in a
 * JobStatusMessage. The orchestrator-only states `queued` and `dispatched`
 * are intentionally excluded — agents must never emit those values over the
 * wire.
 */
export type AgentJobStatus = "executing" | "reviewing" | "blocked" | "complete" | "failed";

/**
 * Structured failure reason for JobFailed messages.
 * Enables the orchestrator to apply different recovery strategies per failure category:
 *   agent_crash  → re-queue immediately on a healthy machine
 *   ci_failure   → move to Needs Human for triage
 *   timeout      → re-queue with extended timeout or move to Needs Human
 *   unknown      → log and move to Needs Human
 */
export type FailureReason =
  | "agent_crash"
  | "ci_failure"
  | "timeout"
  | "unknown"
  | "daemon_heartbeat_gap"
  | "stuck_no_output";

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
  /** Project UUID — executor uses to cache repo clone by project. */
  projectId: string;
  /**
   * GitHub HTTPS URL from projects.repo_url — executor clones from this.
   * Optional for NO_CODE_CONTEXT roles that run without repo/worktree.
   */
  repoUrl?: string | null;
  /**
   * Feature branch name from features.branch — job branches are created off this.
   * Optional for NO_CODE_CONTEXT roles that run without repo/worktree.
   */
  featureBranch?: string | null;
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
  /**
   * Pre-compiled personality prompt string injected directly into the agent's system context.
   * Generated by the orchestrator from the company's personality config at dispatch time —
   * the agent receives the final rendered string and does not resolve any config references.
   * Optional; omit for jobs that do not require a personality overlay.
   * Must not exceed MAX_PERSONALITY_PROMPT_BYTES when present.
   */
  personalityPrompt?: string;
  /**
   * Pre-compiled sub-agent personality prompt. Injected into the agent workspace
   * so the primary exec agent can forward team values to sub-agents spawned via
   * the Task tool. Contains core beliefs, anti-patterns, and root constraints -
   * no persona, voice, style, or domain boundaries.
   * Optional; omit when sub-agent inheritance is not required.
   * Must not exceed MAX_PERSONALITY_PROMPT_BYTES when present.
   */
  subAgentPrompt?: string;
  /**
   * Operational role prompt from roles.prompt — defines the agent's scope and output contract.
   * Injected after personalityPrompt and before skill content in the 4-layer context stack.
   * Optional; omit for codex slot_type jobs.
   */
  rolePrompt?: string;
  /**
   * Pre-assembled prompt stack with a <!-- SKILLS --> marker where skill content
   * should be inserted by the local agent. Contains personality → role → marker →
   * task context → file-writing rules → completion instructions. When present,
   * the agent ignores personalityPrompt, rolePrompt, and context fields.
   */
  promptStackMinusSkills?: string;
  /**
   * Skill names from roles.skills — executor loads ~/.claude/skills/{name}/SKILL.md for each.
   * Injected at the <!-- SKILLS --> marker position in promptStackMinusSkills.
   * Optional; omit for codex slot_type jobs or roles with no skills.
   */
  roleSkills?: string[];
  /**
   * Branch names of completed dependency jobs. When present, the executor
   * branches from depBranches[0] and merges additional branches (fan-in).
   * Omitted for independent jobs or when all deps have null branches.
   */
  dependencyBranches?: string[];
  /** MCP tool names this role may invoke. Enforced server-side by agent-mcp-server. */
  roleMcpTools?: string[];
  /** When true, executor spawns in TUI mode (no -p) for human collaboration via /remote-control. */
  interactive?: boolean;
  /** Human-readable job title — used in codex commit messages after Haiku review passes. */
  title?: string;
  /** Full job spec text — forwarded to Haiku for post-execution code review of codex jobs. */
  spec?: string;
  /** Acceptance criteria text — forwarded to Haiku for post-execution code review of codex jobs. */
  acceptanceCriteria?: string;
  /**
   * Company project metadata for persistent agent workspace repo links.
   * Populated by company-persistent-jobs for synthetic persistent StartJob payloads.
   */
  companyProjects?: Array<{
    name: string;
    repo_url: string | null;
  }>;
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

export const FEATURE_STATUSES = [
  "created",
  "breaking_down",
  "building",
  "combining_and_pr",
  "verifying",
  "merging",
  "complete",
  "cancelled",
  "failed",
] as const;
export type FeatureStatus = typeof FEATURE_STATUSES[number];

export const JOB_STATUSES = [
  "queued",
  "dispatched",
  "executing",
  "blocked",
  "reviewing",
  "complete",
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
  /** Feature identifier being deployed (feature-scoped deploys). */
  featureId?: string;
  /** Standalone job identifier being deployed (standalone job deploys). */
  standaloneJobId?: string;
  /** Discriminator: whether this deploy is for a feature or standalone job. */
  jobType: "feature" | "standalone";
  /** Branch to deploy to test environment. */
  featureBranch: string;
  /** Target project/environment identifier. */
  projectId: string;
  /** Summary of changes for Slack notification. */
  changeSummary?: string;
  /** Absolute path to the repository on disk. */
  repoPath?: string;
}

/**
 * Tells the local agent to run teardown for a test environment.
 * Sent by the orchestrator after feature approval or rejection.
 */
export interface TeardownTest {
  type: "teardown_test";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Feature that was approved/rejected — used for logging. */
  featureId: string;
  /** Absolute path to the repository on disk (needed to find zazig.test.yaml). */
  repoPath: string;
}

/**
 * Delivers an inbound message from an external platform (Slack, Discord, etc.)
 * to the local agent for injection into the running agent's tmux session.
 * The conversationId is opaque to the agent — it must be echoed back in any
 * MessageOutbound reply so the orchestrator can route the response to the
 * correct platform thread.
 */
export interface MessageInbound {
  type: "message_inbound";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Opaque conversation identifier (e.g. "slack:T123:C456:1234.5678"). */
  conversationId: string;
  /** Human-readable sender (e.g. "@tom"). */
  from: string;
  /** Message content. */
  text: string;
  /**
   * Target persistent agent role (e.g. "cpo", "cto").
   * When present, the local agent routes the message to the matching persistent session.
   * Omit for backward compatibility with single-role deployments — the agent falls back
   * to the sole running persistent agent automatically.
   */
  role?: string;
}

/**
 * Sent by the orchestrator when a human has answered a blocked job's question.
 * The agent should resume executing.
 */
export interface JobUnblocked {
  type: "job_unblocked";
  protocolVersion: number;
  jobId: string;
  /** The human's answer to the agent's question. */
  answer: string;
}

/**
 * Role configuration embedded in a StartExpertMessage.
 * Contains everything needed to set up the expert's Claude environment.
 */
export interface ExpertRoleConfig {
  /** Role-specific system prompt. */
  prompt: string;
  /** Skill names to load into the workspace. */
  skills?: string[];
  /** MCP tool names the expert may invoke. */
  mcp_tools?: string[];
  /** Overrides merged into .claude/settings.json after workspace setup. */
  settings_overrides?: Record<string, unknown>;
}

/**
 * Tells the local agent to start an interactive expert session.
 * Expert sessions run Claude in TUI mode for human collaboration
 * and do not consume a job slot.
 */
export interface StartExpertMessage {
  type: "start_expert";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Expert session UUID from the expert_sessions table. */
  session_id: string;
  /** Project UUID — when provided, a git worktree is created. */
  project_id?: string;
  /** GitHub HTTPS URL for the project repo. Required when project_id is set. */
  repo_url?: string;
  /** Branch to base the worktree on (defaults to master when omitted). */
  branch?: string;
  /** Model identifier for the Claude session. */
  model: string;
  /** Task brief text for the expert. */
  brief: string;
  /** Human-readable display name for the TUI window. */
  display_name?: string;
  /** Company name — used to derive the viewer session name for TUI linking. */
  company_name?: string;
  /** Full role configuration. */
  role: ExpertRoleConfig;
}

/** Union of all messages the orchestrator sends to a local agent. */
export type OrchestratorMessage = StartJob | StopJob | HealthCheck | VerifyJob | DeployToTest | TeardownTest | MessageInbound | JobUnblocked | StartExpertMessage;

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
/**
 * Job result prefix. Always starts with one of these values.
 * May include a reason suffix after a colon, e.g. "FAILED: reason here".
 */
export type JobResultPrefix = "PASSED" | "FAILED" | "VERDICT_MISSING" | "NO_REPORT";

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
  /** Result verdict — starts with a JobResultPrefix, may include ": reason" suffix. */
  result: string;
  /** Pull request URL if the job opened a PR. */
  pr?: string;
  /** Pull request URL if the job opened a PR. */
  pr_url?: string;
  /** Git branch created/pushed for this job. */
  branch?: string;
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
  /**
   * Machine that sent this approval.
   * Allows the orchestrator to audit and verify the sender identity.
   */
  machineId: string;
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
  /**
   * Machine that sent this rejection.
   * Allows the orchestrator to audit and verify the sender identity.
   */
  machineId: string;
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
  /**
   * Machine that ran the verification.
   * Allows the orchestrator to audit and verify the sender identity.
   */
  machineId: string;
  /** True when verification passed all required checks. */
  passed: boolean;
  /** Raw verification/test output. */
  testOutput: string;
  /** Optional high-level review summary for humans/orchestrator logs. */
  reviewSummary?: string;
}

/**
 * Sent by the local agent (via MCP tool) when an agent wants to reply to an
 * external platform message. The orchestrator parses the conversationId prefix
 * to determine which platform adapter should deliver the reply.
 */
export interface MessageOutbound {
  type: "message_outbound";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Job that is sending this reply. */
  jobId: string;
  /** Machine that is sending this reply. */
  machineId: string;
  /** Echoed conversationId from the original MessageInbound. */
  conversationId: string;
  /** Reply text. */
  text: string;
}

/**
 * Sent by the local agent after successfully deploying a feature to a test environment.
 * The orchestrator stores the test URL and opens a Slack thread for approval.
 */
export interface DeployComplete {
  type: "deploy_complete";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Feature that was deployed. */
  featureId: string;
  /** Machine that performed the deployment. */
  machineId: string;
  /** URL of the deployed test environment. */
  testUrl: string;
  /** Whether the test environment is ephemeral (cleaned up after testing). */
  ephemeral: boolean;
}

/**
 * Sent by the local agent when deployment to a test environment fails.
 * The orchestrator logs the error and notifies via Slack.
 */
export interface DeployFailed {
  type: "deploy_failed";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Feature whose deployment failed. */
  featureId: string;
  /** Machine that attempted the deployment. */
  machineId: string;
  /** Error description. */
  error: string;
}

/**
 * Sent by the local agent when no zazig.test.yaml is found in the repository.
 * The orchestrator notifies the user via Slack with instructions to create one.
 */
export interface DeployNeedsConfig {
  type: "deploy_needs_config";
  /** Protocol version — must equal PROTOCOL_VERSION. */
  protocolVersion: number;
  /** Feature that needs test configuration. */
  featureId: string;
  /** Machine that tried to deploy. */
  machineId: string;
}

/**
 * Sent by the agent when it hits a blocker it cannot resolve alone.
 * The orchestrator posts the question to the feature's Slack thread.
 */
export interface JobBlocked {
  type: "job_blocked";
  protocolVersion: number;
  jobId: string;
  machineId: string;
  /** Human-readable question or blocker description. */
  reason: string;
}

/**
 * Sent by the local agent when daemon shutdown has started and in-flight jobs may be interrupted.
 */
export interface DaemonShutdownNotification {
  type: "daemon_shutdown_notification";
  protocolVersion: number;
  machineId: string;
  /** Job IDs that were in-flight when shutdown was initiated. */
  affectedJobIds: string[];
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
  | VerifyResult
  | MessageOutbound
  | DeployComplete
  | DeployFailed
  | DeployNeedsConfig
  | JobBlocked
  | DaemonShutdownNotification;
