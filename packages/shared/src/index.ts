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
} from "./validators.js";
