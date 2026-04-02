status: pass
summary: Added status whitelist (requested, claimed, starting, run) and 2-day recency filter to expert_sessions query in status.ts
files_changed:
  - packages/cli/src/commands/status.ts
failure_reason:

---

summary: Removed attachCustomWheelEventHandler from TerminalPane so xterm.js handles mouse-wheel scrolling natively, and added terminal.reset() after terminal.clear() on session disconnect to fully clear scrollback buffer.
files_changed:
  - packages/desktop/src/renderer/components/TerminalPane.tsx
  - tests/features/electron-desktop-app-terminal-and-sessions.test.ts
  - tests/features/desktop-terminal-scroll-wheel-fix.test.ts (deleted)
