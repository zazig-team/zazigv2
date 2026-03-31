import { BrowserWindow } from 'electron';
import { execFileSync } from 'child_process';
import * as pty from 'node-pty';
import { type IPty } from 'node-pty';

import { TERMINAL_OUTPUT } from './ipc-channels';

// Electron doesn't inherit full shell PATH — resolve tmux location at startup
const TMUX_BIN = (() => {
  try {
    return execFileSync('/bin/sh', ['-lc', 'which tmux']).toString().trim();
  } catch {
    return '/usr/local/bin/tmux';
  }
})();

let activePty: IPty | null = null;
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

function killActivePty(): void {
  if (!activePty) return;

  try {
    activePty.kill();
  } catch (error) {
    console.error('[desktop] Failed to kill active PTY', error);
  }

  activePty = null;
  activeSession = null;
}

export function attach(session: string): string {
  const normalizedSession = normalizeSessionName(session);
  if (!normalizedSession) {
    throw new Error('Session name is required');
  }

  killActivePty();

  const nextPty = pty.spawn(TMUX_BIN, ['attach', '-t', normalizedSession], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: process.cwd(),
    env: process.env,
  });

  activePty = nextPty;
  activeSession = normalizedSession;

  nextPty.onData((data) => {
    broadcastTerminalOutput(data);
  });

  nextPty.onExit(() => {
    if (activePty !== nextPty) return;
    activePty = null;
    activeSession = null;
    // Empty payload signals renderer that the PTY disconnected.
    broadcastTerminalOutput('');
  });

  return normalizedSession;
}

export function detach(): void {
  killActivePty();
}

export function resize(cols: number, rows: number): void {
  if (!activePty) return;
  if (cols <= 0 || rows <= 0) return;

  try {
    activePty.resize(cols, rows);
  } catch (error) {
    console.error('[desktop] Failed to resize PTY', error);
  }
}

export function write(data: string): void {
  if (!activePty) return;
  if (!data) return;

  activePty.write(data);
}

export function getActiveSession(): string | null {
  return activeSession;
}

export function sendSyntheticTerminalMessage(message: string): void {
  broadcastTerminalOutput(message);
}
