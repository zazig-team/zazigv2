# /scrum

**Role:** CPO
**Type:** Ceremony — interactive decision-making with the human
**Target:** < 5 minutes total

Sprint planning for the pipeline. Reviews all unscheduled and failed work, triages into action buckets, gets human approval, then executes scheduling decisions.

---

## Phase 1: Pipeline Review

Call `get_pipeline_snapshot` — one MCP call, returns pre-computed
pipeline state (~500 tokens). Updated every minute by the orchestrator
heartbeat.

If `get_pipeline_snapshot` is unavailable, fall back to raw queries
but use a subagent for `query_features` to avoid context blowout.
Do NOT fire `query_jobs` directly — use feature statuses and the
snapshot's `active_jobs` counts instead.

Classify features from the snapshot into working sets:

**Backlog** — `features_by_status.created`. Candidates for scheduling.
For each: check `has_spec` field. Dependencies must be inferred from
tags or title (the snapshot doesn't track inter-feature deps).

**Failed** — `failed_features`. Need triage decisions.
For each: check `fail_count`. If you need failure details for a
specific feature, use a subagent to query its jobs.

**Active** — all other `features_by_status` keys (ready_for_breakdown
through reviewing). Count from `capacity.active`.

**Complete** — `completed_recent` (last 7 days).

---

## Phase 2: CPO Triage

Sort every backlog and failed feature into exactly one bucket:

### Greenlight
Push to `ready_for_breakdown` without needing human approval. Criteria (ALL must be true):
- Feature has a written spec (spec field is not empty/null)
- No unmet dependencies (doesn't require another feature to ship first)
- Pipeline has capacity (fewer than 3 features currently in active statuses)
- Feature is high or medium priority

For failed features, greenlight a retry if:
- Failed only once
- Failure looks transient (agent died, timeout, infrastructure error)
- Spec doesn't need changes

### Decision Needed
Human must decide. Route here when:
- Multiple features compete for limited pipeline capacity (pick order)
- Failed feature has failed 2+ times (re-spec? deprioritise? architectural issue?)
- Feature is high priority but has no spec (who writes it? now or later?)
- Resource trade-off (scheduling this means delaying that)

### Blocked
Cannot move forward regardless of priority:
- Depends on another feature that hasn't shipped yet
- Needs human action (deploy, configure, approve something external)
- Needs spec written and CPO doesn't have enough context

### Deprioritise
Recommend removing from active consideration:
- Failed 3+ times with no clear fix path
- Superseded by other work
- Low priority and pipeline is constrained

---

## Phase 3: Present

Show a clean decision board. No UUIDs, no JSON.

```
## Sprint Planning — {date}

### Pipeline Capacity
{N} features active | {M} slots available (target: 3 concurrent max)

### Greenlight (pushing to pipeline)
- **{feature title}** — {one line reason why now}
- **{feature title}** — retry, transient failure

### Decisions for You
1. **{feature title}** — {question: which to prioritise? retry or re-spec? schedule now or after X?}
2. **{feature title}** — {question}

### Blocked
- **{feature title}** — depends on {other feature}
- **{feature title}** — needs {human action}

### Recommend Deprioritise
- **{feature title}** — {reason: failed 3x, superseded, low value}

---
**Summary:** {X} to greenlight, {Y} need your call, {Z} blocked, {W} to deprioritise.
```

Wait for human response. They may:
- Approve all greenlights
- Make decisions on the "your call" items
- Override any categorisation
- Add context that changes the triage

---

## Phase 4: Execute Approvals

After the human approves:

**For greenlighted features:**
- `update_feature(feature_id: '{id}', status: 'ready_for_breakdown')` for each
- Report: "Pushed {N} features to breakdown."

**For approved retries (failed features):**
- Reset the feature status: `update_feature(feature_id: '{id}', status: 'ready_for_breakdown')`
- Note: if stale breakdown jobs exist from previous attempt, they may need cleanup (flag to human if this is a known issue)

**For deprioritised features:**
- No status change needed — they stay in `created` or `failed`
- Add a note to the feature description if the human gave a reason

**For decisions made:**
- Execute whatever the human decided (schedule, re-spec, park, etc.)
- If re-spec needed, note it as a follow-up action

---

## Capacity Model

The pipeline has natural throughput limits:
- **Breakdown specialist** processes 1 feature at a time
- **Builders** can run in parallel (multiple jobs across features)
- **Bottleneck** is typically breakdown and verification, not building

Rule of thumb: keep 2-3 features active in the pipeline at any time. More than that creates queuing. Fewer means idle capacity.

If the human asks "why not schedule everything?": explain that features queue at breakdown, and a long queue means later features wait longer. Better to drip-feed at pipeline throughput rate.

---

## Rules

- CPO triages. Human decides. CPO executes decisions.
- Never push a feature to `ready_for_breakdown` without human approval (v1 trust boundary).
- Never re-spec a feature during scrum — that's a separate task. Flag it as a follow-up.
- Keep the presentation scannable. Tom reads on mobile.
- If the pipeline is completely empty and the backlog has specced features, say so directly: "Pipeline is idle with work waiting. Recommend scheduling immediately."
- If all backlog features lack specs, say so: "Nothing is ready to schedule. {N} features need specs written first."
- After executing, suggest running /standup to confirm the pipeline state looks right.
