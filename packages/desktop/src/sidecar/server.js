#!/usr/bin/env node
/**
 * Sidecar WebSocket server — runs outside Electron via Node.
 * Uses node-pty to spawn 'tmux attach -t <session>' and bridges PTY data
 * bidirectionally over a WebSocket connection.
 */
const pty = require('node-pty');
const { WebSocketServer } = require('ws');
const { createServer } = require('http');
const { execSync } = require('child_process');
const { chmodSync, statSync } = require('fs');
const path = require('path');

// Fix node-pty prebuild permissions — spawn-helper ships without +x
(() => {
  try {
    const platform = process.platform === 'darwin' ? `darwin-${process.arch}` : `${process.platform}-${process.arch}`;
    const helperPath = path.join(
      path.dirname(require.resolve('node-pty')),
      '..', 'prebuilds', platform, 'spawn-helper',
    );
    const stat = statSync(helperPath);
    if (!(stat.mode & 0o111)) {
      chmodSync(helperPath, stat.mode | 0o755);
      console.error('[sidecar] fixed spawn-helper permissions');
    }
  } catch {
    // ignore — might not be using prebuilds
  }
})();

const TMUX_BIN = (() => {
  try {
    return execSync('which tmux').toString().trim();
  } catch {
    return '/usr/local/bin/tmux';
  }
})();

const httpServer = createServer();
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  console.error('[sidecar] WebSocket client connected');
  let ptyProcess = null;
  let sessionReceived = false;

  ws.on('message', (message) => {
    if (!sessionReceived) {
      sessionReceived = true;
      const sessionName = message.toString().trim();
      console.error(`[sidecar] session name received: ${sessionName}`);
      console.error(`[sidecar] using tmux binary: ${TMUX_BIN}`);

      try {
        ptyProcess = pty.spawn(TMUX_BIN, ['attach', '-t', sessionName], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: process.env.HOME || process.cwd(),
          env: process.env,
        });
        console.error(`[sidecar] PTY spawned for session: ${sessionName} (pid=${ptyProcess.pid})`);
      } catch (err) {
        console.error(`[sidecar] PTY spawn failed:`, err);
        ws.close();
        return;
      }

      ptyProcess.onData((data) => {
        if (ws.readyState === 1) {
          ws.send(data);
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        console.error(`[sidecar] PTY exited with code ${exitCode}`);
        ws.close();
      });
      return;
    }

    if (!ptyProcess) return;

    const str = message.toString();
    try {
      const json = JSON.parse(str);
      if (json.type === 'resize' && typeof json.cols === 'number' && typeof json.rows === 'number') {
        ptyProcess.resize(json.cols, json.rows);
        return;
      }
    } catch {
      // Not JSON — treat as terminal input
    }
    ptyProcess.write(str);
  });

  ws.on('close', () => {
    console.error('[sidecar] WebSocket client disconnected');
    if (ptyProcess) {
      ptyProcess.kill();
      ptyProcess = null;
    }
  });
});

// Bind to random port
httpServer.listen(0, '127.0.0.1', () => {
  const port = httpServer.address().port;
  process.stdout.write(port + '\n');
  console.error(`[sidecar] listening on port ${port}`);
});
