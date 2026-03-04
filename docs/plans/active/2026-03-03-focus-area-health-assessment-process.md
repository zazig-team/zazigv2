# Focus Area Health Assessment Process

**Created:** 2026-03-03
**Owner:** CPO
**Purpose:** Repeatable process for assessing whether each focus area is on track, at risk, or off track. Designed to be run manually first, then automated via the CPO major heartbeat.

---

## The Assessment Model

Each focus area has numbered acceptance criteria stored in its `description` field. Health is assessed by evaluating each criterion against current system state.

### Three-tier health rating

| Rating | Meaning | Signal |
|--------|---------|--------|
| **On track** | Majority of criteria met or mostly met. Remaining gaps are scoped and in progress. | Green |
| **At risk** | Some criteria met but critical gaps exist. Could miss the linked goal's target date without intervention. | Amber |
| **Off track** | Most criteria not met. Significant work needed. Unlikely to meet linked goal's target date at current pace. | Red |

### Decision rules

- **On track:** ≥50% of criteria are "met" or "mostly met", AND no single criterion is both "not met" and blocking for the linked goal
- **At risk:** Some criteria met, but at least one critical criterion is "not met" and directly threatens the linked goal's target date
- **Off track:** ≥50% of criteria are "not met", OR the focus area has almost no shipped features addressing its criteria

These are guidelines, not hard rules. The assessor applies judgment — a focus area with 4/5 criteria met but the 5th being catastrophically broken (like Pipeline Reliability tonight) is at risk, not on track.

---

## Manual Assessment Process (v1)

### Step 1: Gather state

Pull the pipeline snapshot (`get_pipeline_snapshot`) to get:
- Features by status (which are active, complete, failed, stuck)
- Active jobs and capacity
- Stuck items and failed features

Pull focus areas with goals (`query_focus_areas` with `include_goals: true`) to get:
- Each focus area's acceptance criteria (in `description`)
- Linked goals with target dates and metrics
- Linked feature IDs

### Step 2: Evaluate each criterion

For each focus area, go through its acceptance criteria one by one:

1. **Read the criterion** — what specific condition must be true?
2. **Check against evidence** — can the pipeline snapshot, recent features, or known system state confirm or deny this?
3. **Rate it:**
   - **Met** — the condition is true today, reliably
   - **Mostly met** — true in most cases, with known edge cases or minor gaps
   - **Partially met** — works sometimes or for some cases, but not reliably
   - **Not met** — the condition is not true today

Evidence sources (in order of reliability):
- Pipeline snapshot data (quantitative — feature counts, statuses, stuck items)
- Recent session observations (qualitative — what did we see happen today?)
- Known bugs and open ideas (what's broken that we know about?)
- Linked feature status (what's shipped vs in progress vs not started?)

### Step 3: Assess overall health

Apply the decision rules above. For each focus area, produce:
- The three-tier rating (on track / at risk / off track)
- A one-sentence justification
- The criterion-level breakdown (met / mostly met / partially met / not met for each)

### Step 4: Check against goal target dates

For each linked goal, ask: "Given this health rating, will we hit the target by the target date?"

- Goal 1: First external beta user by 2026-04-01
- Goal 2: Product-market fit signal by 2026-05-01
- Goal 3: Fundable or profitable by 2026-06-30

If a focus area is "on track" by criteria but the linked goal's target date is approaching fast, escalate to "at risk."

### Step 5: Update and communicate

Update the focus area status in the database (currently limited to `active`/`paused` — see Schema Gap below).

Present the assessment in standup format:
```
## Focus Area Health — {date}

Pipeline Reliability: AT RISK — pipeline works but Realtime drops make it unreliable under load
Onboarding: OFF TRACK — 0/4 criteria met, no bootstrap script exists
The Full Loop: AT RISK — pieces exist individually but aren't connected end-to-end
Visibility: ON TRACK — dashboard live, notifications working, specific gaps scoped
Autonomous Organisation: OFF TRACK — foundational data shipped, autonomous behavior layer doesn't exist
```

---

## Schema Gap

The `focus_areas.status` field currently only supports `active` | `paused`. The dashboard renders "active" as "ON TRACK" for all focus areas regardless of actual health.

To make the dashboard honest, we need either:
- A new `health` column (`on_track` | `at_risk` | `off_track`) separate from `status`
- Or expand the `status` enum to include health states

Recommendation: separate `health` column. A focus area can be `active` (we're working on it) and `off_track` (we're behind) simultaneously. These are orthogonal dimensions.

---

## Automation Path (v2 — via CPO major heartbeat)

When the heartbeat system exists, this assessment runs on a daily rhythm:

1. **Data gather** — pipeline snapshot + focus areas + linked features (all MCP calls, ~1k tokens total)
2. **Per-criterion evaluation** — LLM reads each criterion, checks against pipeline data, rates met/not-met
3. **Health rating** — apply decision rules, produce rating + justification
4. **DB update** — set `health` field on each focus area (requires schema change)
5. **Notification** — if any focus area transitions (e.g. on_track → at_risk), notify via Slack

The minor heartbeat (local model, every 30 min) handles simple checks:
- Any focus area with 0 active features? Flag it.
- Any linked goal target date within 14 days with health != on_track? Escalate.

The major heartbeat (full model, daily) handles the qualitative assessment described above.

---

## First Assessment: 2026-03-03

| Focus Area | Health | Criteria Met | Key Issue |
|---|---|---|---|
| Pipeline Reliability | At risk | 0 met, 2 partial | Realtime event drops — 6 features stuck silently tonight |
| Onboarding | Off track | 0 met | No bootstrap script, no self-service flow |
| The Full Loop | At risk | 0 met, 3 partial | Pieces exist but aren't connected; trust boundary blocks full autonomy |
| Visibility | On track | 2 mostly met, 1 partial, 1 not met | Dashboard works, focus area health is the main gap |
| Autonomous Organisation | Off track | 0 met, 1 partial | No heartbeat, no proactive work generation, no peer-to-peer |
