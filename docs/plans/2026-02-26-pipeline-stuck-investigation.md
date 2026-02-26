# Pipeline Stuck Investigation

**Date:** 2026-02-26
**Status:** Investigation — pre-plan
**Context:** Chris has been fixing the pipeline all day. It's progressed but still broken. This doc captures the current state and known issues before we form a fix plan.

---

## What's Working

- **Breakdown → building transition:** `processFeatureLifecycle` handles this as a catch-up poller (line 2229). Also handled in `handleJobComplete` (line 999). CAS guards prevent double-fire.
- **Building → combining transition:** `processFeatureLifecycle` handles this (line 2317). Also triggered in `handleJobComplete` via `triggerCombining()`. Both paths guarded.
- **Dependency branch chaining:** Jobs now receive their dependency's branch as a base. Leaf-branch calculation for the combiner is correct (only merge tips, not superseded intermediate branches).
- **Logging:** Comprehensive logging added — `~/.zazigv2/local-agent.log` for agent, `~/.zazigv2/job-logs/{jobId}-pre-post.log` for lifecycle, `{jobId}-pipe-pane.log` for tmux output.
- **Individual jobs run fine in isolation.** Chris confirmed each job succeeds when run separately.

## What's Broken

### 1. `combining → verifying` transition has no catch-up poller

**The primary issue Chris identified before signing off.**

`processFeatureLifecycle` (line 2228) handles two transitions:
1. `breakdown → building` (line 2229)
2. `building → combining` (line 2317)

It does **not** handle `combining → verifying`. That transition only fires via the Realtime path in `handleJobComplete` (line 1072-1076):

```typescript
if (jobRow?.job_type === "combine" && jobRow?.feature_id) {
  await triggerFeatureVerification(supabase, jobRow.feature_id);
}
```

The orchestrator listens to Realtime for only 4 seconds per cron tick. If the combiner's `job_complete` broadcast lands outside that window, the feature is permanently stuck in `combining`.

**Fix:** Add a third case to `processFeatureLifecycle` — when feature is in `combining` and the combine job is `complete`, call `triggerFeatureVerification()`.

### 2. Concurrent job execution causes failures

Chris: "I am pretty sure the issue is to do with having multiple jobs all executing at the same time. I can run each job separately and no issues. But run them all together and bam."

Likely causes:
- **Git bare repo contention:** Multiple worktrees created simultaneously from the same bare repo. `git fetch` in one worktree could interfere with another. Chris already removed `--prune` from fetch and changed to non-force refspec to protect active branches.
- **Slot accounting race:** Multiple jobs dispatched in the same cron tick could over-allocate machine slots. The orchestrator reads slot counts, then dispatches — no transactional lock between read and insert.
- **Realtime broadcast collisions:** Multiple `JobComplete` events arriving in the same 4-second window could trigger concurrent `handleJobComplete` executions. CAS guards protect feature status transitions but not job-level state.

### 3. `checkUnblockedJobs` is log-only

`checkUnblockedJobs` (line 1253) runs after every job completion but **only logs** which jobs are unblocked. It doesn't dispatch or change job status. Unblocked jobs wait for the next `dispatchQueuedJobs` cron tick (up to 60 seconds).

Not a correctness bug, but adds unnecessary latency to dependency chains. In a 3-job chain A→B→C, that's 2 extra minutes of idle time.

### 4. The 4-second Realtime listen window is fundamentally fragile

The orchestrator is a stateless edge function invoked by cron. It subscribes to Realtime for 4 seconds, processes whatever arrives, then exits. This is the root cause of every "missed broadcast" bug. The catch-up pollers are band-aids — each new feature lifecycle stage needs a new poller case, and they all add a full cron interval of latency.

This isn't a bug to fix today, but it's the architectural debt that keeps generating bugs.

### 5. Missing later-stage catch-up transitions

Beyond `combining → verifying`, there are other Realtime-only transitions that would also be stuck if broadcasts are missed:
- `verifying → deploying_to_test` (triggered by `VerifyResult` broadcast)
- `deploying_to_test → ready_to_test` (triggered by `DeployComplete` broadcast)
- `deploying_to_prod → complete` (triggered by deploy job completion)

These are less immediately urgent (we need to get through combining → verifying first) but represent the same pattern.

---

## Immediate Fix Required

Per Chris's analysis before signing off, the minimal fix to unblock the pipeline:

**Add `combining → verifying` catch-up to `processFeatureLifecycle`:**

After the existing building → combining block (line 2348), add:

```
// --- 3. combining → verifying ---
// Features stuck in 'combining' where the combine job is already complete
Query features with status = 'combining'
For each: check if combine job exists and is 'complete'
If yes: call triggerFeatureVerification(supabase, feature.id)
```

Same pattern as the existing two cases. CAS guard in `triggerFeatureVerification` already prevents double-fire (line 1562-1566).

---

## What Chris Changed Today (Key Commits)

| Commit | What |
|--------|------|
| `e2a5cf2` | `dependencyBranches` in `StartJob` for branch chaining |
| `6ae3649` | Full pipeline dependency branch chaining |
| `299a328` | Removed `commission_contractor` (was causing double-dispatch) |
| `5373ead` | Anon key for edge function auth in persistent agent discovery |
| `564c100` | Server-side MCP tool access control via DB-driven role allow-list |
| `660d53a` | Working version with branches |
| `fd0906b` | Delete branch on new job |
| `5b36b2a` | Fixed git cleanup issue |
| `77e83d7` | Comprehensive logging + git fetch/push fixes |
| `ea97118` | Fixed branch issues |

---

## Git Changes Worth Noting

- Removed `--prune` from all `git fetch` calls — was deleting active job branches
- Changed fetch refspec from `+refs/heads/*:refs/heads/*` (force) to `refs/heads/*:refs/heads/*` (no force) — protects worktrees from concurrent fetch overwrites
- Push changed to `--force` — needed because rebased/amended job branches can't push without it
- `ensureRepo` no longer fetches on existing repo — fetch moved inside the lock

---

## Testing Approach

Chris suggested: create a new feature (e.g. "build a dummy website"), let it run through the pipeline with the latest code. This will generate detailed logs in `~/.zazigv2/local-agent.log` and `~/.zazigv2/job-logs/` that can be used to debug remaining issues.

---

## Open Questions

1. **Concurrent execution root cause:** Is it git contention, slot accounting, Realtime collision, or something else? The detailed logging Chris added should reveal this on the next full pipeline run.
2. **Should `checkUnblockedJobs` actively dispatch?** Or is the 1-minute latency acceptable? Trade-off: faster chains vs. more complex state management.
3. **Long-term Realtime architecture:** The 4-second listen window keeps generating catch-up poller requirements. Is there a path to a persistent listener (e.g. long-running worker instead of edge function)?
