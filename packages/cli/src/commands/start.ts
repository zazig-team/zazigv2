/**
 * start.ts — zazig start
 *
 * Starts the local-agent daemon in the background.
 *   1. Verifies credentials (auto-refreshes expired token).
 *   2. On first run: prompts for slot config and saves ~/.zazigv2/config.json.
 *   3. Fetches user companies, picks one (or uses --company flag).
 *   4. Stops existing daemon if already running for that company.
 *   5. Spawns the local-agent as a detached child process.
 *   6. Waits 3s, discovers agent sessions, launches TUI (unless --no-tui).
 */

import { existsSync, readFileSync } from "node:fs";
import { hostname, homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { getValidCredentials } from "../lib/credentials.js";
import { configExists, loadConfig, saveConfig } from "../lib/config.js";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import {
  isDaemonRunningForCompany,
  readPidForCompany,
  startDaemonForCompany,
  logPathForCompany,
  removePidFileForCompany,
} from "../lib/daemon.js";
import { launchTui, discoverAgentSessions } from "./chat.js";
import { syncSkillsForCompany } from "./skills.js";
import { getVersion } from "../lib/version.js";
import { hasPinnedBuild, getCurrentBuildSha } from "../lib/builds.js";
import { checkForUpdate, downloadAndInstall, getLocalVersion } from "../lib/auto-update.js";

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

function readRecentAgentErrorLines(logPath: string): string[] | null {
  try {
    const content = readFileSync(logPath, "utf8");
    const recentLines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(-20);
    return recentLines.filter((line) => /ERROR|FATAL/i.test(line));
  } catch {
    return null;
  }
}

function readClaudeTokenFromKeychain(): string | null {
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w',
      { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" },
    );
    const parsed = JSON.parse(raw);
    const token = parsed?.claudeAiOauth?.accessToken;
    return typeof token === "string" && token.startsWith("sk-ant-") ? token : null;
  } catch {
    return null;
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
  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  let company = await pickCompany(companies);

  // --company flag override
  if (companyFlagValue) {
    const found = companies.find((c) => c.id === companyFlagValue || c.name === companyFlagValue);
    if (found) company = found;
  }

  console.log(`zazig ${getVersion()}`);
  console.log(`Starting zazig for ${company.name}...`);

  // Auto-update check (production only)
  const zazigEnv = process.env["ZAZIG_ENV"] ?? "production";
  if (zazigEnv === "production") {
    try {
      const updateResult = await checkForUpdate(creds.supabaseUrl, anonKey, "production");
      if (updateResult.status === "update-available") {
        console.log(`Update available: v${updateResult.remoteVersion}`);
        console.log("Downloading...");
        await downloadAndInstall(updateResult.remoteVersion);
        console.log(`\nUpdated zazig to v${updateResult.remoteVersion}. Please run 'zazig start' again.`);
        return;
      }
    } catch (err) {
      console.warn(`Auto-update check failed (continuing with current version): ${String(err)}`);
    }
  }

  // Stop existing daemon before (re)starting
  if (isDaemonRunningForCompany(company.id)) {
    const oldPid = readPidForCompany(company.id);
    if (oldPid && isProcessRunning(oldPid)) {
      process.stdout.write(`Stopping existing daemon (PID ${oldPid})...`);
      try { process.kill(oldPid, "SIGTERM"); } catch { /* */ }

      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        await sleep(200);
        if (!isProcessRunning(oldPid)) break;
      }
      if (isProcessRunning(oldPid)) {
        try { process.kill(oldPid, "SIGKILL"); } catch { /* */ }
      }
      console.log(" stopped.");
    }
    removePidFileForCompany(company.id);
  }

  const claudeToken = readClaudeTokenFromKeychain();

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
    ...(claudeToken ? { ANTHROPIC_API_KEY: claudeToken } : {}),
  };

  // Resolve agent entry point: use standalone binary, pinned build, or repo
  let agentEntryOverride: string | undefined;

  if (zazigEnv === "production") {
    const binAgent = join(homedir(), ".zazigv2", "bin", "zazig-agent");
    if (existsSync(binAgent)) {
      agentEntryOverride = binAgent;
      const ver = getLocalVersion();
      console.log(`Using zazig-agent binary${ver ? ` (v${ver})` : ""}`);
    } else if (hasPinnedBuild()) {
      // Legacy fallback — old pinned .mjs build
      const buildDir = join(homedir(), ".zazigv2", "builds", "current");
      agentEntryOverride = join(buildDir, "packages", "local-agent", "releases", "zazig-agent.mjs");
      const sha = getCurrentBuildSha();
      console.log(`Using pinned build${sha ? ` (${sha.slice(0, 7)})` : ""}`);
    }
  } else if (zazigEnv === "staging") {
    console.log("Using repo build (staging mode)");
  }

  let pid: number;
  try {
    pid = startDaemonForCompany(env, company.id, agentEntryOverride);
    console.log(`Agent started (PID ${pid}). Logs: ${logPathForCompany(company.id)}`);
  } catch (err) {
    console.error(`Failed to start daemon: ${String(err)}`);
    process.exitCode = 1;
    return;
  }

  // Poll for agent sessions (up to 30s).
  // Wait until the count stabilizes (same count for 2 consecutive polls)
  // so we don't miss agents that spawn slightly after the first one.
  process.stdout.write("Waiting for agents to spawn...");
  let agentSessions: ReturnType<typeof discoverAgentSessions> = [];
  let lastCount = 0;
  let stablePolls = 0;
  const spawnDeadline = Date.now() + 30_000;
  while (Date.now() < spawnDeadline) {
    await sleep(2000);
    if (!isProcessRunning(pid)) {
      const logPath = logPathForCompany(company.id);
      const errorLines = readRecentAgentErrorLines(logPath);
      if (!errorLines || errorLines.length === 0) {
        console.error(`\nAgent failed to start. Check logs: ${logPath}`);
      } else {
        console.error("\nAgent failed to start.");
        for (const line of errorLines) {
          console.error(`  ${line}`);
        }
        console.error(`Logs: ${logPath}`);
      }
      process.exitCode = 1;
      return;
    }
    agentSessions = discoverAgentSessions(config.name, company.id);
    if (agentSessions.length > 0 && agentSessions.length === lastCount) {
      stablePolls++;
      if (stablePolls >= 2) break;
    } else {
      stablePolls = 0;
    }
    lastCount = agentSessions.length;
    process.stdout.write(".");
  }
  console.log(agentSessions.length > 0 ? ` found ${agentSessions.length} agent(s).` : "");

  // Best-effort skill link reconciliation for persistent workspaces.
  try {
    const sync = await syncSkillsForCompany(creds.supabaseUrl, anonKey, company.id);
    console.log(
      `Skills sync: added=${sync.added}, updated=${sync.updated}, removed=${sync.removed}, unchanged=${sync.unchanged}`,
    );
    for (const warning of sync.warnings) {
      console.warn(warning);
    }
  } catch (err) {
    console.warn(`Skills sync skipped: ${String(err)}`);
  }

  if (noTui) {
    console.log("Zazig started successfully (headless).");
    console.log(`Logs: ${logPathForCompany(company.id)}`);
  } else if (agentSessions.length === 0) {
    console.log("No agent sessions found. Daemon may still be starting up.");
    console.log(`Logs: ${logPathForCompany(company.id)}`);
  } else {
    launchTui({
      companyName: company.name,
      agents: agentSessions,
      onShutdown: () => {
        console.log("\nDetached from agents (daemon still running in background).");
        console.log("Run 'zazig chat' to reconnect, or 'zazig stop' to stop it.");
      },
    });
  }
}
