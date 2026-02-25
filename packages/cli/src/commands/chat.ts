/**
 * chat.ts — split-screen TUI for persistent agent interaction.
 *
 * Top: read-only stream of active agent tmux session (capture-pane polling).
 * Bottom: status bar + input line.
 * Tab: switch between persistent agents.
 * Ctrl+C: graceful shutdown (stops daemon + agents).
 */

import blessed from "blessed";
import { execSync } from "node:child_process";
import { fetchUserCompanies, pickCompany } from "../lib/company-picker.js";
import { getValidCredentials } from "../lib/credentials.js";
import { isDaemonRunningForCompany } from "../lib/daemon.js";
import { loadConfig } from "../lib/config.js";

interface AgentSession {
  role: string;
  sessionName: string;
}

interface ChatOptions {
  companyName: string;
  agents: AgentSession[];
  onShutdown: () => void;
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

export function launchTui(options: ChatOptions): void {
  const { companyName, agents, onShutdown } = options;

  if (agents.length === 0) {
    console.error("No persistent agents running.");
    return;
  }

  let activeIndex = 0;
  let captureInterval: ReturnType<typeof setInterval> | null = null;

  const screen = blessed.screen({
    smartCSR: true,
    title: `zazig — ${companyName}`,
  });

  // --- Top: agent output ---
  const outputBox = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%-3",
    scrollable: true,
    alwaysScroll: true,
    scrollbar: { ch: "│" },
    tags: false,
    style: { fg: "white", bg: "black" },
  });

  // --- Status bar ---
  const statusBar = blessed.box({
    bottom: 2,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "white", bg: "blue" },
  });

  // --- Input line ---
  const inputBox = blessed.textbox({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    inputOnFocus: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "gray" },
    },
  });

  screen.append(outputBox);
  screen.append(statusBar);
  screen.append(inputBox);

  function updateStatusBar(): void {
    const tabs = agents
      .map((a, i) =>
        i === activeIndex
          ? `{bold}[${a.role.toUpperCase()}]{/bold}`
          : ` ${a.role.toUpperCase()} `
      )
      .join("  ");
    statusBar.setContent(`  ${companyName} · ${tabs}          Tab: switch`);
    screen.render();
  }

  function capturePane(): void {
    const session = agents[activeIndex]!.sessionName;
    try {
      const output = execSync(
        `tmux capture-pane -t ${session} -p -S -200`,
        { encoding: "utf-8", timeout: 2000 }
      );
      outputBox.setContent(output);
      outputBox.setScrollPerc(100);
      screen.render();
    } catch {
      // Session may not exist yet or tmux not ready
    }
  }

  function startCapture(): void {
    if (captureInterval) clearInterval(captureInterval);
    capturePane();
    captureInterval = setInterval(capturePane, 300);
  }

  function sendMessage(text: string): void {
    const session = agents[activeIndex]!.sessionName;
    const escaped = text.replace(/'/g, "'\\''");
    try {
      execSync(`tmux send-keys -t ${session} '${escaped}' Enter`, {
        timeout: 5000,
      });
    } catch {
      // Session may have died
    }
  }

  // --- Key bindings ---

  // Tab: cycle agents
  screen.key(["tab"], () => {
    if (agents.length > 1) {
      activeIndex = (activeIndex + 1) % agents.length;
      updateStatusBar();
      capturePane();
    }
  });

  // Ctrl+C: shutdown
  screen.key(["C-c"], () => {
    if (captureInterval) clearInterval(captureInterval);
    screen.destroy();
    onShutdown();
  });

  // Input handling
  inputBox.on("submit", (value: string) => {
    if (value.trim()) {
      sendMessage(value.trim());
    }
    inputBox.clearValue();
    inputBox.focus();
    screen.render();
  });

  // Focus input on start
  inputBox.focus();
  updateStatusBar();
  startCapture();
  screen.render();
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

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? "";
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
      process.exit(0);
    },
  });
}
