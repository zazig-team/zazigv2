# Getting a Grip: Connecting Ideas, Plans, and Pipeline

**Date:** 2026-03-01 (v2 — revised after goals brainstorm)
**Status:** In Progress — Phase 1 complete, Phase 2 (Spring Clean) complete
**Author:** CPO
**Pipeline:** idea:522bafcc
**Focus Area:** The Full Loop, Visibility, Autonomous Organisation
**Related docs:** `shipped/2026-02-25-ideas-pipeline-unified-design.md`, `shipped/2026-02-27-goals-and-focus-areas-design.md`, `archived/2026-02-25-idea-visualiser-proposal.md`, `archived/2026-03-01-goals-focus-areas-manual-build.md`

---

## Context: What Changed Since v1

The afternoon goals brainstorm established hard constraints that reshape this proposal:

- **Goal 1:** First external beta user on their own project — April 1 (4 weeks)
- **Target customer:** Solopreneurs with ideas and business acumen but no technical co-founder
- **Holy shit moment:** "I told my CPO about a problem, it came back with a plan, got it built, and showed me the result"
- **5 focus areas:** Pipeline Reliability, Onboarding, The Full Loop, Visibility, Autonomous Organisation

Everything in this proposal now gets evaluated against: **does this help a solopreneur see the full loop working by April 1?**

---

## Problem

We have ~60 design documents in `docs/plans/`, 10 new ideas in the inbox, a backlog in Tom's Trello, 8 failed features, 10 unspecced features, and 9 completed features. These exist in separate systems with no links between them. The knowledge architecture, personality system, events & triggers, goals & priorities, gateway, heartbeat — all have detailed designs that were written before the ideas inbox existed. There's no way to know what's been built, what's still just a document, and what's been abandoned.

More critically: **the pipeline has no clear intake process.** Ideas exist. Features exist. But the path from one to the other is a manual, undocumented CPO action with no guard rails. A beta user can't use something that only works when the founder manually nudges every transition.

---

## The IDEAS → READY Gap

This is the structural problem Tom flagged, and it's the hardest part of the whole system.

**The current dashboard columns are right:** READY, BREAKDOWN, BUILDING, COMBINING, VERIFYING, PR READY, COMPLETE, FAILED. These map to real pipeline states with real automation behind them. Once a feature hits READY (has a spec, is set to `ready_for_breakdown`), the pipeline takes over.

**The gap is everything before READY.** Today it looks like:

```
Raw idea → ??? → Feature with spec → READY → [pipeline handles the rest]
```

That `???` is currently: CPO reads idea, CPO thinks about it, CPO writes a spec, CPO creates a feature, CPO sets it to `ready_for_breakdown`. Five manual steps, no automation, no visibility, no self-service.

**What needs to exist:**

```
Raw idea → Triaged idea → Approved → Spec written → READY → [pipeline]
```

Each transition needs:
1. **Clear ownership** — who (or what agent) is responsible for moving it forward
2. **Visible status** — the dashboard shows where every item is in this intake funnel
3. **Defined triggers** — what causes the transition (human approval, CPO decision, automatic)
4. **Quality gates** — what must be true before something advances

### Proposed Intake Pipeline

**Stage 1: Raw Input → Triaged Idea (autonomous)**
- **Owner:** CPO (on heartbeat or conversation)
- **Trigger:** New idea appears in inbox
- **Gate:** Has title, description, tags, priority, suggested_exec
- **Output:** Status changes from `new` to `triaged`
- **Automation:** Fully autonomous. Triage is clerical — tag, prioritise, assess against goals/focus areas, check for duplicates. No cost to triaging; it's just organising. CPO presents recommendations with rationale for how each idea fits (or doesn't) within active goals and focus areas.

**Stage 2: Triaged Idea → Approved for Build (human gate)**
- **Owner:** Human founder, with CPO recommendation
- **Trigger:** CPO presents triaged idea with promote/park/reject recommendation
- **Gate:** Human explicitly approves promotion
- **Output:** `promote_idea` called, feature created
- **Automation:** The CPO recommends, the human decides. This is the commitment gate — promotion creates a feature which will consume engineering slots. Most ideas flow through quickly (CPO says "promote, here's why", human says "yes"), but ambiguous, cross-cutting, or conflicting ideas sit in TRIAGE until the human weighs in.
- **Exception:** If an idea is unambiguous, high-priority, and directly aligned with an active focus area, the CPO can auto-promote. This is the "forgiveness not permission" path for obvious wins.

