// @zazigv2/orchestrator — Supabase Edge Functions entry point
// Deterministic orchestrator: no LLM. Polls Trello, dispatches via Supabase Realtime.
//
// Intended runtime: Deno / Supabase Edge Functions
// Deploy via: supabase functions deploy orchestrator

export type {
  CardAnnotation,
  Complexity,
  CardType,
  Job,
  JobStatusMessage,
  Machine,
  OrchestratorMessage,
} from "@zazigv2/shared";

// Re-export constants so edge function handlers can import from this package
export {
  HEARTBEAT_INTERVAL_MS,
  MACHINE_DEAD_THRESHOLD_MS,
} from "@zazigv2/shared";
