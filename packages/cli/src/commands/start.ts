/**
 * start.ts — zazig start
 *
 * Starts the local-agent daemon in the background.
 *   1. Verifies credentials (auto-refreshes expired token).
 *   2. On first run: prompts for slot config and saves ~/.zazigv2/config.json.
 *   3. Checks if daemon is already running.
 *   4. Spawns the local-agent as a detached child process.
 *   5. Waits 1.5s, confirms the process is still alive.
 *   6. Exits — the daemon continues running independently.
 */

import { hostname } from "node:os";
import { createInterface } from "node:readline/promises";
import { getValidCredentials } from "../lib/credentials.js";
import { configExists, loadConfig, saveConfig } from "../lib/config.js";
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

function generateMachineName(): string {
  const raw = hostname().toLowerCase();
  // Replace non-alphanumeric chars with hyphens, strip trailing hyphens
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") || "my-machine";
}

async function promptForConfig(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("zazig: first run — let's configure this machine.\n");

  try {
    const claudeAns = await rl.question("Max concurrent Claude Code sessions [4]: ");
    const codexAns  = await rl.question("Max concurrent Codex sessions [4]: ");

    const claudeCount = parseInt(claudeAns.trim(), 10) || 4;
    const codexCount  = parseInt(codexAns.trim(),  10) || 4;
    const name = generateMachineName();

    saveConfig({
      name,
      slots: { claude_code: claudeCount, codex: codexCount },
    });

    console.log(
      `\nMachine configured: ${name} (${claudeCount} Claude Code, ${codexCount} Codex)`
    );
  } finally {
    rl.close();
  }
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

  // First-run config
  if (!configExists()) {
    await promptForConfig();
  }

  const config = loadConfig();

  // Already running?
  if (isDaemonRunning()) {
    const pid = readPid();
    console.log(`Agent is already running (PID ${pid}).`);
    console.log("Use 'zazig status' to check state or 'zazig stop' to stop.");
    return;
  }

  // Build env for the spawned process
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: creds.accessToken,
    SUPABASE_URL: creds.supabaseUrl,
    ZAZIG_MACHINE_NAME: config.name,
    ZAZIG_SLOTS_CLAUDE_CODE: String(config.slots.claude_code),
    ZAZIG_SLOTS_CODEX: String(config.slots.codex),
  };

  let pid: number;
  try {
    pid = startDaemon(env);
  } catch (err) {
    console.error(`Failed to start daemon: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  await sleep(1500);

  if (isRunning(pid)) {
    console.log(`Agent started (PID ${pid}).`);
    console.log(`Logs: ${LOG_PATH}`);
  } else {
    console.error(`Agent failed to start. Check ${LOG_PATH}`);
    process.exitCode = 1;
  }
}
