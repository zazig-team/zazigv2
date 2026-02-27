---
name: standup
description: "Pipeline standup — gather pipeline health, inbox state, active work, stuck/failed items. Use when starting a session, when someone says 'standup', 'status', 'what's happening', or 'catch me up'."
---

# /standup

**Role:** CPO
**Type:** Operational — gathers state and presents status
**Target:** < 60 seconds, < 30 lines output

Run this at session start or when the human asks for status. This is the pipeline equivalent of a daily standup: what shipped, what's active, what's stuck, what needs attention.

---

## Phase 1: Parallel Data Gather

Run all of these simultaneously (parallel tool calls):

1. **Inbox sweep:** `query_ideas(status: 'new')` — count new ideas
2. **Pipeline features:** `query_features(project_id: '{zazigv2-project-id}')` — all features, all statuses
3. **Active jobs:** `query_jobs(status: 'dispatched')` — what's running right now
4. **Queued jobs:** `query_jobs(status: 'queued')` — what's waiting

If you have the project ID cached, use it. Otherwise query projects first.

---

## Phase 2: Classify and Count

Group features by status into these buckets:

| Bucket | Statuses | Meaning |
|--------|----------|---------|
| **Backlog** | `created` | Awaiting spec or scheduling |
| **Active** | `ready_for_breakdown`, `breakdown`, `building`, `deploying_to_test`, `testing`, `combining`, `reviewing` | In the pipeline, being worked on |
| **Failed** | `failed` | Hit an error, needs triage |
| **Complete** | `complete`, `deployed` | Shipped |

For failed features, note:
- Priority (high failures are more urgent)
- How long they've been failed (> 24h is stale)

For active features, note:
- Which stage they're in
- Whether they appear stuck (same status for > 2 hours during work hours)

---

## Phase 3: Present

Output this format. Omit empty sections entirely.

```
## Standup — {date}

**Inbox:** {N} new ideas awaiting triage
**Pipeline:** {active} active | {backlog} backlog | {failed} failed | {complete} complete

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
