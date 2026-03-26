import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Polls git ls-remote every 30 seconds to detect master branch SHA changes.
 * On change: fetches the bare repo, then broadcasts to all active tmux sessions.
 * All errors are caught and logged — the poller never throws.
 */
export class MasterChangePoller {
  constructor(opts) {
    this.exec = opts.execFileAsync ?? execFileAsync;
    this.broadcastFn = opts.broadcast;
    this.fetchBareRepo = opts.fetchBareRepo;
    this.repoPath = opts.repoPath;
    this.getActiveSessions = opts.getActiveSessions;
    this.currentSha = null;
  }

  start() {
    console.log("[git master refresh] Poller started");
  }

  async poll() {
    let newSha;
    try {
      const { stdout } = await this.exec("git", ["ls-remote", this.repoPath, "refs/heads/master"]);
      newSha = stdout.split("\t")[0].trim();
    } catch (err) {
      console.warn("[git master refresh] ls-remote failed:", err);
      return;
    }

    if (!this.currentSha) {
      // First poll: store SHA without broadcasting
      this.currentSha = newSha;
      return;
    }

    if (newSha === this.currentSha) {
      return;
    }

    const oldSha = this.currentSha;
    console.log(`[git master refresh] Master SHA changed: ${oldSha.slice(0, 7)} -> ${newSha.slice(0, 7)}`);

    try {
      await this.fetchBareRepo();
      console.log("[git master refresh] Bare repo fetched successfully");
    } catch (err) {
      console.error("[git master refresh] Bare repo fetch failed:", err);
      // Do not update currentSha so next cycle retries
      return;
    }

    // Update SHA only after successful fetch
    this.currentSha = newSha;

    const shortOldSha = oldSha.slice(0, 7);
    const shortNewSha = newSha.slice(0, 7);
    const message = `[System] Master branch updated (${shortOldSha} -> ${shortNewSha}). Your worktree may be behind origin/master. Decide how to handle based on your current work.`;

    const sessionNames = this.getActiveSessions?.().map((s) => s.name);
    const notified = await this.broadcastFn(message, sessionNames);
    console.log(`[git master refresh] Notified ${notified} active session(s) of master update`);
  }
}
