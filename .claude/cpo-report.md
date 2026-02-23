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
