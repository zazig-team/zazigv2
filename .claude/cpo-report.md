STATUS: COMPLETE
CARD: job-lifecycle-cleanup
FILES: supabase/migrations/027_job_lifecycle.sql (new), packages/shared/src/messages.ts, packages/shared/src/validators.ts, packages/shared/src/index.ts, supabase/functions/orchestrator/index.ts, supabase/functions/slack-events/index.ts, packages/local-agent/src/index.ts, packages/local-agent/src/executor.ts, dashboard/index.html
TESTS: N/A — no test files in scope; typecheck clean across all 4 workspaces
NOTES: Cut job statuses from 14 to 8, added blocked flow (Slack-based human input) and reviewing step (multi-agent code review trigger).

---

# CPO Report — Job Lifecycle Cleanup

## Summary
Consolidated the job status lifecycle from 14 statuses to 8, removed dead/unused statuses, added a "blocked" flow for agents requesting human input via Slack, and added a "reviewing" step that triggers multi-agent code review before marking jobs complete.

## New Lifecycle
```
queued → dispatched → executing → reviewing → complete
                          ↓                       ↑
                       blocked ──(Slack reply)──→ executing

Terminal: complete, failed, cancelled
```

### Removed Statuses
`design`, `verify_failed`, `testing`, `approved`, `rejected`, `waiting_on_human`, `verifying`, `done`

### New Statuses
- `blocked` — agent needs human input; posts question to Slack thread, unblocks on reply
- `cancelled` — explicit cancellation (previously no distinct terminal status for this)

### Renamed
- `done` → `complete` (clearer terminal status)

## Changes

### 1. Migration 027_job_lifecycle.sql (new)
- Drops old `jobs_status_check` constraint (14 statuses)
- Migrates existing rows: `done`/`approved` → `complete`, `verify_failed`/`waiting_on_human` → `queued`, `testing`/`design`/`verifying` → `executing`, `rejected` → `failed`
- Adds new 8-status CHECK constraint
- Adds `blocked_reason TEXT` and `blocked_slack_thread_ts TEXT` columns
- Creates `jobs_blocked_idx` partial index on `status = 'blocked'`
- Updates `all_feature_jobs_complete()` to use new terminal statuses
- Inserts `code-reviewer` role with structured review prompt (P0-P3 severity levels)
- Extends `jobs_job_type_check` to include `review`, `combine`, `deploy`

### 2. Shared Messages (packages/shared/src/messages.ts)
- `JOB_STATUSES`: 15 → 8 entries
- `AgentJobStatus`: added `"blocked"` to union
- `JobStatusValue`: added `"blocked"` and `"cancelled"`
- New `JobBlocked` interface (agent → orchestrator): `{ type, protocolVersion, jobId, machineId, reason }`
- New `JobUnblocked` interface (orchestrator → agent): `{ type, protocolVersion, jobId, answer }`
- Updated `AgentMessage` union to include `JobBlocked`
- Updated `OrchestratorMessage` union to include `JobUnblocked`

### 3. Shared Validators (packages/shared/src/validators.ts)
- `isJobStatusMessage`: added `"blocked"` to accepted statuses
- New `isJobBlocked` validator (validates machineId, reason)
- New `isJobUnblocked` validator (validates jobId, answer)
- Updated `isOrchestratorMessage` switch for `"job_unblocked"`
- Updated `isAgentMessage` switch for `"job_blocked"`

### 4. Shared Index (packages/shared/src/index.ts)
- Exported `JobBlocked`, `JobUnblocked` types
- Exported `isJobBlocked`, `isJobUnblocked` validators

### 5. Orchestrator (supabase/functions/orchestrator/index.ts) — largest change
- **dispatchQueuedJobs**: removed `verify_failed` from pickup query, now only picks `queued`
- **handleJobComplete**: rewrote to support reviewing step
  - Review job completion: parses `originalJobId` from context, checks for P0 findings → re-queues original or marks complete
  - Feature-linked code jobs (code/infra/bug/docs): sets job to `reviewing`, inserts code-review job with structured prompt
  - Standalone verification path preserved with TODO
- **handleJobBlocked** (new): sets job status to `blocked`, fetches feature's Slack thread, posts question via `postSlackMessage`, stores `blocked_slack_thread_ts`
- **handleJobUnblocked** (new): appends answer to job context, resets status to `executing`, broadcasts `JobUnblocked` to agent machine channel
- **handleJobStatus**: added `"blocked"` to accepted status transitions
- **handleVerifyResult**: `verify_failed` → `queued` (re-queue), `done` → `complete`
- **triggerStandaloneVerification**: updated idempotency guard and status transitions
- **reapDeadMachines**: added `"blocked"` to stuck job statuses for dead machine cleanup
- **handleFeatureApproved**: `done` → `complete` for job status updates
- Added `isJobBlocked` handler to Realtime event router

### 6. Slack Events (supabase/functions/slack-events/index.ts)
- New `handleBlockedJobReply`: looks up blocked jobs by `blocked_slack_thread_ts`, broadcasts `JobUnblocked` to orchestrator
- Updated `broadcastToOrchestrator` type to accept `JobUnblocked`
- Blocked job thread check runs BEFORE testing thread check (priority: blocked > testing > CPO)

