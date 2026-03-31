import { BrowserWindow } from 'electron';
import { spawn, execFileSync, type ChildProcess } from 'child_process';

import { TERMINAL_OUTPUT } from './ipc-channels';

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

  // Use tmux pipe-pane to stream output from the session, and send-keys for input.
  // This avoids needing node-pty (which requires Electron-specific native rebuild).
  // tmux capture-pane + pipe-pane gives us a read-only view of the session.
  const child = spawn(TMUX_BIN, [
    'pipe-pane', '-t', normalizedSession, '-o', 'cat',
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  activeChild = child;
  activeSession = normalizedSession;

  child.stdout?.on('data', (data: Buffer) => {
    broadcastTerminalOutput(data.toString());
  });

  child.on('exit', () => {
    if (activeChild !== child) return;
    activeChild = null;
    activeSession = null;
    broadcastTerminalOutput('');
  });

  // Capture the current pane content immediately so the user sees existing output
  try {
    const captured = execFileSync(TMUX_BIN, [
      'capture-pane', '-t', normalizedSession, '-p', '-S', '-100',
    ]).toString();
    if (captured.trim()) {
      broadcastTerminalOutput(captured);
    }
  } catch {
    // ignore — pane might not have content yet
  }

  return normalizedSession;
}

export function detach(): void {
  if (activeSession) {
    // Stop the pipe-pane
    try {
      execFileSync(TMUX_BIN, ['pipe-pane', '-t', activeSession]);
    } catch {
      // ignore
    }
  }
  killActiveChild();
}

export function resize(_cols: number, _rows: number): void {
  // Resize not applicable — we're observing an existing tmux session, not owning it
}

export function write(data: string): void {
  if (!activeSession) return;
  if (!data) return;

  // Send keystrokes to the tmux session
  try {
    execFileSync(TMUX_BIN, ['send-keys', '-t', activeSession, '-l', data]);
  } catch (error) {
    console.error('[desktop] Failed to send keys to tmux', error);
  }
}

export function getActiveSession(): string | null {
  return activeSession;
}

export function sendSyntheticTerminalMessage(message: string): void {
  broadcastTerminalOutput(message);
}
