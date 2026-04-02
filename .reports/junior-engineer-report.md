status: pass
summary: Updated PipelineColumn.tsx expert session cards to use onExpertClick callback prop with proper isActive guard, blue active highlight styling, and onKeyDown handler.
files_changed:
  - packages/desktop/src/renderer/components/PipelineColumn.tsx
failure_reason:

---

summary: Added the desktop IPC channel constant for expert session auto-switch and exposed an `onExpertSessionAutoSwitch` listener on the preload `zazig` bridge.
files_changed:
  - packages/desktop/src/main/ipc-channels.ts
  - packages/desktop/src/main/preload.ts
failure_reason:

---

summary: Added status whitelist (requested, claimed, starting, run) and 2-day recency filter to expert_sessions query in status.ts
files_changed:
  - packages/cli/src/commands/status.ts
failure_reason:

---

summary: Updated orchestrator to use 'run' status instead of 'running'/'completed', removed stale 'executing' from ACTIVE_SPEC_SESSION_STATUSES, and fixed conditional guards to use the new status model without inverting business logic.
files_changed:
  - supabase/functions/orchestrator/index.ts

---

summary: Removed attachCustomWheelEventHandler from TerminalPane so xterm.js handles mouse-wheel scrolling natively, and added terminal.reset() after terminal.clear() on session disconnect to fully clear scrollback buffer.
files_changed:
  - packages/desktop/src/renderer/components/TerminalPane.tsx
  - tests/features/electron-desktop-app-terminal-and-sessions.test.ts
  - tests/features/desktop-terminal-scroll-wheel-fix.test.ts (deleted)
