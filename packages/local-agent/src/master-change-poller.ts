/**
 * MasterChangePoller — polls git ls-remote for changes to refs/heads/master every 30 seconds.
 *
 * On detection of a new SHA:
 *   1. Fetches the bare repo via fetchBareRepo().
 *   2. On successful fetch, calls broadcast() with a notification message.
 *   3. On fetch failure, logs and retries on the next cycle (does NOT broadcast).
 *
 * Does NOT acquire the repo lock for ls-remote — it is a read-only network call.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const defaultExecFileAsync = promisify(execFile);

export interface MasterChangePollerOptions {
  /** Absolute path to the bare repo directory. */
  repoPath: string;
  /**
   * Called with the notification message when master SHA changes and fetch succeeds.
   * Should return the number of sessions notified (used for logging).
   * The poller does not care how this is implemented (tmux, DB, etc.).
   */
  broadcast: (message: string) => Promise<number | void>;
  /** Called to fetch the bare repo after a SHA change is detected. */
  fetchBareRepo: (repoPath: string) => Promise<void>;
  /** Optional override for execFileAsync (used in tests). */
  execFileAsync?: typeof defaultExecFileAsync;
}

export class MasterChangePoller {
  private readonly repoPath: string;
  private readonly broadcast: (message: string) => Promise<number | void>;
  private readonly fetchBareRepo: (repoPath: string) => Promise<void>;
  private readonly exec: typeof defaultExecFileAsync;

  private lastKnownSha: string | null = null;

  constructor(options: MasterChangePollerOptions) {
    this.repoPath = options.repoPath;
    this.broadcast = options.broadcast;
    this.fetchBareRepo = options.fetchBareRepo;
    this.exec = options.execFileAsync ?? defaultExecFileAsync;
  }

  /** Call once after construction to log that the poller is active. */
  start(): void {
    console.log("[git master refresh] Poller started");
  }

  /**
   * Execute one poll cycle. Safe to call repeatedly — never throws.
   */
  async poll(): Promise<void> {
    let currentSha: string;
    try {
      currentSha = await this.getMasterSha();
    } catch (err) {
      console.warn(
        `[git master refresh] ls-remote failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    if (this.lastKnownSha === null) {
      // First run — store SHA without broadcasting.
      this.lastKnownSha = currentSha;
      return;
    }

    if (currentSha === this.lastKnownSha) {
      return; // No change.
    }

    const oldSha = this.lastKnownSha;
    console.log(
      `[git master refresh] Master SHA changed: ${oldSha.slice(0, 7)} → ${currentSha.slice(0, 7)}`,
    );

    // Fetch bare repo — must succeed before broadcasting.
    try {
      await this.fetchBareRepo(this.repoPath);
      console.log("[git master refresh] Bare repo fetched successfully");
    } catch (err) {
      console.error(
        `[git master refresh] Bare repo fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      // Do NOT update lastKnownSha — retry on next cycle.
      return;
    }

    // Fetch succeeded — advance SHA and broadcast.
    this.lastKnownSha = currentSha;

    const message =
      `[git master refresh] Master branch updated on origin/master: ` +
      `${oldSha.slice(0, 7)} → ${currentSha.slice(0, 7)}`;

    let notifiedCount: number | void;
    try {
      notifiedCount = await this.broadcast(message);
    } catch (err) {
      console.warn(
        `[git master refresh] broadcast failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    const count = typeof notifiedCount === "number" ? notifiedCount : 0;
    console.log(`[git master refresh] Notified ${count} active session(s)`);
  }

  private async getMasterSha(): Promise<string> {
    const { stdout } = await this.exec(
      "git",
      ["-C", this.repoPath, "ls-remote", "origin", "refs/heads/master"],
      { encoding: "utf8" },
    );
    const firstLine = (stdout ?? "")
      .trim()
      .split("\n")
      .find((l) => l.trim().length > 0);
    if (!firstLine) {
      throw new Error("ls-remote produced no output");
    }
    const sha = firstLine.trim().split(/\s+/)[0];
    if (!sha) {
      throw new Error(`Could not parse SHA from ls-remote output: ${firstLine}`);
    }
    return sha;
  }
}
