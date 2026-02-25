/**
 * chat.ts — native tmux-based agent interaction.
 *
 * Links all agent tmux sessions as windows in a single viewer session,
 * then attaches. User gets native tmux input, mouse scrolling, and
 * Ctrl+B n/p (or window numbers) to switch between agents.
 *
 * No blessed, no custom TUI, no keystroke forwarding — just tmux.
 */

import { execSync, spawnSync } from "node:child_process";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { getValidCredentials } from "../lib/credentials.js";
import { isDaemonRunningForCompany } from "../lib/daemon.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

interface AgentSession {
  role: string;
  sessionName: string;
}

export function discoverAgentSessions(
  machineId: string
): AgentSession[] {
  try {
    const output = execSync("tmux list-sessions -F '#{session_name}'", {
      encoding: "utf-8",
      timeout: 5000,
    });
    return output
      .trim()
      .split("\n")
      .filter((s) => s.startsWith(`${machineId}-`))
      .map((sessionName) => ({
        role: sessionName.replace(`${machineId}-`, ""),
        sessionName,
      }));
  } catch {
    return [];
  }
}

/**
 * Create a viewer tmux session that links all agent windows together,
 * enable mouse scrolling, then attach.
 */
export function launchTui(options: {
  companyName: string;
  agents: AgentSession[];
  onShutdown: () => void;
}): void {
  const { companyName, agents, onShutdown } = options;

  if (agents.length === 0) {
    console.error("No persistent agents running.");
    return;
  }

  const viewerSession = `zazig-view-${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  // Kill stale viewer session if it exists
  try {
    execSync(`tmux kill-session -t ${viewerSession}`, { stdio: "pipe" });
  } catch { /* didn't exist */ }

  // Create viewer session (detached, with first agent linked)
  const firstAgent = agents[0]!;
  try {
    // Create session by linking to the first agent's window
    execSync(
      `tmux new-session -d -s ${viewerSession} -t ${firstAgent.sessionName}`,
      { stdio: "pipe" }
    );
    // Rename the window to the role
    execSync(
      `tmux rename-window -t ${viewerSession} ${firstAgent.role.toUpperCase()}`,
      { stdio: "pipe" }
    );
  } catch (err) {
    console.error(`Failed to create viewer session: ${String(err)}`);
    return;
  }

  // Link remaining agent sessions as additional windows
  for (let i = 1; i < agents.length; i++) {
    const agent = agents[i]!;
    try {
      execSync(
        `tmux link-window -s ${agent.sessionName}:0 -t ${viewerSession}`,
        { stdio: "pipe" }
      );
      // Rename the linked window
      const winIndex = i + 1; // window 0 is first agent, but link-window adds at next index
      try {
        execSync(
          `tmux rename-window -t ${viewerSession}:${winIndex} ${agent.role.toUpperCase()}`,
          { stdio: "pipe" }
        );
      } catch { /* rename is best-effort */ }
    } catch (err) {
      console.warn(`Could not link ${agent.role} session: ${String(err)}`);
    }
  }

  // Enable mouse mode for scrolling
  try {
    execSync(`tmux set -t ${viewerSession} mouse on`, { stdio: "pipe" });
  } catch { /* best-effort */ }

  // Set status bar to show agent windows
  try {
    execSync(
      `tmux set -t ${viewerSession} status-style "bg=blue,fg=white"`,
      { stdio: "pipe" }
    );
    execSync(
      `tmux set -t ${viewerSession} status-left " ${companyName} | "`,
      { stdio: "pipe" }
    );
    execSync(
      `tmux set -t ${viewerSession} status-right " Ctrl+B n: next agent | Ctrl+B d: detach "`,
      { stdio: "pipe" }
    );
  } catch { /* best-effort */ }

  console.log(`Attaching to agents for ${companyName}...`);
  console.log("Switch agents: Ctrl+B n/p | Scroll: mouse wheel | Detach: Ctrl+B d\n");

  // Attach — this blocks until the user detaches
  const result = spawnSync("tmux", ["attach", "-t", viewerSession], {
    stdio: "inherit",
  });

  // Clean up viewer session after detach
  try {
    execSync(`tmux kill-session -t ${viewerSession}`, { stdio: "pipe" });
  } catch { /* already gone */ }

  if (result.status !== 0) {
    console.error("tmux attach failed.");
    process.exitCode = 1;
    return;
  }

  onShutdown();
}

export async function chat(): Promise<void> {
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    console.error("Not logged in. Run 'zazig login' first.");
    process.exitCode = 1;
    return;
  }

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const companies = await fetchUserCompanies(creds.supabaseUrl, anonKey, creds.accessToken);
  const company = await pickCompany(companies);

  if (!isDaemonRunningForCompany(company.id)) {
    console.error(`Zazig is not running for ${company.name}. Run 'zazig start' first.`);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const machineId = config.name;
  const agentSessions = discoverAgentSessions(machineId);

  if (agentSessions.length === 0) {
    console.error("No agent sessions found. Daemon may still be starting up.");
    process.exitCode = 1;
    return;
  }

  launchTui({
    companyName: company.name,
    agents: agentSessions,
    onShutdown: () => {
      console.log("\nDisconnected from agents (daemon still running).");
    },
  });
}
