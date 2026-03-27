/**
 * @zazigv2/local-agent — Node.js daemon entry point
 *
 * Connects to Supabase and polls for job commands from the orchestrator.
 * Job execution is handled by a separate module (future card).
 *
 * Runtime: Node.js 20+
 * Start: node dist/index.js (or npm start from this package)
 *
 * Auth: Reads ~/.zazigv2/credentials.json for Supabase Auth JWT.
 * Config: env vars from `zazig start` or ~/.zazigv2/config.json (machine name + slots)
 */

import { createWriteStream } from "node:fs";
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

// Tee all console output to a per-company log file for debugging
const companySlug = process.env["ZAZIG_COMPANY_ID"]?.slice(0, 8) ?? "default";
const logPath = join(homedir(), ".zazigv2", `local-agent-${companySlug}.log`);
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
import { JobExecutor, type CompanyProject, type PersistentAgentJobDefinition } from "./executor.js";
import { ExpertSessionManager } from "./expert-session-manager.js";
import { FixAgentManager } from "./fix-agent.js";
import { MasterChangePoller } from "./master-change-poller.js";
import { JobVerifier } from "./verifier.js";
import { resolveAgentVersion } from "./version.js";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { OrchestratorMessage, MessageInbound, DaemonShutdownNotification, StartExpertMessage } from "@zazigv2/shared";
import type { RealtimeChannel } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

