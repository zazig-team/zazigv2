# Local Agent Job-Polling Fallback Plan (v2)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a periodic job-polling fallback to the local agent so dispatched jobs are picked up even when the Realtime broadcast is missed.

**Architecture:** The local agent receives dispatched jobs exclusively via Supabase Realtime broadcast on `agent:{machineName}`. If the channel drops (observed: 39k disconnects in one session due to Cloudflare 502s), dispatched jobs are permanently lost. The agent already has a startup-only recovery (`recoverStuckJobs` at `src/index.ts:195-255`) that resets `dispatched` jobs to `queued`. We extend this pattern to run periodically on the heartbeat interval.

**Tech Stack:** TypeScript, Supabase JS client, existing heartbeat mechanism

**Context:** Follow-up item #8 from `docs/plans/2026-02-26-pipeline-lifecycle-fix-plan.md`. Discovered during smoke testing — the orchestrator lifecycle pollers work correctly, but the agent can't receive dispatched jobs when Realtime is unstable.

**Reviewed by:** Codex gpt-5.3-codex (1 round, code-level), Gemini gemini-2.5-pro (1 round, plan-level), CTO (synthesis)

---

## Design Decision: Reset-to-Queued vs Direct Execution

Two approaches were considered:

| Approach | How | Pros | Cons |
|----------|-----|------|------|
| **A: Reset to queued** | Agent detects `dispatched` jobs, resets to `queued`, orchestrator re-dispatches | Minimal code (~20 lines), reuses existing pattern, no new data deps | Adds ~60s latency (orchestrator round-trip) |
| **B: Direct execution** | Store full `StartJob` payload on job row, agent reads it and calls `handleStartJob` | No round-trip, faster recovery | Schema change, orchestrator change, duplicates dispatch logic |

**Decision: Approach A.** Both Codex and Gemini confirmed this is the right short-term fix. The `StartJob` message construction in the orchestrator involves multiple DB joins (personality, role, project, feature, dependencies) that should not be duplicated in the agent. Keep it simple. *(Unanimous approval from both reviewers)*

---

## Critical Safety Rules

### 1. Only poll for THIS machine's jobs (with company scoping)

The agent must only query jobs assigned to its own `machine_id` UUIDs. The recovery query must also scope by `company_id` because machine names are unique per `(company_id, name)`, not globally. If the agent ever runs with service-role credentials, an unscoped name lookup could touch jobs from other tenants.

*(Finding: Codex — cross-tenant safety risk)*

### 2. Don't reset executing jobs

Only reset `dispatched` jobs — not `executing` ones. Executing jobs have active tmux sessions. Resetting them would fight the running executor and corrupt state.

### 3. CAS guard on reset

Use `.eq("status", "dispatched")` on the update to prevent race conditions where the orchestrator or another process has already changed the job status.

### 4. No overlapping recovery polls

The heartbeat's `setInterval` can fire overlapping `sendHeartbeat()` calls if the DB is slow. Add an in-flight guard so the recovery poll is skipped if the previous one hasn't returned.

*(Finding: Codex — heartbeat overlap risk)*

---

## Task 0: Add composite index for recovery query

**Priority:** Critical — both reviewers flagged this.

**Problem:** The recovery query will run every 30s on every active agent. Without an index, it performs a full table scan on `jobs` every time. This will destroy DB performance as the table grows.

*(Finding: Gemini — "single biggest threat to this plan's success"; Codex — "query shape should be hardened")*

**Files:**
- Create: `supabase/migrations/059_job_dispatched_recovery_index.sql`

**Step 1: Create the migration**

```sql
-- 059: Add composite index for local agent job recovery polling.
-- The agent polls every 30s for jobs stuck in 'dispatched' status.
-- Without this index, each poll does a full table scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_dispatched_recovery
  ON public.jobs (status, machine_id, updated_at)
  WHERE status = 'dispatched';
```

The partial index (`WHERE status = 'dispatched'`) keeps it small — only dispatched jobs are indexed, not the entire table.

**Step 2: Commit**