**The Parking Lot: What happens to ideas that don't make the cut?**

Not every idea should be built right now. Some are good ideas in the wrong quarter. Some are bad ideas disguised as good ones. Some will never be relevant. The triage recommendation at Stage 2 has three outcomes: **promote**, **park**, or **reject**. Each has a defined lifecycle:

- **Parked** — "Not now, but maybe later." The idea has merit but doesn't align with current goals/focus areas, or resources are better spent elsewhere. Parked ideas live in a dedicated section of the dashboard (collapsed by default, showing a count badge). They are **periodically re-evaluated on the major heartbeat** (daily CPO standup, not every minor health-check tick): parked ideas are checked against current goals and focus areas. If the strategic context shifts and a parked idea suddenly aligns, the CPO surfaces it with a "recommend un-park" rationale. The founder approves or re-parks. **Staleness guard:** parked ideas older than 90 days without a re-evaluation bump are flagged for the founder — "still want this, or kill it?" The founder explicitly re-parks (resets the clock) or rejects. This prevents the parking lot from silently growing into a graveyard.

- **Rejected** — "We considered this and decided no." The idea doesn't fit the product direction, duplicates something else, or was investigated and found unviable. Rejected ideas stay in the database but are **invisible in default views** — they don't clutter the dashboard, don't appear in standup, and don't consume CPO attention. They remain searchable ("did we ever consider X?") and can be un-rejected if circumstances change dramatically. The founder can always override.

- **Founder override** — The founder can insist on promoting a parked or rejected idea. The CPO should push back with reasoning ("this doesn't serve Goal 1 because...") but ultimately the founder decides. This is the "I don't care what the data says, I have a hunch" path. The CPO logs the override rationale so the decision is auditable later.

**Key principle:** Parking is a first-class pipeline state, not a dustbin. The CPO actively manages the parking lot as part of standup — it's not "out of sight, out of mind." The 90-day staleness guard ensures nothing rots indefinitely. And rejection is always reversible — we never permanently lose an idea.

**Stage 3: Approved → Spec Written (autonomous)**
- **Owner:** CPO commissions spec work via contractors, or writes inline for simple ideas
- **Trigger:** Feature exists after promotion
- **Gate:** Has a written spec. For simple ideas, the spec can be inline on the feature. For complex ideas, a design doc in `docs/plans/` linked to the feature.
- **Output:** Feature spec field populated, acceptance_tests written
- **Automation:** Fully autonomous. The human already approved the direction at Stage 2. Spec writing is execution, not decision-making.

**Stage 4: Spec Written → READY (autonomous)**
- **Owner:** CPO
- **Trigger:** Feature has spec, acceptance tests, and human checklist populated
- **Gate:** spec field populated, acceptance_tests populated, branch and repo_url set on project
- **Output:** Feature status set to `ready_for_breakdown`
- **Automation:** Mechanical. Once the spec is complete, the transition to READY is a status change with a quality check.

### What This Means for the Dashboard

```
IDEAS → TRIAGE → PROPOSAL → READY → BREAKDOWN → BUILDING → COMBINING → VERIFYING → PR READY → COMPLETE
                                                                                                 FAILED
         ↓
       PARKED (collapsed section, count badge, 90-day staleness guard)
```

- **IDEAS** — raw, untouched ideas. Shows count and age. Incoming signal.
- **TRIAGE** — CPO has reviewed, tagged, prioritised, and attached a promote/park/reject recommendation with rationale. This is the approval column — human reviews CPO recommendations and approves promotions from here. Three exits: promote (→ PROPOSAL), park (→ PARKED), reject (→ hidden).
- **PARKED** — not a full column. Collapsed section below the pipeline showing a count badge ("12 parked"). Expands on click to show parked ideas grouped by age. Stale items (>90 days) highlighted. Ideas can be un-parked back to TRIAGE with a fresh recommendation.
- **PROPOSAL** — promoted to feature, spec being written by CPO or contractor. Autonomous.
- **READY** through **COMPLETE/FAILED** — existing columns, unchanged.

The key insight: IDEAS, TRIAGE, and PROPOSAL are the intake funnel. READY onwards is the build pipeline. PARKED is the holding pen, actively managed. The dashboard shows both, but they're visually distinct — intake on the left, pipeline on the right, parking lot below. Triage is where the human spends most of their time: reviewing CPO recommendations and saying yes/no/park.

