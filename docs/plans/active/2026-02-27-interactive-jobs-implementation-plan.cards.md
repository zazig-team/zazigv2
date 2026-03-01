# Card Catalog: Interactive Jobs & Remote Control Implementation

**Source:** docs/plans/2026-02-27-interactive-jobs-implementation-plan.md
**Board:** zazigv2 (6995a7a3f836598005909f31)
**Generated:** 2026-02-27T12:00:00Z
**Numbering:** sequential

## Dependency Graph

```
1 --+
2 --+-- (parallel, no deps)
3 --+
4 ----+
5 ---- 2
6 ---- 1, 2, 3
7 ---- 4
8 ---- 4
9 ---- 1, 2, 3, 4, 5, 6, 7, 8
```

---

### 1 -- Migration: Add interactive column + tester role

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10ce3081de805165e8218 |

**What:** Create migration `063_interactive_roles.sql` that adds an `interactive` boolean column (default false) to the `roles` table, marks `test-deployer` as interactive, and inserts a new `tester` role with interactive=true and a prompt for feature testing sessions.

**Why:** The executor needs to know which roles should spawn in TUI mode vs `-p` mode. The tester role is needed for the feature testing flow where a human connects via `/remote-control`.

**Files:**
- Create: `supabase/migrations/063_interactive_roles.sql`

**Gotchas:**
- The `tester` role prompt references `enable_remote` and `send_message` MCP tools that don't exist yet (Task 4)
- Use `ON CONFLICT (name) DO UPDATE` for idempotent re-runs

**Implementation Prompt:**
> Create file `supabase/migrations/063_interactive_roles.sql`. Add `interactive boolean NOT NULL DEFAULT false` column to `public.roles`. Update `test-deployer` to set `interactive = true`. Insert a `tester` role with `interactive = true`, `is_persistent = false`, `default_model = 'claude-sonnet-4-6'`, `slot_type = 'claude_code'`. The tester prompt should instruct the agent to: (1) call `enable_remote` for a remote URL, (2) post URL to Slack via `send_message`, (3) wait for human, (4) help review the deployed feature, (5) end with APPROVED or REJECTED in `.claude/tester-report.md`, then `/exit`. Use `ON CONFLICT (name) DO UPDATE` for idempotency. See the full prompt text in the implementation plan Task 1. Run `npx supabase db push` to apply. Commit: `feat: add interactive column to roles + tester role`.

---

### 2 -- Shared types: interactive flag + feature_test CardType

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10cec0997991eae3c5f01 |

**What:** Add `interactive?: boolean` field to `StartJob` interface and `"feature_test"` to the `CardType` union in `messages.ts`. Update the `isStartJob` validator in `validators.ts` to include `"feature_test"` in the cardType allowlist.

**Why:** The local agent needs to receive the `interactive` flag from the orchestrator to know whether to spawn in TUI mode. The `feature_test` card type is needed for tester jobs.

**Files:**
- Modify: `packages/shared/src/messages.ts` (~line 65, StartJob interface)
- Modify: `packages/shared/src/messages.ts` (~line 30, CardType union)
- Modify: `packages/shared/src/validators.ts` (~line 91, isStartJob allowlist)

**Gotchas:**
- `interactive` is optional — don't add validator check for it (undefined is fine)
- The CardType union change must match the DB constraint (Task 3)

**Implementation Prompt:**
> In `packages/shared/src/messages.ts`: (1) Add `"feature_test"` to the `CardType` union (~line 30). (2) Add `interactive?: boolean;` with JSDoc comment to the `StartJob` interface after `roleMcpTools` (~line 65). In `packages/shared/src/validators.ts`: add `"feature_test"` to the `isStartJob` cardType allowlist (~line 91). The `interactive` field is optional so no validator change needed for it. Build with `npm run build` to verify. Commit: `feat: add interactive flag to StartJob + feature_test CardType`.

---

### 3 -- Migration: Add feature_test to job_type constraint

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10cf5a6bc266a863e27be |

**What:** Create migration `064_feature_test_job_type.sql` that drops and recreates the `jobs_job_type_check` constraint to include `feature_test`.