let shuttingDown = false;
const MASTER_CHANGE_POLL_INTERVAL_MS = 30_000;
const execFileAsync = promisify(execFile);

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
  const agentVersion = resolveAgentVersion();

  // Create and configure Realtime connection
  // Auth: AgentConnection reads SUPABASE_ACCESS_TOKEN from env (set by `zazig start`)
  // and uses it for authenticated DB writes. No explicit authenticate() call needed.
  const conn = new AgentConnection(config, slots, agentVersion);

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

  // Initialize expert session manager — handles interactive expert sessions
  const expertManager = new ExpertSessionManager({
    machineId: config.name,
    companyId: config.company_id ?? "",
    companyName: process.env["ZAZIG_COMPANY_NAME"] ?? "",
    supabase: conn.dbClient,
    supabaseUrl: config.supabase.url,
    supabaseAnonKey: config.supabase.anon_key,
    repoManager: executor.repoManager,
  });

  // Initialize fix agent manager — spawns ephemeral Claude sessions during testing phase
  const _fixAgentManager = new FixAgentManager(process.cwd());

  // Register message handler — dispatch StartJob/StopJob to executor
  conn.onMessage((msg: OrchestratorMessage) => {
    switch (msg.type) {
      case "start_job":
        if (shuttingDown) {
          console.log(`[local-agent] SHUTDOWN: Rejecting StartJob for jobId=${msg.jobId} — daemon is shutting down`);
          return;
        }
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
        console.log("[local-agent] Received health_check");
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

      case "start_expert":
        console.log(
          `[local-agent] Received start_expert — sessionId=${msg.session_id}`
        );
        expertManager.handleStartExpert(msg).catch((err) => {
          console.error(`[local-agent] FATAL: handleStartExpert crashed for session=${msg.session_id}:`, err);
        });
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

  // Start the connection (connects + begins poll loop)
  await conn.start();

  // Discover and spawn persistent agents if ZAZIG_COMPANY_ID is set
  const companyId = process.env["ZAZIG_COMPANY_ID"];
  let rolePromptChannel: RealtimeChannel | null = null;
  let masterChangePollTimer: ReturnType<typeof setInterval> | null = null;
  if (companyId) {
    await discoverAndSpawnPersistentAgents(
      config.supabase.url,
      config.supabase.anon_key,
      companyId,
      executor,
    );

    const pollers = executor
      .getCompanyProjects()
      .filter((project) => Boolean(project.repo_url))
      .map((project) =>
        new MasterChangePoller({
          repoPath: project.repo_url,
          execFileAsync: execFileAsync as typeof execFileAsync,
          fetchBareRepo: async () => {
            try {
              await executor.repoManager.refreshWorktree(project.name);
            } catch (err) {
              console.error("[git master refresh] Bare repo fetch failed:", err);
              throw err;
            }
          },
          getActiveSessions: () => executor.getMasterRefreshTargets(),
          broadcast: async (message, sessionNames) => {
            const notified = await executor.broadcastMasterRefreshNotification(message, sessionNames);
            console.log(`[git master refresh] Notified ${notified} active sessions`);
            return notified;
          },
        }),
      );

    masterChangePollTimer = setInterval(() => {
      for (const poller of pollers) {
        void poller.poll();
      }
    }, MASTER_CHANGE_POLL_INTERVAL_MS);

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
    if (shuttingDown) {
      console.log(`[local-agent] SHUTDOWN: Duplicate ${signal} signal ignored`);
      return;
    }
    shuttingDown = true;

    console.log(`[local-agent] SHUTDOWN: Received ${signal}`);

    // Remove role prompt channel first
    if (rolePromptChannel) {
      try {
        await conn.supabase.removeChannel(rolePromptChannel);
      } catch (err) {
        console.warn("[local-agent] Failed to remove role prompt channel during shutdown:", err);
      }
      rolePromptChannel = null;
    }
    if (masterChangePollTimer) {
      clearInterval(masterChangePollTimer);
      masterChangePollTimer = null;
    }

    const gracePeriodMs = parseInt(process.env["ZAZIG_GRACEFUL_SHUTDOWN_MS"] ?? "10000", 10);
    console.log(`[local-agent] SHUTDOWN: Grace period started (${gracePeriodMs}ms)`);

    // DB transition: executing → queued
    const activeJobIds = executor.getActiveJobIds().filter(id => !id.startsWith("persistent-"));
    for (const jobId of activeJobIds) {
      try {
        const { data, error } = await conn.dbClient
          .from("jobs")
          .update({ status: "queued", blocked_reason: "daemon shutdown — awaiting re-dispatch" })
          .eq("id", jobId)
          .eq("status", "executing")
          .select("id");

        if (error) {
          console.error(`[local-agent] SHUTDOWN: DB transition error for job ${jobId}:`, error);
        } else if (!data || data.length === 0) {
          console.log(`[local-agent] SHUTDOWN: Job ${jobId} already completed — skipping transition`);
        } else {
          console.log(`[local-agent] SHUTDOWN: Job ${jobId} transitioned to queued`);
        }
      } catch (err) {
        console.error(`[local-agent] SHUTDOWN: DB transition error for job ${jobId}:`, err);
      }
    }

    // Send DaemonShutdownNotification
    try {
      const notification: DaemonShutdownNotification = {
        type: "daemon_shutdown_notification",
        protocolVersion: PROTOCOL_VERSION,
        machineId: config.name,
        affectedJobIds: activeJobIds,
      };
      await conn.sendMessage(notification);
      console.log("[local-agent] SHUTDOWN: DaemonShutdownNotification sent");
    } catch (err) {
      console.error("[local-agent] SHUTDOWN: Failed to send DaemonShutdownNotification:", err);
    }

    // Grace period wait
    await new Promise<void>((resolve) => setTimeout(resolve, gracePeriodMs));
    console.log("[local-agent] SHUTDOWN: Grace period wait complete");

    // Force-kill remaining jobs
    console.log("[local-agent] SHUTDOWN: Force-kill phase start");
    expertManager.cleanup();
    await executor.stopAll();

    // Channel cleanup
    console.log("[local-agent] SHUTDOWN: Channel closure");
    const stopPromise = conn.stop();
    const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, 5000));
    await Promise.race([stopPromise, timeoutPromise]);

    console.log("[local-agent] SHUTDOWN: Exit");
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
): Promise<{ jobs: PersistentAgentJobDefinition[]; companyProjects: CompanyProject[] }> {
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

  const payload = (await res.json()) as unknown;
  if (Array.isArray(payload)) {
    return { jobs: payload as PersistentAgentJobDefinition[], companyProjects: [] };
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Persistent jobs endpoint returned invalid JSON payload");
  }

  const body = payload as Record<string, unknown>;
  const jobs =
    Array.isArray(body["jobs"]) ? body["jobs"] :
    Array.isArray(body["persistent_jobs"]) ? body["persistent_jobs"] :
    Array.isArray(body["persistentJobs"]) ? body["persistentJobs"] :
    [];

  const projects =
    Array.isArray(body["company_projects"]) ? body["company_projects"] :
    Array.isArray(body["companyProjects"]) ? body["companyProjects"] :
    Array.isArray(body["projects"]) ? body["projects"] :
    [];

  const companyProjects: CompanyProject[] = [];
  for (const project of projects) {
    if (!project || typeof project !== "object") continue;
    const record = project as Record<string, unknown>;
    const name = typeof record["name"] === "string" ? record["name"] : "";
    const repoUrl =
      typeof record["repo_url"] === "string" ? record["repo_url"] :
      typeof record["repoUrl"] === "string" ? record["repoUrl"] :
      "";

    if (!name || !repoUrl) continue;
    companyProjects.push({ name, repo_url: repoUrl });
  }

  return { jobs: jobs as PersistentAgentJobDefinition[], companyProjects };
}

async function discoverAndSpawnPersistentAgents(
  supabaseUrl: string,
  anonKey: string,
  companyId: string,
  executor: JobExecutor,
): Promise<void> {
  try {
    const { jobs, companyProjects } = await fetchPersistentAgentDefinitions(supabaseUrl, anonKey, companyId);

    console.log(`[local-agent] Discovered ${jobs.length} persistent agent(s) for company ${companyId}`);
    console.log(`[local-agent] Discovered ${companyProjects.length} project repo(s) for company ${companyId}`);

    for (const project of companyProjects) {
      try {
        await executor.repoManager.ensureRepo(project.repo_url, project.name);
        await executor.repoManager.ensureWorktree(project.name);
      } catch (err) {
        console.error(`[local-agent] Failed to initialize worktree for project ${project.name}:`, err);
      }
    }

    executor.setCompanyProjects(companyProjects);

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
  const channelName = `agent:${machineId}:${companyId}:role-prompt-hot-reload`;
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
            const { jobs } = await fetchPersistentAgentDefinitions(supabaseUrl, anonKey, companyId);
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
