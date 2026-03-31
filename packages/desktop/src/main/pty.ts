import { BrowserWindow } from 'electron';
import { spawn, execFileSync, type ChildProcess } from 'child_process';

import { TERMINAL_OUTPUT } from './ipc-channels';

// Electron doesn't inherit full shell PATH — resolve tmux location at startup
const TMUX_BIN = (() => {
  try {
    return execFileSync('/bin/sh', ['-lc', 'which tmux']).toString().trim();
  } catch {
    return '/usr/local/bin/tmux';
  }
})();

let activeChild: ChildProcess | null = null;
let activeSession: string | null = null;

function broadcastTerminalOutput(data: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(TERMINAL_OUTPUT, data);
  }
}

function normalizeSessionName(session: string): string {
  return session.trim();
}

function killActiveChild(): void {
  if (!activeChild) return;

  try {
    activeChild.kill();
  } catch (error) {
    console.error('[desktop] Failed to kill active child', error);
  }

  activeChild = null;
  activeSession = null;
}

export function attach(session: string): string {
  const normalizedSession = normalizeSessionName(session);
  if (!normalizedSession) {
    throw new Error('Session name is required');
  }

  killActiveChild();

  // Use script(1) to get a real PTY for tmux without needing node-pty.
  // script -q /dev/null runs the command in a PTY, discarding the typescript file.
  const child = spawn('/usr/bin/script', ['-q', '/dev/null', TMUX_BIN, 'attach', '-t', normalizedSession], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  activeChild = child;
  activeSession = normalizedSession;

  child.stdout?.on('data', (data: Buffer) => {
    broadcastTerminalOutput(data.toString());
  });

  child.stderr?.on('data', (data: Buffer) => {
    broadcastTerminalOutput(data.toString());
  });

  child.on('exit', () => {
    if (activeChild !== child) return;
    activeChild = null;
    activeSession = null;
    broadcastTerminalOutput('');
  });

  return normalizedSession;
}

export function detach(): void {
  killActiveChild();
}

export function resize(_cols: number, _rows: number): void {
  // resize not supported without node-pty — no-op for now
}

export function write(data: string): void {
  if (!activeChild) return;
  if (!data) return;

  activeChild.stdin?.write(data);
}

export function getActiveSession(): string | null {
  return activeSession;
}

export function sendSyntheticTerminalMessage(message: string): void {
  broadcastTerminalOutput(message);
}
