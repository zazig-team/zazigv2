/**
 * types.ts — Shared type definitions for the local-agent daemon.
 */

/**
 * Configuration for the local-agent daemon process.
 *
 * These values control how the daemon interacts with the orchestrator and
 * how many jobs it can run simultaneously.
 */
export interface DaemonConfig {
  /**
   * The number of concurrent jobs the daemon is allowed to run at once.
   * Each active job consumes one slot. The orchestrator will not dispatch
   * more jobs than the available slot count reported in heartbeats.
   */
  slots: number;

  /**
   * How often (in milliseconds) the daemon sends a heartbeat ping to the
   * server. Heartbeats report slot availability and machine health. Lower
   * values keep the orchestrator more up-to-date at the cost of more
   * network traffic.
   */
  heartbeatInterval: number;
}
