/**
 * slack-chat.ts — CPO Slack chat router
 *
 * Listens for inbound Slack DMs and @mentions via Socket Mode and injects them
 * into the CPO's persistent Claude Code tmux session. The CPO then responds
 * using its configured Slack MCP tools.
 *
 * Flow:
 *   Slack DM/@mention
 *     → Socket Mode event
 *     → SlackChatRouter formats message
 *     → queued if CPO busy, injected when idle
 *     → tmux send-keys → CPO Claude Code
 *     → CPO uses slack_post_message MCP to reply
 */

import { App } from "@slack/bolt";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CpoSlackConfig } from "./config.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QueuedMessage {
  text: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

// ---------------------------------------------------------------------------
// SlackChatRouter
// ---------------------------------------------------------------------------

/**
 * Manages the CPO's inbound Slack message pipeline.
 *
 * Lifecycle:
 *   1. `start()` — connects to Slack via Socket Mode
 *   2. Incoming events are formatted and enqueued
 *   3. Queue processor waits for CPO to be idle, then injects via tmux send-keys
 *   4. `stop()` — disconnects cleanly
 */
export class SlackChatRouter {
  private readonly app: App;
  private readonly sessionName: string;
  private readonly allowedChannels: Set<string>;
  private readonly queue: QueuedMessage[] = [];
  private processing = false;

  constructor(config: CpoSlackConfig, sessionName: string) {
    this.sessionName = sessionName;
    this.allowedChannels = new Set(config.channels);

    this.app = new App({
      token: config.bot_token,
      appToken: config.app_token,
      socketMode: true,
      // Silence built-in logger — we use our own console.log
      logger: {
        debug: () => {},
        info: () => {},
        warn: (msg) => console.warn("[slack-chat]", msg),
        error: (msg) => console.error("[slack-chat]", msg),
        setLevel: () => {},
        getLevel: () => "warn" as const,
        setName: () => {},
      },
    });

    this.registerHandlers();
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  async start(): Promise<void> {
    await this.app.start();
    console.log(`[slack-chat] Connected via Socket Mode — session=${this.sessionName}`);
  }

  async stop(): Promise<void> {
    await this.app.stop();
    console.log("[slack-chat] Disconnected");
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  private registerHandlers(): void {
    // DMs: channel_type === "im"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.app.event("message", async ({ event }: { event: any }) => {
      // Skip bot messages and subtypes (edits, deletions, etc.)
      if (event.bot_id || event.subtype || !event.user) return;

      const isDm = event.channel_type === "im";
      const isAllowedChannel = this.allowedChannels.has(event.channel as string);

      if (!isDm && !isAllowedChannel) return;

      const channelRef = isDm ? "DM" : `#${event.channel}`;
      const threadTs = (event.thread_ts ?? event.ts) as string;
      const text = String(event.text ?? "").trim();
      if (!text) return;

      const formatted = formatMessage(event.user as string, channelRef, threadTs, text);
      console.log(`[slack-chat] Queuing message from @${event.user} in ${channelRef}`);
      await this.enqueue(formatted);
    });

    // @mentions in channels (separate event type for explicit @mentions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.app.event("app_mention", async ({ event }: { event: any }) => {
      if (!event.user) return;

      const channelRef = `#${event.channel}`;
      const threadTs = (event.thread_ts ?? event.ts) as string;
      // Strip the bot mention token(s) from the text
      const text = String(event.text ?? "").replace(/<@[A-Z0-9]+>/g, "").trim();
      if (!text) return;

      console.log(`[slack-chat] Queuing @mention from @${event.user} in ${channelRef}`);
      const formatted = formatMessage(event.user as string, channelRef, threadTs, text);
      await this.enqueue(formatted);
    });
  }

  // ---------------------------------------------------------------------------
  // Queue
  // ---------------------------------------------------------------------------

  private enqueue(message: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.queue.push({ text: message, resolve, reject });
      if (!this.processing) {
        void this.processQueue();
      }
    });
  }

  private async processQueue(): Promise<void> {
    this.processing = true;
    while (this.queue.length > 0) {
      const item = this.queue.shift()!;
      try {
        await this.injectWhenIdle(item.text);
        item.resolve();
      } catch (err) {
        console.error("[slack-chat] Failed to inject message:", err);
        item.reject(err);
      }
    }
    this.processing = false;
  }

  // ---------------------------------------------------------------------------
  // Injection
  // ---------------------------------------------------------------------------

  private async injectWhenIdle(message: string): Promise<void> {
    // Poll until CPO is idle (prompt visible), up to 5 minutes
    const MAX_WAIT_MS = 5 * 60_000;
    const POLL_INTERVAL_MS = 5_000;
    const deadline = Date.now() + MAX_WAIT_MS;

    while (Date.now() < deadline) {
      if (await this.isCpoIdle()) break;
      console.log(`[slack-chat] CPO busy — waiting ${POLL_INTERVAL_MS / 1000}s before retry`);
      await sleep(POLL_INTERVAL_MS);
    }

    // Normalise newlines so multi-line messages don't send prematurely.
    // tmux send-keys treats literal \n as Enter — collapse to a space.
    const singleLine = message.replace(/\r?\n/g, " ");

    await execFileAsync("tmux", [
      "send-keys",
      "-t", this.sessionName,
      singleLine,
      "Enter",
    ]);

    console.log(`[slack-chat] Injected message into session=${this.sessionName}`);
  }

  /**
   * Returns true when the CPO's tmux pane shows the Claude Code prompt,
   * indicating it is idle and waiting for input.
   *
   * Claude Code's interactive prompt shows `>` on the last visible line.
   * We also accept `$` as a fallback (shell prompt if Claude exited).
   */
  private async isCpoIdle(): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("tmux", [
        "capture-pane",
        "-t", this.sessionName,
        "-p",   // print to stdout
      ]);

      const lines = stdout.trimEnd().split("\n");
      // Walk back from the last line to find a non-empty line
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i]!.trim();
        if (!line) continue;
        // Claude Code prompt: lines ending with ">" or "> "
        // Shell prompt fallback: lines ending with "$" or "% "
        return /[>$%]\s*$/.test(line);
      }
      return false;
    } catch {
      // Session doesn't exist yet or tmux error — not idle
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an inbound Slack message for injection into Claude Code.
 * Includes enough metadata so CPO can thread-reply correctly via MCP.
 *
 * Example output:
 *   [Slack from @tom in #cpo, thread:1740000000.123456]
 *   What's the status of the pipeline?
 */
function formatMessage(
  userId: string,
  channelRef: string,
  threadTs: string,
  text: string
): string {
  return `[Slack from @${userId} in ${channelRef}, thread:${threadTs}]\n${text}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
