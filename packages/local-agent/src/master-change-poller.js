import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseMasterSha(stdout) {
  const line = stdout.trim().split("\n")[0] ?? "";
  if (!line) return null;
  const [sha] = line.split(/\s+/);
  return sha || null;
}

export class MasterChangePoller {
  constructor(deps) {
    this.repoPath = deps.repoPath;
    this.exec = deps.execFileAsync ?? execFileAsync;
    this.fetchBareRepo = deps.fetchBareRepo;
    this.broadcast = deps.broadcast;
    this.getActiveSessions = deps.getActiveSessions ?? (() => []);
    this.lastMasterSha = null;
    this.started = false;
    this.start();
  }

  start() {
    if (this.started) return;
    this.started = true;
    console.log("[git master refresh] Poller started");
  }

  async poll() {
    let currentMasterSha = null;
    try {
      const { stdout } = await this.exec("git", [
        "ls-remote",
        this.repoPath,
        "refs/heads/master",
      ], { encoding: "utf8" });
      currentMasterSha = parseMasterSha(stdout);
    } catch (err) {
      console.warn("[git master refresh] ls-remote failed:", err);
      return;
    }

    if (!currentMasterSha) {
      console.warn("[git master refresh] ls-remote failed: empty response");
      return;
    }

    if (this.lastMasterSha === null) {
      this.lastMasterSha = currentMasterSha;
      return;
    }

    if (currentMasterSha === this.lastMasterSha) {
      return;
    }

    const previousMasterSha = this.lastMasterSha;
    console.log(
      `[git master refresh] Master SHA changed: ${previousMasterSha.slice(0, 7)} -> ${currentMasterSha.slice(0, 7)}`,
    );

    try {
      await this.fetchBareRepo();
      console.log("[git master refresh] Bare repo fetched successfully");
    } catch (err) {
      console.error("[git master refresh] Bare repo fetch failed:", err);
      return;
    }

    const message = [
      "Master branch updated on origin/master.",
      `${previousMasterSha.slice(0, 7)} -> ${currentMasterSha.slice(0, 7)}`,
    ].join(" ");
    const sessions = this.getActiveSessions().map((session) => session.name);

    let notifiedCount = sessions.length;
    try {
      const maybeCount = await this.broadcast(message, sessions);
      if (typeof maybeCount === "number") {
        notifiedCount = maybeCount;
      }
    } catch (err) {
      console.warn("[git master refresh] Failed to broadcast notification:", err);
    }

    console.log(`[git master refresh] Notified ${notifiedCount} active sessions`);
    this.lastMasterSha = currentMasterSha;
  }
}
