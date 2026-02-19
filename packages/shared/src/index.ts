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
  FailureReason,
  // Orchestrator → Local Agent messages
  StartJob,
  StopJob,
  HealthCheck,
  OrchestratorMessage,
  // Local Agent → Orchestrator messages
  Heartbeat,
  JobStatus,
  JobComplete,
  JobFailed,
  JobAck,
  StopAck,
  AgentMessage,
} from "./messages.js";

// ---- Card annotation (parsed from Trello card description) ----

export interface CardAnnotation {
  complexity: import("./messages.js").Complexity;
  cardType: import("./messages.js").CardType;
}

// ---- Machine / slot tracking ----

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
  hostsCpo: boolean;
  lastHeartbeat: string | null;
  status: MachineStatus;
}

// ---- Job record (orchestrator DB row) ----

export interface Job {
  id: string;
  cardId: string;
  cardType: import("./messages.js").CardType;
  complexity: import("./messages.js").Complexity;
  slotType: import("./messages.js").SlotType;
  machineId: string | null;
  status: import("./messages.js").JobStatusValue;
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
export const CPO_FAILOVER_THRESHOLD_MS = 15 * 60_000;

/**
 * Maximum size (in bytes) for the `context` field in StartJob messages.
 * Supabase Realtime has a per-message payload limit (~1 MB). This constant
 * guards against cards with oversized descriptions (embedded images, long
 * threads) causing broadcast failures or prompt injection via size abuse.
 */
export const MAX_CONTEXT_BYTES = 64_000;

// ---- Runtime validators ----
// Validate untrusted JSON from Supabase Realtime before acting on it.
export {
  isOrchestratorMessage,
  isAgentMessage,
  isStartJob,
  isStopJob,
  isHealthCheck,
  isHeartbeat,
  isJobStatus,
  isJobComplete,
  isJobFailed,
  isJobAck,
  isStopAck,
} from "./validators.js";
