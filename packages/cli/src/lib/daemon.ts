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
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ZAZIGV2_DIR = join(homedir(), ".zazigv2");
const PID_PATH = join(ZAZIGV2_DIR, "daemon.pid");
const LOG_DIR = join(ZAZIGV2_DIR, "logs");
export const LOG_PATH = join(LOG_DIR, "agent.log");

/**
 * Resolve the local-agent's entry point (dist/index.js).
 * Primary: package resolution via createRequire (works when installed as dependency).
 * Fallback: adjacent package path (monorepo dev mode).
 */
function resolveAgentEntry(): string {
  try {
    const req = createRequire(import.meta.url);
    return req.resolve("@zazigv2/local-agent");
  } catch {
    // Dev fallback: CLI is at packages/cli/dist/index.js,
    // local-agent is at packages/local-agent/dist/index.js
    const thisDir = dirname(fileURLToPath(import.meta.url));
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

  const child = spawn(process.execPath, [agentEntry], {
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
