status: pass

## Test files created (initiative-breakdown-job-type feature c0fdab15)

### 1. `tests/features/initiative-breakdown-job-type-local-agent.test.ts` — 12 test cases

Static analysis of `packages/local-agent/src/executor.ts` and `workspace.ts` for executor handling:
- executor.ts recognizes 'initiative-breakdown' as a valid job type
- cardType branching for initiative-breakdown
- defaults to breakdown-specialist role
- ZAZIG_IDEA_ID forwarding from idea_id
- breaking_down/on_hold status handling
- 'spawned' status set on completion
- slot allocation strategy
- workspace context for child idea creation

### 2. `tests/features/initiative-breakdown-job-type-agent-role.test.ts` — 16 test cases

Static analysis of `packages/local-agent/src/workspace.ts` and `agent-mcp-server.ts`:
- ROLE_DEFAULT_MCP_TOOLS entry for initiative-breakdown/breakdown-specialist (ask_user, create_idea, update_idea, query_ideas)
- create_idea tool fields: title, description, originator, source, tags
- create_idea project_id is absent or optional (triage assigns it)
- update_idea status includes 'spawned' and 'breaking_down'
- ask_user 10-min timeout constant and suspend/resume pattern
- parent idea updated with breakdown summary
- parent:idea-uuid tag convention for child ideas

**Total: 28 test cases across 2 files. All written to FAIL against current codebase.**

No `package.json` changes needed — `tests/package.json` uses `vitest run` which discovers tests/features/ recursively.

---

## Test files created (task-execute-job-type feature 66e23dd9)

### tests/features/task-execute-job-type-local-agent.test.ts — 13 test cases
Static analysis of `packages/local-agent/src/executor.ts` and `workspace.ts` for executor-level handling.

| Describe block | Tests | Acceptance Criterion |
|---|---|---|
| Local agent recognizes 'task-execute' as a valid job type | 4 | executor.ts references task-execute, branches on cardType, launches role |
| Executor passes ZAZIG_IDEA_ID to task-execute agent | 2 | ZAZIG_IDEA_ID env var set from idea_id for task-execute jobs |
| Executor handles on_hold suspend/resume | 2 | on_hold polling, clean exit on suspend |
| task-execute uses appropriate capacity slot | 1 | slot allocation strategy present |
| workspace.ts includes task-execute in ROLE_DEFAULT_MCP_TOOLS | 3 | ask_user and update_idea tools granted |
| Executor defaults task-execute jobs to task-executor role | 2 | role defaulting, ideaId forwarding |

### tests/features/task-execute-job-type-agent-role.test.ts — 18 test cases
Static analysis of agent role prompt, MCP tools, edge function, and orchestrator.

| Describe block | Tests | Acceptance Criterion |
|---|---|---|
| Agent reads enriched idea content and conversation history | 3 | spec/description, idea_messages, repo_url lookup |
| Agent generates HTML presentations | 2 | HTML output, sales/decks or marketing directory |
| Agent commits output to correct repo directory | 3 | research/, docs/, descriptive commit message |
| update_idea MCP tool supports output_path field | 2 | output_path field in update_idea schema |
| update-idea edge function supports output fields | 4 | output_path handled, does not block executing status |
| ask_user works during task-execute for clarifications | 2 | ask_user accessible, awaiting_response timeout path |
| Orchestrator sets idea to 'done' when job completes | 3 | task-execute referenced, done status set |

**Total: 31 test cases across 2 files. All written to FAIL until task-execute job type is implemented.**

No `package.json` changes needed — `tests/vitest.config.ts` uses vitest which discovers tests/features/ recursively.

---

## Test files created (orchestrator-suspend-resume-via-realtime feature a94ca129)

### `tests/features/orchestrator-suspend-resume-via-realtime.test.ts` — 23 test cases

Static analysis of `supabase/functions/orchestrator/index.ts` and migrations for the suspend/resume feature.

