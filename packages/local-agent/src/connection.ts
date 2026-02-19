/**
 * connection.ts — Supabase Realtime connection manager
 *
 * Manages the WebSocket connection to Supabase Realtime for a single machine channel.
 * Handles:
 *   - Initial connection to channel `agent:${machineId}`
 *   - Exponential backoff on disconnect (capped at 30 s)
 *   - Heartbeat every HEARTBEAT_INTERVAL_MS (30 s)
 *   - Incoming OrchestratorMessage validation + dispatch to handlers
 */

import { createClient, type SupabaseClient, type RealtimeChannel } from "@supabase/supabase-js";
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
  private readonly supabase: SupabaseClient;
  private readonly machineId: string;
  private readonly config: MachineConfig;
  private readonly slots: SlotTracker;
  private readonly handlers: MessageHandler[] = [];

  private channel: RealtimeChannel | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private stopped = false;

  constructor(config: MachineConfig, slots: SlotTracker) {
    this.config = config;
    this.machineId = config.name;
    this.slots = slots;
    this.supabase = createClient(config.supabase.url, config.supabase.anon_key, {
      realtime: {
        // Supabase Realtime default params — heartbeat and timeout are managed
        // by the library internally; we add our own application-level heartbeat.
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }

  /** Register a handler for incoming OrchestratorMessages. */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Send an AgentMessage back to the orchestrator over the Realtime channel.
   * Returns "ok" on success or a non-"ok" string on failure.
   */
  async sendMessage(msg: AgentMessage): Promise<void> {
    if (!this.channel || this.stopped) {
      console.warn("[local-agent] sendMessage called but channel is not connected; message dropped:", msg.type);
      return;
    }
    const result = await this.channel.send({
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
    console.log(`[local-agent] Connecting to Realtime channel: ${channelName}`);

    this.channel = this.supabase.channel(channelName, {
      config: {
        broadcast: { ack: false },
      },
    });

    // Listen for broadcast messages from the orchestrator
    this.channel.on("broadcast", { event: "message" }, (payload) => {
      this.handleIncomingPayload(payload.payload);
    });

    this.channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        console.log(`[local-agent] Connected to channel: ${channelName}`);
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error(`[local-agent] Channel error (status=${status}):`, err ?? "unknown error");
        this.clearHeartbeatTimer();
        this.scheduleReconnect();
      } else if (status === "CLOSED") {
        if (!this.stopped) {
          console.warn(`[local-agent] Channel closed unexpectedly. Scheduling reconnect.`);
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
    if (!this.channel || this.stopped) return;

    const slotsAvailable = this.slots.getAvailable();
    const heartbeat: Heartbeat = {
      type: "heartbeat",
      protocolVersion: PROTOCOL_VERSION,
      machineId: this.machineId,
      slotsAvailable,
      cpoAlive: false, // placeholder — CPO hosting is future work
    };

    const result = await this.channel.send({
      type: "broadcast",
      event: "message",
      payload: heartbeat,
    });

    if (result === "ok") {
      console.log(
        `[local-agent] Heartbeat sent — machineId=${this.machineId}, ` +
          `slots=${JSON.stringify(slotsAvailable)}, cpoAlive=false`
      );
    } else {
      console.warn(`[local-agent] Heartbeat send returned: ${result}`);
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
      if (this.channel) {
        try {
          await this.supabase.removeChannel(this.channel);
        } catch {
          // best-effort cleanup
        }
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
