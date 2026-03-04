# Auto-Scheduling: Autonomous Pipeline Feed

**Created:** 2026-03-03
**Author:** CPO
**Status:** Proposal
**Focus areas:** The Full Loop, Autonomous Organisation, Pipeline Reliability

---

## Problem

Today: The pipeline only moves when a human says "go." Specced features sit in `created` until Tom runs `/scrum` and approves greenlighting. Triaged ideas sit in the inbox until Tom says "spec that." If Tom is asleep, travelling, or busy — the pipeline is idle with work waiting.

Which is a problem, because: The pipeline has capacity but no work flowing into it. Every hour the pipeline sits idle with specced features in the backlog is wasted compute and wasted time-to-ship. This directly blocks two focus areas (The Full Loop, Autonomous Organisation) and the near-term goal of a beta user shipping autonomously.

What if?: The CPO spots idle capacity, checks pipeline health, and feeds work into the pipeline automatically — with the human able to flip a kill switch at any time.

---

## Design

### Two autonomous behaviors

**Auto-greenlight** — mechanical, no LLM needed
- Specced features in `created` are pushed to `ready_for_breakdown` when capacity exists and the pipeline is healthy
- Runs in the orchestrator heartbeat (every 60s)

**Auto-spec** — requires LLM judgment
- Triaged ideas are promoted to features and specced when the pipeline is quiet and the inbox has candidates
- Runs in the CPO major heartbeat (daily or on-demand)

These are independent. Auto-greenlight can ship without auto-spec. Auto-spec without auto-greenlight just pre-writes specs for human review.

---

### Safety layer 1: The toggle

A global on/off switch for auto-scheduling, surfaced on the pipeline dashboard page.

```
auto_scheduling_enabled: boolean (default: false)
```

Stored in a `company_settings` table (or a column on `companies`). Readable by the orchestrator and CPO heartbeat. Togglable from the dashboard with a single click.

When **off**: no auto-greenlighting, no auto-speccing. Pipeline behaves exactly as today — human approval required for everything.

When **on**: auto-greenlight and auto-spec are active, subject to health gates.

The toggle is the emergency brake. If the pipeline misbehaves, flip it off. No restart needed, no code change, immediate effect.

Dashboard UI: a simple toggle switch in the pipeline header area, clearly labelled. "Auto-scheduling: ON/OFF". Visible but not prominent — you don't want to accidentally toggle it.

---

### Safety layer 2: Pipeline health gate

Before auto-greenlighting anything, check pipeline health. If the pipeline is unhealthy, don't feed more work into it — that just creates a bigger mess.

**Health checks (all must pass):**

| Check | Threshold | Rationale |
|-------|-----------|-----------|
| Stuck features | 0 features stuck >1 hour | If things are stuck, adding more work compounds the problem |
| Failed features | <3 failed in last 24 hours | High failure rate means something systemic is broken |
| Active job progress | At least 1 job has progressed in last 30 min | If nothing is moving, the daemon or Realtime may be down |
| Unmerged PRs | <3 features at `pr_ready` | Each unmerged PR increases merge conflict risk for new features |

If any check fails, auto-scheduling pauses and a notification fires:
> "Auto-scheduling paused: {reason}. Pipeline needs attention before more work enters."

The human sees this on the dashboard and in Slack. They can either fix the issue or manually override.

**Why unmerged PRs matter:** Every feature branch diverges from main. If 5 features are sitting at `pr_ready` with unmerged PRs, feature #6 is building against a main branch that's 5 features behind reality. Merge conflicts become near-certain. The threshold (3) is conservative — if PRs are piling up, the bottleneck is merging, not building.

---

### Safety layer 3: Candidate filtering

Not every specced feature should be auto-greenlighted. Filter candidates:

