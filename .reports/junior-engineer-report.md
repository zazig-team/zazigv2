status: pass
summary: Removed attachCustomWheelEventHandler from TerminalPane so xterm.js handles mouse-wheel scrolling natively, and added terminal.reset() after terminal.clear() on session disconnect to fully clear scrollback buffer.
files_changed:
  - packages/desktop/src/renderer/components/TerminalPane.tsx
  - tests/features/electron-desktop-app-terminal-and-sessions.test.ts
  - tests/features/desktop-terminal-scroll-wheel-fix.test.ts (deleted)