**Why:** The jobs table has a CHECK constraint on `job_type`. Without adding `feature_test`, inserting tester jobs will fail with a constraint violation.

**Files:**
- Create: `supabase/migrations/064_feature_test_job_type.sql`

**Gotchas:**
- Must include ALL existing job types in the new constraint, not just the new one
- Check the current constraint values first: `code, infra, design, research, docs, bug, persistent_agent, verify, breakdown, combine, deploy_to_test, deploy_to_prod, review`

**Implementation Prompt:**
> Create `supabase/migrations/064_feature_test_job_type.sql`. Drop `jobs_job_type_check` constraint, recreate with all existing types plus `feature_test`: `CHECK (job_type IN ('code', 'infra', 'design', 'research', 'docs', 'bug', 'persistent_agent', 'verify', 'breakdown', 'combine', 'deploy_to_test', 'deploy_to_prod', 'review', 'feature_test'))`. Run `npx supabase db push`. Commit: `feat: add feature_test to job_type constraint`.

---

### 4 -- MCP: Add enable_remote tool

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10cfd89074023f38349ec |

**What:** Add an `enable_remote` MCP tool to `agent-mcp-server.ts` that sends `/remote-control` to the agent's tmux session, waits for output, captures the URL via `tmux capture-pane`, and returns it. Also pass `ZAZIG_TMUX_SESSION` env var from executor to MCP server.

**Why:** Interactive agents need to enable remote control so humans can connect from any device. The agent calls this tool, gets the URL, then posts it to Slack.

**Files:**
- Modify: `packages/local-agent/src/agent-mcp-server.ts` (~line 99, after send_message)
- Modify: `packages/local-agent/src/executor.ts` (~line 452, MCP env vars)

**Gotchas:**
- `execFileAsync` may need to be imported (`execFile` from `node:child_process` + `promisify` from `node:util`)
- The 5-second wait for `/remote-control` output may need tuning
- `tmux capture-pane -p -S -30` captures last 30 lines — URL should be in there
- Must also add `ZAZIG_TMUX_SESSION` in `handlePersistentJob` MCP env section (~line 697)

**Implementation Prompt:**
> Two changes: (1) In `packages/local-agent/src/executor.ts`, find where `.mcp.json` env vars are written in `handleStartJob` (where `ZAZIG_JOB_ID` is set, ~line 452). Add `ZAZIG_TMUX_SESSION: sessionName` (sessionName is `${this.machineId}-${jobId}`). Do the same in `handlePersistentJob` where `.mcp.json` is written (~line 697, sessionName is `${this.machineId}-${role}`). (2) In `packages/local-agent/src/agent-mcp-server.ts`, after the `send_message` tool (~line 99), add `enable_remote` tool. It reads `ZAZIG_TMUX_SESSION` from env, runs `tmux send-keys -t {session} /remote-control Enter`, waits 5 seconds, runs `tmux capture-pane -t {session} -p -S -30`, parses the URL with `/https:\/\/\S+/`, returns it. Import `execFile` from `node:child_process` and `promisify` from `node:util` if not already imported. See full code in plan Task 4. Build with `npm run build`. Commit: `feat: add enable_remote MCP tool for /remote-control`.

---

### 5 -- Executor: Support interactive non-persistent jobs

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | High |
| Model | Sonnet 4.6 |
| Labels | claude-ok, tech-review |
| Depends on | 2 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10d06f9357ed581bad841 |

**What:** Modify the executor to detect `msg.interactive === true` and spawn Claude Code in TUI mode (no `-p` flag) instead of print mode. Interactive jobs get a 30-minute timeout, prompt injection via `tmux send-keys` after startup delay, and report fallbacks for tester/test-deployer roles.

**Why:** This is the core runtime change. Interactive jobs need TUI mode so the agent can use `/remote-control` and stay alive for human collaboration, but they still follow the regular job lifecycle (worktree, timeout, poll, report).

**Files:**
- Modify: `packages/local-agent/src/executor.ts`

