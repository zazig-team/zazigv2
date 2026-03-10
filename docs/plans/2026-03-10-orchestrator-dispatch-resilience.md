# Orchestrator Dispatch Resilience — Stuck Job Detection & Alerting (v2)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate silent dispatch failures — when jobs can't be dispatched, the system detects it within 5 minutes and alerts the team via Slack, instead of silently skipping for hours.

**Architecture:** Three layers: (1) fix the misleading snapshot that hides disabled machines, (2) add company-level dispatch health detection to the orchestrator's existing 10-second cron loop, (3) alert via Slack when no eligible machines exist. No new infrastructure — everything builds on existing orchestrator code and Slack integration.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), PostgreSQL (migration), existing Slack bot integration.

**Reviewed by:** Codex (gpt-5.3-codex) and Gemini. Both reviews incorporated — see changelog at bottom.

---

## Root Cause Analysis (2026-03-10 Incident)

Three jobs sat `queued` with `machine_id: null` for 3+ hours. The orchestrator ran every 10 seconds and saw them — but silently skipped dispatch because the only online machine had `enabled = FALSE`.

The pipeline snapshot reported `machines_online: 1` with `8 claude_code slots` — because the snapshot SQL doesn't filter by `enabled`. This made it look like a Realtime issue when it was actually a zero-eligible-machines issue.

