STATUS: COMPLETE

## Summary

Implemented persistent agent discovery on daemon startup and persistent_agents table upserts (Tasks 10-11 from the Terminal-First CPO 6.1 plan).

### Changes

**`packages/local-agent/src/executor.ts`** (4 changes):

1. **New fields**: Added `persistentJobRole` and `persistentHeartbeatTimer` to `JobExecutor` class for tracking the active persistent agent's role and its heartbeat interval.

2. **`spawnPersistentAgent()` (public)**: New method that accepts a job definition from `company-persistent-jobs` edge function, builds a synthetic `StartJob` message, acquires a slot, and delegates to `handlePersistentJob`.

3. **`handlePersistentJob()` updated**:
   - Added `companyId?: string` parameter (falls back to `ZAZIG_COMPANY_ID` env var)
   - Company-scoped workspace path: `~/.zazigv2/{companyId}-{role}-workspace`
   - Upserts `persistent_agents` table after workspace creation (status=running, prompt_stack, last_heartbeat)
   - Starts a heartbeat interval (`HEARTBEAT_INTERVAL_MS`) that updates `persistent_agents.last_heartbeat`
   - Tracks `persistentJobRole` for shutdown cleanup

4. **`clearPersistentAgent()` (private helper)**: Centralizes shutdown cleanup -- clears heartbeat timer, updates `persistent_agents` status to `stopped`, nulls `persistentJobId`/`persistentJobRole`. Called from `stopAll()`, `handleStopJob()`, `onJobTimeout()`, and `onJobEnded()`.

**`packages/local-agent/src/index.ts`** (1 change):

5. **`discoverAndSpawnPersistentAgents()`**: Standalone async function called after `conn.start()` when `ZAZIG_COMPANY_ID` is set. Fetches job definitions from `company-persistent-jobs` edge function and spawns each via `executor.spawnPersistentAgent()`.

### Verification

- `npx tsc -p packages/shared/tsconfig.json --noEmit` -- clean
- `npx tsc -p packages/local-agent/tsconfig.json --noEmit` -- clean
- No `as unknown as X` casts needed

### Token Usage

- Model: claude-opus-4-6
- Routing: claude-ok (direct implementation)