### For the Beta User

A solopreneur doesn't need to understand the internal stages. Their view is simpler:

```
"Here's what I want" → "Your team is thinking about it" → "Your team is building it" → "It's done"
```

The intake pipeline maps to "thinking about it." The build pipeline maps to "building it." The dashboard can surface this simplified view while the internal detail stays available for power users.

---

## Hypothesis

The reason work gets lost is twofold: (1) most strategic thinking predates the inbox and has no machine-readable status, and (2) the pipeline has no defined intake process — the gap between "idea" and "ready for breakdown" is an undocumented manual operation. Fix both, and the existing pipeline handles the rest.

---

## How This Would Work

### Phase 1: Goals & Focus Areas ~~DONE~~

**COMPLETE (2026-03-01).** 3 goals, 5 focus areas, all linked. See `2026-03-01-goals-focus-areas-manual-build.md`.

### Phase 2: The Spring Clean ~~DONE~~

**COMPLETE (2026-03-01).** 81 docs audited, 30 systems reconciled against codebase. 6 idea records created for unbuilt designs, 14 ideas parked, 2 rejected (already fixed). Filing system reorganised into `active/` (22), `shipped/` (27), `archived/` (40). Full report at `active/2026-03-01-spring-clean-reconciliation-report.md`.

**Original objective:** Every significant design document gets a corresponding idea record in the inbox, with status reflecting reality.

**Process:**

1. CPO audits every file in `docs/plans/` and `docs/plans/archive/`
2. For each document, creates an idea record with:
   - `title` — the document's topic
   - `description` — one-line summary of what it proposes
   - `raw_text` — reference to the doc path
   - `tags` — domain, related systems
   - `status` — set based on current reality:
     - Document has a shipped feature → `promoted` (link to feature)
     - Document has a pipeline feature (even failed) → `promoted` (link to feature)
     - Document is still relevant but no pipeline entry → `triaged`
     - Document is superseded or obsolete → `rejected`
     - Document needs re-evaluation → `new`
   - `clarification_notes` — what's unclear about current state
3. For documents that already spawned features, set `promoted_to_type` and `promoted_to_id` to close the loop
4. Produce a reconciliation report: what's tracked, what's orphaned, what needs decisions

**Scale:** ~60 documents. Dispatch a haiku subagent to do the inventory, CPO reviews and commits the records.

**Goal 1 relevance:** Medium. A beta user won't see our internal doc backlog. But *we* need this to stop losing track of what's been designed vs built. Do it this week while it's fresh.

### Phase 3: Document Linkage (schema + convention)

**Objective:** Ideas and features can reference their design documents, and documents can reference their inbox entries.

**Schema changes:**

```sql
ALTER TABLE public.ideas ADD COLUMN doc_refs text[];
ALTER TABLE public.features ADD COLUMN doc_refs text[];
```

**Convention — add frontmatter to design docs:**

```markdown
**Pipeline:** idea:abc123 | feature:xyz789 | none
**Focus Area:** Pipeline Reliability | The Full Loop | etc
```

Pipeline field traces the lineage: doc → idea → feature. Focus Area links to the strategic framework. These are already applied to key active docs as part of Phase 2.

Bidirectional: idea/feature → doc via `doc_refs`, doc → idea/feature via frontmatter.

**Goal 1 relevance:** Low for external beta. High for internal sanity. Can be done alongside other work.

### Phase 4: The Visualiser + Dashboard

**Objective:** A web interface showing the full pipeline from ideas through to shipped features, with approval actions.

**Dashboard approach:** Extend the existing dashboard. Keep the current columns (READY, BREAKDOWN, BUILDING, COMBINING, VERIFYING, PR READY, COMPLETE, FAILED). Add:

- **IDEAS column** on the far left — triaged ideas, grouped by priority
- **SPECCING column** — features created but not yet specced (current `created` status)
- **Strategy tab** — goals (ordered), focus areas (linked to goals), coverage map, stale items

**For the beta user:** Consider a simplified "founder view" that collapses the pipeline into three states: Thinking, Building, Done. The full pipeline view is the power-user mode.

**Rendering approach:** Use [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer) as the foundation. Pure HTML/CSS/JS, CDN-hosted, Netlify-deployed. Approval buttons POST to Supabase edge functions.

