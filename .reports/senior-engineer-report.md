status: fail
summary: Extended SessionViewer to poll tmux session liveness, render in-Ink centered muted placeholders for ended/waiting states, detach embedded panes on session death, and re-embed automatically when sessions reappear.
files_changed:
  - packages/tui/src/components/SessionViewer.tsx
  - packages/tui/src/lib/tmux.ts
  - packages/tui/src/components/SessionViewer.ts
failure_reason: Could not stage/commit due sandbox permission error creating git index lock at .git/worktrees/.../index.lock (Operation not permitted).
