# Created → Queued Job Status Split — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a `created` status for newly inserted jobs. The orchestrator's `dispatchQueuedJobs` loop picks up `created` jobs, enriches them (prompt_stack, role, model, slot_type), then sets them to `queued`. Agents only pick up `queued` jobs — which are guaranteed to have `prompt_stack` populated. This eliminates the race condition where agents claim jobs before enrichment.

**Architecture:** Add `created` to the jobs status constraint. Change all job insert sites to use `status: 'created'`. Change `dispatchQueuedJobs` to look for `created` (instead of `queued`) and transition to `queued` after enrichment. Simplify `agent-inbound-poll` to trust that `queued` = enriched.

**Tech Stack:** TypeScript, Supabase Edge Functions, Postgres migration

---

## Chunk 1: Database migration + orchestrator

### Task 1: Add `created` status to jobs constraint

**Files:**
- Create: `supabase/migrations/XXX_add_created_job_status.sql` (use next migration number)

- [ ] **Step 1: Find the next migration number**

Run: `ls supabase/migrations/ | tail -5` to find the latest migration number. Use N+1.

- [ ] **Step 2: Write the migration**

```sql
-- Add 'created' status to jobs lifecycle.
-- Jobs start as 'created', the orchestrator enriches them with prompt_stack
-- and transitions to 'queued'. Agents only claim 'queued' jobs.

ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Transition any existing 'queued' jobs that lack prompt_stack to 'created'
-- so they get enriched on the next orchestrator pass.
UPDATE public.jobs
SET status = 'created'
WHERE status = 'queued'
  AND prompt_stack IS NULL;

ALTER TABLE public.jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'created',
    'queued',
    'executing',
    'verify_queued',
    'verify_failed',
    'blocked',
    'reviewing',
    'complete',
    'failed',
    'cancelled'
  ));
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/XXX_add_created_job_status.sql
git commit -m "migration: add 'created' job status for pre-enrichment state"
```

---

### Task 2: Update `dispatchQueuedJobs` to process `created` jobs and transition to `queued`

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts`

- [ ] **Step 1: Change the status filter from `queued` to `created`**

At line 430, change:
```ts
.in("status", ["queued", "verify_failed"])
```
to:
```ts
.in("status", ["created", "verify_failed"])
```

- [ ] **Step 2: Update the enrichment update to also set `status: "queued"`**

At lines 816-826, change the `.update(...)` call to include `status: "queued"`:

```ts
const { data: enrichedRows, error: updateJobErr } = await supabase
  .from("jobs")
  .update({
    status: "queued",
    role: resolvedRole,
    model,
    slot_type: slotType,
    prompt_stack: promptStackMinusSkills || null,
  })
  .eq("id", job.id)
  .in("status", ["created", "verify_failed"]) // optimistic lock
  .select("id");
```

- [ ] **Step 3: Update the log message**

At line 842, update the log from "Enriched queued job" to "Enriched and queued job":

```ts
console.log(
  `[orchestrator] Enriched and queued job ${job.id} with role=${resolvedRole}, slot=${slotType}, model=${model}`,
);
```

- [ ] **Step 4: Update the log messages referencing "queued jobs"**

At line 442:
```ts
console.log("[orchestrator] No created jobs to enrich.");
```

At line 446:
```ts
console.log(`[orchestrator] ${queuedJobs.length} created job(s) to enrich.`);
```

- [ ] **Step 5: Update null-context failure case**

At lines 756-768, the null-context guard currently fails the job. Update the `.eq` status filter:

Change:
```ts
.eq("id", job.id);
```

This one already doesn't filter on status, so it's fine. (Double-check this — the exact code at line 760-768 just does `.eq("id", job.id)` without a status filter.)

- [ ] **Step 6: Update the `reapStaleJobs` function if it references `queued`**

Check `reapStaleJobs` — if it re-queues jobs stuck in `executing` back to `queued`, those jobs already have prompt_stack so `queued` is correct. No change needed there.

At orchestrator line 409, `reapStaleJobs` does:
```ts
.update({ status: "queued", machine_id: null })
```
This is correct — these jobs were previously enriched, so they should go back to `queued` (not `created`).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "feat: dispatchQueuedJobs processes 'created' jobs → enriches → sets 'queued'"
```

---

### Task 3: Update `agent-inbound-poll` to remove the prompt_stack filter

**Files:**
- Modify: `supabase/functions/agent-inbound-poll/index.ts`

- [ ] **Step 1: Remove the `.or("prompt_stack.not.is.null,context.not.is.null")` filter**

At line 189, remove:
```ts
.or("prompt_stack.not.is.null,context.not.is.null")
```

