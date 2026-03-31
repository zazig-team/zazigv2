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
let sendCount = 0;

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
      'capture-pane', '-t', session, '-p', '-S', '-200',
    ]);
    return stdout;
  } catch (err) {
    console.error('[pty] capture-pane error:', err);
    return '';
  }
}

async function pollCapture(): Promise<void> {
  if (!activeSession) return;

  const content = await capturePane(activeSession);
  // Always resend for the first few polls — the renderer may not have its
  // IPC listener registered yet when the first capture arrives.
  const forceResend = sendCount < 5;
  if (content !== lastSnapshot || forceResend) {
    lastSnapshot = content;
    sendCount++;
    // Strip trailing empty lines, convert newlines to \r\n for xterm
    const trimmed = content.replace(/\n+$/, '');
    const formatted = trimmed.split('\n').join('\r\n');
    broadcastTerminalOutput('\x1b[2J\x1b[H' + formatted);
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
  sendCount = 0;

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
