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

import { createWriteStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Tee all console output to a log file for debugging
const logPath = join(homedir(), ".zazigv2", "local-agent.log");
const logStream = createWriteStream(logPath, { flags: "a" });
const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
const ts = () => new Date().toISOString();
console.log = (...args: unknown[]) => { const line = `${ts()} ${args.join(" ")}\n`; logStream.write(line); origLog(...args); };
console.error = (...args: unknown[]) => { const line = `${ts()} ERROR ${args.join(" ")}\n`; logStream.write(line); origErr(...args); };
console.warn = (...args: unknown[]) => { const line = `${ts()} WARN ${args.join(" ")}\n`; logStream.write(line); origWarn(...args); };

// Prevent unhandled errors from crashing the process and killing all running jobs
process.on("unhandledRejection", (reason) => {
  console.error("[local-agent] Unhandled rejection (process NOT exiting):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[local-agent] Uncaught exception (process NOT exiting):", err);
});

import { loadConfig } from "./config.js";
import { SlotTracker } from "./slots.js";
import { AgentConnection } from "./connection.js";
import { JobExecutor, type PersistentAgentJobDefinition } from "./executor.js";
import { FixAgentManager } from "./fix-agent.js";
import { recoverDispatchedJobs } from "./job-recovery.js";
import { JobVerifier } from "./verifier.js";
import type { OrchestratorMessage, MessageInbound } from "@zazigv2/shared";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

  const verifier = new JobVerifier({
    repoDir: process.cwd(),
    machineId: config.name,
    send: (msg) => conn.sendMessage(msg),
  });

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
        executor.handleStartJob(msg).catch((err) => {
          console.error(`[local-agent] FATAL: handleStartJob crashed for jobId=${msg.jobId}:`, err);
        });
        break;

      case "stop_job":
        console.log(
          `[local-agent] Received stop_job — jobId=${msg.jobId}, reason=${msg.reason}`
        );
        executor.handleStopJob(msg).catch((err) => {
          console.error(`[local-agent] FATAL: handleStopJob crashed for jobId=${msg.jobId}:`, err);
        });
        break;

      case "health_check":
        console.log("[local-agent] Received health_check — heartbeat will be sent on next interval");
        break;

      case "message_inbound":
        console.log(`[local-agent] Received message_inbound — conversationId=${msg.conversationId}, from=${msg.from}`);
        executor.handleMessageInbound(msg as MessageInbound);
        break;

      case "job_unblocked":
        console.log(`[local-agent] Job ${msg.jobId} unblocked — answer: ${msg.answer.slice(0, 80)}`);
        void executor.handleJobUnblocked(msg);
        break;

      case "verify_job":
        console.log(
          `[local-agent] Received verify_job — jobId=${msg.jobId}, featureBranch=${msg.featureBranch}, jobBranch=${msg.jobBranch}`,
        );
        void verifier.verify(msg);
        break;

      // Legacy message types — orchestrator no longer sends these but they remain
      // in the OrchestratorMessage union for backward compatibility during rollout.
      case "deploy_to_test":
      case "teardown_test":
        console.warn(`[local-agent] Ignoring deprecated message type: ${msg.type}`);
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

  // Recover any jobs that were dispatched when we last went offline.
  // These are stuck because the Realtime broadcast was missed or the daemon was killed.
  await recoverDispatchedJobs(conn.dbClient, config.name, {
    gracePeriodMs: 0,
    companyIds: conn.companyIds,
  });

  // Discover and spawn persistent agents if ZAZIG_COMPANY_ID is set
  const companyId = process.env["ZAZIG_COMPANY_ID"];
  let rolePromptChannel: RealtimeChannel | null = null;
  if (companyId) {
    await discoverAndSpawnPersistentAgents(
      config.supabase.url,
      config.supabase.anon_key,
      companyId,
      executor,
    );

    rolePromptChannel = subscribeToRolePromptHotReload(
      conn,
      config.name,
      config.supabase.url,
      config.supabase.anon_key,
      companyId,
      executor,
    );
  }

  // ---------------------------------------------------------------------------
  // Graceful shutdown handlers
  // ---------------------------------------------------------------------------

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[local-agent] Received ${signal}, shutting down gracefully...`);
    if (rolePromptChannel) {
      try {
        await conn.supabase.removeChannel(rolePromptChannel);
      } catch (err) {
        console.warn("[local-agent] Failed to remove role prompt channel during shutdown:", err);
      }
      rolePromptChannel = null;
    }
    await executor.stopAll();
    await conn.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  console.log("[local-agent] Daemon running. Press Ctrl+C to stop.");
}

// ---------------------------------------------------------------------------
// Persistent agent discovery
// ---------------------------------------------------------------------------

async function fetchPersistentAgentDefinitions(
  supabaseUrl: string,
  anonKey: string,
  companyId: string,
): Promise<PersistentAgentJobDefinition[]> {
  // Edge Functions gateway verifies JWTs using the project's HS256 secret.
  // The Supabase Auth JWT (ES256) won't pass this check — use the anon key
  // as the Bearer token instead (it IS an HS256 JWT the gateway accepts).
  const url = `${supabaseUrl}/functions/v1/company-persistent-jobs?company_id=${encodeURIComponent(companyId)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Failed to fetch persistent jobs: HTTP ${res.status} — body: ${body.slice(0, 500)}`,
    );
  }

  const jobs = (await res.json()) as unknown;
  if (!Array.isArray(jobs)) {
    throw new Error("Persistent jobs endpoint returned non-array JSON");
  }

  return jobs as PersistentAgentJobDefinition[];
}

async function discoverAndSpawnPersistentAgents(
  supabaseUrl: string,
  anonKey: string,
  companyId: string,
  executor: JobExecutor,
): Promise<void> {
  try {
    const jobs = await fetchPersistentAgentDefinitions(supabaseUrl, anonKey, companyId);

    console.log(`[local-agent] Discovered ${jobs.length} persistent agent(s) for company ${companyId}`);

    for (const job of jobs) {
      await executor.spawnPersistentAgent(job, companyId);
    }
  } catch (err) {
    console.error(`[local-agent] Error during persistent agent discovery:`, err);
  }
}

function subscribeToRolePromptHotReload(
  conn: AgentConnection,
  machineId: string,
  supabaseUrl: string,
  anonKey: string,
  companyId: string,
  executor: JobExecutor,
): RealtimeChannel {
  const inFlightRoles = new Set<string>();
  const channelName = `agent:${machineId}:role-prompt-hot-reload`;
  const channel = conn.supabase
    .channel(channelName)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "roles" },
      (payload) => {
        void (async (): Promise<void> => {
          const nextRow = (payload.new ?? {}) as Record<string, unknown>;
          const prevRow = (payload.old ?? {}) as Record<string, unknown>;
          const role = typeof nextRow.name === "string" ? nextRow.name : "";
          const prevPrompt = typeof prevRow.prompt === "string" ? prevRow.prompt : "";
          const nextPrompt = typeof nextRow.prompt === "string" ? nextRow.prompt : "";

          if (!role || prevPrompt === nextPrompt) return;
          if (!executor.hasPersistentAgent(role)) {
            return;
          }
          if (inFlightRoles.has(role)) {
            console.log(`[local-agent] role prompt reload already running for role=${role} — skipping duplicate event`);
            return;
          }
          inFlightRoles.add(role);

          try {
            const jobs = await fetchPersistentAgentDefinitions(supabaseUrl, anonKey, companyId);
            const refreshed = jobs.find((job) => job.role === role);
            if (!refreshed) {
              console.log(
                `[local-agent] role prompt update ignored for role=${role} — role is not active/persistent in company ${companyId}`,
              );
              return;
            }

            await executor.reloadPersistentAgent(refreshed, companyId);
            console.log(`[local-agent] Hot-reloaded persistent agent for role=${role}`);
          } catch (err) {
            console.error(`[local-agent] Failed to hot-reload role=${role}:`, err);
          } finally {
            inFlightRoles.delete(role);
          }
        })();
      },
    );

  channel.subscribe((status, err) => {
    if (status === "SUBSCRIBED") {
      console.log(`[local-agent] Subscribed to role prompt hot-reload channel: ${channelName}`);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.error(`[local-agent] Role prompt hot-reload channel error (status=${status}):`, err ?? "unknown error");
    }
  });

  return channel;
}

main().catch((err) => {
  console.error("[local-agent] Fatal startup error:", err);
  process.exit(1);
});
