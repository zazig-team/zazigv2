import { execSync } from "node:child_process";

// zazig session naming format: <machine>-<companyId>-<role>
const ZAZIG_SESSION_PATTERN = /^([^-]+)-([0-9a-f-]+)-([a-z-]+)$/;

export const PERSISTENT_ROLES = ["cpo", "cto", "vpe"] as const;

const PERSISTENT_ROLE_SET = new Set<string>(PERSISTENT_ROLES);

export interface AgentSession {
  role: string;
  sessionName: string;
  isAlive: boolean;
}

// persistent agents are long-lived exec roles; non-persistent roles are expert sessions.
export function isPersistentAgent(role: string): boolean {
  return PERSISTENT_ROLE_SET.has(role);
}

function listTmuxSessionNames(): string[] {
  try {
    const output = execSync("tmux list-sessions -F '#{session_name}'", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // tmux exits non-zero when no server is running; treat that as no sessions.
    return [];
  }
}

export function listAgentSessions(): AgentSession[] {
  const sessionNames = listTmuxSessionNames();
  const aliveSessionSet = new Set(sessionNames);

  return sessionNames
    .filter((sessionName) => ZAZIG_SESSION_PATTERN.test(sessionName))
    .map((sessionName) => {
      const match = ZAZIG_SESSION_PATTERN.exec(sessionName);
      const role = match?.[3] ?? "";

      return {
        role,
        sessionName,
        isAlive: aliveSessionSet.has(sessionName),
      };
    });
}
