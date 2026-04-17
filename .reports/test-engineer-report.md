status: pass

## Test files created (quiet-hours-push-notification-suppression feature aa8b3f48)

### 1. `tests/features/quiet-hours-is-quiet-now-logic.test.ts` — 38 test cases
Tests the pure `isQuietNow(entries, day, time)` function from `packages/shared/src/quiet-hours.ts`.

**Acceptance criteria covered:** AC3, AC4, AC5, AC7, AC8, AC10, AC11 (logic), AC12 (logic)

- AC3 & AC4: Normal window suppression and passthrough (6 cases)
- AC5: Midnight-spanning window (22:00–07:00) — suppresses at 23:30 and 06:00 (8 cases)
- AC7: Empty entries array → no suppression (2 cases)
- AC8: All-day suppression (00:00–23:59) (4 cases)
- AC10: Multiple entries same day (lunch break + overnight) (5 cases)
- AC11 logic: Weeknights preset entries work correctly via isQuietNow (8 cases)
- AC12 logic: Weekends preset entries work correctly via isQuietNow (5 cases)

### 2. `tests/features/quiet-hours-supabase-schema.test.ts` — 9 test cases
Static analysis of `supabase/migrations/` to verify the quiet_hours schema migration.

**Acceptance criteria covered:** AC1, AC2, AC9

- AC1: Migration exists, defines `quiet_hours jsonb DEFAULT '[]'::jsonb`, targets `user_preferences` (5 cases)
- AC2: Schema supports per-user row persistence (user_id FK, UNIQUE constraint) (2 cases)
- AC9: RLS enabled, policy scoped to `auth.uid() = user_id` (2 cases)

### 3. `tests/features/quiet-hours-presets.test.ts` — 18 test cases
Tests `buildWeeknightsPreset()` and `buildWeekendsPreset()` from `packages/shared/src/quiet-hours.ts`, plus AC6 (synchronous effect).

**Acceptance criteria covered:** AC6, AC11, AC12

- AC11: `buildWeeknightsPreset()` returns 5 entries Mon–Fri 22:00–07:00 (7 cases)
- AC12: `buildWeekendsPreset()` returns 2 entries Sat–Sun 00:00–23:59 (7 cases)
- AC6: `isQuietNow` is synchronous, changes take effect immediately (3 cases)

**Total: 65 new test cases. All written to FAIL against current codebase.**

`package.json` NOT modified — `tests` workspace uses `vitest run` which discovers recursively.

---

## Previous test reports

## Test files created (retry-failed-uploads feature e2df6871)

### `tests/features/retry-failed-uploads.test.ts` — 16 test cases

**AC1: contextRef fetch retries on transient errors (5xx / network) — 6 tests**
- executor.ts exists
- resolveContext contains a retry loop or recursive retry call
- declares a maximum number of retry attempts (constant or parameter)
- implements exponential or fixed back-off between retries
- retries specifically on 5xx HTTP status codes
- retries on network/fetch errors (non-HTTP failures)

**AC2: contextRef fetch does NOT retry on permanent errors (4xx) — 2 tests**
- distinguishes retriable from permanent status codes
- throws immediately on 4xx without retry

**AC3: Job is failed with a clear error after max retries exhausted — 2 tests**
- throws a descriptive error when retries are exhausted
- sendJobFailed is reachable when resolveContext throws after exhausted retries

**AC4: Retry parameters are bounded and reasonable — 2 tests**
- maximum retry count is ≤ 5 (avoids infinite loops on persistent failures)
- back-off delay is reasonable (≥ 500ms, ≤ 30000ms)

**AC5: Successful retry returns the correct context string — 2 tests**
- resolveContext still returns response.text() on success
- retry loop exits and returns on a successful fetch (2xx)

**AC6: Retry attempts are logged for observability — 2 tests**
- logs a warning or info message when a retry is attempted
- logs the attempt number and/or remaining retries

All 16 tests written to FAIL against current codebase — `resolveContext` currently does
a single-shot fetch with no retry logic. No `package.json` changes needed — `vitest run`
in `tests/package.json` discovers test files recursively.

---

## Test files created (cross-tenant-job-failure-to-idea feature 1f627dc8)

### `tests/features/cross-tenant-job-failure-to-idea.test.ts` — 27 test cases

