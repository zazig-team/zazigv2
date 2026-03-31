import { BrowserWindow } from 'electron';
import { execFileSync, execFile } from 'child_process';
import { promisify } from 'util';

import { TERMINAL_OUTPUT } from './ipc-channels';

const execFileAsync = promisify(execFile);

const TMUX_BIN = (() => {
  try {
    return execFileSync('/bin/sh', ['-lc', 'which tmux']).toString().trim();
  } catch {
    return '/usr/local/bin/tmux';
  }
})();

let activeSession: string | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let lastSnapshot = '';

function broadcastTerminalOutput(data: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(TERMINAL_OUTPUT, data);
  }
}

function normalizeSessionName(session: string): string {
  return session.trim();
}

async function capturePane(session: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(TMUX_BIN, [
      'capture-pane', '-t', session, '-p', '-e', '-S', '-200',
    ]);
    return stdout;
  } catch {
    return '';
  }
}

async function pollCapture(): Promise<void> {
  if (!activeSession) return;

  const content = await capturePane(activeSession);
  console.error(`[pty] capture-pane for ${activeSession}: ${content.length} bytes, changed=${content !== lastSnapshot}`);
  if (content !== lastSnapshot) {
    lastSnapshot = content;
    // Send full pane content — renderer's xterm should handle it as a refresh
    broadcastTerminalOutput('\x1b[2J\x1b[H' + content);
  }
}

export function attach(session: string): string {
  const normalizedSession = normalizeSessionName(session);
  if (!normalizedSession) {
    throw new Error('Session name is required');
  }

  detach();

  activeSession = normalizedSession;
  lastSnapshot = '';

  // Initial capture
  void pollCapture();

  // Poll every 500ms for pane changes
  pollTimer = setInterval(() => {
    void pollCapture();
  }, 500);

  return normalizedSession;
}

export function detach(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  activeSession = null;
  lastSnapshot = '';
}

export function resize(_cols: number, _rows: number): void {
  // Resize not applicable — we're observing an existing tmux session
}

export function write(data: string): void {
  if (!activeSession) return;
  if (!data) return;

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
