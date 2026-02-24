# CPO Report — DAG Dispatch + CPO Notifications

## Summary
Added DAG-aware job dispatch, dependency-unblocking on completion, and CPO notification system to the orchestrator. Fixed breakdown specialist role name. All new functionality has passing tests.

## Agent Team Summary
- **Team composition**: 2 agents (orchestrator-agent, test-agent) using general-purpose subagent type
- **Contract chain**: orchestrator-agent (upstream, delivered function signatures) → test-agent (downstream, wrote tests against contracts)
- **Files per teammate**:
  - orchestrator-agent: `supabase/functions/orchestrator/index.ts`
  - test-agent: `supabase/functions/orchestrator/orchestrator.test.ts`
- **Agent Teams value assessment**: Clean split with zero merge conflicts. Contract-first delivery worked well — test-agent received exact function signatures from orchestrator-agent. The 2-agent setup was appropriate for this scope. Team lead fixed pre-existing test mismatches that the test-agent flagged.

## Changes

### `supabase/functions/orchestrator/index.ts` (+225 lines)
- **DAG dispatch** (lines 454-473): `dispatchQueuedJobs` now checks `depends_on` arrays before dispatching. Jobs with unfinished dependencies are skipped with a log message.
- **`checkUnblockedJobs`** (lines 1172-1214): New exported function. When a job completes, queries for queued jobs in the same feature that reference the completed job in `depends_on`, then checks if ALL their dependencies are now complete.
- **`notifyCPO`** (lines 1224-1286): New exported function. Finds the active CPO job, resolves its machine name, and sends a `MessageInbound` via Supabase Realtime broadcast.
- **CPO notification on breakdown complete** (lines 954-975): After breakdown job finishes, notifies CPO with job count and dispatchable count.
- **CPO notification on project-architect complete** (lines 978-996): After project structuring, notifies CPO with feature count.
- **CPO notification on verification failure** (lines 1307-1325): On failed verification, notifies CPO with test output snippet.
- **`depends_on` on JobRow interface** (line 91): Added to type and SELECT query.
- **Role fix** (line 2010): Changed `triggerBreakdown` role from `"feature-breakdown-expert"` to `"breakdown-specialist"` to match migration 040.
- **Integration**: `checkUnblockedJobs` called in `handleJobComplete` (line 903) and `handleVerifyResult` (line 1358).

### `supabase/functions/orchestrator/orchestrator.test.ts` (+420/-115 lines)
- **7 new tests**: checkUnblockedJobs (3 tests: all-deps-complete, partial-incomplete, no-candidates), notifyCPO (2 tests: sends message, no active CPO), triggerBreakdown role fix, handleVerifyResult CPO notification
- **Mock enhancements**: Added `contains`, `neq`, `head` to smart mock method list
- **Pre-existing test fixes**: Fixed 6 tests with wrong status expectations (`verify_failed`→`queued`, `done`→`complete`), removed reference to non-existent `triggerStandaloneVerification` function, adjusted chain count assertions for new checkUnblockedJobs integration

## Testing
- **18 tests pass** (all new + previously-passing tests)
- **6 tests fail** — all pre-existing mock limitations, not caused by our changes:
  - 3x `insert().select()` not supported by mock (triggerFeatureVerification, handleFeatureRejected)
  - 2x double `.eq().eq()` not supported by mock (handleFeatureApproved, handleFeatureRejected)
  - 1x test assumes triggerFeatureVerification but code calls triggerCombining

## Decisions Made
- `checkUnblockedJobs` is a logging-only function for now — it identifies unblocked jobs but doesn't mutate state (dispatch happens on next orchestrator tick)
- `notifyCPO` uses `MessageInbound` over Realtime broadcast, with `conversationId: "internal:notification:{uuid}"` pattern
- CPO notification is best-effort: if no active CPO, message is lost with a warning log (CPO catches up on next wakeup)
