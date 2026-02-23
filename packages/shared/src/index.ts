// @zazigv2/shared — public API
// Shared types, message protocol, and constants.
// Consumed by both the cloud orchestrator (Supabase Edge Functions) and local-agent (Node.js daemon).

// Re-export the full message protocol
export type {
  // Shared value types
  SlotType,
  Complexity,
  CardType,
  JobStatusValue,
  AgentJobStatus,
  FailureReason,
  FeatureStatus,
  PipelineJobStatus,
  // Orchestrator → Local Agent messages
  StartJob,
  StopJob,
  HealthCheck,
  VerifyJob,
  DeployToTest,
  MessageInbound,
  OrchestratorMessage,
  // Local Agent → Orchestrator messages
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
  AgentMessage,
} from "./messages.js";
export { FEATURE_STATUSES, JOB_STATUSES } from "./messages.js";

// ---- Card annotation (parsed from Trello card description) ----

export type { CardAnnotation } from "./annotations.js";
export { parseAnnotation } from "./annotations.js";

// ---- Test recipe schema (zazig.test.yaml) ----

export type {
  TestRecipe,
  TestRecipeDeploy,
  TestRecipeTeardown,
  TestRecipeHealthcheck,
  TestRecipeProvider,
  TestRecipeType,
} from "./test-recipe.js";

// ---- Slack helpers ----

export type { SlackConfig } from "./slack.js";
export { formatTestingMessage, SlackNotifier } from "./slack.js";

// ---- Machine / slot tracking ----

import type { CardType, Complexity, SlotType, JobStatusValue } from "./messages.js";

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

// ---- Job record (orchestrator DB row) ----

/** Type of job — matches the `job_type` column in the jobs table. */
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

// ---- Constants ----

/**
 * Current protocol version.
 * Both OrchestratorMessage and AgentMessage carry this value in their
 * `protocolVersion` field. Receivers should reject messages with a
 * different version to surface schema mismatch early.
 *
 * Increment this when making a breaking change to the message schema
 * (e.g. renaming a required field, removing a message type).
 * Adding optional fields or new message types is non-breaking.
 */
export const PROTOCOL_VERSION = 1;

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const MACHINE_DEAD_THRESHOLD_MS = 120_000;
export const RECOVERY_COOLDOWN_MS = 60_000;
/**
 * Maximum size (in bytes) for the `context` field in StartJob messages.
 * Supabase Realtime has a per-message payload limit (~1 MB). This constant
 * guards against cards with oversized descriptions (embedded images, long
 * threads) causing broadcast failures or prompt injection via size abuse.
 */
export const MAX_CONTEXT_BYTES = 64_000;
/** Maximum size of a compiled personality prompt string. Compiled prompts are
 * injected into the agent system context over Supabase Realtime in the same
 * message as `context`, so both fields share the per-message budget.
 */
export const MAX_PERSONALITY_PROMPT_BYTES = 16_000;

// ---- Runtime validators ----
// Validate untrusted JSON from Supabase Realtime before acting on it.
export {
  isOrchestratorMessage,
  isAgentMessage,
  isStartJob,
  isStopJob,
  isHealthCheck,
  isVerifyJob,
  isDeployToTest,
  isMessageInbound,
  isHeartbeat,
  isJobStatusMessage,
  isJobComplete,
  isJobFailed,
  isJobAck,
  isStopAck,
  isFeatureApproved,
  isFeatureRejected,
  isVerifyResult,
  isMessageOutbound,
  isDeployComplete,
  isDeployFailed,
  isDeployNeedsConfig,
} from "./validators.js";

// ---- Personality prompt compilation ----

export type {
  BeliefStatement,
  AntiPattern,
  ContextualOverlay,
  ArchetypeDefinition,
  CompiledPersonality,
  PersonalityMode,
} from "./personality/index.js";
export { compilePersonalityPrompt } from "./personality/index.js";
