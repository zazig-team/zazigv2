/**
 * stop.ts — zazig stop
 *
 * Sends SIGTERM to the running daemon, waits up to 10s for graceful
 * shutdown, then falls back to SIGKILL if the process is still alive.
 */

import { readPid, isRunning, removePidFile } from "../lib/daemon.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function stop(): Promise<void> {
  const pid = readPid();

  if (pid === null || !isRunning(pid)) {
    console.log("Agent is not running.");
    removePidFile(); // Clean up stale PID file if present
    return;
  }

  process.stdout.write(`Stopping agent (PID ${pid})...`);

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    console.log(" (failed to send SIGTERM — process may already be gone)");
    removePidFile();
    return;
  }

  // Wait up to 10s for graceful exit (local-agent handles SIGTERM)
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    await sleep(200);
    if (!isRunning(pid)) {
      console.log(" stopped.");
      removePidFile();
      return;
    }
  }

  // Grace period exhausted — force kill
  try {
    process.kill(pid, "SIGKILL");
    console.log(" killed (SIGKILL after 10s timeout).");
  } catch {
    console.log(" process already gone.");
  }
  removePidFile();
}
