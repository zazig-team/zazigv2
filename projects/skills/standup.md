# /standup

**Role:** CPO
**Type:** Operational — gathers state and presents status
**Target:** < 60 seconds, < 30 lines output

Run this at session start or when the human asks for status. This is the pipeline equivalent of a daily standup: what shipped, what's active, what's stuck, what needs attention.

---

## Phase 1: Data Gather

Run `zazig snapshot --company <company_id>` — one CLI call, returns pre-computed
pipeline state (~500 tokens). Updated every minute by the orchestrator
heartbeat.

The snapshot contains:
- `capacity` — active count, max, available slots
- `features_by_status` — all non-terminal features grouped by status,
  with title, priority, has_spec, updated_at, tags
- `failed_features` — failed features with fail_count
- `completed_recent` — features completed in the last 7 days
- `stuck_items` — features in active statuses with no progress > 2 hours
- `ideas_inbox` — new_count, triaged_count, parked_count, oldest_new
- `active_jobs` — queued, dispatched, executing counts

If the CLI is unavailable, report that the snapshot could not be retrieved
and ask the human to check that the CLI is installed and authenticated.

---

## Phase 2: Classify and Count

The snapshot pre-classifies features by status. Map to these buckets:

| Bucket | Snapshot field | Meaning |
|--------|---------------|---------|
| **Backlog (spec-ready)** | `created` WITHOUT `needs-workshop` tag | Ready for spec-feature |
| **Backlog (workshop)** | `created` WITH `needs-workshop` tag | In iterative design with human |
| **Active** | All other `features_by_status` keys | In the pipeline |
| **Failed** | `failed_features` | Hit an error, needs triage |
| **Stuck** | `stuck_items` | No progress > 2 hours |
| **Complete** | `completed_recent` | Shipped in last 7 days |

For failed features, note:
- Priority (high failures are more urgent)
- `fail_count` from the snapshot

For active features, note:
- Which stage they're in (the status key)
- Whether they appear in `stuck_items`

---

## Phase 3: Present

Output this format. Omit empty sections entirely.

```
## Standup — {date}

**Inbox:** {N} new ideas awaiting triage
**Pipeline:** {active} active | {backlog} backlog | {failed} failed | {complete} complete

**Workshop (iterating with human):**
- {feature title} — design doc at {path if known}

**Active work:**
- {feature title} — {status} ({time in status if notable})

**Stuck (no progress > 24h):**
- {feature title} — {status} since {date}

**Failed (needs attention):**
- {feature title} — {priority} — failed {date}

**Recently completed:**
- {feature title} — completed {date}
```

Keep it scannable. No IDs, no UUIDs, no JSON. Human-readable titles only.

---

## Phase 4: Trigger Recommendations

After presenting status, check these thresholds and append recommendations:

| Condition | Recommendation |
|-----------|---------------|
| New ideas > 0 | "Want me to triage the inbox?" |
| Failed features > 3 | "Failed features are accumulating — recommend running /scrum to triage." |
| Backlog (`created`) > 5 AND active < 2 | "Pipeline has capacity. Want to run /scrum to schedule more work?" |
| Active features > 5 | "Pipeline is at capacity. No scheduling recommendations." |
| Stuck features > 0 | "These look stuck — want me to investigate?" |

Only show the most relevant 1-2 recommendations. Don't overwhelm.

---

## Rules

- Total output under 30 lines
- No tool calls shown to user — just the synthesised status
- If pipeline is completely empty (no features at all), say so and suggest capturing work via the ideas inbox
- If this is a session start, run silently and present as part of the greeting — don't announce "running standup"
- After standup, yield to whatever the human wants to do. Standup is informational, not a workflow gate.
