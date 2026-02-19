/**
 * @zazigv2/local-agent — Node.js daemon entry point
 *
 * Connects to Supabase Realtime, sends heartbeats, and listens for job commands
 * from the orchestrator. Job execution is handled by a separate module (future card).
 *
 * Runtime: Node.js 20+
 * Start: node dist/index.js (or npm start from this package)
 *
 * Required environment:
 *   SUPABASE_ANON_KEY — Supabase anonymous API key (never hardcoded)
 *   SUPABASE_URL      — Optional override for supabase.url in machine.yaml
 *
 * Config: ~/.zazigv2/machine.yaml
 */

import { loadConfig } from "./config.js";
import { SlotTracker } from "./slots.js";
import { AgentConnection } from "./connection.js";
import type { OrchestratorMessage } from "@zazigv2/shared";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[local-agent] Initializing...");

  // Load machine config from ~/.zazigv2/machine.yaml
  const config = loadConfig();
  console.log(
    `[local-agent] Config loaded — machine=${config.name}, ` +
      `slots=${JSON.stringify(config.slots)}, hostsCpo=${config.hosts_cpo}`
  );

  // Initialize slot tracker from config
  const slots = new SlotTracker(config.slots);

  // Create and configure Realtime connection
  const conn = new AgentConnection(config, slots);

  // Register message handler — log all received messages
  // Job dispatch will be wired here in the next card (job execution)
  conn.onMessage((msg: OrchestratorMessage) => {
    switch (msg.type) {
      case "start_job":
        console.log(
          `[local-agent] Received start_job — jobId=${msg.jobId}, cardId=${msg.cardId}, ` +
            `slotType=${msg.slotType}, complexity=${msg.complexity}, model=${msg.model}`
        );
        // TODO: dispatch to job executor (separate card)
        break;

      case "stop_job":
        console.log(
          `[local-agent] Received stop_job — jobId=${msg.jobId}, reason=${msg.reason}`
        );
        // TODO: terminate running job (separate card)
        break;

      case "health_check":
        console.log("[local-agent] Received health_check — heartbeat will be sent on next interval");
        break;

      default: {
        // Exhaustiveness guard — TypeScript ensures this branch is unreachable
        // if all OrchestratorMessage variants are handled above.
        const _exhaustive: never = msg;
        console.warn("[local-agent] Unhandled message type:", _exhaustive);
      }
    }
  });

  // Start the connection (connects + begins heartbeat loop)
  await conn.start();

  // ---------------------------------------------------------------------------
  // Graceful shutdown handlers
  // ---------------------------------------------------------------------------

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[local-agent] Received ${signal}, shutting down gracefully...`);
    await conn.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log("[local-agent] Daemon running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[local-agent] Fatal startup error:", err);
  process.exit(1);
});