**Failure chain:**
1. Both machines (laptop + mini) went offline
2. Daemon restarted, registered as `-local` — but that row had `enabled = FALSE` (operator-set at some prior point; the daemon does NOT write the `enabled` field — confirmed in `connection.ts:437-443`)
3. Orchestrator: `No machine with available claude_code slot for job X — skipping` (every 10 seconds, silently)
4. Snapshot showed 1 machine online with 8 slots (misleading — didn't filter `enabled`)
5. No alert, no escalation, no visibility for 3+ hours

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `supabase/migrations/NNN_dispatch_resilience.sql` | Create | Fix snapshot SQL to filter `enabled` |
| `supabase/functions/orchestrator/index.ts` | Modify | Diagnostic logging + company-level dispatch health alerting |
| `supabase/functions/get-pipeline-snapshot/index.ts` | Modify | Stale snapshot indicator |

---

## Chunk 1: Fix Misleading Snapshot + Diagnostic Logging

### Task 1: Fix pipeline snapshot to respect `enabled` flag

The `refresh_pipeline_snapshot()` Postgres function counts machines where `status = 'online'` but ignores the `enabled` column. Disabled-but-online machines inflate the capacity numbers.

**Files:**
- Create: `supabase/migrations/NNN_dispatch_resilience.sql`

- [ ] **Step 1: Write the migration**

The latest version of `refresh_pipeline_snapshot` is in migration `119_pipeline_snapshot_failed_jobs_flag.sql`. Copy the entire function body from that migration, then apply ONLY the capacity subquery fix below.

In the capacity subquery (around lines 100-108 of migration 119), change the FILTER clauses:

```sql
-- BEFORE (migration 119, lines 100-104):
'capacity', COALESCE((
  SELECT jsonb_build_object(
    'machines_online', count(*) FILTER (WHERE m.status = 'online'),
    'total_claude_code_slots', COALESCE(sum(m.slots_claude_code) FILTER (WHERE m.status = 'online'), 0),
    'total_codex_slots', COALESCE(sum(m.slots_codex) FILTER (WHERE m.status = 'online'), 0)
  )
  FROM public.machines m
  WHERE m.company_id = p_company_id
), '{"machines_online":0,"total_claude_code_slots":0,"total_codex_slots":0}'::jsonb)

-- AFTER:
'capacity', COALESCE((
  SELECT jsonb_build_object(
    'machines_online', count(*) FILTER (WHERE m.status = 'online' AND m.enabled = true),
    'total_claude_code_slots', COALESCE(sum(m.slots_claude_code) FILTER (WHERE m.status = 'online' AND m.enabled = true), 0),
    'total_codex_slots', COALESCE(sum(m.slots_codex) FILTER (WHERE m.status = 'online' AND m.enabled = true), 0)
  )
  FROM public.machines m
  WHERE m.company_id = p_company_id
), '{"machines_online":0,"total_claude_code_slots":0,"total_codex_slots":0}'::jsonb)
```

**Why `= true` is safe:** The `enabled` column is `NOT NULL DEFAULT true` (migration 090). No null values exist. This matches the orchestrator's `.neq("enabled", false)` filter semantically, but is more readable in SQL.

- [ ] **Step 2: Verify the fix logic matches orchestrator**

Cross-reference with orchestrator/index.ts line 765: `.neq("enabled", false)` — the Supabase JS equivalent. Both filter out `enabled = false` and include `enabled = true`. Confirm they match.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/NNN_dispatch_resilience.sql
git commit -m "fix: pipeline snapshot counts disabled machines as available capacity"
```

---

### Task 2: Diagnostic logging — use cached machine data, not per-skip queries

Currently the skip message is:
```
[orchestrator] No machine with available claude_code slot for job X — skipping.
```

This doesn't distinguish between "no machines online", "machines online but disabled", and "machines online but slots full". Make it diagnostic using the **existing `machineCache`** — no additional DB queries.

**Files:**
- Modify: `supabase/functions/orchestrator/index.ts`

**Key insight from review:** The orchestrator already fetches machines per company into `machineCache` (line 757-770). But this cache only stores enabled+online machines (the dispatch candidates). To diagnose WHY dispatch fails, we need ALL machines for the company.

- [ ] **Step 1: Add a `fullMachineCache` alongside the existing `machineCache`**

Near the top of `dispatchQueuedJobs` (around line 498), alongside the existing `machineCache`, add:

```typescript
// Full machine list per company — includes offline/disabled, for diagnostics only.
const fullMachineCache = new Map<string, Array<{ name: string; status: string; enabled: boolean; slots_claude_code: number; slots_codex: number }>>();
```

- [ ] **Step 2: Populate `fullMachineCache` when populating `machineCache`**

In the machine fetch block (around line 757), after the existing query that populates `machineCache`, add a second query that fetches ALL machines (no status/enabled filter):

```typescript
// Also fetch full machine list for diagnostics (no filter)
if (!fullMachineCache.has(job.company_id)) {
  const { data: allM } = await supabase
    .from("machines")
    .select("name, status, enabled, slots_claude_code, slots_codex")
    .eq("company_id", job.company_id);
  fullMachineCache.set(job.company_id, allM ?? []);
}
```

This runs once per company per orchestrator pass — not per job.

- [ ] **Step 3: Replace the skip log with a diagnostic message**

Around line 790-794 (the "No machine with available" block), replace:

```typescript
if (!candidate) {
  console.log(
    `[orchestrator] No machine with available ${slotType} slot for job ${job.id} — skipping.`,
  );
  continue;
}
```

With:

```typescript
if (!candidate) {
  const allMachines = fullMachineCache.get(job.company_id) ?? [];
  const online = allMachines.filter((m) => m.status === "online");
  const enabled = online.filter((m) => m.enabled !== false);
  const withSlots = enabled.filter((m) =>
    slotType === "codex" ? m.slots_codex > 0 : m.slots_claude_code > 0
  );

  const reason = allMachines.length === 0
    ? "no machines registered"
    : online.length === 0
    ? `${allMachines.length} machine(s) registered, all offline`
    : enabled.length === 0
    ? `${online.length} online but all disabled (enabled=false)`
    : withSlots.length === 0
    ? `${enabled.length} eligible but 0 ${slotType} slots free`
    : "unknown (check agent_version or recovery cooldown)";

  console.log(
    `[orchestrator] Cannot dispatch job ${job.id} (${slotType}): ${reason}`,
  );
  continue;
}
```

**Note:** The "unknown" case covers agent_version mismatch and recovery cooldown — dispatch filters that exist in the `machineCache` population but not in this diagnostic. The log points the operator to check those.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/orchestrator/index.ts
git commit -m "fix: diagnostic logging when job dispatch skipped — show why no machine eligible"
```

---

## Chunk 2: Company-Level Dispatch Health Alerting

### Task 3: Detect dispatch failures at the company level and alert via Slack

This is the core resilience feature. Instead of tracking per-job age (which false-positives on dependency-gated jobs), detect at the company level: "queued jobs exist AND no eligible machines to run them."

**Design decisions (from Codex + Gemini review):**
- **Company-level, not per-job:** Avoids false positives on jobs intentionally blocked by `depends_on` or feature status gates.
- **DB-backed dedup, not in-memory Map:** Edge function cold starts are frequent. In-memory state resets. Use a `last_dispatch_alert_at` column on the `companies` table.
- **Two severity levels:** "No eligible machines" (critical — operator must act) vs "Slots full" (info — system is working, just saturated).

**Files:**
- Modify: `supabase/migrations/NNN_dispatch_resilience.sql` (same migration from Task 1)
- Modify: `supabase/functions/orchestrator/index.ts`

- [ ] **Step 1: Add alert tracking column to companies table**

In the migration file, add:

```sql
-- Track when the last dispatch health alert was sent, to avoid spam.
-- Null = never alerted. Orchestrator checks: if now() - last_dispatch_alert_at < 30 min, skip.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS last_dispatch_alert_at TIMESTAMPTZ;
```

- [ ] **Step 2: Add constants**

At the top of orchestrator/index.ts, near other constants:

```typescript
const DISPATCH_ALERT_THRESHOLD_MS = 5 * 60 * 1000; // Alert after 5 min of undispatchable jobs
const DISPATCH_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // Don't re-alert same company for 30 min
```

- [ ] **Step 3: Write the `checkDispatchHealth` function**

Place after `dispatchQueuedJobs`, before `refreshPipelineSnapshotCache`:

```typescript
/**
 * Company-level dispatch health check. Detects when queued jobs exist but
 * cannot be dispatched due to infrastructure issues (no machines online,
 * all disabled, etc.) and alerts via Slack.
 *
 * Does NOT alert on:
 * - Jobs blocked by depends_on (normal pipeline behaviour)
 * - Jobs waiting for slots to free up (system working, just saturated)
 * - Transient gaps < DISPATCH_ALERT_THRESHOLD_MS
 *
 * Uses companies.last_dispatch_alert_at for durable dedup (survives cold starts).
 */
async function checkDispatchHealth(supabase: SupabaseClient): Promise<void> {
  // Find companies with old queued jobs
  const cutoff = new Date(Date.now() - DISPATCH_ALERT_THRESHOLD_MS).toISOString();

  const { data: stuckJobs, error } = await supabase
    .from("jobs")
    .select("id, company_id, role, job_type, created_at")
    .eq("status", "queued")
    .is("machine_id", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error || !stuckJobs || stuckJobs.length === 0) return;

  // Group by company
  const byCompany = new Map<string, typeof stuckJobs>();
  for (const job of stuckJobs) {
    const list = byCompany.get(job.company_id) ?? [];
    list.push(job);
    byCompany.set(job.company_id, list);
  }

  for (const [companyId, jobs] of byCompany) {
    // Check cooldown — DB-backed, survives cold starts
    const { data: company } = await supabase
      .from("companies")
      .select("last_dispatch_alert_at")
      .eq("id", companyId)
      .single();

    if (company?.last_dispatch_alert_at) {
      const lastAlert = new Date(company.last_dispatch_alert_at).getTime();
      if (Date.now() - lastAlert < DISPATCH_ALERT_COOLDOWN_MS) continue;
    }

    // Diagnose: fetch ALL machines for this company
    const { data: allMachines } = await supabase
      .from("machines")
      .select("name, status, enabled, slots_claude_code, slots_codex")
      .eq("company_id", companyId);

    const machines = allMachines ?? [];
    const online = machines.filter((m) => m.status === "online");
    const eligible = online.filter((m) => m.enabled !== false);
    const withSlots = eligible.filter((m) => m.slots_claude_code > 0 || m.slots_codex > 0);

    // Determine severity
    let severity: "critical" | "warning";
    let diagnosis: string;

    if (eligible.length === 0) {
      severity = "critical";
      diagnosis = online.length === 0
        ? `All ${machines.length} machine(s) offline`
        : `${online.length} machine(s) online but all disabled (enabled=false)`;
    } else if (withSlots.length === 0) {
      severity = "warning";
      diagnosis = `${eligible.length} machine(s) eligible but all slots occupied`;
    } else {
      // Machines exist with free slots — jobs are blocked for other reasons
      // (depends_on, feature gates, version mismatch, cooldown).
      // This is normal pipeline behaviour, not an infra issue. Don't alert.
      continue;
    }

    const icon = severity === "critical" ? ":rotating_light:" : ":warning:";
    const jobSample = jobs.slice(0, 5).map((j) => {
      const age = Math.round((Date.now() - new Date(j.created_at).getTime()) / 60_000);
      return `  • \`${j.id.slice(0, 8)}\` ${j.role ?? j.job_type} — queued ${age}m`;
    }).join("\n");

    const text = [
      `${icon} *Dispatch ${severity}: ${jobs.length} job(s) cannot be dispatched*`,
      "",
      `*Diagnosis:* ${diagnosis}`,
      "",
      jobSample,
      jobs.length > 5 ? `  _...and ${jobs.length - 5} more_` : "",
      "",
      severity === "critical"
        ? "_Action needed: start a machine, or set `enabled = true` on an existing one._"
        : "_Slots should free up as running jobs complete. Alert if this persists >30m._",
    ].filter(Boolean).join("\n");

    console.warn(`[orchestrator] DISPATCH ${severity.toUpperCase()}: company ${companyId} — ${diagnosis}`);

    // Post to Slack
    const slackChannel = await getDefaultSlackChannel(supabase, companyId);
    if (slackChannel) {
      const botToken = await getSlackBotToken(supabase, companyId);
      if (botToken) {
        const sent = await postSlackMessage(botToken, slackChannel, text);
        // Only update cooldown if Slack send succeeded
        if (sent) {
          await supabase
            .from("companies")
            .update({ last_dispatch_alert_at: new Date().toISOString() })
            .eq("id", companyId);
        }
      }
    }
  }
}
```

- [ ] **Step 4: Wire into the main handler**

In the `Deno.serve` handler, add between `dispatchQueuedJobs` and `refreshPipelineSnapshotCache`:

```typescript
    // 5. Dispatch queued jobs to available machines.
    await dispatchQueuedJobs(supabase);

    // 6. Check dispatch health — alert if jobs stuck due to infra issues.
    await checkDispatchHealth(supabase);

    // 7. Refresh pipeline snapshot cache after all state mutations.
    await refreshPipelineSnapshotCache(supabase);
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/orchestrator/index.ts supabase/migrations/NNN_dispatch_resilience.sql
git commit -m "feat: company-level dispatch health alerting via Slack"
```

---

## Chunk 3: Stale Snapshot Indicator

### Task 4: Mark stale snapshots in get-pipeline-snapshot

If the orchestrator throws before reaching `refreshPipelineSnapshotCache`, the snapshot goes stale. Consumers (dashboard, CPO) should know.

**Files:**
- Modify: `supabase/functions/get-pipeline-snapshot/index.ts`

- [ ] **Step 1: Add staleness check after fetching the snapshot**

In `get-pipeline-snapshot/index.ts`, after the snapshot is fetched from the DB and before returning the response, add:

```typescript
// Flag stale snapshots so consumers know data may be outdated.
// Orchestrator refreshes every ~10 seconds. >2 min stale = something wrong.
if (snapshot?.generated_at) {
  const ageMs = Date.now() - new Date(snapshot.generated_at as string).getTime();
  if (ageMs > 2 * 60 * 1000) {
    snapshot.stale = true;
    snapshot.stale_seconds = Math.round(ageMs / 1000);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/get-pipeline-snapshot/index.ts
git commit -m "feat: mark pipeline snapshot as stale when older than 2 minutes"
```

---

## Summary of Deliverables

| # | What | Why | Files |
|---|------|-----|-------|
| 1 | Fix snapshot capacity to filter `enabled` | Disabled machines showed phantom capacity | Migration |
| 2 | Diagnostic dispatch skip logging (cached) | "No machine" → "2 online but all disabled" | orchestrator/index.ts |
| 3 | Company-level dispatch health alert | 3+ hour silent failures become 5-minute Slack alerts | orchestrator/index.ts + migration |
| 4 | Stale snapshot indicator | Consumers know when data is outdated | get-pipeline-snapshot/index.ts |

**Estimated scope:** ~120 lines of new code across 3 files + 1 migration column. No new dependencies, no new infrastructure.

---

## Changelog (v1 → v2)

Changes based on Codex (gpt-5.3-codex) and Gemini reviews:

1. **Rewrote stuck-job detection as company-level dispatch health** — v1 flagged per-job age, which false-positives on dependency-gated jobs (Codex finding #1). v2 checks "queued jobs exist AND no eligible machines" at the company level.
2. **DB-backed alert dedup** — v1 used in-memory `Map` which resets on edge function cold starts (Codex #2). v2 uses `companies.last_dispatch_alert_at` column. Only updates after confirmed Slack send (fixes Codex's "marks alerted before send" concern).
3. **Cached diagnostics, not per-skip queries** — v1 added a DB query per skipped job (Codex #4, Gemini #1). v2 populates `fullMachineCache` once per company per pass.
4. **Two severity levels** — "critical" (no eligible machines) vs "warning" (slots full) per Gemini's alert fatigue feedback.
5. **Dropped Task 5 (investigate enabled=FALSE)** — Codex and Gemini both confirmed the daemon doesn't write `enabled` (connection.ts:437-443). The `-local` row was operator-set. Not a bug.
6. **Dropped `dispatch_eligible` from snapshot** — Codex correctly noted it can't capture agent_version gating or recovery cooldown, making it misleadingly optimistic. The diagnostic logging (Task 2) is more honest.
7. **Fixed `IS NOT FALSE` reasoning** — `enabled` is `NOT NULL DEFAULT true` (migration 090). Changed to `= true` in SQL for clarity.
8. **Fixed internal inconsistencies** — goal says 5 min (not 2), removed `dispatch_alerts` table reference, Task 4 correctly targets edge function (not migration).
9. **Added "unknown" diagnostic case** — covers agent_version mismatch and recovery cooldown that the simple check can't detect.
10. **Skip alert when machines have free slots** — if eligible machines exist with capacity, jobs are blocked for pipeline reasons (depends_on, feature gates), not infra. Don't alert.