| Describe block | Tests | Acceptance Criterion |
|---|---|---|
| AC1: Realtime subscription to idea_messages | 4 | channel subscription, table filter, sender=user filter |
| AC2: User reply triggers resume job creation | 4 | awaiting_response check, job insert, idea_id, company_id |
| AC3: Resume job matches suspended job type | 2 | last_job_type on idea, job_type set from it |
| AC4: Resume job brief reads conversation history | 2 | "Resume work on this idea" + read idea_messages |
| AC5: Atomic status transition to prevent duplicates | 3 | optimistic lock eq('status','awaiting_response'), active job check |
| AC6: Polling fallback when Realtime unavailable | 3 | poll fallback code, idea_messages query, fallback logging |
| AC7: on_hold ideas not resumed | 2 | on_hold=false check, proximity to awaiting_response logic |
| AC8: No duplicate resume jobs | 2 | active job guard per idea, status transition dedup |
| AC9: Realtime connection drops are logged | 2 | error handling, drop logging |
| AC10: ideas.last_job_type column | 2 | migration or orchestrator references last_job_type, sets it on dispatch |

All 23 tests written to FAIL against current codebase — orchestrator does not yet implement suspend/resume via Realtime.

No `package.json` changes needed — `tests/vitest.config.ts` uses vitest which discovers tests/features/ recursively.

---

## Test files created (orchestrator-idea-job-dispatch-and-routing feature 31f97497)

### `tests/features/orchestrator-idea-job-dispatch-and-routing.test.ts` — 30 test cases

Static analysis of `supabase/functions/orchestrator/index.ts` for the new idea lifecycle dispatch functions.

| Describe block | Tests | Acceptance Criterion |
|---|---|---|
| AC1: New ideas get idea-triage job | 6 | status='new', on_hold=false query, idea-triage job creation with idea_id/company_id/brief |
| AC2: Atomic transition to 'triaging' | 2 | status update + optimistic lock (eq status='new' before update) |
| AC3: Enriched bug/feature → promote-idea + 'routed' | 4 | status='enriched' query, type-based routing, promote-idea call, 'routed' status |
| AC4: Task ideas → task-execute job + 'executing' | 2 | task-execute job type, 'executing' status near task routing |
| AC5: Initiative ideas → initiative-breakdown + 'breaking_down' | 2 | initiative-breakdown job type, 'breaking_down' status for idea routing |
| AC6: Completed task-execute → idea 'done' | 3 | task-execute completion watcher, 'done' status assignment |
| AC7: Completed initiative-breakdown → idea 'spawned' | 3 | initiative-breakdown completion watcher, 'spawned' status assignment |
| AC8: on_hold ideas skipped by all loops | 3 | on_hold filter in new-idea query, on_hold filter in enriched-idea query |
| AC9: No double-dispatch, atomic transitions | 2 | optimistic lock pattern, active-job guard before dispatch |
| AC10: Concurrency limits respected | 2 | MAX_TRIAGE constant or equivalent, active-job count check |
| AC11: One active job per idea | 2 | idea_id check in active-jobs query, skip if already active |
| AC12: Existing feature pipeline not affected | 3 | auto-triage functions present, triggerCombining/triggerMerging intact, coexistence check |

All 30 tests written to FAIL against current codebase — `idea-triage`, `task-execute`, and `initiative-breakdown` job types confirmed absent from orchestrator/index.ts.

No `package.json` changes needed — `tests/vitest.config.ts` uses `features/**/*.test.ts` which discovers recursively.

---

## Test files created (company-project-setup feature fe10afa9)

### `tests/features/company-project-setup.test.ts` — 10 test cases

| Describe block | Tests | Acceptance Criterion |
|---|---|---|
| AC1: Project record inserted for zazig-dev | 4 | Project in projects table with status, repo_url, name |
| AC2: companies.company_project_id set for zazig-dev | 3 | UPDATE companies sets company_project_id for 00000000-0000-0000-0000-000000000001 |
| AC3: company_project_id queryable → project repo_url | 2 | Both INSERT and UPDATE exist; INSERT is idempotent |
| AC4: repo_url under zazig-team GitHub org | 1 | URL matches https://github.com/zazig-team/ |
| AC5: Repo folder structure documented | 1 | sales/, marketing/, research/, docs/ referenced in migration or setup script |

