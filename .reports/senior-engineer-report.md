status: pass
summary: Extended SessionViewer with liveness polling every 2s, centered "Session ended"/"Waiting for agents..." placeholders, and automatic re-embedding when a dead session reappears; added hasSession export to tmux.ts.
files_changed:
  - packages/tui/src/components/SessionViewer.ts
  - packages/tui/src/lib/tmux.ts