Since `queued` now guarantees the job has been enriched with `prompt_stack`, this filter is redundant.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/agent-inbound-poll/index.ts
git commit -m "fix: remove redundant prompt_stack filter — queued status guarantees enrichment"
```

---

## Chunk 2: Change all job insert sites to `status: 'created'`

Every place that inserts a job with `status: "queued"` needs to change to `status: "created"`. The orchestrator loop will enrich these and transition them to `queued`.

### Task 4: `handleFeatureRejected` (orchestrator/index.ts)

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` (~line 1304)

- [ ] **Step 1: Change `status: "queued"` to `status: "created"`**

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "feat: handleFeatureRejected inserts jobs as 'created'"
```

---

### Task 5: `triggerBreakdown` — both paths (orchestrator/index.ts)

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts` (~lines 1576, 1639)

- [ ] **Step 1: Change `status: "queued"` to `status: "created"` in the fast-track insert (~line 1576)**

- [ ] **Step 2: Change `status: "queued"` to `status: "created"` in the breakdown-specialist insert (~line 1639)**

- [ ] **Step 3: Check line 1617 — there's a `.eq("status", "queued")` that cancels duplicate breakdown jobs**

This query at line 1617 checks for existing queued breakdown jobs to avoid duplicates. Update to also check `created`:

```ts
.in("status", ["created", "queued"])
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "feat: triggerBreakdown inserts jobs as 'created'"
```

---

### Task 6: `batch-create-jobs` (batch-create-jobs/index.ts)

**Files:**
- Modify: `supabase/functions/batch-create-jobs/index.ts` (~lines 245, 288)

- [ ] **Step 1: Change `status: "queued"` to `status: "created"` at both insert sites**

Line 245 is the main batch insert. Line 288 appears to be a secondary insert path (possibly for single jobs). Change both.

- [ ] **Step 2: Check line 106 — `.eq("status", "queued")` in a duplicate check**

If this checks for existing queued jobs to prevent duplicates, update to:
```ts
.in("status", ["created", "queued"])
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/batch-create-jobs/index.ts
git commit -m "feat: batch-create-jobs inserts jobs as 'created'"
```

---

### Task 7: `pipeline-utils.ts` — triggerCombining, triggerFeatureVerification, triggerMerging

**Files:**
- Modify: `supabase/functions/_shared/pipeline-utils.ts` (~lines 402, 531, 543, 686)

- [ ] **Step 1: Change all `status: "queued"` to `status: "created"` in job inserts**

There are 4 insert sites:
- `triggerCombining` (~line 402)
- `triggerFeatureVerification` active variant (~line 531)
- `triggerFeatureVerification` passive variant (~line 543)
- `triggerMerging` (~line 686)

- [ ] **Step 2: Update duplicate-check queries that filter on `"queued"`**

There are several `.eq("status", "queued")` checks used for idempotency/duplicate prevention:
- Line 171: duplicate check — update to `.in("status", ["created", "queued"])`
- Line 444: cancel duplicate combine jobs — update to `.in("status", ["created", "queued"])`
- Line 591: cancel duplicate verify jobs — update to `.in("status", ["created", "queued"])`
- Line 728: cancel duplicate merge jobs — update to `.in("status", ["created", "queued"])`

- [ ] **Step 3: Check line 655 — `.in("status", ["queued", "executing", "complete"])`**

This is a query that checks if jobs are active/pending. Add `"created"`:
```ts
.in("status", ["created", "queued", "executing", "complete"])
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/pipeline-utils.ts
git commit -m "feat: pipeline-utils inserts jobs as 'created'"
```

---

### Task 8: `request-feature-fix` (request-feature-fix/index.ts)

**Files:**
- Modify: `supabase/functions/request-feature-fix/index.ts` (~line 173)

- [ ] **Step 1: Change `status: "queued"` to `status: "created"`**

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/request-feature-fix/index.ts
git commit -m "feat: request-feature-fix inserts retry jobs as 'created'"
```

---

### Task 9: `diagnose-feature` (diagnose-feature/index.ts)

**Files:**
- Modify: `supabase/functions/diagnose-feature/index.ts` (~line 203)

- [ ] **Step 1: Change `status: "queued"` to `status: "created"`**

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/diagnose-feature/index.ts
git commit -m "feat: diagnose-feature inserts jobs as 'created'"
```

---

### Task 10: `promote-idea` (promote-idea/index.ts)

**Files:**
- Modify: `supabase/functions/promote-idea/index.ts` (~line 154)

