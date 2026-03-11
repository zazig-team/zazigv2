/**
 * connection.ts — local-agent connection manager
 *
 * Manages inbound polling and outbound HTTP delivery:
 *   - Inbound HTTP poll: `functions/v1/agent-inbound-poll` — receives orchestrator messages
 *   - Outbound HTTP:     `functions/v1/agent-event`        — sends Heartbeat/JobAck/JobComplete/JobFailed
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { HEARTBEAT_INTERVAL_MS, MACHINE_DEAD_THRESHOLD_MS, PROTOCOL_VERSION, isOrchestratorMessage } from "@zazigv2/shared";
import { jobLog } from "./executor.js";
import type { OrchestratorMessage, Heartbeat, AgentMessage, FailureReason } from "@zazigv2/shared";
import type { MachineConfig } from "./config.js";
import type { SlotTracker } from "./slots.js";
import { recoverDispatchedJobs } from "./job-recovery.js";

const CREDENTIALS_PATH = join(homedir(), ".zazigv2", "credentials.json");
const execFileAsync = promisify(execFile);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type MessageHandler = (msg: OrchestratorMessage) => void;

export class AgentConnection {
  /** Anon-key client used as DB fallback when no JWT/service role key is configured. */
  readonly supabase: SupabaseClient;
  /** Service-role client for direct DB writes (bypasses RLS). Falls back to anon client if service_role_key not set. */
  readonly dbClient: SupabaseClient;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly machineName: string;
  private readonly primaryCompanyId: string | undefined;
  private readonly agentVersion: string;
  public companyIds: string[] = [];
  private readonly config: MachineConfig;
  private readonly slots: SlotTracker;
  private readonly handlers: MessageHandler[] = [];

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private stopped = false;
  private isRecoveryRunning = false;
  private consecutiveHeartbeatFailures = 0;
  private lastHeartbeatSentAt: number = Date.now();
  private killStaleJobsFn?: (reason: FailureReason) => Promise<number>;
  private outdated = false;
  private outdatedShutdownInProgress = false;

  constructor(config: MachineConfig, slots: SlotTracker, agentVersion: string) {
    this.config = config;
    this.supabaseUrl = config.supabase.url;
    this.supabaseAnonKey = config.supabase.anon_key;
    this.machineName = config.name;
    this.primaryCompanyId = config.company_id;
    this.agentVersion = agentVersion;
    this.slots = slots;

    if (config.supabase.access_token && !config.supabase.refresh_token) {
      throw new Error("[local-agent] refresh_token is required when access_token is set — daemon refused to start");
    }

    this.supabase = createClient(config.supabase.url, config.supabase.anon_key);

    // Prefer authenticated JWT with auto-refresh for DB writes (respects RLS).
    // Fall back to service_role key (bypasses RLS), then anon client.
    if (config.supabase.access_token && config.supabase.refresh_token) {
      // Create client with autoRefreshToken enabled (default).
      // We'll call auth.setSession() in start() to activate the managed session.
      this.dbClient = createClient(config.supabase.url, config.supabase.anon_key);
      console.log("[local-agent] Using authenticated JWT with auto-refresh for DB writes");
    } else if (config.supabase.service_role_key) {
      this.dbClient = createClient(config.supabase.url, config.supabase.service_role_key);
      console.log("[local-agent] Using service_role key for DB writes");
    } else {
      this.dbClient = this.supabase;
      console.warn("[local-agent] No access token or service_role key set — DB writes will use anon key (may fail)");
    }
  }

  /** Register a handler for incoming OrchestratorMessages. */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  public setKillStaleJobsFn(fn: (reason: FailureReason) => Promise<number>): void {
    this.killStaleJobsFn = fn;
  }

  /**
   * Send an AgentMessage to the orchestrator via the `agent-event` edge function.
   */
  async sendMessage(msg: AgentMessage): Promise<void> {
    if (this.stopped) {
      console.warn("[local-agent] sendMessage called while stopped; message dropped:", msg.type);
      return;
    }
    await this.sendToOrchestrator(msg);
  }

  private async sendToOrchestrator(msg: AgentMessage): Promise<boolean> {
    const url = `${this.config.supabase.url}/functions/v1/agent-event`;
    const { data: { session } } = await this.dbClient.auth.getSession();
    const token = session?.access_token ?? this.config.supabase.anon_key;

    for (const delay of [0, 1000, 5000, 15000]) {
      if (delay > 0) await sleep(delay);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(msg),
        });

        if (res.ok) return true;
        console.warn(`[local-agent] agent-event failed (${res.status}), retrying...`);
      } catch (e) {
        console.warn(`[local-agent] agent-event error: ${e}, retrying...`);
      }
    }

    console.error("[local-agent] agent-event failed after 3 retries");
    return false;
  }

  /**
   * Query user_companies to get all companies the authenticated user belongs to.
   * Falls back to config.company_id if the query fails or returns nothing.
   *
   * IMPORTANT: Only queries when using an authenticated JWT (RLS filters by user).
   * With service_role key, RLS is bypassed and the query would return ALL companies
   * for ALL users — causing this machine to register under other users' companies.
   */
  async getCompanyIds(): Promise<string[]> {
    // Service-role client bypasses RLS — cannot safely query user_companies.
    // Fall back to config.company_id (caller handles the empty-array case).
    if (!this.config.supabase.access_token) {
      console.warn("[local-agent] No access token — skipping user_companies query (service_role would bypass RLS)");
      return [];
    }

    try {
      const { data } = await this.dbClient
        .from("user_companies")
        .select("company_id");
      return (data ?? []).map(r => r.company_id);
    } catch (err) {
      console.warn(`[local-agent] Failed to query user_companies: ${String(err)}`);
      return [];
    }
  }

  /** Start heartbeat and inbound poll loop. */
  async start(): Promise<void> {
    console.log(`[local-agent] Starting daemon for machine: ${this.machineName}`);
    this.stopped = false;

    // Initialize managed auth session for automatic token refresh.
    // supabase-js will refresh the access token ~10s before expiry.
    if (this.config.supabase.access_token && this.config.supabase.refresh_token) {
      const { error } = await this.dbClient.auth.setSession({
        access_token: this.config.supabase.access_token,
        refresh_token: this.config.supabase.refresh_token,
      });
      if (error) {
        throw new Error(`[local-agent] Failed to set auth session: ${error.message}`);
      } else {
        console.log("[local-agent] Auth session initialized — auto-refresh enabled");
      }

      // Write refreshed tokens back to credentials.json so CLI commands also benefit.
      this.dbClient.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token && session?.refresh_token) {
          try {
            // Read existing credentials to preserve email and other fields
            let existing: Record<string, unknown> = {};
            try {
              existing = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
            } catch { /* file may not exist yet */ }

            const creds = {
              ...existing,
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
              email: session.user?.email ?? existing.email,
              supabaseUrl: this.config.supabase.url,
            };
            mkdirSync(join(homedir(), ".zazigv2"), { recursive: true });
            writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
            console.log(`[local-agent] Credentials refreshed and saved to disk`);
          } catch (err) {
            console.warn(`[local-agent] Failed to save refreshed credentials: ${String(err)}`);
          }
        }
      });
    }

    // Discover all companies for the authenticated user
    const discovered = await this.getCompanyIds();
    if (discovered.length > 0) {
      this.companyIds = discovered;
      console.log(`[local-agent] User belongs to ${discovered.length} company(ies): ${discovered.join(", ")}`);
    } else if (this.primaryCompanyId) {
      this.companyIds = [this.primaryCompanyId];
      console.warn("[local-agent] Could not discover companies from user_companies — falling back to config.company_id");
    } else {
      console.warn("[local-agent] No companies found and no company_id in config — heartbeats may fail");
      this.companyIds = [];
    }

    if (!this.config.supabase.access_token && !this.config.supabase.service_role_key) {
      console.warn("[local-agent] No access token set — multi-company lookup requires an authenticated JWT");
    }

    // Register/upsert machine row so heartbeats and status queries work
    await this.registerMachine();

    this.startHeartbeat();
    this.startPollLoop();
  }

  /** Gracefully disconnect and stop all timers. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.clearHeartbeatTimer();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    console.log(`[local-agent] Daemon stopped.`);
  }

  private startPollLoop(): void {
    void this.poll();
    this.pollInterval = setInterval(() => {
      void this.poll();
    }, 10_000);
  }

  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      if (!this.primaryCompanyId) {
        console.warn("[Connection] Poll skipped: missing primary company id");
        return;
      }

      const url = `${this.supabaseUrl}/functions/v1/agent-inbound-poll`;
      const { data: { session } } = await this.dbClient.auth.getSession();
      const token = session?.access_token ?? this.supabaseAnonKey;
      const slotsAvailable = this.slots.getAvailable();

      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          machine_name: this.machineName,
          company_id: this.primaryCompanyId,
          slots_available: slotsAvailable,
          agent_version: this.agentVersion,
        }),
      });
      if (!response.ok) {
        console.warn(`[Connection] Poll failed: ${response.status} ${response.statusText}`);
        return;
      }
      const result = await response.json() as { jobs?: unknown[]; heartbeat?: string };
      const jobs = result.jobs ?? [];
      for (const item of jobs) {
        this.handleIncomingPayload(item);
      }
    } catch (err) {
      console.warn(`[Connection] Poll unreachable: ${String(err)}`);
    } finally {
      this.isPolling = false;
    }
  }

  private handleIncomingPayload(payload: unknown): void {
    if (!isOrchestratorMessage(payload)) {
      const obj = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
      const jobId = typeof obj.jobId === "string" ? obj.jobId : undefined;
      const msgType = typeof obj.type === "string" ? obj.type : "unknown";
      const cardType = typeof obj.cardType === "string" ? obj.cardType : undefined;
      console.warn(
        `[local-agent] Rejected invalid message: type=${msgType}, jobId=${jobId ?? "none"}, cardType=${cardType ?? "none"}. ` +
        `Full payload: ${JSON.stringify(payload)}`,
      );
      if (jobId) {
        // Write to per-job log so it's findable
        try {
          const logDir = join(homedir(), ".zazigv2", "job-logs");
          mkdirSync(logDir, { recursive: true });
          appendFileSync(
            join(logDir, `${jobId}-pre-post.log`),
            `${new Date().toISOString()} REJECTED by validator: type=${msgType}, cardType=${cardType ?? "none"}\n`,
          );
        } catch { /* best-effort */ }
      }
      return;
    }

    if (this.outdated && (payload.type === "start_job" || payload.type === "start_expert")) {
      console.warn(
        `[local-agent] Ignoring ${payload.type} while agent is outdated and awaiting upgrade`
      );
      return;
    }

    console.log(`[local-agent] Received message: type=${payload.type}`, JSON.stringify(payload));

    // Log to per-job file immediately so every message is traceable from arrival
    if ("jobId" in payload && typeof payload.jobId === "string") {
      const msg = payload as unknown as Record<string, unknown>;
      jobLog(payload.jobId, `RECV from orchestrator: type=${payload.type}, slotType=${msg.slotType ?? "none"}, role=${msg.role ?? "none"}, cardType=${msg.cardType ?? "none"}`);
    }

    for (const handler of this.handlers) {
      try {
        handler(payload);
      } catch (err) {
        console.error("[local-agent] Message handler threw:", err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Heartbeat
  // ---------------------------------------------------------------------------

  private startHeartbeat(): void {
    this.clearHeartbeatTimer();
    // Send immediately, then on interval
    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async registerMachine(): Promise<void> {
    if (this.companyIds.length === 0) {
      console.warn("[local-agent] No companies — skipping machine registration");
      return;
    }

    const slotsAvailable = this.slots.getAvailable();
    const row = {
      name: this.machineName,
      status: "online",
      last_heartbeat: new Date().toISOString(),
      slots_claude_code: slotsAvailable.claude_code,
      slots_codex: slotsAvailable.codex,
      agent_version: this.agentVersion,
    };

    let failures = 0;
    for (const companyId of this.companyIds) {
      const { error } = await this.dbClient
        .from("machines")
        .upsert(
          { ...row, company_id: companyId },
          { onConflict: "company_id,name" }
        );
      if (error) {
        console.warn(`[local-agent] Machine registration failed for company ${companyId}: ${error.message}`);
        failures++;
      }
    }

    if (failures === 0) {
      console.log(`[local-agent] Machine registered for ${this.companyIds.length} company(ies)`);
    } else {
      console.warn(`[local-agent] Machine registration: ${this.companyIds.length - failures}/${this.companyIds.length} succeeded`);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.stopped) return;

    const now = Date.now();
    const gapMs = now - this.lastHeartbeatSentAt;
    if (gapMs > MACHINE_DEAD_THRESHOLD_MS) {
      const gapMin = (gapMs / 60_000).toFixed(1);
      const runningJobs = this.killStaleJobsFn ? await this.killStaleJobsFn("daemon_heartbeat_gap") : 0;
      console.log(`[local-agent] Killing ${runningJobs} jobs — heartbeat gap of ${gapMin}m detected (likely sleep/network loss)`);
    }
    this.lastHeartbeatSentAt = now;

    const slotsAvailable = this.slots.getAvailable();
    const env = process.env["ZAZIG_ENV"] ?? "production";
    try {
      const { data: latestVersion, error: latestVersionErr } = await this.dbClient
        .from("agent_versions")
        .select("version")
        .eq("env", env)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestVersionErr) {
        console.warn(`[local-agent] Failed to query latest agent version for env=${env}: ${latestVersionErr.message}`);
      } else if (latestVersion && latestVersion.version !== this.agentVersion) {
        this.onOutdatedDetected(this.agentVersion, latestVersion.version);
      }
    } catch (err) {
      console.warn(`[local-agent] Failed to query latest agent version for env=${env}: ${String(err)}`);
    }

    // Send heartbeat event to orchestrator via edge function.
    const heartbeat: Heartbeat = {
      type: "heartbeat",
      protocolVersion: PROTOCOL_VERSION,
      machineName: this.machineName,
      slotsAvailable,
    };
    const heartbeatOk = await this.sendToOrchestrator(heartbeat);
    if (heartbeatOk) {
      this.consecutiveHeartbeatFailures = 0;
    } else {
      this.consecutiveHeartbeatFailures++;
      console.error(
        `[local-agent] Heartbeat failure ${this.consecutiveHeartbeatFailures}/5 — machineName=${this.machineName}`
      );
      if (this.consecutiveHeartbeatFailures >= 5) {
        console.error(
          `[local-agent] 5 consecutive heartbeat failures — exiting for supervisor restart`
        );
        process.exit(1);
      }
    }

    // --- Job recovery poll ---
    // Check for dispatched jobs that were missed due to poll drops.
    // Resets them to queued so the orchestrator re-dispatches on next tick.
    // Skip if previous recovery poll is still in-flight (DB slow).
    if (!this.isRecoveryRunning) {
      this.isRecoveryRunning = true;
      try {
        const recovered = await recoverDispatchedJobs(
          this.dbClient,
          this.machineName,
          { companyIds: this.companyIds },
        );
        if (recovered > 0) {
          console.log(`[local-agent] Heartbeat recovered ${recovered} missed job(s)`);
        }
      } catch (err) {
        console.warn(`[local-agent] Job recovery poll failed:`, err);
      } finally {
        this.isRecoveryRunning = false;
      }
    }
  }

  private onOutdatedDetected(currentVersion: string, requiredVersion: string): void {
    if (this.outdatedShutdownInProgress) return;
    this.outdatedShutdownInProgress = true;
    this.outdated = true;

    const mismatchMessage =
      `ERROR: Agent version mismatch — local: ${currentVersion}, backend: ${requiredVersion}. Shutting down. Restart with updated code.`;
    console.error(`[local-agent] ${mismatchMessage}`);
    process.stderr.write(`${mismatchMessage}\n`);

    void this.shutdownForVersionMismatch();
  }

  private async shutdownForVersionMismatch(): Promise<void> {
    try {
      await this.closeOutdatedInteractiveSessions();
      await this.stop();
    } catch (err) {
      console.error("[local-agent] Failed during version mismatch shutdown:", err);
    } finally {
      process.exit(1);
    }
  }

  private async closeOutdatedInteractiveSessions(): Promise<void> {
    let sessions: string[] = [];
    try {
      const { stdout } = await execFileAsync("tmux", ["list-sessions", "-F", "#{session_name}"], { encoding: "utf8" });
      sessions = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    } catch (err) {
      console.warn(`[local-agent] Could not enumerate tmux sessions while outdated: ${String(err)}`);
      return;
    }

    const companyPrefixes = new Set<string>();
    if (this.primaryCompanyId) companyPrefixes.add(this.primaryCompanyId.slice(0, 8));
    for (const companyId of this.companyIds) {
      companyPrefixes.add(companyId.slice(0, 8));
    }

    const targets = sessions.filter((sessionName) => {
      if (sessionName.startsWith("expert-")) return true;
      if (sessionName === `${this.machineName}-cpo`) return true;
      if (sessionName === `${this.machineName}-cto`) return true;
      for (const prefix of companyPrefixes) {
        if (sessionName === `${this.machineName}-${prefix}-cpo`) return true;
        if (sessionName === `${this.machineName}-${prefix}-cto`) return true;
      }
      return false;
    });

    for (const sessionName of targets) {
      try {
        await execFileAsync("tmux", ["kill-session", "-t", sessionName], { encoding: "utf8" });
        console.warn(`[local-agent] Closed interactive tmux session while outdated: ${sessionName}`);
      } catch (err) {
        console.warn(`[local-agent] Failed to close tmux session ${sessionName}: ${String(err)}`);
      }
    }
  }

}