**Goal 1 relevance:** High. A solopreneur needs to see what their team is doing. Minimum viable: the existing dashboard extended with notifications. The visualiser is the polished version.

### Phase 4.5: Skill

Tom input: there's a lot to do for phase 4. Maybe we can have a manual skill in the meantime to occasionally do more spring cleaning and filing. Btw we need a plans/parked too to correspond with ideas that are marked as parked. For example, I think zazig terminal-proposal should be parked to revisit later.

### Phase 5: Exec Autonomy

**The root issue:** The CPO currently only acts when Tom starts a conversation. Between conversations, nothing happens. Ideas accumulate, features fail, documents go stale.

**What needs to happen for Goal 1:**

1. **Multi-heartbeat** — Two rhythms, not one. **Minor heartbeat** (local model like Granite, every 30min): pipeline health, stuck jobs, slot availability — costs zero tokens. **Major heartbeat** (full model, daily): CPO standup, inbox triage, parked idea re-evaluation, coverage gaps against focus areas. This separates "is the system healthy?" (cheap, frequent) from "are we working on the right things?" (expensive, less frequent). Folds into the existing Triggers & Events design (`active/2026-02-22-triggers-and-events-design.md`).
2. **Cache-TTL** — session resets after idle period. Clean context, full memory, every time. Prevents the degradation that kills long-running agents.
3. **CPO standup enhancement** — stale idea scan, failed feature triage, parked idea staleness check, coverage gap report against focus areas.
4. **Inter-exec collaboration** — CPO identifies a problem, discusses with CTO, they agree on approach, CTO commissions the work. Not human-in-the-loop for every decision.

**Goal 1 relevance:** Critical. This is the difference between "a tool" and "a team." The holy shit moment requires the agents to be working *between* conversations, not just during them.

---

## Sequencing and Priority

Reordered against Goal 1 (beta user by April 1):

1. ~~**Goals & Focus Areas**~~ **DONE (2026-03-01)**
2. **Exec Autonomy: Heartbeat + Cache-TTL** (P0) — without this, agents only work when prompted. The demo falls flat if the user has to manually kick every step. *Focus area: Autonomous Organisation*
3. **Pipeline Reliability** (P0) — test-deploy needs to stop failing. Features need to ship without manual SQL. *Focus area: Pipeline Reliability + The Full Loop*
4. **Dashboard + Notifications** (P1) — minimum viable: the user can see what's happening and gets notified when something ships or needs input. *Focus area: Visibility*
5. **Intake Pipeline** (P1) — define the IDEAS→READY process, update CPO behaviour, make the intake funnel visible on the dashboard. *Focus area: The Full Loop*
6. **Spring Clean + Document Linkage** (P1) — internal hygiene. Important for us, invisible to beta user. *Focus area: The Full Loop*
7. **Onboarding** (P1) — Mac provisioning, repo connection, team formation. Forced by hardware timeline (Mac Mini arriving). *Focus area: Onboarding*
8. **Visualiser** (P2) — polished web view. Depends on 1-6. *Focus area: Visibility*

Items 2-3 are parallel and critical path for April 1. Items 4-7 can run alongside. Item 8 is polish.

---

## The Delegation Question

How do you run autonomous R&D and build without burning subscription tokens?

**Cost-aware dispatch.** The complexity field on jobs (`simple`, `medium`, `complex`) should route to different execution strategies:
- `simple` → haiku model, fast turnaround, cheap
- `medium` → sonnet, standard execution
- `complex` → opus, full context, expensive

This is already partially designed in the contractor dispatch routing plan. Shipping it means the CPO can commission more work without the token anxiety. For Goal 1, this matters because a beta user will be running on our infrastructure — cost per user needs to be manageable.

---

## We Propose

A prioritised "Getting a Grip" operation, reordered for the April 1 beta deadline:

**This week (P0):** Ship heartbeat + cache-TTL for exec autonomy, and fix pipeline reliability so features deploy without manual intervention. These are the two things that make the full loop actually loop.

**Next two weeks (P1):** Define and build the intake pipeline (IDEAS→READY), extend the dashboard with intake columns and notifications, onboard the Mac Mini, and spring-clean the doc backlog.

**Week 4 (P2):** Polish the visualiser, tune the beta user experience, get a solopreneur connected.

The north star for every decision: **does this help a solopreneur see the full loop — "I told my CPO about a problem and my team built it" — by April 1?**