**Auto-greenlight candidates must be:**
- Status: `created`
- Has spec: `true`
- NOT tagged `needs-workshop`
- NOT tagged `needs-human-input`
- Priority: `high` or `medium` (don't auto-schedule low priority)

**Auto-spec candidates must be:**
- Idea status: `triaged`
- Idea autonomy: `exec-can-run` (set during triage)
- NOT flagged `needs-clarification`
- Idea priority: `high` or `medium`

**Ordering:** highest priority first, then oldest first (FIFO within priority tier).

---

## Auto-greenlight: implementation detail

Lives in the orchestrator heartbeat. Runs every 60 seconds as part of the existing `refresh_pipeline_snapshot` cycle.

```
function maybeAutoGreenlight():
  if not company.auto_scheduling_enabled: return
  if not pipelineHealthy(): return

  available = capacity.max - capacity.active
  if available <= 0: return

  candidates = features
    .where(status = 'created')
    .where(spec IS NOT NULL)
    .where('needs-workshop' NOT IN tags)
    .where('needs-human-input' NOT IN tags)
    .where(priority IN ('high', 'medium'))
    .orderBy(priority DESC, created_at ASC)
    .limit(available)

  for each candidate:
    update_feature(candidate.id, status = 'ready_for_breakdown')
    notify("Auto-scheduled: {candidate.title}")
```

No LLM. No CPO session. Pure SQL + orchestrator logic. ~30 lines of code.

The notification is important — the human should always know what entered the pipeline and why. "Auto-scheduled: Dashboard dark mode (high priority, pipeline had capacity, 0 stuck features)" gives full transparency.

---

## Auto-spec: implementation detail

Lives in the CPO major heartbeat (daily rhythm). Requires the heartbeat system to exist first.

```
function maybeAutoSpec():
  if not company.auto_scheduling_enabled: return
  if not pipelineHealthy(): return

  -- Only auto-spec if pipeline is genuinely quiet
  if capacity.active > 1: return  -- stricter than auto-greenlight

  candidates = ideas
    .where(status = 'triaged')
    .where(autonomy = 'exec-can-run')
    .where('needs-clarification' NOT IN flags)
    .where(priority IN ('high', 'medium'))
    .orderBy(priority DESC, created_at ASC)
    .limit(1)  -- one at a time

  if no candidates: return

  -- Promote to feature
  promote_idea(candidate.id, promote_to = 'feature', project_id = ...)

  -- Write spec autonomously (no human Q&A)
  -- Uses idea title, description, tags, and any linked design docs as context
  run_spec_feature_autonomous(feature_id)

  -- Leave in 'created' — auto-greenlight picks it up next cycle
  notify("Auto-specced: {candidate.title} — spec written, awaiting greenlight")
```

**Key constraint:** auto-spec writes the spec but does NOT push to `ready_for_breakdown`. It leaves the feature in `created` with a spec. The auto-greenlight rule picks it up on the next 60-second cycle. This creates a natural buffer — if the human is online, they can review the spec before it enters the pipeline. If they're not, it flows through automatically.

**Spec quality without human Q&A:** The spec will be less refined than one produced interactively. Mitigation:
- Only auto-spec ideas classified as `exec-can-run` during triage (meaning the CPO judged it had enough context)
- The breakdown specialist validates the spec independently — if it's too vague, breakdown fails and the feature surfaces as failed
- The Haiku review gate catches bad code even from imperfect specs
- Start conservatively: only auto-spec ideas that have a description >100 chars (enough context to work with)

---

## The progression

| Step | What changes | Requires |
|------|-------------|----------|
| **Step 1: Auto-greenlight** | Specced features auto-enter pipeline when healthy + capacity | Orchestrator change (~30 LOC) + toggle UI + health checks |
| **Step 2: Auto-spec** | Triaged ideas get specced autonomously when pipeline is quiet | CPO heartbeat system + autonomous spec-feature mode |
| **Step 3: Auto-generate** | CPO reads goals + focus areas and generates ideas proactively | CPO heartbeat + goal-to-idea reasoning (most ambitious) |

Step 1 is implementable now. Step 2 needs the heartbeat. Step 3 is the full Autonomous Organisation vision.

---

## Dashboard UX

The pipeline page gets a small addition:

```
┌─────────────────────────────────────────────┐
│  AUTO-SCHEDULING: [ON/OFF toggle]           │
│  Status: Healthy ● | 2 slots available      │
│  Last auto-action: "Scheduled Dark Mode"    │
│  Health: 0 stuck | 1 failed | 2 unmerged    │
└─────────────────────────────────────────────┘
```

Shows at a glance: is auto-scheduling on, is the pipeline healthy enough to accept work, what was the last auto-action, and current health metrics.

When health checks fail and auto-scheduling is paused:
```
┌─────────────────────────────────────────────┐
│  AUTO-SCHEDULING: [ON] ⚠ PAUSED            │
│  Reason: 3 stuck features (>1 hour)         │
│  Auto-scheduling will resume when resolved  │
└─────────────────────────────────────────────┘
```

---

## What this doesn't solve

- **Merge conflicts from parallel features:** The unmerged PR threshold reduces risk but doesn't eliminate it. True fix: sequential merging or rebasing features onto latest main before PR.
- **Spec quality without human input:** Auto-spec will produce lower quality specs. Acceptable for `exec-can-run` ideas, not for complex features.
- **Priority conflicts:** Auto-greenlight uses priority + FIFO. It can't reason about strategic sequencing ("build A before B because B depends on A's infrastructure"). That requires the CPO heartbeat's qualitative judgment.
- **The Realtime bug:** Auto-scheduling will happily feed work into a broken pipeline if the health checks don't catch it. The "stuck >1 hour" check should catch this, but only after an hour of waste.

---

## Implementation order

1. **Schema:** Add `auto_scheduling_enabled` boolean to companies table (default: false)
2. **Health checks:** Add `pipelineHealthy()` function to orchestrator (reads snapshot data)
3. **Auto-greenlight logic:** Add to orchestrator heartbeat cycle
4. **Notifications:** Slack message on auto-schedule and on health-pause
5. **Dashboard toggle:** UI control for the boolean + health status display
6. **Auto-spec:** Requires heartbeat system — implement after triggers & events ships

Steps 1-5 are one feature. Step 6 is a follow-up feature dependent on the heartbeat infrastructure.
