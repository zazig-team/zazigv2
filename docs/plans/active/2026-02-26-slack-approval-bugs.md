# P0: Slack Approval Bugs — Two Silent Failures

*Discovered: 2026-02-26 during openclaw/lobster repo-recon*
*Source: Codex second opinion validated against zazigv2 codebase*

---

## Bug 1: Status Mismatch — Slack Approval Can Never Find Features

### Problem
Slack-based feature approval/rejection has **never worked**. The Slack events handler queries for features with `status = "testing"`, but this status does not exist in the pipeline. The orchestrator sets `status = "ready_to_test"` at `supabase/functions/orchestrator/index.ts:2624`.

### Root Cause
`supabase/functions/slack-events/index.ts:163`:
```typescript
.eq("status", "testing")
```
Should be:
```typescript
.eq("status", "ready_to_test")
```

The feature lifecycle is:
```
verifying → deploying_to_test → ready_to_test → deploying_to_prod → complete
```

There is no `"testing"` status. The Slack handler silently returns false for every message in every testing thread — approve/reject keywords are never detected.

### Fix
One line change in `supabase/functions/slack-events/index.ts:163`:
Change `.eq("status", "testing")` to `.eq("status", "ready_to_test")`.

Update the comments at lines 144, 156, and 168 that reference "testing" to say "ready_to_test" for consistency.

### Verification
- Deploy the Slack events edge function after fix
- Find or create a feature in `ready_to_test` status with `slack_channel` and `slack_thread_ts` set
- Post "approve" in that Slack thread
- Confirm the orchestrator receives a `feature_approved` message and transitions the feature to `deploying_to_prod`

---

## Bug 2: machineId Null Causes Silent Validation Failure

### Problem
When Slack sends a `feature_approved` message to the orchestrator, if `testing_machine_id` is null in the DB, the message fails validation silently. The orchestrator drops the message because `isFeatureApproved` requires a non-empty string for `machineId`.

### Root Cause
`supabase/functions/slack-events/index.ts:193`:
```typescript
const machineId = feature.testing_machine_id ?? null;
```
This can be null if `testing_machine_id` was never set (e.g. manual status transitions, race conditions, or if deploy didn't record the machine).

`packages/shared/src/validators.ts:281`:
```typescript
if (!isString(v.machineId) || v.machineId.length === 0) return false;
```
`null` fails `isString` → validator returns false → message silently dropped.

### Fix
Three changes needed:

1. **Validator** (`packages/shared/src/validators.ts`): Make `machineId` optional for `feature_approved` and `feature_rejected`. The orchestrator's `handleFeatureApproved` at line 1842 doesn't use `machineId` for the actual approval transition — it only needs `featureId` to do the CAS guard `ready_to_test → deploying_to_prod`. Change line 281 from:
   ```typescript
   if (!isString(v.machineId) || v.machineId.length === 0) return false;
   ```
   to:
   ```typescript
   // machineId is optional — Slack approvals may not have it
   if (v.machineId !== undefined && v.machineId !== null &&
       (!isString(v.machineId) || v.machineId.length === 0)) return false;
   ```

2. **Type** (`packages/shared/src/types.ts` or wherever `FeatureApproved` is defined): Change `machineId: string` to `machineId: string | null`.

3. **Slack events** (`supabase/functions/slack-events/index.ts:193`): Add a fallback — if `testing_machine_id` is null, use a sentinel so the orchestrator can log where the approval came from:
   ```typescript
   const machineId = feature.testing_machine_id ?? "slack-approval";
   ```

### Verification
- Set a feature to `ready_to_test` with `testing_machine_id = NULL` in the DB
- Post "approve" in its Slack thread
- Confirm the orchestrator receives and processes the approval
- Check that the feature transitions to `deploying_to_prod`

---

## Summary

| Bug | Severity | Impact | Fix Size |
|-----|----------|--------|----------|
| Status mismatch | P0 | Slack approval completely broken | 1 line + comments |
| machineId null | P0 | Approvals silently dropped on edge case | 3 files, ~5 lines |

Both are one-commit fixes. Bug 1 is the critical one — it means Slack approval has literally never worked. Bug 2 is a safety net for edge cases.