All 10 tests fail against current codebase — migration 250 adds the schema column but inserts no data.
No `package.json` changes needed — `tests/package.json` uses `vitest run` which discovers recursively.

---

## Test files created (platform-chat-system feature 9ba5a976)

### 1. `tests/features/platform-chat-idea-messages-crud.test.ts` — 14 test cases
Tests for the idea_messages CRUD edge function and Realtime setup.
- Edge function directory and index.ts file existence
- POST handler: accepts idea_id, sender, content, job_id params; inserts into idea_messages
- GET handler: filters by idea_id, orders by created_at ASC
- RLS policies: migration enables RLS, scopes access by company, INSERT policy present
- Realtime: migration adds idea_messages to supabase_realtime publication, REPLICA IDENTITY

### 2. `tests/features/platform-chat-ask-user-mcp-tool.test.ts` — 18 test cases
Tests for the ask_user MCP tool in agent-mcp-server.ts and workspace.ts.
- Tool registration: `server.tool("ask_user", ...)` with idea_id + question parameters
- Available to all job types (senior-engineer, junior-engineer, test-engineer, breakdown-specialist)
- Inserts into idea_messages with sender='job' and job_id from ZAZIG_JOB_ID env
- 10-minute timeout (600_000ms) sets idea status to awaiting_response
- Realtime subscription for user replies (sender=user)
- Polling fallback (3-5s interval) when Realtime fails

### 3. `tests/features/platform-chat-resume-trigger.test.ts` — 9 test cases
Tests for the orchestrator resume trigger.
- Orchestrator queries ideas with awaiting_response status
- Orchestrator checks idea_messages for new user (sender=user) replies
- Creates a resume job associated with the idea via idea_id
- Transitions idea out of awaiting_response (to executing/routed/spawned)
- Resume job context includes full conversation history from idea_messages
- pipeline-utils.ts supports building context from idea_messages

**Total test files: 3 | Total test cases: 41 | All 10 acceptance criteria covered**

No `package.json` changes needed — `tests/package.json` uses `vitest run` which discovers tests/features/ recursively.

---

## Test files created (schema-idea-pipeline-foundations feature 00b1634e)

### `tests/features/schema-idea-pipeline-foundations.test.ts` — 42 test cases

| Describe block | Cases | Acceptance Criterion |
|---|---|---|
| AC1: idea_messages table columns | 8 | idea_messages has all columns and correct types |
| AC2: idea_messages FK to ideas.id CASCADE | 2 | FK to ideas.id with ON DELETE CASCADE |
| AC3: idea_messages FK to jobs.id | 1 | FK to jobs.id (nullable) |
| AC4: idea_messages index on (idea_id, created_at) | 1 | Composite index exists |
| AC5: Realtime enabled on idea_messages | 1 | supabase_realtime publication |
| AC6: jobs.idea_id column | 4 | Nullable FK column + index |
| AC7: ideas.on_hold column | 5 | Boolean, NOT NULL, DEFAULT false |
| AC8: ideas.type column | 7 | TEXT nullable, check constraint for bug/feature/task/initiative |
| AC9: New idea statuses | 9 | enriched, routed, executing, breaking_down, spawned, awaiting_response |
| AC10: companies.company_project_id | 6 | UUID nullable FK to projects.id ON DELETE SET NULL |
| AC11: Idempotency | 3 | IF NOT EXISTS patterns throughout |
| AC12: Existing data unaffected | 4 | Nullable + default values preserve existing rows |

All tests perform static analysis of `supabase/migrations/*.sql` files.
All 42 tests will FAIL against the current codebase — the migrations do not exist yet.
No `package.json` changes needed — `vitest run` discovers tests/features/ recursively.

