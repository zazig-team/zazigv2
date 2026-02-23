/**
 * start.ts — zazig start
 *
 * Starts the local-agent daemon in the background.
 *   1. Verifies credentials and machine config exist.
 *   2. Checks if daemon is already running.
 *   3. Spawns the local-agent as a detached child process.
 *   4. Waits 1s, confirms the process is still alive.
 *   5. Exits — the daemon continues running independently.
 */

import { getValidCredentials } from "../lib/credentials.js";
import { configExists } from "../lib/config.js";
import {
  isDaemonRunning,
  startDaemon,
  readPid,
  isRunning,
  LOG_PATH,
} from "../lib/daemon.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function start(): Promise<void> {
  // Require credentials (auto-refreshes expired token)
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  // Require machine config
  if (!configExists()) {
    console.error("No machine config. Create ~/.zazigv2/machine.yaml first.");
    process.exitCode = 1;
    return;
  }

  // Already running?
  if (isDaemonRunning()) {
    const pid = readPid();
    console.log(`Agent is already running (PID ${pid}).`);
    console.log("Use 'zazig status' to check state or 'zazig stop' to stop.");
    return;
  }

  // Build env for the spawned process — credentials come from the CLI,
  // machine.yaml is read by the local-agent at startup.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: creds.accessToken,
    SUPABASE_URL: creds.supabaseUrl,
  };

  let pid: number;
  try {
    pid = startDaemon(env);
  } catch (err) {
    console.error(`Failed to start daemon: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // Wait briefly to detect immediate crash
  await sleep(1500);

  if (isRunning(pid)) {
    console.log(`Agent started (PID ${pid}).`);
    console.log(`Logs: ${LOG_PATH}`);
  } else {
    console.error(`Agent failed to start. Check ${LOG_PATH}`);
    process.exitCode = 1;
  }
}
