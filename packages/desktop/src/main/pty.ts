import { BrowserWindow } from 'electron';
import WebSocket from 'ws';

import { TERMINAL_OUTPUT } from './ipc-channels';

// The sidecar (server.ts) uses node-pty to spawn: tmux attach -t <session>
// This module connects to the sidecar WebSocket, relays terminal data to the
// renderer, and forwards input/resize messages to the sidecar.

let activeSession: string | null = null;
let ws: WebSocket | null = null;
let sidecarPort: number | null = null;

function broadcastTerminalOutput(data: string): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(TERMINAL_OUTPUT, data);
  }
}

export function setSidecarPort(port: number): void {
  sidecarPort = port;
}

export function attach(session: string): string {
  const normalizedSession = session.trim();
  if (!normalizedSession) {
    throw new Error('Session name is required');
  }

  detach();

  if (!sidecarPort) {
    throw new Error('Sidecar not available');
  }

  activeSession = normalizedSession;

  const socket = new WebSocket(`ws://127.0.0.1:${sidecarPort}`);
  ws = socket;

  socket.on('open', () => {
    socket.send(normalizedSession);
  });

  socket.on('message', (data) => {
    const text = Buffer.isBuffer(data) ? data.toString() : String(data);
    broadcastTerminalOutput(text);
  });

  socket.on('close', () => {
    if (ws === socket) {
      ws = null;
      activeSession = null;
    }
  });

  socket.on('error', (err) => {
    console.error('[pty] WebSocket error:', err);
    if (ws === socket) {
      ws = null;
      activeSession = null;
    }
  });

  return normalizedSession;
}

export function detach(): void {
  const socket = ws;
  ws = null;
  activeSession = null;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
  }
}

export function resize(cols: number, rows: number): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}

export function write(data: string): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!data) return;
  ws.send(data);
}

export function getActiveSession(): string | null {
  return activeSession;
}

export function sendSyntheticTerminalMessage(message: string): void {
  broadcastTerminalOutput(message);
}