**Gotchas:**
- Interactive spawn must NOT pipe prompt via stdin — use `tmux send-keys -l` for literal prompt injection after startup delay
- `CPO_STARTUP_DELAY_MS` constant is reused for the inject delay — verify it exists and its value (~15s)
- `shellEscape` function must be available (check imports)
- The `unset CLAUDECODE` prefix prevents nested agent detection
- Report fallbacks: `test-deployer` → `.claude/test-deployer-report.md`, `tester` → `.claude/tester-report.md`
- The timeout timer must use `INTERACTIVE_JOB_TIMEOUT_MS` (30min) for interactive jobs

**Implementation Prompt:**
> In `packages/local-agent/src/executor.ts`: (1) Add constant `INTERACTIVE_JOB_TIMEOUT_MS = 30 * 60_000` near other constants (~line 43). (2) In `handleStartJob`, after the persistent job branch (~line 310), add `const isInteractive = msg.interactive === true`. (3) After `buildCommand` call (~line 398), branch: if `isInteractive`, set `cmd = "claude"` and `cmdArgs = ["--model", resolvedModel]` (resolve model same as non-codex). Otherwise use `buildCommand` result. (4) Replace `spawnTmuxSession` call: if `isInteractive`, spawn tmux session with `tmux new-session -d -s {name} -c {dir} {cmd}` (no stdin pipe), then `setTimeout` to inject prompt via `tmux send-keys -t {name} -l {promptText}` + `Enter` after `CPO_STARTUP_DELAY_MS`. Otherwise use existing `spawnTmuxSession`. (5) Set timeout timer: `isInteractive ? INTERACTIVE_JOB_TIMEOUT_MS : JOB_TIMEOUT_MS`. (6) Add to `REPORT_FALLBACKS`: `"test-deployer": ".claude/deploy-report.md"`, `tester: ".claude/tester-report.md"`. See full code in plan Task 5. Build with `npm run build`. Commit: `feat: support interactive non-persistent jobs in executor`.

---

### 6 -- Orchestrator: Pass interactive flag + create tester job

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1, 2, 3 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10d0f50abe7afd03bfdff |

**What:** Modify the orchestrator to: (1) read the `interactive` column from roles and include it in the `StartJob` message, (2) create a `feature_test` job when a feature transitions to `ready_to_test` in `handleDeployComplete`.