**Migration: trigger function (14 tests)**
- Trigger created AFTER UPDATE OF status on public.jobs FOR EACH ROW
- Calls `notify_job_failure_to_zazig` as the trigger function
- Guards: `NEW.status <> 'failed'` AND `OLD.status IS NOT DISTINCT FROM 'failed'`
- Inserts into `public.ideas` with `company_id = 00000000-0000-0000-0000-000000000001` and `project_id = 3c405cbc-dbb0-44c5-a27d-de48fb573b13`
- Sets `item_type='bug'`, `source='monitoring'`, `originator='job-failure-monitor'`, `source_ref=NEW.id`, `status='new'`
- Builds `raw_text` via `format()` including company name/id, role, model, feature title, commit SHA, error_analysis
- Truncates `error_analysis` to 2000 chars
- Uses `COALESCE` with `'<unknown>'` for nullable fields
- Uses `ON CONFLICT DO NOTHING`
- Wraps insert in `BEGIN...EXCEPTION WHEN OTHERS` with `RAISE WARNING`
- Returns `NEW` so job status update is never blocked

**Migration: partial unique index (3 tests)**
- Unique index on `ideas(source_ref)` WHERE `source='monitoring' AND originator='job-failure-monitor'`
- Uses `IF NOT EXISTS`

**Only 'failed' status creates an idea (2 tests)**
- Early return when `NEW.status <> 'failed'`
- Combined guard prevents re-firing within 'failed' (idempotency)

**Self-observation: zazig-dev not excluded (2 tests)**
- No company_id exclusion guard in trigger body
- `NEW.company_id` included in `raw_text`

**Triage flow: bug at status='new' (3 tests + 1 negative)**
- `status='new'` for normal triage flow
- `item_type='bug'` for per-type automation
- Does NOT insert into `features` (no auto-promotion)

All 27 tests written to FAIL until the migration for `notify_job_failure_to_zazig` is added to `supabase/migrations/`.
No `package.json` changes needed — `tests/vitest.config.ts` already includes `features/**/*.test.ts`.

---

## Test files created (file-locking-credentials-json feature b4b8f152)

### `tests/features/file-locking-credentials-json.test.ts` — 18 test cases

**credentials.ts — getValidCredentials() acquires a file lock (5 tests)**
- File exists
- Imports a lock mechanism (proper-lockfile, flock, or similar)
- getValidCredentials() calls lock acquire before reading credentials
- getValidCredentials() releases the lock after write (finally block)
- saveCredentials() acquires a file lock before writing

**credentials.ts — uses credentials.lock as the lock file (2 tests)**
- References credentials.lock as the lock file path
- Lock file path is under the zazigDir() / ZAZIG_HOME directory

**credentials.ts — lock timeout is 5 seconds with graceful failure (3 tests)**
- Configures a timeout value of 5000ms for lock acquisition
- Logs a warning when lock acquisition times out
- Does not re-throw lock timeout as an unhandled error that hangs the process

**connection.ts — recoverSessionFromDisk() acquires a file lock (4 tests)**
- File exists
- Imports a lock mechanism
- recoverSessionFromDisk() acquires a lock before reading credentials.json
- recoverSessionFromDisk() releases the lock in a finally block

**connection.ts — onAuthStateChange write-back acquires a file lock (2 tests)**
- The onAuthStateChange handler acquires a lock before writeFileSync
- The lock is released after writeFileSync in the auth state change handler

**connection.ts — lock timeout is 5 seconds with graceful failure (3 tests)**
- Configures a timeout value of 5000ms for lock acquisition
- Logs a warning when lock acquisition times out
- Handles ELOCKED or lock timeout without crashing the daemon

**Stale lock detection — CLI can acquire lock after daemon killed mid-refresh (2 tests)**
- credentials.ts uses proper-lockfile or equivalent with stale detection
- connection.ts uses proper-lockfile or equivalent with stale detection

**Lock implementation — consistent lock file path across CLI and daemon (2 tests)**
- credentials.ts references credentials.lock
- connection.ts references credentials.lock (same lock file as CLI)

All 18 tests currently FAIL against the codebase (no locking logic present in either file).
No `package.json` changes needed — `vitest run` discovers tests/features/ recursively.

---

## Test files created (ci-monitor-extract-actionable-failure-context feature aa483d49)

### `tests/features/ci-monitor-extract-actionable-failure-context.test.ts` — 28 test cases

