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
import { JobExecutor } from "./executor.js";
import { JobVerifier } from "./verifier.js";
import { FixAgentManager } from "./fix-agent.js";
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
      `slots=${JSON.stringify(config.slots)}`
  );

  // Initialize slot tracker from config
  const slots = new SlotTracker(config.slots);

  // Create and configure Realtime connection
  const conn = new AgentConnection(config, slots);

  // Initialize job verifier — handles VerifyJob messages inline
  const verifier = new JobVerifier(
    config.name,
    (msg) => conn.sendMessage(msg),
  );

  // Initialize job executor — passes messages back to orchestrator via conn.sendMessage
  // conn.dbClient (service_role) is passed so the executor can write job status directly to the DB
  const executor = new JobExecutor(
    config.name,
    config.company_id,
    slots,
    (msg) => conn.sendMessage(msg),
    conn.dbClient,
  );

  // Initialize fix agent manager — spawns ephemeral Claude sessions during testing phase
  // Temporarily unused: spawn gated until DeployToTest includes slackChannel/slackThreadTs (Task 10)
  const _fixAgentManager = new FixAgentManager(process.cwd());

  // Register message handler — dispatch StartJob/StopJob to executor
  conn.onMessage((msg: OrchestratorMessage) => {
    switch (msg.type) {
      case "start_job":
        console.log(
          `[local-agent] Received start_job — jobId=${msg.jobId}, cardId=${msg.cardId}, ` +
            `slotType=${msg.slotType}, complexity=${msg.complexity}, model=${msg.model}`
        );
        void executor.handleStartJob(msg);
        break;

      case "stop_job":
        console.log(
          `[local-agent] Received stop_job — jobId=${msg.jobId}, reason=${msg.reason}`
        );
        void executor.handleStopJob(msg);
        break;

      case "health_check":
        console.log("[local-agent] Received health_check — heartbeat will be sent on next interval");
        break;

      case "verify_job":
        console.log(`[local-agent] Received verify_job — jobId=${msg.jobId}`);
        void verifier.verify(msg);
        break;

      case "deploy_to_test":
        console.log(
          `[local-agent] Received deploy_to_test — featureId=${msg.featureId}, ` +
            `branch=${msg.featureBranch}`
        );
        // TODO: DeployToTest message does not yet include slackChannel/slackThreadTs.
        // Fix agent spawning is gated until protocol is extended (Task 10).
        // Tracked: https://github.com/zazig-team/zazigv2 (add slackChannel, slackThreadTs to DeployToTest)
        console.warn('[local-agent] deploy_to_test: slackChannel/slackThreadTs not in protocol yet — fix agent NOT spawned');
        break;

      case "message_inbound":
        // TODO: Route inbound messages to agent tmux session (Wave 2, Task 6)
        console.log(`[local-agent] Received message_inbound — conversationId=${msg.conversationId}, from=${msg.from}`);
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
    await executor.stopAll();
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
