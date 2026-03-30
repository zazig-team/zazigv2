import { execFile, execFileSync } from "node:child_process";

export const PERSISTENT_ROLES = ["cpo", "cto", "vpe"];

export interface AgentSession {
  role: string;
  sessionName: string;
  isAlive: boolean;
}

/**
 * Zazig session naming pattern: <machine>-<companyId>-<role>
 * e.g. macbook-550e8400-e29b-41d4-a716-446655440000-cpo
 */
const ZAZIG_SESSION_PATTERN = /^[^-]+-[0-9a-f-]+-[a-z-]+$/;

export type SessionGeometry = {
  top?: number;
  left?: number;
  width: number;
  height: number;
};

type ExecResult = {
  stdout: string;
  stderr: string;
};

export class TmuxSessionNotFoundError extends Error {
  readonly code = "TMUX_SESSION_NOT_FOUND" as const;

  constructor(public readonly sessionName: string) {
    super(`tmux session not found: ${sessionName}`);
    this.name = "TmuxSessionNotFoundError";
  }
}

/**
 * Returns true if the role is a persistent agent (cpo, cto, vpe)
 * as opposed to an expert session (hotfix-engineer, spec-writer, etc.)
 */
export function isPersistentAgent(role: string): boolean {
  return PERSISTENT_ROLES.includes(role);
}

/**
 * Shells out to tmux to list sessions, filters for zazig naming pattern,
 * and returns AgentSession objects with role, sessionName, and isAlive fields.
 *
 * Returns an empty array if tmux is not running or has no sessions.
 */
export function listAgentSessions(): AgentSession[] {
  let output: string;
  try {
    output = execFileSync("tmux", ["list-sessions", "-F", "#{session_name}"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return [];
  }

  const lines = output.split("\n").filter(Boolean);
  const sessions: AgentSession[] = [];

  for (const sessionName of lines) {
    if (!ZAZIG_SESSION_PATTERN.test(sessionName)) {
      continue;
    }

    const parts = sessionName.split("-");
    if (parts.length < 7) {
      continue;
    }

    const role = parts.slice(6).join("-");

    sessions.push({
      role,
      sessionName,
      isAlive: true,
    });
  }

  return sessions;
}

function isSessionNotFoundMessage(message: string): boolean {
  return /can't find session|no such session/i.test(message);
}

function runTmux(args: string[]): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    execFile("tmux", args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({
        stdout: String(stdout ?? ""),
        stderr: String(stderr ?? ""),
      });
    });
  });
}

async function assertSessionExists(sessionName: string): Promise<void> {
  try {
    await runTmux(["has-session", "-t", sessionName]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSessionNotFoundMessage(message)) {
      throw new TmuxSessionNotFoundError(sessionName);
    }
    throw error;
  }
}

function assertSessionName(sessionName: string): void {
  if (!sessionName || !sessionName.trim()) {
    throw new Error("sessionName must be a non-empty string");
  }
}

function assertGeometry(geometry: SessionGeometry): void {
  if (!Number.isFinite(geometry.width) || geometry.width <= 0) {
    throw new Error("geometry.width must be a positive number");
  }
  if (!Number.isFinite(geometry.height) || geometry.height <= 0) {
    throw new Error("geometry.height must be a positive number");
  }

  const top = geometry.top ?? 0;
  const left = geometry.left ?? 0;
  if (!Number.isFinite(top) || top < 0) {
    throw new Error("geometry.top must be a non-negative number");
  }
  if (!Number.isFinite(left) || left < 0) {
    throw new Error("geometry.left must be a non-negative number");
  }
}

export async function hasSession(sessionName: string): Promise<boolean> {
  assertSessionName(sessionName);
  try {
    await runTmux(["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

export async function switchSession(sessionName: string): Promise<void> {
  assertSessionName(sessionName);
  await assertSessionExists(sessionName);
  await runTmux(["switch-client", "-t", sessionName]);
}

export async function embedSession(sessionName: string, geometry: SessionGeometry): Promise<void> {
  assertSessionName(sessionName);
  assertGeometry(geometry);
  await assertSessionExists(sessionName);

  await runTmux(["join-pane", "-s", `${sessionName}:`, "-t", "."]);
  await runTmux([
    "resize-pane",
    "-t",
    ".",
    "-x",
    String(Math.floor(geometry.width)),
    "-y",
    String(Math.floor(geometry.height)),
  ]);
}