```bash
git add supabase/migrations/059_job_dispatched_recovery_index.sql
git commit -m "perf: add partial index for job dispatched recovery polling"
```

---

## Task 1: Extract `recoverStuckJobs` into a reusable function

**Priority:** Prep — enables reuse.

**Problem:** `recoverStuckJobs` in `src/index.ts:195-255` is a standalone function that takes `(dbClient, machineName)`. It runs once at startup. We need to call the same logic periodically from the heartbeat, which lives in `Connection` (`src/connection.ts`). The function needs to be importable.

**Files:**
- Modify: `packages/local-agent/src/index.ts`
- Create: `packages/local-agent/src/job-recovery.ts`

**Step 1: Extract to new file**

Create `packages/local-agent/src/job-recovery.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find jobs assigned to this machine that are stuck in `dispatched` status
 * (the Realtime broadcast was missed or dropped). Reset them to `queued`
 * so the orchestrator re-dispatches on its next tick.
 *
 * Safe to call repeatedly — uses CAS guard on status.
 *
 * @param gracePeriodMs - Only recover jobs dispatched longer than this ago.
 *   Default 5 minutes. Pass 0 at startup to recover all (previous-run jobs).
 * @param companyIds - Scope the machine lookup by company for multi-tenant safety.
 * @returns Number of jobs recovered
 */
export async function recoverDispatchedJobs(
  dbClient: SupabaseClient,
  machineName: string,
  options?: { gracePeriodMs?: number; companyIds?: string[] },
): Promise<number> {
  const gracePeriodMs = options?.gracePeriodMs ?? 5 * 60 * 1000; // default 5 min

  try {
    // Look up our machine row ID(s) by name, scoped to our companies
    let machineQuery = dbClient
      .from("machines")
      .select("id")
      .eq("name", machineName);

    if (options?.companyIds && options.companyIds.length > 0) {
      machineQuery = machineQuery.in("company_id", options.companyIds);
    }

    const { data: machines, error: machErr } = await machineQuery;

    if (machErr || !machines || machines.length === 0) {
      return 0;
    }

    const machineIds = machines.map((m: { id: string }) => m.id);

    // Find stuck jobs: dispatched means the Realtime broadcast was missed.
    // Only reset 'dispatched' — not 'executing'. Executing jobs have an
    // active tmux session; resetting them would fight the running executor.
    let jobQuery = dbClient
      .from("jobs")
      .select("id, status, job_type, role")
      .in("machine_id", machineIds)
      .eq("status", "dispatched");

    // Grace period: skip recently-dispatched jobs that may still be mid-delivery.
    // The executor sets status to 'executing' late in the startup flow (after
    // context resolution, worktree creation, and tmux spawn — executor.ts:415),
    // so large repos can take several minutes. 5 minutes covers p99 startup.
    if (gracePeriodMs > 0) {
      const graceCutoff = new Date(Date.now() - gracePeriodMs).toISOString();
      jobQuery = jobQuery.lt("updated_at", graceCutoff);
    }

    const { data: stuckJobs, error: jobErr } = await jobQuery;

    if (jobErr) {
      console.error("[local-agent] Error querying dispatched jobs:", jobErr.message);
      return 0;
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      return 0;
    }

    console.log(`[local-agent] Found ${stuckJobs.length} dispatched job(s) — resetting to queued`);

    let recovered = 0;
    for (const job of stuckJobs) {
      const { error: updateErr } = await dbClient
        .from("jobs")
        .update({
          status: "queued",
          machine_id: null,
          started_at: null,
        })
        .eq("id", job.id)
        .eq("status", "dispatched"); // CAS guard

      if (updateErr) {
        console.error(`[local-agent] Failed to reset job ${job.id}: ${updateErr.message}`);
      } else {
        console.log(
          `[local-agent] Reset job ${job.id} (dispatched → queued, role=${job.role ?? "none"})`,
        );
        recovered++;
      }
    }

    return recovered;
  } catch (err) {
    console.error("[local-agent] Job recovery failed:", err);
    return 0;
  }
}
```