**AC2: ANSI escape code stripping (3 tests)**
- `extractFailureSummary` exported from local-agent
- Result contains no ANSI escape sequences
- Strips all common ANSI color codes

**AC1: Vitest failure summary extraction — only failing content (7 tests)**
- Summary contains the failing test name
- Summary contains the assertion error
- Summary does NOT contain passing test lines
- Summary contains the Test Files / Tests line
- Falls back to last 200 lines when no structured summary found
- Handles empty log without throwing

**AC3: 8KB hard cap with truncation marker (3 tests)**
- Summary is at most 8192 bytes
- Truncated summary includes `gh run view` pointer with run ID
- Truncated summary ends with truncation marker

**AC4: Workspace identification from npm error lines (3 tests)**
- Identifies `packages/orchestrator` from npm error path
- Identifies `packages/local-agent` from npm error path
- Includes npm error lines from the bottom of the log

**AC1/AC2 (behavioral): Feature spec uses extraction template (2 tests)**
- Feature spec contains FAILURE SUMMARY section, not raw log dump
- Feature spec contains no ANSI codes

**AC5: Structural — master-ci-monitor.js uses same extraction logic (9 tests)**
- executor.ts and master-ci-monitor.js both reference `extractFailureSummary`
- Both files reference FAILURE SUMMARY and HOW TO REPRODUCE template sections
- Both files contain ANSI stripping logic
- Both files enforce 8KB cap
- `extractFailureSummary` importable from master-ci-monitor.js

**Unit tests for extractFailureSummary edge cases (4 tests)**
- Extracts vitest FAIL block between FAIL marker and Test Files summary
- Extracts jest failure format
- Handles build error logs by returning last 200 lines
- Empty log handled gracefully

No `package.json` changes needed — `vitest run` discovers recursively.

---

## Test files created (desktop-expert-session-auto-switch-state-sync feature 5b40e4e1)

### `tests/features/desktop-expert-session-auto-switch-state-sync.test.ts` — 26 test cases

**poller.ts: syncExpertSessions routes through IPC (5 tests)**
- poller.ts file exists
- syncExpertSessions function is defined in poller.ts
- poller.ts broadcasts expert-session:auto-switch IPC event on new session (AC1/FC1)
- poller.ts does NOT call pty.attach() directly inside syncExpertSessions (FC1)
- poller.ts sends session ID with the IPC auto-switch event

**poller.ts: resetExpertSessionTracking called on SELECT_COMPANY (3 tests)**
- resetExpertSessionTracking function is defined in poller.ts
- resetExpertSessionTracking is called when SELECT_COMPANY IPC is received (AC5/FC3)
- poller.ts does NOT rely solely on poller stop to reset expert tracking (AC5)

**App.tsx: handles expert-session:auto-switch IPC and updates activeSession (5 tests)**
- App.tsx file exists
- App.tsx listens for expert-session:auto-switch IPC event
- App.tsx routes expert auto-switch through transitionQueueRef (AC4)
- App.tsx updates activeSession state when expert auto-switch fires (FC2)
- App.tsx updates activeSessionRef.current on expert auto-switch (AC6)

**App.tsx: provides onExpertClick prop that routes through transition queue (3 tests)**
- App.tsx defines an onExpertClick handler
- onExpertClick handler routes through transitionQueueRef (AC4)
- onExpertClick updates activeSession state (AC3)

**PipelineColumn.tsx: expert session card shows active highlight (4 tests)**
- PipelineColumn.tsx file exists
- PipelineColumn accepts activeSession prop
- expert session card compares activeSession against session ID for highlight (AC2)
- expert session card applies active styling class when session is active (AC2)

**PipelineColumn.tsx: expert session click uses onExpertClick callback prop (3 tests)**
- PipelineColumn accepts onExpertClick callback prop (AC3)
- expert session card onClick calls onExpertClick, not inline terminalAttach (FC1)
- PipelineColumn does not call window.electron.terminalAttach inline for expert sessions

**App.tsx: transition queue prevents races (3 tests)**
- App.tsx defines transitionQueueRef for serializing transitions
- all session switches enqueue through transitionQueueRef (AC4)
- activeSessionRef.current is updated before completing each transition (AC6)

**Total: 26 new test cases, all written to FAIL against current codebase.**

## Test files created (desktop-sidebar-persistent-agents-switching feature 434544fa)

