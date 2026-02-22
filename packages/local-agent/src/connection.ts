/**
 * connection.ts — Supabase Realtime connection manager
 *
 * Manages two Realtime channels for bidirectional orchestrator communication:
 *   - Inbound:  `agent:${machineId}`     — receives StartJob/StopJob/HealthCheck from orchestrator
 *   - Outbound: `orchestrator:commands`   — sends Heartbeat/JobAck/JobComplete/JobFailed to orchestrator
 *
 * Auth: Uses an authenticated Supabase client (user JWT) for both Realtime
 * subscriptions and DB writes. No service-role key required.
 *
 * Handles:
 *   - Dual-channel subscription with coordinated readiness
 *   - Exponential backoff on disconnect (capped at 30 s)
 *   - Heartbeat every HEARTBEAT_INTERVAL_MS (30 s)
 *   - Incoming OrchestratorMessage validation + dispatch to handlers
 *   - Automatic JWT refresh via Supabase Auth
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
import WebSocket from "ws";
import { HEARTBEAT_INTERVAL_MS, PROTOCOL_VERSION, isOrchestratorMessage } from "@zazigv2/shared";
import type { OrchestratorMessage, Heartbeat, AgentMessage } from "@zazigv2/shared";
import type { MachineConfig } from "./config.js";
import type { SlotTracker } from "./slots.js";

// Backoff constants
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_MULTIPLIER = 2;

export type MessageHandler = (msg: OrchestratorMessage) => void;

export class AgentConnection {
  /** Authenticated Supabase client — used for both Realtime and DB operations. */
  readonly supabase: SupabaseClient;
  /** DB client for writes — same authenticated client (RLS enforced). */
  readonly dbClient: SupabaseClient;
  private readonly machineId: string;
  private readonly companyId: string;
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

  constructor(config: MachineConfig, slots: SlotTracker) {
    this.config = config;
    this.machineId = config.name;
    this.companyId = config.company_id;
    this.slots = slots;

    // Create Supabase client — will be authenticated in authenticate()
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

    // Single authenticated client for all operations (Realtime + DB writes)
    // RLS enforces company_id scoping automatically via the JWT claim.
    this.dbClient = this.supabase;
  }

  /**
   * Authenticate the Supabase client using stored JWT credentials.
   * Must be called before start().
   */
  async authenticate(): Promise<void> {
    const { auth } = this.config;
    console.log("[local-agent] Authenticating with Supabase Auth...");

    const { data, error } = await this.supabase.auth.setSession({
      access_token: auth.accessToken,
      refresh_token: auth.refreshToken,
    });

    if (error || !data.session) {
      throw new Error(
        `Supabase Auth failed: ${error?.message ?? "no session returned"}. Run 'zazig login' to re-authenticate.`
      );
    }

    console.log("[local-agent] Authenticated as user " + data.session.user.email);

    // Listen for token refresh events to persist updated credentials
    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) {
        console.log("[local-agent] JWT refreshed automatically");
        // Best-effort persist — don't fail if write fails
        try {
          const credsPath = join(homedir(), ".zazigv2", "credentials.json");
          const raw = readFileSync(credsPath, "utf-8");
          const creds = JSON.parse(raw);
          creds.accessToken = session.access_token;
          creds.refreshToken = session.refresh_token;
          mkdirSync(join(homedir(), ".zazigv2"), { recursive: true });
          writeFileSync(credsPath, JSON.stringify(creds, null, 2) + "\n", { mode: 0o600 });
        } catch (err) {
          console.warn("[local-agent] Failed to persist refreshed credentials:", err);
        }
      }
    });
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

  /** Connect to Supabase Realtime and start the heartbeat loop. */
  async start(): Promise<void> {
    console.log(`[local-agent] Starting daemon for machine: ${this.machineId}`);
    this.stopped = false;
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

    // Listen for broadcast messages from the orchestrator
    this.channel.on("broadcast", { event: "message" }, (payload) => {
      this.handleIncomingPayload(payload.payload);
    });

    // Also listen for start_job events (orchestrator sends with event: "start_job")
    this.channel.on("broadcast", { event: "start_job" }, (payload) => {
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
      void this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private clearHeartbeatTimer(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (this.stopped) return;

    const slotsAvailable = this.slots.getAvailable();
    // Write heartbeat directly to the DB via authenticated client (RLS-scoped)
    const { error: dbErr } = await this.dbClient
      .from("machines")
      .update({
        last_heartbeat: new Date().toISOString(),
        status: "online",
        slots_claude_code: slotsAvailable.claude_code,
        slots_codex: slotsAvailable.codex,
      })
      .eq("company_id", this.companyId)
      .eq("name", this.machineId);

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
