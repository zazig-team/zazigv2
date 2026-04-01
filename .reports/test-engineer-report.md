status: pass

## Test files created (desktop-expert-sessions feature)

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
