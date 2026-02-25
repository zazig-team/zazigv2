/**
 * @zazigv2/local-agent — Node.js daemon entry point
 *
 * Connects to Supabase Realtime, sends heartbeats, and listens for job commands
 * from the orchestrator. Job execution is handled by a separate module (future card).
 *
 * Runtime: Node.js 20+
 * Start: node dist/index.js (or npm start from this package)
 *
 * Auth: Reads ~/.zazigv2/credentials.json for Supabase Auth JWT.
 * Config: env vars from `zazig start` or ~/.zazigv2/config.json (machine name + slots)
 */

import { loadConfig } from "./config.js";
import { SlotTracker } from "./slots.js";
import { AgentConnection } from "./connection.js";
import { JobExecutor } from "./executor.js";
import { JobVerifier } from "./verifier.js";
import { FixAgentManager } from "./fix-agent.js";
import { TestRunner } from "./test-runner.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrchestratorMessage, MessageInbound } from "@zazigv2/shared";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[local-agent] Initializing...");

  // Load machine config from env vars or ~/.zazigv2/config.json
  const config = loadConfig();
  console.log(
    `[local-agent] Config loaded — machine=${config.name}, ` +
      `slots=${JSON.stringify(config.slots)}`
  );

  // Initialize slot tracker from config
  const slots = new SlotTracker(config.slots);

  // Create and configure Realtime connection
  // Auth: AgentConnection reads SUPABASE_ACCESS_TOKEN from env (set by `zazig start`)
  // and uses it for authenticated DB writes. No explicit authenticate() call needed.
  const conn = new AgentConnection(config, slots);

  // Initialize job verifier — handles VerifyJob messages via role-driven Claude session
  // conn.dbClient passed so the verifier can load the reviewer role prompt from the DB
  const verifier = new JobVerifier(
    config.name,
    (msg) => conn.sendMessage(msg),
    conn.dbClient,
  );

  // Initialize job executor — passes messages back to orchestrator via conn.sendMessage
  // conn.dbClient (authenticated) is passed so the executor can write job status directly to the DB
  const executor = new JobExecutor(
    config.name,
    config.company_id ?? "",
    slots,
    (msg) => conn.sendMessage(msg),
    conn.dbClient,
    config.supabase.url,
    config.supabase.anon_key,
  );

  // Initialize test runner — handles deploy_to_test messages (zazig.test.yaml recipes)
  const testRunner = new TestRunner(
    config.name,
    (msg) => conn.sendMessage(msg),
  );

  // Initialize fix agent manager — spawns ephemeral Claude sessions during testing phase
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
        void testRunner.handleDeployToTest(msg);
        break;

      case "message_inbound":
        console.log(`[local-agent] Received message_inbound — conversationId=${msg.conversationId}, from=${msg.from}`);
        executor.handleMessageInbound(msg as MessageInbound);
        break;

      case "teardown_test":
        console.log(
          `[local-agent] Received teardown_test — featureId=${msg.featureId}`
        );
        void testRunner.runTeardown(msg.repoPath);
        break;

      case "job_unblocked":
        console.log(`[local-agent] Job ${msg.jobId} unblocked — answer: ${msg.answer.slice(0, 80)}`);
        void executor.handleJobUnblocked(msg);
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

  // Recover any jobs that were dispatched/executing when we last went offline.
  // These are stuck because the Realtime broadcast was missed or the daemon was killed.
  await recoverStuckJobs(conn.dbClient, config.name);

  // Poll for dispatched jobs every 30s — the Realtime broadcast is fire-and-forget
  // so the agent may miss start_job messages. This resets them to queued so the
  // orchestrator re-dispatches on its next cycle.
  const RECOVERY_POLL_MS = 30_000;
  setInterval(() => {
    void recoverStuckJobs(conn.dbClient, config.name);
  }, RECOVERY_POLL_MS);

  // Discover and spawn persistent agents if ZAZIG_COMPANY_ID is set
  const companyId = process.env["ZAZIG_COMPANY_ID"];
  if (companyId) {
    await discoverAndSpawnPersistentAgents(
      config.supabase.url,
      config.supabase.anon_key,
      config.supabase.access_token,
      companyId,
      executor,
    );
  }

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

// ---------------------------------------------------------------------------
// Startup recovery — re-queue jobs stuck from a previous run
// ---------------------------------------------------------------------------

/**
 * On startup, find any jobs assigned to this machine that are stuck in
 * `dispatched` or `executing` status (from a previous daemon run that crashed
 * or was restarted). Reset them to `queued` so the orchestrator re-dispatches.
 */
async function recoverStuckJobs(
  dbClient: SupabaseClient,
  machineName: string,
): Promise<void> {
  try {
    // Look up our machine row ID(s) by name
    const { data: machines, error: machErr } = await dbClient
      .from("machines")
      .select("id")
      .eq("name", machineName);

    if (machErr || !machines || machines.length === 0) {
      console.log("[local-agent] No machine rows found — skipping job recovery");
      return;
    }

    const machineIds = machines.map((m: { id: string }) => m.id);

    // Find stuck jobs: dispatched means the Realtime broadcast was missed.
    // NOTE: only reset 'dispatched' — not 'executing'. Executing jobs have an
    // active tmux session; resetting them would fight the running executor.
    const { data: stuckJobs, error: jobErr } = await dbClient
      .from("jobs")
      .select("id, status, job_type, role")
      .in("machine_id", machineIds)
      .eq("status", "dispatched");

    if (jobErr) {
      console.error("[local-agent] Error querying stuck jobs:", jobErr.message);
      return;
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log("[local-agent] No stuck jobs to recover");
      return;
    }

    console.log(`[local-agent] Found ${stuckJobs.length} stuck job(s) — resetting to queued`);

    for (const job of stuckJobs) {
      const { error: updateErr } = await dbClient
        .from("jobs")
        .update({
          status: "queued",
          machine_id: null,
          started_at: null,
        })
        .eq("id", job.id);

      if (updateErr) {
        console.error(`[local-agent] Failed to reset job ${job.id}: ${updateErr.message}`);
      } else {
        console.log(
          `[local-agent] Reset job ${job.id} (${job.status} → queued, role=${job.role ?? "none"})`,
        );
      }
    }
  } catch (err) {
    console.error("[local-agent] Job recovery failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Persistent agent discovery
// ---------------------------------------------------------------------------

async function discoverAndSpawnPersistentAgents(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string | undefined,
  companyId: string,
  executor: JobExecutor,
): Promise<void> {
  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/company-persistent-jobs?company_id=${encodeURIComponent(companyId)}`,
      {
        headers: {
          apikey: anonKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      }
    );

    if (!res.ok) {
      console.error(`[local-agent] Failed to fetch persistent jobs: HTTP ${res.status}`);
      return;
    }

    const jobs = (await res.json()) as Array<{
      role: string;
      prompt_stack: string;
      skills: string[];
      model: string;
      slot_type: string;
    }>;

    console.log(`[local-agent] Discovered ${jobs.length} persistent agent(s) for company ${companyId}`);

    for (const job of jobs) {
      await executor.spawnPersistentAgent(job, companyId);
    }
  } catch (err) {
    console.error(`[local-agent] Error during persistent agent discovery:`, err);
  }
}

main().catch((err) => {
  console.error("[local-agent] Fatal startup error:", err);
  process.exit(1);
});
