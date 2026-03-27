import { execFile } from "node:child_process";
import { promisify } from "node:util";

type ExecFileAsyncFn = (
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

type ActiveSession = { name: string };

export interface MasterChangePollerDeps {
  repoPath: string;
  execFileAsync?: ExecFileAsyncFn;
  fetchRepo: () => Promise<void>;
  broadcast: (message: string, sessionNames: string[]) => Promise<number | void>;
  getActiveSessions?: () => ActiveSession[];
}

const execFileAsync = promisify(execFile) as unknown as ExecFileAsyncFn;

function parseMasterSha(stdout: string): string | null {
  const line = stdout.trim().split("\n")[0] ?? "";
  if (!line) return null;
  const [sha] = line.split(/\s+/);
  return sha || null;
}

export class MasterChangePoller {
  private readonly repoPath: string;
  private readonly exec: ExecFileAsyncFn;
  private readonly fetchRepo: () => Promise<void>;
  private readonly broadcast: (message: string, sessionNames: string[]) => Promise<number | void>;
  private readonly getActiveSessions: () => ActiveSession[];
  private lastMasterSha: string | null = null;
  private started = false;

  constructor(deps: MasterChangePollerDeps) {
    this.repoPath = deps.repoPath;
    this.exec = deps.execFileAsync ?? execFileAsync;
    this.fetchRepo = deps.fetchRepo;
    this.broadcast = deps.broadcast;
    this.getActiveSessions = deps.getActiveSessions ?? (() => []);
    this.start();
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    console.log("[git master refresh] Poller started");
  }

  async poll(): Promise<void> {
    let currentMasterSha: string | null = null;
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
      await this.fetchRepo();
      console.log("[git master refresh] Repo fetched successfully");
    } catch (err) {
      console.error("[git master refresh] Repo fetch failed:", err);
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
