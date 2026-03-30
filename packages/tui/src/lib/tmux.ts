import { execFile } from "node:child_process";

export type SessionGeometry = {
  top: number;
  left: number;
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

export async function switchSession(sessionName: string): Promise<void> {
  assertSessionName(sessionName);
  await assertSessionExists(sessionName);
  await runTmux(["switch-client", "-t", sessionName]);
}

export async function embedSession(sessionName: string, geometry: SessionGeometry): Promise<void> {
  assertSessionName(sessionName);
  assertGeometry(geometry);
  await assertSessionExists(sessionName);

  // Embed the source session's active pane into the current TUI window, then size it.
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
