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

function getFirstWindowId(sessionName: string): string | undefined {
  try {
    const output = execSync(
      `tmux list-windows -t ${sessionName} -F '#{window_id}'`,
      { encoding: "utf-8", timeout: 5000 },
    ).trim();
    if (!output) return undefined;
    return output.split("\n")[0]?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export function discoverAgentSessions(
  machineId: string,
  companyId?: string,
): AgentSession[] {
  try {
    const output = execSync("tmux list-sessions -F '#{session_name}'", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const companyPrefix = companyId ? companyId.slice(0, 8) + "-" : "";
    const prefix = `${machineId}-${companyPrefix}`;
    return output
      .trim()
      .split("\n")
      .filter((s) => s.startsWith(prefix))
      .map((sessionName) => ({
        role: sessionName.replace(prefix, ""),
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

  // Create a standalone viewer session and link all agent windows into it.
  // Using `new-session -d` (without -t) avoids session grouping, which would
  // prevent Ctrl+B n/p from cycling across all agents.
  const firstAgent = agents[0]!;
  try {
    const firstAgentWindowId = getFirstWindowId(firstAgent.sessionName);
    if (!firstAgentWindowId) {
      throw new Error(`No tmux window found for session ${firstAgent.sessionName}`);
    }

    execSync(
      `tmux new-session -d -s ${viewerSession}`,
      { stdio: "pipe" }
    );

    const viewerDefaultWindowId = getFirstWindowId(viewerSession);
    if (!viewerDefaultWindowId) {
      throw new Error(`No default tmux window found for viewer session ${viewerSession}`);
    }

    // Link the first agent's window and remove the empty default window
    execSync(
      `tmux link-window -s ${firstAgentWindowId} -t ${viewerSession}`,
      { stdio: "pipe" }
    );
    execSync(
      `tmux kill-window -t ${viewerDefaultWindowId}`,
      { stdio: "pipe" }
    );
    // Rename to role
    execSync(
      `tmux rename-window -t ${firstAgentWindowId} ${firstAgent.role.toUpperCase()}`,
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
      const agentWindowId = getFirstWindowId(agent.sessionName);
      if (!agentWindowId) {
        console.warn(`Could not find tmux window for ${agent.role} session ${agent.sessionName}`);
        continue;
      }
      execSync(
        `tmux link-window -s ${agentWindowId} -t ${viewerSession}`,
        { stdio: "pipe" }
      );
      // Rename the linked window
      try {
        execSync(
          `tmux rename-window -t ${agentWindowId} ${agent.role.toUpperCase()}`,
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

  // Color-code status bar per role so you can tell agents apart at a glance.
  // The hook fires on every window switch and updates the bar color.
  const roleColors: Record<string, string> = {
    CPO: "bg=blue,fg=white",
    CTO: "bg=green,fg=black",
    VPE: "bg=magenta,fg=white",
    CMO: "bg=yellow,fg=black",
  };
  const defaultColor = "bg=colour240,fg=white";

  // Build a shell case statement for the hook
  const caseBranches = Object.entries(roleColors)
    .map(([role, style]) => `${role}) tmux set -t ${viewerSession} status-style '${style}' ;;`)
    .join(" ");
  const hookCmd = `W=$(tmux display-message -p '#W'); case $W in ${caseBranches} *) tmux set -t ${viewerSession} status-style '${defaultColor}' ;; esac`;

  try {
    // Set initial color based on first agent
    const firstRole = agents[0]!.role.toUpperCase();
    const initialColor = roleColors[firstRole] ?? defaultColor;
    execSync(
      `tmux set -t ${viewerSession} status-style "${initialColor}"`,
      { stdio: "pipe" }
    );
    execSync(
      `tmux set -t ${viewerSession} status-left " ${companyName} | "`,
      { stdio: "pipe" }
    );
    execSync(
      `tmux set -t ${viewerSession} status-right " Ctrl+B n: next | Ctrl+B d: detach "`,
      { stdio: "pipe" }
    );
    // Hook: change status bar color when switching windows
    execSync(
      `tmux set-hook -t ${viewerSession} after-select-window "run-shell '${hookCmd}'"`,
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
  const agentSessions = discoverAgentSessions(machineId, company.id);

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
