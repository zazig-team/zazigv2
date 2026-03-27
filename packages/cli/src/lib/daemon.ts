/**
 * daemon.ts — PID file management and background process spawning
 *
 * Spawns the local-agent as a fully detached child process (stdio redirected
 * to a log file, parent exits immediately). The local-agent binary is resolved
 * from @zazigv2/local-agent in this package's own node_modules.
 */

import { spawn } from "node:child_process";
import {
  openSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  mkdirSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ZAZIGV2_DIR = process.env["ZAZIG_HOME"] ?? join(homedir(), ".zazigv2");
const PID_PATH = join(ZAZIGV2_DIR, "daemon.pid");
const PIDS_DIR = join(ZAZIGV2_DIR, "pids");
const LOG_DIR = join(ZAZIGV2_DIR, "logs");
export const LOG_PATH = join(LOG_DIR, "agent.log");

const IS_STAGING = process.env["ZAZIG_ENV"] === "staging";

/**
 * Resolve the local-agent's entry point.
 * Staging: returns src/index.ts so bun runs it directly from source.
 * Production: returns dist/index.js (compiled binary path).
 */
function resolveAgentEntry(): string {
  try {
    const resolved = fileURLToPath(import.meta.resolve("@zazigv2/local-agent"));
    if (IS_STAGING) {
      // bun runs TypeScript directly — use the source file
      if (resolved.includes("/src/") || resolved.endsWith(".ts")) return resolved;
      const pkgDir = resolved.replace(/\/dist\/.*$/, "");
      return resolve(pkgDir, "src/index.ts");
    }
    // node: must use compiled dist/index.js
    if (resolved.includes("/src/") || resolved.endsWith(".ts")) {
      const pkgDir = resolved.replace(/\/src\/.*$/, "");
      return resolve(pkgDir, "dist/index.js");
    }
    return resolved;
  } catch {
    const thisDir = dirname(fileURLToPath(import.meta.url));
    if (IS_STAGING) return resolve(thisDir, "../../local-agent/src/index.ts");
    return resolve(thisDir, "../../local-agent/dist/index.js");
  }
}

export function readPid(): number | null {
  try {
    const raw = readFileSync(PID_PATH, "utf-8").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Check whether a process is alive by sending signal 0 (no-op). */
export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function isDaemonRunning(): boolean {
  const pid = readPid();
  return pid !== null && isRunning(pid);
}

/**
 * Fork the local-agent daemon into the background.
 * Returns the PID of the spawned child.
 * Throws if spawn fails or no PID is assigned.
 */
export function startDaemon(env: NodeJS.ProcessEnv): number {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(ZAZIGV2_DIR, { recursive: true });

  const agentEntry = resolveAgentEntry();
  const logFd = openSync(LOG_PATH, "a");

  const command = IS_STAGING ? "bun" : process.execPath;
  const child = spawn(command, [agentEntry], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });

  // Unref so the CLI process can exit while the child runs.
  child.unref();

  const pid = child.pid;
  if (pid == null) throw new Error("Spawn succeeded but no PID was assigned");

  writeFileSync(PID_PATH, String(pid) + "\n");
  return pid;
}

export function removePidFile(): void {
  try {
    unlinkSync(PID_PATH);
  } catch {
    // File may already be gone — that's fine
  }
}

/* ── Per-company PID management ────────────────────────────────── */

export function pidPathForCompany(companyId: string): string {
  return join(PIDS_DIR, `${companyId}.pid`);
}

export function logPathForCompany(companyId: string): string {
  mkdirSync(LOG_DIR, { recursive: true });
  return join(LOG_DIR, `${companyId}.log`);
}

export function readPidForCompany(companyId: string): number | null {
  try {
    const raw = readFileSync(pidPathForCompany(companyId), "utf-8").trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function isDaemonRunningForCompany(companyId: string): boolean {
  const pid = readPidForCompany(companyId);
  return pid !== null && isRunning(pid);
}

export function removePidFileForCompany(companyId: string): void {
  try {
    unlinkSync(pidPathForCompany(companyId));
  } catch {
    /* already gone */
  }
}

export function startDaemonForCompany(
  env: NodeJS.ProcessEnv,
  companyId: string,
  agentEntryOverride?: string,
): number {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(ZAZIGV2_DIR, { recursive: true });
  mkdirSync(PIDS_DIR, { recursive: true });

  const agentEntry = agentEntryOverride ?? resolveAgentEntry();
  const logPath = logPathForCompany(companyId);
  const logFd = openSync(logPath, "a");

  // Staging: spawn with bun (runs .ts source directly).
  // Production: compiled binaries run directly; .mjs/.js need node.
  const isScript = agentEntry.endsWith(".mjs") || agentEntry.endsWith(".js") || agentEntry.endsWith(".ts");
  const command = IS_STAGING ? "bun" : (isScript ? process.execPath : agentEntry);
  const args = isScript ? [agentEntry] : [];

  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });

  child.unref();

  const pid = child.pid;
  if (pid == null) throw new Error("Spawn succeeded but no PID was assigned");

  writeFileSync(pidPathForCompany(companyId), String(pid) + "\n");
  return pid;
}
