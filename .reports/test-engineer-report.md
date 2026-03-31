status: pass

## Test files created

- `tests/features/electron-desktop-app-launch-and-structure.test.ts` — 22 test cases
- `tests/features/electron-desktop-app-terminal-and-sessions.test.ts` — 27 test cases

## Total test cases: 49

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
