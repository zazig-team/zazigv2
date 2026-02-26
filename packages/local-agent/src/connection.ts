/**
 * connection.ts — Supabase Realtime connection manager
 *
 * Manages two Realtime channels for bidirectional orchestrator communication:
 *   - Inbound:  `agent:${machineId}`     — receives StartJob/StopJob/HealthCheck from orchestrator
 *   - Outbound: `orchestrator:commands`   — sends Heartbeat/JobAck/JobComplete/JobFailed to orchestrator
 *
 * Handles:
 *   - Dual-channel subscription with coordinated readiness
 *   - Exponential backoff on disconnect (capped at 30 s)
 *   - Heartbeat every HEARTBEAT_INTERVAL_MS (30 s)
 *   - Incoming OrchestratorMessage validation + dispatch to handlers
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import WebSocket from "ws";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { HEARTBEAT_INTERVAL_MS, PROTOCOL_VERSION, isOrchestratorMessage } from "@zazigv2/shared";
import type { OrchestratorMessage, Heartbeat, AgentMessage } from "@zazigv2/shared";
import type { MachineConfig } from "./config.js";
import type { SlotTracker } from "./slots.js";
import { recoverDispatchedJobs } from "./job-recovery.js";

const CREDENTIALS_PATH = join(homedir(), ".zazigv2", "credentials.json");

// Backoff constants
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

export type MessageHandler = (msg: OrchestratorMessage) => void;

export class AgentConnection {
  /** Anon-key client — used for Realtime subscriptions only. */
  readonly supabase: SupabaseClient;
  /** Service-role client for direct DB writes (bypasses RLS). Falls back to anon client if service_role_key not set. */
  readonly dbClient: SupabaseClient;
  private readonly machineId: string;
  private readonly primaryCompanyId: string | undefined;
  public companyIds: string[] = [];
  private readonly config: MachineConfig;
  private readonly slots: SlotTracker;
  private readonly handlers: MessageHandler[] = [];

  /** Inbound channel: `agent:{machineId}` — receives commands from orchestrator. */
  private channel: RealtimeChannel | null = null;
  /** Outbound channel: `orchestrator:commands` — sends messages to orchestrator. */
  private outChannel: RealtimeChannel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private stopped = false;
  private isRecoveryRunning = false;

  constructor(config: MachineConfig, slots: SlotTracker) {
    this.config = config;
    this.machineId = config.name;
    this.primaryCompanyId = config.company_id;
    this.slots = slots;
    this.supabase = createClient(config.supabase.url, config.supabase.anon_key, {
      realtime: {
        // Node.js requires an explicit WebSocket implementation; the ws package
        // types don't perfectly align with supabase-js's WebSocketLikeConstructor.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        transport: WebSocket as any,
        params: {
          eventsPerSecond: 10,
        },
      },
    });

    // Prefer authenticated JWT with auto-refresh for DB writes (respects RLS).
    // Fall back to service_role key (bypasses RLS), then anon client.
    if (config.supabase.access_token && config.supabase.refresh_token) {
      // Create client with autoRefreshToken enabled (default).
      // We'll call auth.setSession() in start() to activate the managed session.
      this.dbClient = createClient(config.supabase.url, config.supabase.anon_key);
      console.log("[local-agent] Using authenticated JWT with auto-refresh for DB writes");
    } else if (config.supabase.access_token) {
      // No refresh token — fall back to static header (will expire after ~1h)
      this.dbClient = createClient(config.supabase.url, config.supabase.anon_key, {
        global: { headers: { Authorization: `Bearer ${config.supabase.access_token}` } },
      });
      console.warn("[local-agent] No refresh token — JWT will expire after ~1h");
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

  /**
   * Send an AgentMessage to the orchestrator via the `orchestrator:commands` channel.
   * The orchestrator subscribes to this channel and dispatches by message type.
   */
  async sendMessage(msg: AgentMessage): Promise<void> {
    if (!this.outChannel || this.stopped) {
      console.warn("[local-agent] sendMessage called but outbound channel is not connected; message dropped:", msg.type);
      return;
    }
    const result = await this.outChannel.send({
      type: "broadcast",
      event: "message",
      payload: msg,
    });
    if (result !== "ok") {
      console.warn(`[local-agent] sendMessage returned: ${result} for type=${msg.type}`);
    } else {
      console.log(`[local-agent] Sent ${msg.type} for jobId=${"jobId" in msg ? msg.jobId : "n/a"}`);
    }
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

  /** Connect to Supabase Realtime and start the heartbeat loop. */
  async start(): Promise<void> {
    console.log(`[local-agent] Starting daemon for machine: ${this.machineId}`);
    this.stopped = false;

    // Initialize managed auth session for automatic token refresh.
    // supabase-js will refresh the access token ~10s before expiry.
    if (this.config.supabase.access_token && this.config.supabase.refresh_token) {
      const { error } = await this.dbClient.auth.setSession({
        access_token: this.config.supabase.access_token,
        refresh_token: this.config.supabase.refresh_token,
      });
      if (error) {
        console.warn(`[local-agent] Failed to set auth session: ${error.message}`);
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

    await this.connect();
  }

  /** Gracefully disconnect and stop all timers. */
  async stop(): Promise<void> {
    this.stopped = true;
    this.clearReconnectTimer();
    this.clearHeartbeatTimer();
    if (this.outChannel) {
      await this.supabase.removeChannel(this.outChannel);
      this.outChannel = null;
    }
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    console.log(`[local-agent] Daemon stopped.`);
  }

  // ---------------------------------------------------------------------------
  // Private connection management
  // ---------------------------------------------------------------------------

  private async connect(): Promise<void> {
    if (this.stopped) return;

    const channelName = `agent:${this.machineId}`;
    const outChannelName = "orchestrator:commands";
    console.log(`[local-agent] Connecting to channels: ${channelName} (in), ${outChannelName} (out)`);

    // Inbound channel: receives commands from orchestrator
    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false },
      },
    });

    // Catch-all: log every broadcast event received on this channel
    this.channel.on("broadcast", { event: "*" }, (payload) => {
      console.log(`[local-agent][DEBUG] Broadcast received — event=${(payload as Record<string, unknown>).event ?? "unknown"}, keys=${Object.keys(payload)}`);
    });

    // Listen for broadcast messages from the orchestrator
    this.channel.on("broadcast", { event: "message" }, (payload) => {
      console.log(`[local-agent][DEBUG] Matched event=message`);
      this.handleIncomingPayload(payload.payload);
    });

    // Also listen for named events (orchestrator sends with event matching the message type)
    this.channel.on("broadcast", { event: "start_job" }, (payload) => {
      console.log(`[local-agent][DEBUG] Matched event=start_job`);
      this.handleIncomingPayload(payload.payload);
    });

    this.channel.on("broadcast", { event: "verify_job" }, (payload) => {
      console.log(`[local-agent][DEBUG] Matched event=verify_job`);
      this.handleIncomingPayload(payload.payload);
    });

    this.channel.on("broadcast", { event: "deploy_to_test" }, (payload) => {
      console.log(`[local-agent][DEBUG] Matched event=deploy_to_test`);
      this.handleIncomingPayload(payload.payload);
    });

    this.channel.on("broadcast", { event: "job_unblocked" }, (payload) => {
      console.log(`[local-agent][DEBUG] Matched event=job_unblocked`);
      this.handleIncomingPayload(payload.payload);
    });

    this.channel.on("broadcast", { event: "message_inbound" }, (payload) => {
      console.log(`[local-agent][DEBUG] Matched event=message_inbound`);
      this.handleIncomingPayload(payload.payload);
    });

    this.channel.on("broadcast", { event: "teardown_test" }, (payload) => {
      console.log(`[local-agent][DEBUG] Matched event=teardown_test`);
      this.handleIncomingPayload(payload.payload);
    });

    // Outbound channel: sends heartbeats/job updates to orchestrator
    this.outChannel = this.supabase.channel(outChannelName, {
      config: {
        broadcast: { ack: false },
      },
    });

    // Subscribe to both channels; start heartbeat once both are ready
    let inReady = false;
    let outReady = false;

    const onBothReady = (): void => {
      if (inReady && outReady) {
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      }
    };

    this.outChannel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[local-agent] Connected to outbound channel: ${outChannelName}`);
        outReady = true;
        onBothReady();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[local-agent] Outbound channel error (status=${status}):`, err ?? "unknown error");
        this.clearHeartbeatTimer();
        this.scheduleReconnect();
      }
    });

    this.channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[local-agent] Connected to inbound channel: ${channelName}`);
        inReady = true;
        onBothReady();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[local-agent] Inbound channel error (status=${status}):`, err ?? "unknown error");
        this.clearHeartbeatTimer();
        this.scheduleReconnect();
      } else if (status === "CLOSED") {
        if (!this.stopped) {
          console.warn(`[local-agent] Inbound channel closed unexpectedly. Scheduling reconnect.`);
          this.clearHeartbeatTimer();
          this.scheduleReconnect();
        }
      }
    });
  }

  private handleIncomingPayload(payload: unknown): void {
    if (!isOrchestratorMessage(payload)) {
      console.warn("[local-agent] Received invalid/unknown message, ignoring:", JSON.stringify(payload));
      return;
    }

    console.log(`[local-agent] Received message: type=${payload.type}`, JSON.stringify(payload));

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
      // Log channel state alongside heartbeat for debugging
      const inState = this.channel?.state ?? "null";
      console.log(`[local-agent][DEBUG] Channel state: inbound=${inState}, machineId=${this.machineId}`);
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
      name: this.machineId,
      status: "online",
      last_heartbeat: new Date().toISOString(),
      slots_claude_code: slotsAvailable.claude_code,
      slots_codex: slotsAvailable.codex,
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

    const slotsAvailable = this.slots.getAvailable();
    // Primary: write heartbeat directly to the DB — reliable, no timing dependency
    // Update all company rows so the orchestrator sees this machine as online for every company.
    const updatePayload = {
      last_heartbeat: new Date().toISOString(),
      status: "online",
      slots_claude_code: slotsAvailable.claude_code,
      slots_codex: slotsAvailable.codex,
    };

    let dbErr: Error | null = null;
    if (this.companyIds.length > 0) {
      const { error } = await this.dbClient
        .from("machines")
        .update(updatePayload)
        .eq("name", this.machineId)
        .in("company_id", this.companyIds);
      if (error) dbErr = error;
    } else {
      const { error } = await this.dbClient
        .from("machines")
        .update(updatePayload)
        .eq("name", this.machineId);
      if (error) dbErr = error;
    }

    if (dbErr) {
      console.warn(`[local-agent] Heartbeat DB write failed: ${dbErr.message}`);
    }

    // Secondary: also broadcast via Realtime (for orchestrator live monitoring)
    if (this.outChannel) {
      const heartbeat: Heartbeat = {
        type: "heartbeat",
        protocolVersion: PROTOCOL_VERSION,
        machineId: this.machineId,
        slotsAvailable,
      };

      await this.outChannel.send({
        type: "broadcast",
        event: "message",
        payload: heartbeat,
      });
    }

    if (dbErr) {
      console.warn(
        `[local-agent] Heartbeat FAILED — machineId=${this.machineId}, ` +
          `slots=${JSON.stringify(slotsAvailable)}, db=FAIL`
      );
    }

    // --- Job recovery poll ---
    // Check for dispatched jobs that were missed due to Realtime drops.
    // Resets them to queued so the orchestrator re-dispatches on next tick.
    // Skip if previous recovery poll is still in-flight (DB slow).
    if (!this.isRecoveryRunning) {
      this.isRecoveryRunning = true;
      try {
        const recovered = await recoverDispatchedJobs(
          this.dbClient,
          this.machineId,
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

  // ---------------------------------------------------------------------------
  // Reconnection with exponential backoff
  // ---------------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.clearReconnectTimer();

    const delay = Math.min(
      BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, this.reconnectAttempts),
      BACKOFF_MAX_MS
    );
    this.reconnectAttempts++;

    console.log(
      `[local-agent] Reconnecting in ${delay}ms (attempt #${this.reconnectAttempts})...`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.outChannel) {
        try { await this.supabase.removeChannel(this.outChannel); } catch { /* best-effort */ }
        this.outChannel = null;
      }
      if (this.channel) {
        try { await this.supabase.removeChannel(this.channel); } catch { /* best-effort */ }
        this.channel = null;
      }
      await this.connect();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