### 7. Local Agent Index (packages/local-agent/src/index.ts)
- Added `case "job_unblocked":` to exhaustive message router switch
- Routes to `executor.handleJobUnblocked(msg)`

### 8. Executor (packages/local-agent/src/executor.ts)
- Added `handleJobUnblocked` method (V1: log-only, agent reads answer from DB context)
- Handles case where job session has died (logs + lets dispatcher re-pick)

### 9. Dashboard (dashboard/index.html)
- New `.blocked` dot class (amber #f59e0b, 1s pulse animation)
- Removed dead dot classes: `done`, `approved`, `verify_failed`, `verifying`
- Updated `WORKING_JOB_STATUSES` to include `'blocked'`
- Updated `TERMINAL_JOB_STATUSES`: removed `'done'`, `'approved'` → `['complete', 'failed', 'cancelled']`
- Updated `JOB_STATUS_TO_COLUMN` mapping for 8 statuses
- Added `blocked_reason` tooltip on job dots
- Updated feature query to include `blocked_reason`

## Design Decisions
1. **Blocked flow via Slack threads**: Reuses existing Slack infrastructure. Agent posts question → human replies in thread → `slack-events` function detects reply and unblocks via orchestrator broadcast.
2. **Code review as a job**: Review is modeled as a separate `review` job type, not inline logic. This means reviews consume a slot and are visible on the dashboard.
3. **P0 severity gate**: Only P0 findings from code review cause re-queue of the original job. P1-P3 findings are logged but the job still completes.
4. **V1 handleJobUnblocked**: The executor logs the unblock but doesn't inject text into the tmux session. The agent reads the answer from DB context on its next iteration.

## Build
- Typecheck: clean across all 4 workspaces (shared, local-agent, orchestrator, cli)
- Token budget: claude-ok (direct code changes)

---

STATUS: COMPLETE
CARD: 699c2685
FILES: supabase/migrations/027_feature_lifecycle.sql (new), supabase/functions/orchestrator/index.ts (modified), packages/shared/src/messages.ts (modified), dashboard/index.html (modified)
TESTS: Typecheck clean across all 4 workspaces
NOTES: 11-status feature lifecycle pipeline, 3 new roles, full orchestrator rewiring

---

# CPO Report — Feature Status Lifecycle Cleanup

## Summary
Replaced the muddled 11-value feature status constraint with a clean 11-status pipeline (10 active + cancelled). Renamed tech-lead → feature-breakdown-expert. Created job-combiner and deployer roles. Rewired the entire orchestrator to support the new pipeline.

## New Pipeline
```
created → ready_for_breakdown → breakdown → building → combining
        → verifying → deploying_to_test → ready_to_test → deploying_to_prod → complete
(+ cancelled at any point)
```

## Changes Made

### 1. Migration 027_feature_lifecycle.sql (new)
- Drops old 11-value `features_status_check` constraint
- Migrates existing rows: proposed/approved/designing/in_progress/design → ready_for_breakdown, done/complete → complete, testing → ready_to_test
- Adds clean 11-status constraint
- Updates `jobs_job_type_check` to add `combine` and `deploy` job types
- Renames `tech-lead` role → `feature-breakdown-expert`
- Updates CPO role prompt to use `ready_for_breakdown`
- Inserts `job-combiner` role with merge prompt
- Inserts `deployer` role with test/prod deploy prompt

### 2. Orchestrator (supabase/functions/orchestrator/index.ts)
- `processApprovedFeatures` → `processReadyForBreakdown`: queries `ready_for_breakdown` status
- `triggerBreakdown`: CAS guard `ready_for_breakdown`, status → `breakdown`, role → `feature-breakdown-expert`
- `handleJobComplete`: added handlers for:
  - `breakdown` completion → feature `breakdown` → `building`
  - `combine` completion → triggers `triggerFeatureVerification`
  - `deploy` (prod) completion → calls `handleProdDeployComplete`
- `triggerCombining` (new): fetches completed job branches, transitions feature `building` → `combining`, inserts combine job
- `handleVerifyResult`: calls `triggerCombining` instead of `triggerFeatureVerification` when all feature jobs done
- `triggerFeatureVerification`: updated CAS exclusion list to include all new late-stage statuses
- `promoteToTesting` → `initiateTestDeploy`: checks for `deploying_to_test`/`ready_to_test` in queue, sets `deploying_to_test`
- `handleDeployComplete`: adds CAS guard `deploying_to_test`, sets `ready_to_test`
- `handleFeatureApproved`: CAS `ready_to_test` → `deploying_to_prod`, dispatches deployer job for prod
- `handleProdDeployComplete` (new): CAS `deploying_to_prod` → `complete`, drains testing queue, runs teardown
- `handleFeatureRejected`: CAS guard updated to `ready_to_test`
- `handleDeployFailed`/`handleDeployNeedsConfig`: CAS guard updated to `deploying_to_test`
- Standalone job pipeline (`triggerStandaloneVerification`, `promoteStandaloneToTesting`) kept intact

### 3. Shared (packages/shared/src/messages.ts)
- `FEATURE_STATUSES` updated to all 11 values
- `FeatureStatus` type automatically derives from the array

### 4. Dashboard (dashboard/index.html)
- COLUMNS array: 9 visible columns matching new pipeline
- CSS variables renamed from `--col-design/--col-done/--col-testing` to match new status keys
- `JOB_STATUS_TO_COLUMN` mapping updated for new column keys

## Verification
- `npm run typecheck`: clean across all 4 workspaces (orchestrator, local-agent, shared, cli)
- No hardcoded `"testing"`, `"done"`, or `"approved"` feature status strings remain in the orchestrator (remaining `"done"`/`"testing"` references are JOB statuses in the standalone pipeline)
- All CAS guards updated to use new status values

## Token Usage
- Budget: claude-ok (wrote code directly)
- Approach: Full discovery read of all 4 files → systematic edits → typecheck → commit

---

CARD: 699c2e02
BRANCH: cpo/remove-machine-yaml
FILES: packages/cli/src/lib/config.ts, packages/cli/src/commands/start.ts, packages/cli/src/commands/setup.ts, packages/cli/src/commands/status.ts, packages/cli/src/commands/personality.ts, packages/cli/package.json, packages/local-agent/src/config.ts, packages/local-agent/src/connection.ts, packages/local-agent/src/executor.ts, packages/local-agent/src/index.ts, packages/local-agent/package.json, package-lock.json
TESTS: N/A — CLI interactive prompts, typecheck passes
NOTES: Replaced machine.yaml with config.json, first-run prompts in zazig start, removed yaml dependency.

---

# CPO Report — Remove machine.yaml, configure slots on first start

## Summary
Replaced `~/.zazigv2/machine.yaml` (YAML-based manual config) with `~/.zazigv2/config.json` (JSON, auto-written on first `zazig start`). Users no longer need to manually create a config file before running the agent.

## New First-Run Flow
```
zazig start
→ No config found
→ "zazig: first run — let's configure this machine."
→ "Max concurrent Claude Code sessions [4]: "
→ "Max concurrent Codex sessions [4]: "
→ Generates machine name from hostname
→ Writes ~/.zazigv2/config.json
→ Starts the agent
```

Subsequent runs skip prompts and start immediately.

## Changes Made

### Change 1: CLI config.ts — JSON-based config
- Replaced YAML read/write with JSON (`readFileSync` + `JSON.parse`, `writeFileSync` + `JSON.stringify`)
- Removed `company_id` and `supabase` from `MachineConfig` — only `name` and `slots` remain
- Removed `yaml` import
- Added `configExists()`, `loadConfig()`, `saveConfig()` with proper error handling

### Change 2: CLI start.ts — First-run prompts
- Added `promptForConfig()` — prompts for slot counts with defaults of 4
- Added `generateMachineName()` — converts hostname to slug format
- On first run: prompts → saves config → starts daemon
- Passes `ZAZIG_MACHINE_NAME`, `ZAZIG_SLOTS_CLAUDE_CODE`, `ZAZIG_SLOTS_CODEX` env vars to daemon

### Change 3: local-agent config.ts — JSON + env var fallback
- Priority: env vars (from `zazig start`) > `config.json` file
- Removed `yaml` import and YAML parsing
- Made `company_id` optional (comes from `user_companies` at runtime)
- Supabase config sourced entirely from env vars

### Change 4: Removed yaml dependency
- Removed `yaml: ^2.7.0` from `packages/local-agent/package.json`
- Removed `yaml: ^2.7.0` from `packages/cli/package.json`
- Updated `package-lock.json`

### Change 5: setup.ts — Removed saveConfig call
- Removed `saveConfig` import and the machine config write block (lines 265-274)
- Removed `hostname` import (no longer needed)
- Setup no longer writes machine config — `zazig start` handles it

### Change 6: status.ts and personality.ts
- **status.ts**: Removed `company_id` from machine query (queries by `name` only), removed company name display
- **personality.ts**: Added `resolveCompanyId()` helper — fetches `company_id` from `user_companies` table (RLS-scoped) instead of reading from local config. Removed `loadConfig` import.

### Typecheck fixes
- `connection.ts`: Made `companyId` field `string | undefined`, added conditional `.eq("company_id")` in heartbeat query
- `executor.ts`: Made `companyId` parameter and field `string | undefined`
- `index.ts`: Updated comments to reference `config.json` instead of `machine.yaml`

## Config Format

**Old (`machine.yaml`):**
```yaml
name: macbook-pro-chris
company_id: uuid-here
slots:
  claude_code: 4
  codex: 4
supabase:
  url: https://...
```

**New (`config.json`):**
```json
{
  "name": "macbook-pro-chris",
  "slots": {
    "claude_code": 4,
    "codex": 4
  }
}
```

## Verification
- Typecheck: clean on both `packages/cli` and `packages/local-agent`
- No DB migration needed (CLI/local-agent change only)

## Token Usage
- Budget: claude-ok (wrote code directly)
- Approach: Read-first discovery → targeted edits → typecheck → single commit
