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
 * Lifecycle status values for a job in the orchestrator's job queue.
 *
 *   queued → dispatched → executing → reviewing → complete
 *                                              ↘ failed
 *
 * NOTE: TypeScript does not allow a type alias and an interface to share the
 * same name in the same scope. The `JobStatus` message interface (below) uses
 * `JobStatusValue` for the status field type to avoid that collision while
 * keeping the message interface named exactly `JobStatus` per the protocol spec.
 */
export type JobStatusValue =
  | "queued"
  | "dispatched"
  | "executing"
  | "reviewing"
  | "complete"
  | "failed";

// ---------------------------------------------------------------------------
// Orchestrator → Local Agent messages
// ---------------------------------------------------------------------------

/**
 * Tells the local agent to start executing a card.
 * The agent should spin up the appropriate tmux/CLI process using the
 * provided model and context, and report progress via JobStatus / JobComplete / JobFailed.
 */
export interface StartJob {
  type: "start_job";
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
  /** Full card context (description, repo info, instructions) for the agent prompt. */
  context: string;
}

/**
 * Instructs the local agent to terminate a running job immediately.
 * The agent should kill the tmux session / process and release the slot.
 */
export interface StopJob {
  type: "stop_job";
  /** Job to terminate. */
  jobId: string;
  /** Human-readable reason for the stop (logged for observability). */
  reason: string;
}

/**
 * Liveness probe sent by the orchestrator.
 * The local agent should respond with a Heartbeat message.
 */
export interface HealthCheck {
  type: "health_check";
}

/** Union of all messages the orchestrator sends to a local agent. */
export type OrchestratorMessage = StartJob | StopJob | HealthCheck;

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
  /** Stable machine identifier (matches the `machines` table in Supabase). */
  machineId: string;
  /**
   * Number of free slots per slot type on this machine at time of heartbeat.
   * Example: { claude_code: 1, codex: 0 }
   */
  slotsAvailable: Record<SlotType, number>;
  /** Whether the persistent CPO session is running on this machine. */
  cpoAlive: boolean;
}

/**
 * Progress update for an in-flight job.
 * Sent whenever the job transitions to a new status phase.
 * May include an optional partial output or status detail.
 */
export interface JobStatus {
  type: "job_status";
  jobId: string;
  /** New status value for this job (see JobStatusValue). */
  status: JobStatusValue;
  /** Optional partial output or status message for observability. */
  output?: string;
}

/**
 * Sent when a job finishes successfully.
 * The orchestrator will move the Trello card to Review and release the slot.
 */
export interface JobComplete {
  type: "job_complete";
  jobId: string;
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
  jobId: string;
  /** Error description for logging and card annotation. */
  error: string;
}

/** Union of all messages a local agent sends to the orchestrator. */
export type AgentMessage = Heartbeat | JobStatus | JobComplete | JobFailed;
