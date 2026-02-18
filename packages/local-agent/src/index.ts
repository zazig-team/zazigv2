// @zazigv2/local-agent — Node.js daemon entry point
// Connects to Supabase Realtime, sends heartbeats, executes tmux sessions.
//
// Runtime: Node.js 20+
// Start: node dist/index.js (or npm start from this package)

export type {
  Machine,
  MachineSlots,
  SlotPool,
  OrchestratorMessage,
  Heartbeat,
  JobStatus,
  JobComplete,
  JobFailed,
  AgentMessage,
  StartJob,
  StopJob,
  SlotType,
  Complexity,
  CardType,
  JobStatusValue,
} from "@zazigv2/shared";

export {
  HEARTBEAT_INTERVAL_MS,
  MACHINE_DEAD_THRESHOLD_MS,
} from "@zazigv2/shared";
