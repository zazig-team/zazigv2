STATUS: COMPLETE
CARD: 699c23aa

# CPO Report: Multi-Company User Model

**Branch:** `cpo/multi-company-user-model`
**Date:** 2026-02-23
**Trello Card:** 699c23aa

## Summary

Replaced single-company JWT claim model with a `user_companies` join table supporting many-to-many user-company relationships. Updated all layers: migrations, CLI auth, local agent startup, and dashboard.

## Changes

### Migrations
- **027_user_companies.sql** — `user_companies` join table (user_id + company_id composite PK, RLS policies for read/insert own, service_role full access, user_id index)
- **028_rls_user_companies.sql** — Created `user_in_company(cid)` helper function. Replaced all JWT claim-based RLS policies across 9 tables (companies, machines, projects, features, jobs, events, messages, memory_chunks, company_roles) with `user_in_company()` lookups

### CLI
- **credentials.ts** — Removed `companyId` from `Credentials` interface
- **login.ts** — Switched from GitHub OAuth to magic link flow. Removed company selection logic, `decodeJwtPayload`, `openBrowser`. Login now only authenticates; company context comes from `user_companies` at runtime
- **setup.ts** — After company creation, inserts into `user_companies` to link the authenticated user
- **credentials.test.ts** — Removed `companyId` from test fixtures and assertions

### Local Agent
- **config.ts** — Made `company_id` optional in `MachineConfig`. Validation warns instead of throwing when missing
- **connection.ts** — Added `getCompanyIds()` method that queries `user_companies` table. `start()` discovers all companies for the authenticated user at startup, logs membership. Falls back to config `company_id` if discovery fails. Heartbeat uses primary company_id or first discovered
- **index.ts** — Passes `config.company_id ?? ""` to `JobExecutor` constructor to handle optional type

### Dashboard
- **index.html** — Added `<select id="companySelect">` company switcher in header. Populated by querying all companies. Hidden if only one company. On change, re-fetches dashboard data for selected company

## Typecheck
All 4 packages pass: `cli`, `local-agent`, `shared`, `orchestrator`.

## Token Usage
- Token budget: claude-ok (direct code writing)
- No codex-delegate or agent teams used

---

PREV STATUS: COMPLETE
CARD: 699b97ea8af43fd5e97cef65
FILES: packages/cli/src/commands/setup.ts (new), packages/cli/src/index.ts (modified), packages/cli/src/commands/join.ts (deleted)
TESTS: N/A — interactive CLI command, depends on PR #67 for auth types
NOTES: zazig setup command created with full guided flow. zazig join removed.

---

# CPO Report — zazig setup command

## Summary
Added `zazig setup` CLI command: guided flow to create a company, onboard a project (with optional AI conversation), and invite teammates. Removed `zazig join` (superseded).

## Files Changed
- `packages/cli/src/commands/setup.ts` — **New**: full setup flow (auth check, company creation/selection, project creation with AI brief, teammate invites)
- `packages/cli/src/index.ts` — Replaced `join` import/case with `setup`, updated help text
- `packages/cli/src/commands/join.ts` — **Deleted**

## Implementation Details

