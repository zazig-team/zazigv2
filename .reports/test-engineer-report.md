status: pass

## Test files created (desktop-sidebar-permanent-agents feature)

- `tests/features/desktop-sidebar-permanent-agents-listing-and-switching.test.ts` — 36 test cases across 10 describe blocks

### AC7 — PipelineViewData includes permanentAgents (3 tests)
### AC1/AC2 — PermanentAgent entry interface shape: id, role, status, sessionName (5 tests)
### AC7 — parsePipelinePayload populates permanentAgents from status.persistent_agents (2 tests)
### AC8 — Session name resolution per agent by role or direct session field (3 tests)
### AC1/AC6 — Sidebar renders agents section, maps over all agents (5 tests)
### AC2 — Running status shown with visual indicator (2 tests)
### AC3/AC4 — Click switches terminal; active agent highlighted with aria-pressed (5 tests)
### AC5 — Agents without session show grey indicator (2 tests)
### CLI agents command — persistent agent entries include tmux_session (3 tests)
### CLI status command — persistent_agents entries include tmux_session (3 tests)

## Notes

- `tests/vitest.config.ts` already includes `features/**/*.test.ts` — no package.json changes needed.
- All tests use static source analysis consistent with this codebase's feature test conventions.
- All tests written to FAIL against current codebase (feature not yet implemented).

---

## Previous report (desktop-drag-and-drop-image-support feature)

- `tests/features/desktop-drag-and-drop-image-support.test.ts` — 26 test cases

### AC1 — Drop saves file and injects absolute path into terminal (7 tests)
- TerminalPane.tsx has an onDrop handler
- TerminalPane.tsx calls saveAttachment on drop
- TerminalPane.tsx injects the returned file path via window.zazig.terminalInput()
- preload.ts exposes saveAttachment on the zazig bridge
- main/index.ts handles the saveAttachment IPC channel
- main/index.ts writes the file under ~/.zazigv2/attachments/
- main/index.ts uses a timestamp prefix in the saved filename

### AC2 — Drop zone overlay appears on dragover, disappears on dragleave/drop (8 tests)
- TerminalPane.tsx has an onDragOver handler
- TerminalPane.tsx has an onDragLeave handler
- Tracks a drop-zone-active boolean state
- Renders drop zone overlay element conditionally
- dragover sets state to true; dragleave and drop reset to false
- dragover handler calls event.preventDefault()

### AC3 — Multiple files are injected as space-separated paths (2 tests)
- drop handler iterates over dataTransfer.files or dataTransfer.items
- multiple paths joined with a space separator

### AC4 — Non-image files handled identically (2 tests)
- no MIME type or extension filter applied
- all dropped files processed regardless of type

### AC5 — IPC channel wiring complete (5 tests)
- ipc-channels.ts exports a SAVE_ATTACHMENT constant
- preload.ts imports and exposes saveAttachment via ipcRenderer.invoke
- main/index.ts uses ipcMain.handle and returns the absolute saved path

### AC6 — No errors when no active session (2 tests)
- drop handler guards against null window.zazig
- async error handling for saveAttachment

## Notes

- `tests/package.json` uses `vitest run` which auto-discovers recursively — no changes needed.
- All tests use static source analysis consistent with this codebase's feature test conventions.
- All tests written to FAIL against current codebase (feature not yet implemented).

---

## Previous report (desktop-expert-sessions feature)

- `tests/features/desktop-expert-sessions-cli-status.test.ts` — 10 test cases
- `tests/features/desktop-expert-sessions-sidebar.test.ts` — 12 test cases
- `tests/features/desktop-expert-sessions-auto-attach.test.ts` — 10 test cases

## Total test cases: 32

### desktop-expert-sessions-cli-status.test.ts
Covers: CLI `zazig status --json` adds `expert_sessions` key (AC1, AC4, AC5)
- `expert_sessions` field present in `JsonStatusOutput` type
- Field typed as an array
- `ExpertSession` shape: id, role_name, session_id, status, created_at
- Data source (expert_sessions table / tmux expert-* pattern) queried
- Results populated in output JSON object

### desktop-expert-sessions-sidebar.test.ts
Covers: PipelineColumn sidebar Expert Sessions section (AC2, AC3, AC4, AC5)
- "Expert Sessions" section heading rendered
- Section positioned below Active Jobs
- Expert session cards mapped from `expert_sessions` array
- Each card displays `role_name`
- onClick calls `window.zazig.terminalAttach(session_id)` (same flow as job clicks)
- Rendering is data-driven (cards disappear when session no longer in payload)
- `parsePipelinePayload` extracts `expert_sessions` from status JSON

### desktop-expert-sessions-auto-attach.test.ts
Covers: Poller auto-attaches on new expert session (AC1, AC6)
- Poller reads `expert_sessions` from CLI status output
- Poller calls `terminalAttach` when new session detected
- Poller tracks known session IDs between poll cycles
- Comparison against previous IDs prevents re-triggering
- Known IDs updated after each cycle
- Renderer notified via IPC `webContents.send` with expert session context
- Main process wires `terminalAttach` IPC handler

## Notes

- `tests/package.json` uses `vitest run` which discovers files recursively — no `package.json` changes needed.
- All tests use static source analysis consistent with this codebase's feature test conventions.
- All tests written to FAIL against current codebase (features not yet implemented).

---

## Previous report (electron-desktop-app feature)

### electron-desktop-app-launch-and-structure.test.ts
Covers AC1, AC2, AC9, AC10.
- AC1: zazig desktop CLI command (desktop.ts) exists and spawns Electron
- AC1: packages/desktop package.json exists with electron + esbuild deps
- AC1: Electron main.ts creates BrowserWindow and loads renderer
- AC1: Renderer has two-panel split-view layout (App.tsx/Layout.tsx)
- AC2: Pipeline column shows active jobs, failed, backlog, recently completed, status bar
- AC2: Recently completed limited to 5 items and collapsible
- AC9: Watch button shows "not running locally" message for non-running jobs
- AC10: No code signing, DMG targets, or auto-update packages

### electron-desktop-app-terminal-and-sessions.test.ts
Covers AC3, AC4, AC5, AC6, AC7, AC8.
- AC3: Main process polls zazig status --json every 5000ms via setInterval, diffs before sending
- AC3: Renderer receives IPC updates and stores in React state
- AC4: Green/grey dot per active job based on tmux session presence
- AC4: Main process cross-references standup/tmux sessions with job list
- AC5: Terminal.tsx uses xterm.js; main uses node-pty + tmux attach -t
- AC5: Pipeline onClick sends attach IPC message
- AC6: Tracks currentSession, kills pty before attaching new one, single session only
- AC7: Attaches CPO session by default on launch; shows "No active agents" when unavailable
- AC8: xterm mouseMode enabled, FitAddon resize, scrollback buffer
- AC8: Main streams pty data to renderer and writes renderer input to pty

## Notes

- No changes to `package.json` needed — test script delegates to workspace runners which use vitest recursively.
- All tests written to FAIL against current codebase: `packages/desktop` does not exist yet.

---

### desktop-terminal-scroll-wheel-fix.test.ts (feature e24d7bde)
Covers AC1–AC5 for the terminal scroll escape-characters fix.
- AC5: Dead `mouseEvents` hack removed from TerminalPane.tsx
- AC1/AC2: `attachCustomWheelEventHandler` sends `\x1b[A`/`\x1b[B` via `terminalInput()`
- AC3: Wheel handler unconditionally attached (no tmux guard)
- AC4: `terminal.onData` keyboard handler still present and wired
- AC5 (ext): Wheel handler does not call `terminal.write()` directly