**Changes from v1:**
- **Grace period default raised to 5 minutes** — the executor sets `executing` late in startup (after context resolution + worktree + tmux spawn at executor.ts:415). 2 minutes was too aggressive for large repos. *(Codex finding)*
- **Added `companyIds` parameter** — scopes the machine lookup by company for multi-tenant safety. Machine names are unique per `(company_id, name)`, not globally. *(Codex finding)*
- **Grace period is configurable** — pass `gracePeriodMs: 0` at startup, default 5 min in heartbeat

**Step 2: Update `index.ts` to import and use the extracted function**

Replace the inline `recoverStuckJobs` function in `src/index.ts` with an import:

```typescript
import { recoverDispatchedJobs } from "./job-recovery.js";
```

Replace the call at line 156:

```typescript
await recoverDispatchedJobs(conn.dbClient, config.name, {
  gracePeriodMs: 0,
  companyIds: conn.companyIds,
});
```

Delete the old `recoverStuckJobs` function (lines 195-255).

**Step 3: Commit**

```bash
git add packages/local-agent/src/job-recovery.ts packages/local-agent/src/index.ts
git commit -m "refactor: extract recoverDispatchedJobs into reusable module"
```

---

## Task 2: Add periodic job polling to the heartbeat with overlap guard

**Priority:** Critical — this is the core fix.

**Problem:** The heartbeat runs every 30s (`HEARTBEAT_INTERVAL_MS`) and already writes to DB. We need it to also check for dispatched jobs that were missed.

**Files:**
- Modify: `packages/local-agent/src/connection.ts`

**Step 1: Add overlap guard and import**

At the top of `connection.ts`, add:

```typescript
import { recoverDispatchedJobs } from "./job-recovery.js";
```

Add a private field to the `Connection` class:

```typescript
private isRecoveryRunning = false;
```

**Step 2: Wire up recovery in `sendHeartbeat()`**

At the end of the `sendHeartbeat()` method (after the existing heartbeat broadcast, before the final `if (dbErr)` warning at line 450), insert:

```typescript
    // --- Job recovery poll ---
    // Check for dispatched jobs that were missed due to Realtime drops.
    // Resets them to queued so the orchestrator re-dispatches on next tick.
    // Skip if previous recovery poll is still in-flight (DB slow).
    if (!this.isRecoveryRunning) {
      this.isRecoveryRunning = true;
      try {
        const recovered = await recoverDispatchedJobs(
          this.dbClient,
          this.machineId,
          { companyIds: this.companyIds },
        );
        if (recovered > 0) {
          console.log(`[local-agent] Heartbeat recovered ${recovered} missed job(s)`);
        }
      } catch (err) {
        console.warn(`[local-agent] Job recovery poll failed:`, err);
      } finally {
        this.isRecoveryRunning = false;
      }
    }
```

**Step 3: Expose `companyIds` on the Connection class**

The `Connection` class stores `companyIds` privately. It needs to be accessible from the heartbeat call. Either:
- Make it `public readonly` (simplest)
- Or add a getter

Recommended: `public readonly companyIds: string[]` — it's already set once at construction and never mutated.

**Step 4: Verify behaviour**

The recovery poll runs every 30s alongside the heartbeat. Sequence per tick:
1. Write heartbeat to DB (existing)
2. Broadcast heartbeat via Realtime (existing)
3. Poll for dispatched jobs older than 5 min and reset to queued (new)

If a job is reset, the orchestrator re-dispatches on its next cron tick (~60s). Total worst-case recovery time: 30s (agent poll) + 5min (grace period) + 60s (orchestrator re-dispatch) = **~6.5 minutes**. This is dramatically better than "forever".

**Changes from v1:**
- **Added overlap guard** (`isRecoveryRunning` flag) to prevent concurrent recovery polls when DB is slow *(Codex finding)*
- **Passes `companyIds`** for multi-tenant safety *(Codex finding)*

**Step 5: Commit**

```bash
git add packages/local-agent/src/connection.ts
git commit -m "fix: add periodic job-polling fallback to heartbeat for missed Realtime dispatches"
```

---

## Task 3: Investigate the `persistent jobs` 401 error

**Priority:** Low — separate issue, investigation only.

