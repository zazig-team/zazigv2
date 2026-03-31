#!/usr/bin/env bun
/**
 * Sidecar WebSocket server — runs outside Electron via Bun.
 * Uses node-pty to spawn 'tmux attach -t <session>' and bridges PTY data
 * bidirectionally over a WebSocket connection.
 */
import pty from 'node-pty';
import { execSync } from 'child_process';

const TMUX_BIN = (() => {
  try {
    return execSync('which tmux').toString().trim();
  } catch {
    return '/usr/local/bin/tmux';
  }
})();

interface WsData {
  ptyProcess: ReturnType<typeof pty.spawn> | null;
  sessionReceived: boolean;
}

const server = Bun.serve<WsData>({
  port: 0, // bind to a random available port
  fetch(req, server) {
    const upgraded = server.upgrade(req, {
      data: { ptyProcess: null, sessionReceived: false },
    });
    if (upgraded) return undefined;
    return new Response('WebSocket upgrade required', { status: 426 });
  },
  websocket: {
    open(_ws) {
      console.error('[sidecar] WebSocket client connected');
    },

    message(ws, message) {
      // First message is the tmux session name
      if (!ws.data.sessionReceived) {
        ws.data.sessionReceived = true;
        const sessionName =
          typeof message === 'string'
            ? message.trim()
            : Buffer.from(message as ArrayBuffer).toString().trim();

        console.error(`[sidecar] session name received: ${sessionName}`);

        // Spawn: tmux attach -t <session> via node-pty
        console.error(`[sidecar] using tmux binary: ${TMUX_BIN}`);
        const ptyProcess = pty.spawn(TMUX_BIN, ['attach', '-t', sessionName], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env['HOME'] ?? process.cwd(),
          env: process.env as Record<string, string>,
        });

        ws.data.ptyProcess = ptyProcess;
        console.error(`[sidecar] PTY spawned for session: ${sessionName} (pid=${ptyProcess.pid})`);

        // Bridge PTY output → WebSocket (binary frames)
        ptyProcess.onData((data) => {
          ws.sendBinary(Buffer.from(data));
        });

        ptyProcess.onExit(({ exitCode }) => {
          console.error(`[sidecar] PTY exited with code ${exitCode}`);
          ws.close();
        });
        return;
      }

      const { ptyProcess } = ws.data;
      if (!ptyProcess) return;

      if (typeof message === 'string') {
        // Try to parse as resize message
        try {
          const json = JSON.parse(message) as { type?: string; cols?: number; rows?: number };
          if (
            json.type === 'resize' &&
            typeof json.cols === 'number' &&
            typeof json.rows === 'number'
          ) {
            ptyProcess.resize(json.cols, json.rows);
            return;
          }
        } catch {
          // Not JSON — treat as terminal input
        }
        ptyProcess.write(message);
      } else {
        // Binary input frame — forward as string to PTY
        ptyProcess.write(Buffer.from(message as ArrayBuffer).toString());
      }
    },

    close(ws) {
      console.error('[sidecar] WebSocket client disconnected');
      ws.data.ptyProcess?.kill();
      ws.data.ptyProcess = null;
    },
  },
});

// Print the port number to stdout so the parent process can read it.
// Use write() instead of console.log() to avoid buffering issues in Bun.
process.stdout.write(server.port + '\n');
console.error(`[sidecar] listening on port ${server.port}`);
