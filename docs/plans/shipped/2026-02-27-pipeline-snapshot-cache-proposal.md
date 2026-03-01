# Pipeline Snapshot Cache

## Problem

**Today:** Every CPO scrum starts with 3-5 MCP queries (`query_features`, `query_jobs` x2, `query_ideas`) that take 10-15 seconds, eat ~30k tokens of context, and sometimes fail or return stale data. The CPO agent has to classify and triage from raw API responses every time.

**Which is a problem, because:** Scrum should feel instant — open terminal, get the board, make decisions. Instead there's a cold-start tax on every session. Worse, the raw query results are so large they've caused context blowouts in exec-tier agents (documented incident 2026-02-27). The CPO shouldn't be doing data engineering at scrum time.

**What if?:** The pipeline state was always pre-computed and waiting. CPO reads one small snapshot, skips straight to triage. Scrum goes from "wait 15 seconds, hope context survives" to "instant board, instant decisions."

## Hypothesis

A lightweight background process that periodically snapshots pipeline state into a single read-friendly artifact would eliminate scrum cold-start latency and reduce exec context consumption by ~90%.

## Therefore

Build a pipeline snapshot cache — a background job that polls pipeline state on a heartbeat and writes a pre-classified summary that the CPO (or any exec) can read in one call.

## How this would work

### The snapshot

A single JSON or markdown file containing the pre-classified pipeline state:

```
{
  "generated_at": "2026-02-27T14:30:00Z",
  "capacity": { "active": 1, "max": 3, "available": 2 },
  "features_by_status": {
    "in_breakdown": [{ "id": "...", "title": "...", "since": "..." }],
    "building": [...],
    "failed": [{ "id": "...", "title": "...", "fail_count": 2, "last_failure": "..." }],
    "created": [{ "id": "...", "title": "...", "has_spec": true, "priority": "high" }]
  },
  "stuck_items": [{ "id": "...", "title": "...", "status": "...", "stuck_since": "..." }],
  "ideas_inbox": { "new_count": 3, "oldest_new": "2026-02-25" },
  "zombie_check": { "suspect_count": 0, "details": [] }
}
```

~500 tokens to read vs ~30k tokens from raw queries.

### Where it runs

Three options, in order of preference:

**Option A — Orchestrator heartbeat (cheapest).** The orchestrator edge function already fires every minute via pg_cron. Add a `refreshSnapshot()` step at the end of each heartbeat that writes to a `pipeline_snapshots` table (single row, upserted). Zero new infrastructure. Downside: adds latency to the heartbeat if the snapshot query is slow.

**Option B — Dedicated pg_cron function.** A Postgres function that runs every 5 minutes, queries features/jobs/ideas, writes the snapshot to a table. Pure SQL, no edge function, no agent. Cheapest possible compute. Downside: harder to add classification logic beyond simple status grouping.

**Option C — Standalone haiku contractor.** A haiku-tier agent dispatched via standalone dispatch, running on a 5-minute loop. Can do intelligent classification (stuck detection, spec completeness, dependency analysis). Downside: consumes a machine slot, costs API tokens.

**Recommendation: Option A first, Option C later.** The orchestrator heartbeat already has all the data in scope. A simple SQL snapshot covers 80% of the value. If we later want intelligent classification (e.g. "this feature has failed 3x, recommend deprioritise"), upgrade to Option C.

### How CPO consumes it

Replace the scrum Phase 1 data-gathering step:

```
-- Before (3-5 MCP calls, 30k tokens):
query_features(project_id)
query_jobs(status: 'queued')
query_jobs(status: 'dispatched')
query_ideas(status: 'new')

-- After (1 read, ~500 tokens):
SELECT snapshot FROM pipeline_snapshots WHERE company_id = $1
```

New MCP tool: `get_pipeline_snapshot()` — returns the cached snapshot. Or just read from the existing `query_features` response if we add a `?summary=true` parameter.

### What changes

1. **New table:** `pipeline_snapshots` (company_id PK, snapshot JSONB, updated_at)
2. **Orchestrator change:** Add `refreshSnapshot()` call at end of heartbeat loop
3. **New MCP wrapper** (optional): `get_pipeline_snapshot` edge function
4. **Scrum skill update:** Phase 1 reads snapshot instead of firing raw queries

### What doesn't change

- No new agents or machine slots (Option A)
- No changes to feature/job lifecycle
- Snapshot is read-only cache — all mutations still go through existing MCP tools
- Scrum Phase 2-4 (triage, present, execute) unchanged

## We propose

Add a `pipeline_snapshots` table and a `refreshSnapshot()` step to the orchestrator heartbeat that pre-computes a classified pipeline summary every minute. CPO reads one row instead of firing 5 queries. Eliminates scrum cold-start and reduces exec context consumption by ~90%.
