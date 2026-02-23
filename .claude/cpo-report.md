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
