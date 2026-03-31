status: pass
summary: Implemented desktop terminal sidecar WebSocket bridge — Bun sidecar uses node-pty to attach to tmux sessions and bridges PTY data bidirectionally over WebSocket; Electron main process spawns the sidecar and pty.ts connects via ws instead of capture-pane polling.
files_changed:
  - packages/desktop/src/sidecar/server.ts (created)
  - packages/desktop/src/main/pty.ts (rewritten to use WebSocket)
  - packages/desktop/src/main/index.ts (spawn sidecar on startup, kill on quit)
  - packages/desktop/package.json (added ws + @types/ws)
  - packages/desktop/esbuild.config.mjs (added ws to externals)