- [ ] **Step 1: Change `status: "queued"` to `status: "created"`**

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/promote-idea/index.ts
git commit -m "feat: promote-idea inserts jobs as 'created'"
```

---

### Task 11: `request_standalone_work` SQL RPC

**Files:**
- Create: `supabase/migrations/XXX_update_standalone_work_created_status.sql` (next migration number after Task 1's migration)

- [ ] **Step 1: Write migration to update the RPC function**

Copy the full `CREATE OR REPLACE FUNCTION` from migration 149, but change line 180:
```sql
'queued',
```
to:
```sql
'created',
```

Also update the return message at line 193:
```sql
'message', 'Job created — awaiting orchestrator enrichment.'
```

Also update the idempotency check at line 132 to include `created`:
```sql
AND status IN ('created', 'queued', 'dispatched', 'executing')
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/XXX_update_standalone_work_created_status.sql
git commit -m "migration: request_standalone_work inserts as 'created'"
```

---

## Chunk 3: Update remaining status queries

### Task 12: Update `agent-event/handlers.ts` references

**Files:**
- Modify: `supabase/functions/agent-event/handlers.ts`

- [ ] **Step 1: Check lines 278 and 400**

Line 278: `.eq("status", "queued")` — if this is cancelling a queued job, it should also match `created`:
```ts
.in("status", ["created", "queued"])
```

Line 400: `.update({ status: "queued", machine_id: null })` — this re-queues an executing job. Since it was previously enriched, `queued` is correct. **No change needed.**

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/agent-event/handlers.ts
git commit -m "fix: agent-event handlers check for 'created' status where needed"
```

---

### Task 13: Update orchestrator queries that check for active jobs

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts`

- [ ] **Step 1: Check lines 1503, 1957, 1984, 2085, 2489**

Each of these queries checks for "active" jobs using `.in("status", ["queued", "executing", ...])`. Add `"created"` to each:

- Line 1503: `.in("status", ["queued", "executing", "blocked", "complete"])` → add `"created"`
- Line 1957: `.in("status", ["queued", "executing"])` → add `"created"`
- Line 1984: `.in("status", ["queued", "executing"])` → add `"created"`
- Line 2085: `.eq("status", "queued")` → `.in("status", ["created", "queued"])`
- Line 2489: `.in("status", ["queued", "executing"])` → add `"created"`

For each, read the surrounding context to confirm `"created"` should be included (it should for any query asking "does an active/pending job exist?").

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: orchestrator queries include 'created' in active-job checks"
```

---

### Task 14: Update `query-idea-status` (query-idea-status/index.ts)

**Files:**
- Modify: `supabase/functions/query-idea-status/index.ts` (~line 126)

- [ ] **Step 1: Add handling for `created` status in job counts**

```ts
else if (job.status === "created") jobCounts.queued++; // count created as queued for display
```

Or add a separate `created` counter if the UI distinguishes them.

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/query-idea-status/index.ts
git commit -m "fix: query-idea-status counts 'created' jobs"
```

---

### Task 15: Update orchestrator tests

**Files:**
- Modify: `supabase/functions/orchestrator/orchestrator.test.ts`

- [ ] **Step 1: Update test assertions**

Lines 587, 727, 946, 1237: change `assertEquals(payload.status, "queued")` to `assertEquals(payload.status, "created")` where the test is checking the status of a freshly inserted job.

Line 1265: `data: { id: "existing-breakdown-99", status: "queued" }` — this is a mock for a duplicate-check query. If the test is checking whether a duplicate exists, it may need to include `"created"` in the mock or the query being tested.

Review each test to understand what it's asserting and update accordingly.

- [ ] **Step 2: Run tests**

Run: `deno test supabase/functions/orchestrator/orchestrator.test.ts`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/orchestrator/orchestrator.test.ts
git commit -m "test: update orchestrator tests for 'created' status"
```

---

### Task 16: Deploy and verify

- [ ] **Step 1: Run the migration on staging**

```bash
supabase db push
```

- [ ] **Step 2: Deploy all changed Edge Functions**


```bash
supabase functions deploy orchestrator
supabase functions deploy agent-inbound-poll
supabase functions deploy batch-create-jobs
supabase functions deploy request-feature-fix
supabase functions deploy diagnose-feature
supabase functions deploy promote-idea
supabase functions deploy request-work
supabase functions deploy agent-event
```

- [ ] **Step 3: Verify: create a job and confirm it starts as `created`**

Use `request-work` or the dashboard to create a standalone job. Query the jobs table and confirm `status = 'created'` and `prompt_stack IS NULL`.

- [ ] **Step 4: Verify: orchestrator enriches and transitions to `queued`**

Wait for the next orchestrator cron pass (~10s). Confirm the job now has `status = 'queued'` and `prompt_stack IS NOT NULL`.

- [ ] **Step 5: Verify: agent picks up the `queued` job**

Confirm the local agent's poll claims the job and receives `promptStackMinusSkills` in the start_job message.