**Problem:** `discoverAndSpawnPersistentAgents` at `src/index.ts:261-303` calls the `company-persistent-jobs` edge function using the anon key as a Bearer token. It returns 401.

**Changed from v1:** Downgraded from "fix" to "investigate". Codex found that the edge function (`company-persistent-jobs/index.ts:54`) only checks for header presence, not JWT validity. Switching to user JWT may not fix the root cause. Need to read the actual 401 response body first.

**Files:**
- Read: `supabase/functions/company-persistent-jobs/index.ts`
- Read: `packages/local-agent/src/index.ts:261-303`

**Step 1: Add response body logging**

Before fixing the auth, add the response body to the error log so we can see what's actually failing:

```typescript
if (!res.ok) {
  const body = await res.text().catch(() => "");
  console.error(
    `[local-agent] Failed to fetch persistent jobs: HTTP ${res.status}`,
    `— body: ${body.slice(0, 500)}`,
  );
  return;
}
```

**Step 2: Check from the response body**

The 401 could come from:
- Supabase Edge Functions gateway rejecting the anon key (most likely)
- The edge function itself (unlikely — it creates a service-role client internally)
- Cloudflare/CDN layer

**Step 3: Commit**

```bash
git add packages/local-agent/src/index.ts
git commit -m "debug: add response body to persistent jobs 401 error log"
```

---

## Summary

| Task | What | Priority | Lines |
|------|------|----------|-------|
| 0 | Add partial index for dispatched recovery query | Critical | ~5 (SQL) |
| 1 | Extract `recoverDispatchedJobs` into reusable module | Prep | ~70 |
| 2 | Add periodic job polling to heartbeat with overlap guard | Critical | ~20 |
| 3 | Investigate persistent jobs 401 auth issue | Low | ~5 |

Total diff: ~100 lines of TypeScript + 1 SQL migration across 4 files.

---

## Changes from v1 (based on reviews)

| Change | Source | Severity |
|--------|--------|----------|
| Grace period raised from 2min to 5min | Codex — executor sets `executing` late, large repo checkouts can take minutes | High |
| Added composite partial index on `(status, machine_id, updated_at)` | Gemini + Codex — both flagged DB performance risk | High |
| Added company_id scoping to machine lookup | Codex — cross-tenant safety in service-role mode | High |
| Added overlap guard (`isRecoveryRunning`) | Codex — setInterval can fire overlapping polls | Medium |
| Task 3 downgraded to investigation | Codex — edge function only checks header presence, root cause unclear | Medium |
| Grace period made configurable via options param | Gemini — allows tuning without redeployment | Low |

---

## Follow-up Items (not in scope)

1. **Slot counter persistence:** `SlotTracker` is in-memory and resets to 0 on restart. If tmux sessions survive a restart, the agent will double-book slots. Should reconcile `inUse` count against running tmux sessions on startup.
2. **Outbound channel CLOSED handling:** `connection.ts` only triggers reconnect on inbound channel CLOSED, not outbound. If Supabase silently drops the outbound channel, job results and heartbeats are dropped without reconnect.
3. **Orchestrator dispatch failure handling:** When `channel.send()` returns non-"ok" (line 749), the orchestrator logs the error but doesn't reset the job. Should reset to `queued` on broadcast failure.
4. **Durable job queue:** The fundamental fix is replacing Realtime broadcast with a DB-backed job queue where agents poll for work. This eliminates both the orchestrator catch-up pollers AND the agent polling fallback. Tracked as follow-up #6 in the lifecycle fix plan.
5. **Batch reset optimization:** Current plan updates jobs one at a time in a loop. At scale, use a single `UPDATE ... WHERE id IN (...)` batch. Not needed at current volume. *(Codex)*
6. **Machine-ID caching:** The recovery query looks up machine IDs by name on every tick. Cache the result for the session lifetime since machine names don't change. *(Codex)*
7. **Grace period env var:** Make the grace period configurable via `ZAZIG_RECOVERY_GRACE_MS` env var for tuning without redeployment. Currently hardcoded as default in function signature. *(Gemini)*