---

## Test files created (persistent-agent-resilience feature 94df71bc)

### `tests/features/persistent-agent-resilience-liveness-monitoring.test.ts` — 14 test cases

- **AC1 Structural (6 tests):** heartbeat liveness check wires `isTmuxSessionAlive` before `capturePane`; logs structured warning with `role=` and `session=` fields; skips capture when dead; delegates to respawn method; narrows catch block error level.
- **AC3 Structural (5 tests):** post-spawn `isTmuxSessionAlive` check exists after `spawnTmuxSession`; 2-second delay before check; `pane_dead_status` exit code inspection; failure logged with pane context; throws/returns error on failure.
- **AC5 Structural (3 tests):** liveness guard conditional only acts when dead; healthy ticks still update `last_heartbeat`; `isTmuxSessionAlive` is reused (one definition, ≥3 usages).

### `tests/features/persistent-agent-resilience-respawn-circuit-breaker.test.ts` — 18 test cases

- **AC2 Structural (6 tests):** `respawnPersistentAgentIfDead` method defined; calls `reloadPersistentAgent`; logs structured fields (role, reason, attempt, sessionName); updates `last_respawn_at`; uses reason `heartbeat_detected_dead`; uses reason `post_spawn_failed`.
- **AC4 Structural (6 tests):** `respawnFailureCount` field on `ActivePersistentAgent`; `lastRespawnFailureAt` field; checks `RESET_FAILURE_WINDOW_MS` / `MAX_RESET_FAILURES`; sets `status = "crashed"` in DB; logs critical error; stops after threshold.
- **AC6 Structural (3 tests):** `resetInProgress` guard in respawn method; bails if `resetInProgress` is true; heartbeat skips when `resetInProgress` is true.
- **AC7 Structural (4 tests):** migration adds `last_respawn_at` column; update includes ISO timestamp; status transitions to `"crashed"`; agent init sets `respawnFailureCount: 0` and `lastRespawnFailureAt: null`.

**Total test files: 2 | Total test cases: 32 | All 7 acceptance criteria covered**
No `package.json` changes needed — `tests/vitest.config.ts` already includes `features/**/*.test.ts`.

## Test files created (weekly-digest-email feature 4140c138)

### `tests/features/weekly-digest-email.test.ts` — 24 test cases

1. **send-weekly-digest edge function — exists** (5 tests): function file, deno.json, imports, env vars, Deno.serve handler
2. **queries recently completed features** (4 tests): features table query, status=complete filter, 7-day window, title selection
3. **sends emails via an email provider** (4 tests): email provider, API key env var, From address, recipient
4. **email body includes feature summaries** (3 tests): subject line, HTML/text body with titles, feature count
5. **empty week handling** (2 tests): skip send when no features, structured zero-sent response
6. **structured JSON response** (3 tests): application/json, emails_sent field, 200 status
7. **scheduled cron trigger** (3 tests): migration exists, weekly cadence, calls digest function
8. **company scoping** (2 tests): company_id parameter, scoped features query

All 24 tests written to FAIL against current codebase — `supabase/functions/send-weekly-digest/` does not yet exist.

No `package.json` changes needed — `vitest run` discovers tests/features/ recursively.

---

## Previous test reports

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

## Test files created (chat-typing-indicator feature 92f81468)

### `tests/features/chat-typing-indicator.test.ts` — 18 test cases

| Describe block | # tests |
|---|---|
| AC1: Database schema | 5 |
| AC2: Utility module | 5 |
| AC3: Protocol message type | 5 |
| AC4: Realtime policy | 1 |
| AC5: Auto-expiry timeout | 2 |
| AC6: Send message clears indicator | 2 |
| **Total** | **18** |

All 18 tests fail against the current codebase as expected — the feature does not exist yet.

No `package.json` changes needed — `vitest run` in the `tests` workspace discovers `features/**/*.test.ts` recursively.

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
