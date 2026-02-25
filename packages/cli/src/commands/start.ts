/**
 * start.ts — zazig start
 *
 * Starts the local-agent daemon in the background.
 *   1. Verifies credentials (auto-refreshes expired token).
 *   2. On first run: prompts for slot config and saves ~/.zazigv2/config.json.
 *   3. Fetches user companies, picks one (or uses --company flag).
 *   4. Checks if daemon is already running for that company.
 *   5. Spawns the local-agent as a detached child process.
 *   6. Waits 3s, discovers agent sessions, launches TUI (unless --no-tui).
 */

import { hostname } from "node:os";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { getValidCredentials } from "../lib/credentials.js";
import { configExists, loadConfig, saveConfig } from "../lib/config.js";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import {
  isDaemonRunningForCompany,
  readPidForCompany,
  startDaemonForCompany,
  logPathForCompany,
  removePidFileForCompany,
} from "../lib/daemon.js";
import { launchTui, discoverAgentSessions } from "./chat.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateMachineName(): string {
  const raw = hostname().toLowerCase();
  // Replace non-alphanumeric chars with hyphens, strip trailing hyphens
  return raw.replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "") || "my-machine";
}

async function promptForConfig(codexInstalled: boolean): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log("zazig: first run — let's configure this machine.\n");

  try {
    const claudeAns = await rl.question("Max concurrent Claude Code sessions [4]: ");
    const claudeCount = parseInt(claudeAns.trim(), 10) || 4;

    let codexCount = 0;
    if (codexInstalled) {
      const codexAns = await rl.question("Max concurrent Codex sessions [4]: ");
      codexCount = parseInt(codexAns.trim(), 10) || 4;
    } else {
      console.log("\nCodex CLI is not installed — Codex slots set to 0.");
      console.log("To enable Codex agents later, install it:");
      console.log("  npm install -g @openai/codex\n");
    }

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

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function start(): Promise<void> {
  // Parse flags
  const noTui = process.argv.includes("--no-tui");
  const companyFlagIdx = process.argv.indexOf("--company");
  const companyFlagValue = companyFlagIdx !== -1 ? process.argv[companyFlagIdx + 1] : undefined;

  // Check prerequisites
  let claudeInstalled = false;
  try {
    execSync("claude --version", { stdio: "pipe" });
    claudeInstalled = true;
  } catch { /* not installed */ }

  if (!claudeInstalled) {
    console.error("Claude Code is not installed.");
    console.error("zazig requires Claude Code to run AI coding agents.\n");
    console.error("Install it:");
    console.error("  npm install -g @anthropic-ai/claude-code\n");
    console.error("Then authenticate:  claude login\n");
    process.exitCode = 1;
    return;
  }

  let codexInstalled = false;
  try {
    execSync("codex --version", { stdio: "pipe" });
    codexInstalled = true;
  } catch { /* not installed */ }

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
    await promptForConfig(codexInstalled);
  }

  const config = loadConfig();

  // Fetch companies and pick one
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? "";
  const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  let company = await pickCompany(companies);

  // --company flag override
  if (companyFlagValue) {
    const found = companies.find((c) => c.id === companyFlagValue || c.name === companyFlagValue);
    if (found) company = found;
  }

  console.log(`Starting zazig for ${company.name}...`);

  // Already running check
  if (isDaemonRunningForCompany(company.id)) {
    const pid = readPidForCompany(company.id);
    console.log(`Zazig is already running for ${company.name} (PID ${pid}).`);
    console.log("Run 'zazig chat' to reconnect, or 'zazig stop' to stop it.");
    return;
  }

  // Build env for the spawned process
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SUPABASE_ACCESS_TOKEN: creds.accessToken,
    SUPABASE_REFRESH_TOKEN: creds.refreshToken ?? "",
    SUPABASE_URL: creds.supabaseUrl,
    ZAZIG_MACHINE_NAME: config.name,
    ZAZIG_COMPANY_ID: company.id,
    ZAZIG_COMPANY_NAME: company.name,
    ZAZIG_SLOTS_CLAUDE_CODE: String(config.slots?.claude_code ?? 3),
    ZAZIG_SLOTS_CODEX: String(config.slots?.codex ?? 2),
  };

  let pid: number;
  try {
    pid = startDaemonForCompany(env, company.id);
    console.log(`Agent started (PID ${pid}). Logs: ${logPathForCompany(company.id)}`);
  } catch (err) {
    console.error(`Failed to start daemon: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // Wait for agents to spawn
  await sleep(3000);

  if (!isProcessRunning(pid)) {
    console.error(`Agent failed to start. Check logs: ${logPathForCompany(company.id)}`);
    process.exitCode = 1;
    return;
  }

  const agentSessions = discoverAgentSessions(config.name);

  if (noTui) {
    console.log("Zazig started successfully (headless).");
    console.log(`Logs: ${logPathForCompany(company.id)}`);
  } else {
    launchTui({
      companyName: company.name,
      agents: agentSessions,
      onShutdown: () => {
        try {
          process.kill(pid, "SIGTERM");
        } catch { /* */ }
        removePidFileForCompany(company.id);
        console.log("\nZazig stopped.");
        process.exit(0);
      },
    });
  }
}