**Why:** The orchestrator must pass the interactive flag so the local agent knows to spawn TUI mode. The tester job creation automates the feature testing flow — when test deploy succeeds, a tester session is automatically queued.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts`

**Gotchas:**
- Add `interactive` to the roles select in `dispatchQueuedJobs` (~line 488)
- Only include `interactive: true` in StartJob when the flag is truthy (avoid sending false)
- In `handleDeployComplete`, add `branch` to the feature select (~line 2519) for the tester job context
- The tester job context includes `testUrl` from the deploy complete message
- Deploy orchestrator after changes: `npx supabase functions deploy orchestrator`

**Implementation Prompt:**
> In `supabase/functions/orchestrator/index.ts`: (1) In `dispatchQueuedJobs`, update the roles select (~line 488) to include `interactive`: `.select("default_model, slot_type, interactive")`. Include in StartJob message: `...(roleDefaults?.interactive ? { interactive: true } : {})` (~line 695-713). (2) In `handleDeployComplete`, after feature transitions to `ready_to_test` and Slack notification (~line 2590), insert a tester job: `{ company_id, project_id, feature_id: featureId, role: "tester", job_type: "feature_test", complexity: "simple", slot_type: "claude_code", status: "queued", context: JSON.stringify({ type: "feature_test", featureId, featureBranch: feature.branch, projectId: feature.project_id, testUrl }), branch: feature.branch }`. Add `branch` to the feature select at ~line 2519. Log success/error. Deploy: `npx supabase functions deploy orchestrator`. Commit: `feat: dispatch interactive flag + create tester job on ready_to_test`.

---

### 7 -- Update test-deployer role prompt

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | 4 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10d1ac98c0a5694b33f6e |

**What:** Create migration `065_update_test_deployer_prompt.sql` to update the test-deployer role prompt with instructions to use `enable_remote` when `zazig.test.yaml` is missing.

**Why:** The test-deployer currently has no instructions for handling missing config. With the `enable_remote` tool available, it should know to request human help via remote control when the config file doesn't exist.

**Files:**
- Create: `supabase/migrations/065_update_test_deployer_prompt.sql`

**Gotchas:**
- Dollar-quoting (`$$...$$`) for the prompt to avoid escaping issues
- Prompt must include `/exit` instruction at the end
- Deploy commands should reference doppler for credentials

**Implementation Prompt:**
> Create `supabase/migrations/065_update_test_deployer_prompt.sql`. Update `public.roles` set `prompt = $$...$$` where `name = 'test-deployer'`. The new prompt should cover: (1) read `zazig.test.yaml` from repo root, (2) if found, run deploy command and report URL, (3) if missing, call `enable_remote` to get URL, post to Slack via `send_message` asking for help, wait for human, collaborate to create config, then deploy. Output: `.claude/test-deployer-report.md` with first line `DEPLOYED: <url>` or `DEPLOY_FAILED: <reason>`. End with `/exit`. See full prompt in plan Task 7. Run `npx supabase db push`. Commit: `feat: update test-deployer prompt with enable_remote instructions`.

---

### 8 -- Update MCP server job_type enum

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | 4 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10d248483d5c010a501dd |

**What:** Add `"feature_test"` to the `job_type` Zod enum in `agent-mcp-server.ts` and verify `enable_remote` is accessible to interactive roles.

**Why:** If the MCP server has a job_type validation enum, it needs to accept `feature_test` for tester jobs. The `enable_remote` tool must be in the allowed tools for interactive roles.

**Files:**
- Modify: `packages/local-agent/src/agent-mcp-server.ts` (~line 460, job_type enum)
- Modify: `packages/local-agent/src/executor.ts` (check ZAZIG_ALLOWED_TOOLS for interactive roles)

**Gotchas:**
- Check how `ZAZIG_ALLOWED_TOOLS` is currently populated — if roles with empty skills (`{}`) get all tools by default, no change needed
- If tools are explicitly listed, add `enable_remote` and `send_message` to tester/test-deployer skills in the migration

**Implementation Prompt:**
> In `packages/local-agent/src/agent-mcp-server.ts`, find the job_type Zod enum (~line 460) and add `"feature_test"`. Check `ZAZIG_ALLOWED_TOOLS` handling in `executor.ts` — if roles with empty `skills` field (`{}`) default to all tools, no additional change. If tools are explicitly filtered, ensure `enable_remote` and `send_message` are included for interactive roles. Build with `npm run build`. Commit: `feat: add feature_test job_type + enable_remote tool access`.

---

### 9 -- End-to-end verification

| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok, needs-human |
| Depends on | 1, 2, 3, 4, 5, 6, 7, 8 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/69a10d2fa602ed5d48fd50df |

**What:** Build everything, run all migrations, deploy orchestrator, restart local agent. Test: (1) test-deployer flow — feature verifying → deploying_to_test → agent spawns TUI → calls enable_remote → posts URL. (2) tester flow — feature ready_to_test → feature_test job queued → agent spawns TUI → posts URL → human connects → approves/declines.

**Why:** All 8 previous tasks must work together end-to-end. This verifies the full interactive jobs pipeline.

**Files:**
- No new files — verification only

**Gotchas:**
- Must `npm run build` before restarting local agent
- Must deploy orchestrator edge function
- Test with a real feature going through the pipeline, not just manual DB inserts
- Check tmux sessions are spawned in TUI mode (no `-p` in the command)
- Verify remote control URL is actually captured and posted to Slack

**Implementation Prompt:**
> Run `cd ~/Documents/GitHub/zazigv2 && npm run build`. Run `npx supabase db push` to apply migrations 063-065. Run `npx supabase functions deploy orchestrator`. Run `zazig start` to restart local agent. Test the test-deployer flow: set a feature to `verifying` with a completed PASSED verify job, watch orchestrator create `deploy_to_test` job, confirm local agent spawns TUI mode, confirm `enable_remote` is called when `zazig.test.yaml` is missing, confirm URL posted to Slack. Test the tester flow: manually transition a feature to `ready_to_test` with a test URL, watch orchestrator create `feature_test` job, confirm TUI mode spawn, confirm remote URL posted to Slack, connect via URL, approve the feature, confirm agent writes report and exits, confirm executor detects completion.