### `tests/features/desktop-sidebar-persistent-agents-switching.test.ts` — 32 test cases

9 describe blocks covering all 7 acceptance criteria and 3 failure cases:

1. **PipelineColumn: hardcoded CPO button is removed** (3 tests) — AC7
2. **App.tsx: onCpoClick and isCpoActive are removed** (4 tests) — AC7
3. **PipelineColumn: persistent agents rendered from status payload** (5 tests) — AC1, FC1
4. **PipelineColumn: agent card liveness dot (green/grey)** (4 tests) — AC2
5. **PipelineColumn: active agent card has blue highlight** (2 tests) — AC3
6. **PipelineColumn: agent card click behavior** (3 tests) — AC4, AC5
7. **App.tsx: agent switching goes through the transition queue** (6 tests) — AC4, AC6, FC2
8. **PipelineColumn: non-running persistent agents shown greyed out** (2 tests) — AC5, FC3
9. (All tests written to FAIL against current codebase — feature not yet implemented)

## Test files created (expert-session-liveness-tmux-as-source-of-truth feature 3b53251b)

### 1. `tests/features/expert-session-liveness-migration.test.ts` — 8 test cases
- DB migration renames `running` rows to `run`
- DB migration renames `completed` rows to `run`
- CHECK constraint updated: includes `run`, excludes `running` and `completed`
- CHECK constraint includes all valid statuses: requested, claimed, starting, failed, cancelled
- `expert_sessions` table exists with status column

### 2. `tests/features/expert-session-liveness-manager.test.ts` — 9 test cases
- ExpertSessionManager sets `run` (not `running`) on session launch
- Does NOT write `completed` status or `completed_at`
- Exit handler does NOT update DB status after session ends
- Tmux polling loop does NOT write status back to DB
- `run` is the terminal status (no further transitions written)

### 3. `tests/features/expert-session-liveness-desktop.test.ts` — 12 test cases
- CLI status.ts filters expert sessions to last 2 days
- CLI status.ts filters by allowed statuses (requested, claimed, starting, run)
- Desktop poller checks tmux liveness using `expert-{first8chars}` naming
- Poller polls within 5-second window for liveness detection
- Poller hides run sessions whose tmux window does not exist
- PipelineColumn shows green dot for alive run sessions
- PipelineColumn hides dead run sessions (no tmux)
- Transient state sessions show spinner/yellow indicator
- Failed and cancelled sessions not rendered in sidebar

### 4. `tests/features/expert-session-liveness-orchestrator.test.ts` — 7 test cases
- `ACTIVE_SPEC_SESSION_STATUSES` includes `run`, excludes `running`
- Stale `executing` and `active` status references removed
- Expert session queries use `run`-based status set

**Total: 36 new test cases. All written to FAIL against current codebase.**

No `package.json` changes needed — `vitest run` discovers recursively.

---

## Test files created (desktop-expert-sessions-still-missing feature fd0d6fff)

### 1. `tests/features/desktop-expert-sessions-sidebar.test.ts` — 12 test cases
- `PipelineViewData` interface declares `expertSessions` field typed as array
- Expert session type includes `id`, `roleName`/`role_name`, `sessionId`/`session_id`, `status`
- `parsePipelinePayload` returns object with `expertSessions` key
- `getExpertSessions` or equivalent reads from `status.expert_sessions`
- Sidebar JSX includes an "Expert Sessions" section title
- Sidebar maps over `expertSessions` to render session cards
- Sidebar shows role name for each expert session card

**11 failing** (feature not yet built), 1 passing (file existence check).

### 2. `tests/features/desktop-expert-sessions-auto-switch.test.ts` — 10 test cases
- `linkToViewerTui` defined and called in non-headless code path
- `linkToViewerTui` awaited and not gated behind a headless-only guard
- `switchViewerToCpo` defined and called in `handleSessionExit`
- `getActiveSessions` exposes sidebar-friendly session data (displayName, tmuxSession)
- Desktop poller references `expert_sessions` when building the pipeline payload

**2 failing** (poller doesn't inject expert_sessions; getActiveSessions returns raw Map), 8 passing.

**Total: 22 new test cases, 13 failing against current codebase.**

No `package.json` changes needed — `vitest run` discovers recursively.

---

## Test files created (desktop-drag-and-drop-image-support feature)

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