### Auth (Step 1)
- Uses `getValidCredentials()` from auth branch (PR #67) — auto-refreshes expired tokens
- Creates Supabase client with `createClient()` and sets session via `auth.setSession()`
- Exits with helpful message if not logged in

### Company (Steps 2-3)
- Option 1: Create new company via `supabase.from("companies").insert()`
- Option 2: List existing companies (RLS-scoped), let user pick if multiple
- Falls straight into project creation after company is resolved

### Project (Step 4)
- Prompts for project name and optional git repo path
- If repo path given: reads README.md and package.json for context
- AI conversation (if `ANTHROPIC_API_KEY` set): calls Anthropic Messages API with `claude-haiku-4-5-20251001` to generate structured brief
- Writes `docs/PROJECT.md` to repo if path given and brief generated
- Fallback without API key: prompts for plain text description
- Inserts into `projects` table with `company_id`, `name`, `repo_url`

### Invites (Step 5)
- Comma-separated email input
- Uses `supabase.auth.admin.inviteUserByEmail()` with graceful failure — admin API requires service role key, which user auth doesn't have
- TODO comment noting Edge Function needed for production invites

## Acceptance Criteria Met
1. `zazig setup` registered as CLI command
2. Requires prior `zazig login`
3. Can create a new company + auto-flow into project
4. Can add project to existing company (multi-company pick)
5. Reads repo files (README, package.json)
6. AI conversation with graceful fallback
7. Writes docs/PROJECT.md
8. Inserts project into projects table
9. Invite step fails gracefully with clear message
10. `zazig join` removed

## Token Usage
- Token budget: claude-ok (wrote code directly)

---

# PR #65 Review Fixes — Follow-up Commit

## Summary
Applied 5 fixes from PR #65 code review (1 P0, 3 P1, 1 P2) in a single follow-up commit.

## Fixes Applied

### Fix 1 (P0): getValidCredentials() stub
- Added `getValidCredentials()` to `credentials.ts` — async wrapper around `loadCredentials()` with TODO for token refresh when PR #66 lands

### Fix 2 (P1): Removed misleading invite step
- Replaced `auth.admin.inviteUserByEmail` flow (requires service role key, always fails with user token) with a clear skip message
- TODO comment for wiring to Edge Function when available

### Fix 3 (P1): repo_url stores Git remote URL
- Prompt now asks for Git remote URL with validation (must start with http://, https://, or git@)
- Separate `localRepoPath` prompt for reading context files (README, package.json)
- Local path is NOT stored in DB

### Fix 4 (P1): RLS INSERT policies
- Created `supabase/migrations/024_setup_insert_policies.sql`
- `authenticated_insert_company`: any authenticated user can create a company
- `authenticated_insert_own_project`: scoped by JWT company_id claim

### Fix 5 (P2): Capture project ID + machine.yaml
- Project insert now captures returned `id` via `.select("id").single()`
- After project creation, writes `~/.zazigv2/machine.yaml` using existing `saveConfig()` from `config.ts`
- Uses `os.hostname()` for machine name, defaults to 1 claude_code slot

## Files Changed
- `packages/cli/src/lib/credentials.ts` — added `getValidCredentials()` export
- `packages/cli/src/commands/setup.ts` — all fixes applied (imports, invite removal, URL validation, project ID capture, machine config)
- `supabase/migrations/024_setup_insert_policies.sql` — **New**: INSERT policies for companies + projects

## Token Usage
- Token budget: claude-ok (wrote code directly)

---

# CPO Report — Test Environment Recipes & Slack Testing Loop (PR #62)

CARD: test-environment-recipes
FILES: packages/shared/src/test-recipe.ts, packages/shared/src/messages.ts, packages/shared/src/validators.ts, packages/shared/src/index.ts, packages/local-agent/src/test-runner.ts, packages/local-agent/src/test-runner.test.ts, packages/local-agent/src/connection.ts, packages/local-agent/src/index.ts, supabase/functions/orchestrator/index.ts, supabase/functions/slack-events/index.ts, supabase/migrations/021_testing_columns.sql
TESTS: 61 passed (local-agent), 92 passed (shared) — all green
NOTES: Implemented test environment recipes (zazig.test.yaml) and Slack testing loop. V1 supports vercel + custom providers only.

---

# CPO Report — Test Environment Recipes & Slack Testing Loop

## Summary
Implemented the full test environment recipe system that allows projects to define `zazig.test.yaml` for automated deploy-to-test, healthcheck, and Slack-based approve/reject workflow.

## What Was Done

### 1. Database Migration (021_testing_columns.sql)
- Added `test_url`, `test_started_at`, `slack_channel`, `slack_thread_ts`, `testing_machine_id` columns to `features` table

### 2. TestRecipe Schema (packages/shared/src/test-recipe.ts)
- Defined `TestRecipe`, `TestRecipeDeploy`, `TestRecipeTeardown`, `TestRecipeHealthcheck` interfaces
- Providers: `vercel` | `custom` (v1 scope)
- Types: `ephemeral` | `persistent`

### 3. Message Protocol (packages/shared/src/messages.ts)
- Extended `DeployToTest` with optional `changeSummary` and `repoPath`
- Added three new agent → orchestrator messages: `DeployComplete`, `DeployFailed`, `DeployNeedsConfig`
- Updated `AgentMessage` discriminated union

### 4. Validators (packages/shared/src/validators.ts)
- Added `isDeployComplete`, `isDeployFailed`, `isDeployNeedsConfig` type guards
- Updated `isAgentMessage` switch for new types

### 5. Test Runner (packages/local-agent/src/test-runner.ts)
- `TestRunner` class with injectable `SpawnFn`/`FetchFn` for testing
- `handleDeployToTest()`: reads recipe → deploys → healthchecks → reports
- Vercel: `doppler run --project {name} --config prd -- vercel deploy --yes`
- Custom: `doppler run --project {name} --config prd -- bash -c {script}`
- Healthcheck: polls `{deployUrl}{path}` until 200 or timeout
- `runTeardown()`: runs teardown script for ephemeral envs, no-op for persistent
- `readTestRecipe()`: reads and validates `zazig.test.yaml`

### 6. Connection Fix (packages/local-agent/src/connection.ts)
- **Bug fix**: Added missing event listeners for `deploy_to_test` and `verify_job` events
- Previously only `message` and `start_job` events were listened to, so deploy_to_test and verify_job messages from the orchestrator would never reach handlers

### 7. Local Agent Wiring (packages/local-agent/src/index.ts)
- Replaced deploy_to_test stub with actual `TestRunner` integration

### 8. Orchestrator Updates (supabase/functions/orchestrator/index.ts)
- **Bug fix**: `promoteToTesting` was broadcasting on `company:{companyId}` channel which the local agent doesn't listen to. Fixed to pick an online machine and send on `agent:{machineName}`
- Added `handleDeployComplete`: stores `test_url`/`test_started_at` on feature, posts Slack message with test URL and checklist, stores `slack_channel`/`slack_thread_ts` for testing loop
- Added `handleDeployFailed`: marks feature as failed, logs event
- Added `handleDeployNeedsConfig`: marks feature needing config, logs event
- Added Slack helpers: `getDefaultSlackChannel`, `getSlackBotToken`, `postSlackMessage`, `parseChecklist`

### 9. Slack Events Updates (supabase/functions/slack-events/index.ts)
- Added testing thread detection: checks if message is in a thread matching a feature in `testing` status
- Approve patterns: `approve`, `approved`, `lgtm`, `ship it`, `merge`, `✅`
- Reject patterns: `reject`, `rejected`, `fail`, `rollback`, `❌` (captures remaining text as feedback)
- Routes `FeatureApproved`/`FeatureRejected` to orchestrator via Realtime broadcast

### 10. Tests (packages/local-agent/src/test-runner.test.ts)
- 16 tests covering: `extractUrl`, `readTestRecipe`, `TestRunner.handleDeployToTest`, `TestRunner.runTeardown`
- Tests for: no recipe, vercel deploy, custom deploy, deploy failure, healthcheck timeout, healthcheck pass, teardown ephemeral, skip teardown persistent

## Bugs Discovered & Fixed
1. **Channel routing mismatch**: `promoteToTesting` sent on `company:` channel but local agent only listens to `agent:{machineName}`. Fixed by picking a specific online machine.
2. **Missing event listeners**: `connection.ts` only had `message` and `start_job` event listeners. Added `deploy_to_test` and `verify_job`.

## Post-PR QA Fixes (2026-02-23)

### Fix 1: Wire runTeardown into handleFeatureApproved/Rejected
- Created `runTeardown(supabase, featureId, machineId)` in orchestrator — broadcasts `teardown_test` event to the machine's agent channel and clears `testing_machine_id` on the feature
- Wired as fire-and-forget (`.catch()`, not awaited) at the end of both `handleFeatureApproved` and `handleFeatureRejected` (big rejection path only; small rejections return early so test env stays up)
- Extracted `machineId` from message payload in both handlers (both `FeatureApproved` and `FeatureRejected` types include `machineId`)

### Fix 2: Machine affinity — store testing_machine_id on deploy
- Added `testing_machine_id: msg.machineId` to the feature update in `handleDeployComplete`
- End-to-end flow: `handleDeployComplete` stores `testing_machine_id` → `slack-events` reads it when building FeatureApproved/Rejected messages → orchestrator receives `machineId` in those messages → `runTeardown` routes teardown to correct machine

## Build & Tests
- Typecheck: clean across all 4 workspaces
- Tests: 61 passed (local-agent), 92 passed (shared) — 153 total, all green
- Token budget: claude-ok

## PR #62 Review Fixes (2026-02-23)

### Fix 1: Confirm testing_machine_id in handleDeployComplete
- Already applied in prior commit — verified `testing_machine_id: msg.machineId` present

### Fix 2: Add TeardownTest protocol message + local-agent handler
- Added `TeardownTest` interface to `messages.ts` with `type`, `protocolVersion`, `featureId`, `repoPath`
- Added to `OrchestratorMessage` union
- Added `isTeardownTest` validator + registered in `isOrchestratorMessage` switch
- Updated `runTeardown` in orchestrator to fetch `project.repo_url` and build proper `TeardownTest` message with `PROTOCOL_VERSION`
- Added `case "teardown_test":` handler in local-agent switch → calls `testRunner.runTeardown(msg.repoPath)`
- Exported `TeardownTest` type and `isTeardownTest` validator from shared package index

### Fix 3: Pass repoPath in DeployToTest broadcast
- Added project `repo_url` fetch in `promoteToTesting` after feature fetch
- Added `repoPath: project?.repo_url ?? undefined` to `deployMsg`

### Fix 4: Add partial index on features(slack_channel, slack_thread_ts)
- Added `CREATE INDEX IF NOT EXISTS features_slack_thread_idx` to `021_testing_columns.sql`
- Partial index: `WHERE slack_channel IS NOT NULL AND slack_thread_ts IS NOT NULL`

### Rebase
- Rebased onto master (PRs #60, #61, #63, #64, #66 merged)
- Resolved conflicts in `orchestrator/index.ts` (kept breakdown pipeline from master + deploy handlers from branch)
- Resolved conflicts in `cpo-report.md`
- Fixed type errors from `DeployToTest` interface changes (added `jobType: "feature"` to test, used `featureId ?? ""` fallback)
- Typecheck: clean across all 4 workspaces

## Token Usage
- Budget: claude-ok (direct code changes)
- Approach: Read-first discovery → targeted edits → single commit + rebase
