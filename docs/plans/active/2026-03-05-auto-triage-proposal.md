# Auto-Triage: Automated Idea Processing and Goal-Aligned Promotion

**Date:** 2026-03-05
**Status:** Proposal
**Author:** Claude (CPO session), from Tom Weaver's direction
**Part of:** Idea pipeline automation
**Companion docs:**
- `docs/plans/shipped/2026-02-25-ideas-pipeline-unified-design.md` (Phase 2 origin)
- `docs/plans/archived/2026-02-25-ideaify-skill-proposal.md` (original ideaify design)
- `docs/meetings/2026-03-04-chris-tom-meeting-staging&production.md` (triage automation discussion)
- `supabase/migrations/083_goals_and_focus_areas.sql` (goals/focus areas schema)

---

## Today

Idea triage is manual. The CPO runs `/triage` during standups, presents recommendations to the human, and waits for explicit approval before promoting anything. This means:

- Ideas sit in `status: new` until the next standup or manual session
- Simple, obvious ideas (bugs, small fixes) that clearly align with active goals still need a human to say "yes, promote that"
- When the pipeline has free slots, they sit idle rather than pulling from a backlog of triaged-and-aligned work
- The CPO spends context window on triage decisions that are often trivial: "this is a bug in an active focus area, it should be a job"

The ideaify skill (Phase 1) already cleans and categorises ideas. The triage skill already presents recommendations. But the gap between "idea triaged" and "idea promoted" requires human intervention every time — even when the idea is simple, aligned with goals, and the pipeline has capacity.

### What's already built (as of 2026-03-09)

The WebUI Ideas page and background triage infrastructure are further along than this proposal assumed at writing time. The following are **shipped and working**:

- **Single-idea background triage from the WebUI.** Clicking "Triage" on a `status: new` idea dispatches a background job via `request-work` → orchestrator → daemon → triage-analyst agent. The agent runs the `/triage` skill, enriches the idea (description, tags, priority, suggested_exec, triage_notes), and sets `status: triaged`. E2E tested 2026-03-09.
- **`triaging` intermediate status with live UX.** While an agent is triaging, the idea row shows "Analysing... an agent is triaging this idea" with a badge, and interaction is blocked. This pattern should be reused for heartbeat-driven auto-triage.
- **Triage results rendering.** The inline detail view renders `triage_notes`, `suggested_exec`, enriched tags, and clarification notes. This is the review surface — no new UI needed to display triage output.
- **Park, Reject, and Promote actions.** All working with toast animations, dismiss transitions, and Realtime count updates across tabs.
- **Full Realtime subscriptions.** `useRealtimeTable` on the ideas table means any agent update (auto or manual) hits the UI instantly. No polling.
- **Section tabs with live counts.** Inbox, Triaged, Workshop, Parked, Shipped — counts update in real-time as ideas move between statuses.
- **Type filters.** All, Ideas, Briefs, Bugs, Tests — filtering across all tabs.
- **Promote-to-Feature flow.** Readiness checklist (has title, has description, has project) + project picker + promote button. Works for human-driven promotion of triaged ideas.

This means Phase 2c doesn't start from scratch — the manual flow is the foundation that auto-triage builds on top of.

---

## What if?

What if triage could run on a heartbeat — periodically sweeping the inbox without a human present — and auto-promote ideas that meet strict criteria? Not all ideas. Not complex ones. Not ones that need human judgment. Just the ones where the answer is obviously "yes": bugs in active focus areas, simple fixes aligned with near-term goals, ideas that are already specced and waiting.

The human stays in control via dashboard toggles. Gates at each automation stage can be switched on or off. The system defaults to "hold" — automation is opt-in, not opt-out. When the human wants to go hands-off, they flip the switches. When they want to intervene, they flip them back.

---

## Hypothesis

The bottleneck in the idea pipeline is not triage quality — the CPO's recommendations are almost always approved. The bottleneck is triage latency — ideas wait hours or days for a human to confirm what the CPO already knows. If we gate auto-promotion on goal alignment and simplicity, the risk of promoting the wrong thing is low, and the benefit of keeping the pipeline fed during idle periods is high.

---

## Therefore

Implement Phase 2 of the ideas pipeline: auto-triage with goal-aligned promotion gates and dashboard controls.

---

## Architecture

### The automation loop

```
                    ┌─────────────────────────────────────┐
                    │         HEARTBEAT (periodic)         │
                    │  runs every N minutes when enabled   │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  1. INTAKE (ideaify contractor)      │
                    │  Sweep raw input → clean ideas       │
                    │  Gate: auto_intake toggle             │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │  2. TRIAGE (auto-triage)             │
                    │  Categorise, check goals/focus areas │
                    │  Gate: auto_triage toggle             │
                    └──────────────┬──────────────────────┘
                                   │
                         ┌─────────┴─────────┐
                         │                   │
                   passes gates?        fails gates?
                         │                   │
                         ▼                   ▼
              ┌──────────────────┐  ┌──────────────────┐
              │  3. AUTO-PROMOTE  │  │  HOLD FOR HUMAN  │
              │  → feature/job    │  │  status: triaged  │
              │  Gate: auto_push  │  │  awaits manual    │
              │  toggle           │  │  approval         │
              └──────────────────┘  └──────────────────┘
```

### Three gates, three toggles

Each gate is independently controllable from the dashboard. All default to **off**.

| Gate | Toggle name | What it controls | When ON | When OFF |
|------|-------------|-----------------|---------|----------|
| **Intake** | `auto_intake` | Whether the heartbeat runs ideaify on raw input automatically | Raw input is auto-processed into clean ideas | Raw input waits for CPO to run `/ideaify` manually |
| **Triage** | `auto_triage` | Whether the heartbeat triages `status: new` ideas automatically | New ideas are auto-triaged with goal alignment check | Ideas wait at `status: new` for manual `/triage` |
| **Push** | `auto_push` | Whether auto-triaged ideas that pass all criteria are auto-promoted | Qualifying ideas flow straight into the pipeline | Triaged ideas wait at `status: triaged` for human approval |

There is also a **master kill switch**: `pipeline_hold`. When ON, nothing auto-promotes regardless of other toggles. This is the "hold everything" switch Tom mentioned.

### Auto-promotion criteria

An idea can only be auto-promoted if **ALL** of the following are true:

1. **Goal alignment** — The idea's domain and tags match at least one active focus area, AND that focus area is linked to at least one active goal. Ideas that don't align with any current goal are held for human review.

2. **Simplicity** — The idea's scope is `job` or `feature` with complexity `simple`. Anything `medium`, `complex`, or `unknown` is held. Initiatives and projects are always held.

3. **No ambiguity** — The idea has no `needs-clarification` flags. Any flag means it needs human input.

4. **No duplicates** — The idea has no `potential-duplicate` flag. Duplicate resolution requires human judgment.

5. **Pipeline capacity** — There are free slots in the pipeline. If the pipeline is full, ideas queue at `triaged` until capacity opens up. (This prevents overloading.)

6. **Auto-push toggle is ON** — The gate is open.

If any criterion fails, the idea is held at `status: triaged` with a note explaining why it wasn't auto-promoted. The human sees it at the next standup.

### Promotion targets

Auto-promotion routes by scope:

| Scope | Promotes to | What happens next |
|-------|-------------|-------------------|
| `job` | Standalone job (`feature_id: null`) | Goes to `queued`, dispatched to next free worker |
| `feature` (simple) | Feature in matching project | Goes to `breaking_down`, breakdown specialist decomposes it |

For features, the auto-triage must also determine the target project. Logic:
1. If the idea's tags/domain match exactly one active project → use that project
2. If multiple projects match → hold for human (ambiguous routing)
3. If no project matches → hold for human (may need a new project)

### The `intake-processor` contractor

This is the Phase 2 runner from the original ideaify design. A new contractor role that runs ideaify automatically.

| Property | Value |
|----------|-------|
| Role name | `intake-processor` |
| Tier | 3 (ephemeral contractor) |
| Model | `haiku` or `sonnet` (configurable — ideaify is data cleaning, not strategic reasoning) |
| Skills | `ideaify` |
| MCP tools | `create_idea`, `query_ideas`, `batch_create_ideas`, `query_features`, `query_projects` |
| NOT given | `update_idea`, `promote_idea` — only auto-triage logic promotes, not the intake processor |

The intake-processor does not triage. It only cleans and categorises. The auto-triage logic (separate from the intake-processor) handles promotion decisions.

---

## WebUI Changes

### Prerequisite: Rejected tab and restore actions

The Ideas page currently has Inbox, Triaged, Workshop, Parked, Shipped — but **no Rejected tab**. Rejected ideas vanish from view. Before auto-triage can reject ideas (or before we can claim a complete audit trail), the UI needs:

1. **Rejected tab** with count badge, showing all `status: rejected` ideas
2. **"Restore to Inbox" button** on Parked and Rejected idea detail views — allows recovery of incorrectly parked/rejected ideas

These are small additions to the existing `Ideas.tsx` — the data and Realtime infrastructure already handles these statuses.

### Triaged tab: "Held for review" distinction

When auto-triage holds an idea (fails one of the 6 promotion criteria), it sits at `status: triaged` alongside manually-triaged ideas. The human needs to distinguish:

- **Ready to promote** — passed all criteria, or manually triaged and awaiting human push
- **Held for review** — auto-triage flagged it (ambiguous routing, complexity too high, needs clarification, etc.)

Implementation: a sub-filter or visual badge on triaged ideas. The `promotion_reason` / `triage_notes` field already carries the hold reason — surface it as a pill badge (e.g. "Held: needs clarification", "Held: ambiguous project").

### Auto-promoted visual distinction

In the Shipped tab, auto-promoted ideas should be visually distinct from human-promoted ones. A small "auto" badge next to the feature status, driven by the `auto_promoted` boolean column. This makes the audit trail scannable at a glance.

### Automation controls on the Ideas page

The proposal originally placed toggles on a separate Dashboard settings panel. But the person managing the idea pipeline is on the **Ideas page**, not the Dashboard. Recommended placement:

```
Ideas                                          [⚙ Automation]
──────────────────────────────────────────────────────────────
Inbox 19 | Triaged 14 | Workshop 0 | Parked 15 | Shipped 24
```

Clicking the gear icon opens a compact popover or slide-out:

```
Pipeline Automation
─────────────────────────────────────────
[toggle] Auto-intake     Process raw ideas automatically
[toggle] Auto-triage     Triage new ideas on heartbeat
[toggle] Auto-push       Promote qualifying ideas to pipeline
─────────────────────────────────────────
[toggle] HOLD ALL        Emergency stop — blocks all auto-promotion
─────────────────────────────────────────
Last heartbeat: 2 minutes ago
Ideas auto-promoted today: 3
Ideas held for review: 1
```

A subtle status indicator in the Ideas header shows current state at a glance (e.g. "Auto-triage: ON" or a small pulsing dot when the heartbeat is active).

### Batch triage button

Currently triage is one-idea-at-a-time from the UI. Add a "Triage All New" button in the Inbox tab header that dispatches background triage jobs for all `status: new` ideas. This is the manual equivalent of what the heartbeat does — a stepping stone before flipping on auto_triage, and useful even after (for on-demand sweeps).

### Audit trail

Every auto-promotion is logged in the `events` table with:
- `type: 'auto_promoted'`
- `idea_id`, `promoted_to_type`, `promoted_to_id`
- `criteria_met`: which gates it passed
- `timestamp`

The human can review all auto-promotions on the Ideas page (filtered view in Shipped tab, or a dedicated "Auto-promoted" sub-filter) and reverse any that shouldn't have gone through via a "Cancel & restore" action.

---

## Data Model Changes

### New: `company_settings` table (or extend `companies`)

Toggle storage. Simplest approach: add columns to `companies`.

```sql
ALTER TABLE public.companies
ADD COLUMN auto_intake  boolean NOT NULL DEFAULT false,
ADD COLUMN auto_triage  boolean NOT NULL DEFAULT false,
ADD COLUMN auto_push    boolean NOT NULL DEFAULT false,
ADD COLUMN pipeline_hold boolean NOT NULL DEFAULT false;
```

### New: `intake-processor` role

```sql
INSERT INTO public.roles (name, company_id, model, skills, mcp_tools, tier)
VALUES (
  'intake-processor',
  '00000000-0000-0000-0000-000000000001',
  'haiku',
  ARRAY['ideaify'],
  ARRAY['create_idea', 'query_ideas', 'batch_create_ideas', 'query_features', 'query_projects'],
  3
);
```

### Ideas table: add `auto_promoted` flag

```sql
ALTER TABLE public.ideas
ADD COLUMN auto_promoted    boolean NOT NULL DEFAULT false,
ADD COLUMN promotion_reason text;
```

This distinguishes human-approved promotions from auto-promotions, enabling audit and rollback.

---

## Implementation Plan

### Phase 2a: Intake processor (the forgotten Phase 2)

1. Register `intake-processor` role in DB
2. Add ideaify to its skills array in the manifest
3. Add `zazig skills sync` support for the new role
4. Orchestrator: add heartbeat trigger that dispatches intake-processor when `auto_intake` is true and raw input exists
5. Test: raw input → auto-processed → clean idea in inbox

### Phase 2b: Auto-triage logic

6. Implement goal-alignment check: query `goals`, `focus_areas`, `focus_area_goals`, `feature_focus_areas` to determine if an idea aligns
7. Implement auto-promotion criteria checker (the 6 criteria above)
8. Add `auto_promoted` and `promotion_reason` columns to ideas table
9. Orchestrator: add heartbeat trigger that runs auto-triage when `auto_triage` is true
10. Test: aligned simple idea → auto-triaged → auto-promoted → appears in pipeline

### Phase 2c: WebUI prerequisites (small, no backend changes)

11. Add Rejected tab to Ideas page (data already flows via Realtime)
12. Add "Restore to Inbox" button on Parked and Rejected detail views
13. Add "Triage All New" batch button to Inbox tab header

### Phase 2d: WebUI automation controls

14. Add automation settings columns to companies table
15. Edge function: expose toggle read/write for the WebUI
16. WebUI: add automation popover on Ideas page header (toggles + status)
17. WebUI: add "held for review" badge/filter on Triaged tab
18. WebUI: add "auto" badge on auto-promoted ideas in Shipped tab
19. WebUI: add audit trail filter (auto-promoted sub-view with "Cancel & restore" action)

### Phase 2e: Safety and observability

20. Events logging for all auto-promotions
21. Standup skill: report auto-promoted ideas since last standup
22. Rate limiting: max N auto-promotions per heartbeat cycle (prevent runaway)
23. `pipeline_hold` master switch wired through all auto-promotion paths

---

## What This Enables (from the meeting)

From Tom (2026-03-04 meeting):

> "I think there could be a little trigger — a little switch where you could turn on to stop auto-pushing."

> "I see another automated thing here at the beginning, which is that it should also triage stuff anyway. But then stuff that's being triaged — what it typically does at the moment is it might go 'here's my five recommendations for things that are really simple that we can promote to needing a specification' ... if those things don't need human intervention, they should just go all the way through, do the spec, and then push on into the pipeline."

> "If we can start to use the free capacity — which is at the moment sitting there idle — to take anything that is actually relatively simple to do, or a bug ... we get much closer to having an automated approach."

This proposal implements exactly that: heartbeat-driven triage with gate switches, auto-promoting simple aligned work into the pipeline during idle capacity.

The longer-term vision from the meeting — where the pipeline's own outputs (bugs found during testing, improvement ideas from verification) feed back into the inbox and get auto-triaged — naturally extends from this. Once auto-triage works, the feedback loop is just another input channel.

---

## Scope Boundaries

**In scope:**
- `intake-processor` contractor role registration
- Auto-triage logic with goal/focus-area alignment check
- Auto-promotion criteria and gating
- Dashboard toggle controls (auto_intake, auto_triage, auto_push, pipeline_hold)
- Audit trail for auto-promotions
- Events logging

**Out of scope:**
- Self-testing / simulation feedback loop (future — depends on verification specialist improvements)
- Automatic idea generation from pipeline outputs (future — separate proposal)
- Telegram bot changes (capture layer — separate concern)
- Voice transcription (capture layer)
- Smart inbox features (trend detection, auto-linking — Phase 3 from original proposal)

**Already shipped (not part of this proposal's scope):**
- Background single-idea triage from WebUI (request-work → orchestrator → daemon → triage-analyst)
- `triaging` intermediate status with live UX in Ideas page
- Triage results display (triage_notes, suggested_exec, tags)
- Park, Reject, Promote actions with Realtime updates
- Full Realtime subscriptions on Ideas page

**Not changing:**
- The ideaify skill itself (same skill, different runner)
- The triage skill (still used for manual triage sessions and background triage jobs)
- Manual promotion flow (always available, toggles don't remove it)
- Existing pipeline stages

---

## Open Questions

### 1. Heartbeat frequency

How often should the auto-triage heartbeat run?

| Frequency | Pros | Cons |
|-----------|------|------|
| Every 5 minutes | Ideas flow quickly, pipeline stays fed | More API calls, more orchestrator load |
| Every 15 minutes | Balanced, reasonable latency | Ideas can wait up to 15 min |
| Every 30 minutes | Low overhead | Feels slow for bugs/quick fixes |

**Recommendation:** 15 minutes default, configurable per company.

### 2. Spec generation in the auto-promote flow

Tom mentioned: "if those things don't need human intervention, they should just go all the way through, do the spec, and then push on into the pipeline."

Should auto-promoted features automatically get specced (run `/spec-feature` without human conversation)? This is a bigger automation step — spec-feature is currently a collaborative CPO+human conversation.

**Recommendation:** Separate concern. This proposal gets auto-triage and auto-push working. Auto-spec is a follow-on where the CPO runs spec-feature autonomously for simple features. The spec-feature skill would need a "non-interactive mode" where the CPO writes the spec without human back-and-forth.

### 3. Goal alignment strictness

Should auto-promotion require exact goal match, or is focus-area domain match sufficient?

**Recommendation:** Focus-area match is sufficient. An idea in the `engineering` domain that matches an active `engineering` focus area is aligned enough for auto-promotion of simple work. Exact goal match is too strict for bugs and small fixes.

### 4. Rollback mechanism

If an auto-promoted idea turns out to be wrong, what's the undo?

**Recommendation:** Cancel the resulting feature/job. The idea stays in the inbox with `auto_promoted: true` for audit. No data is lost. The human can park or reject the idea after the fact.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Auto-promotes something misaligned with goals | Low | Medium | 6-criteria gate is conservative. Audit trail enables rollback. |
| Pipeline gets flooded with auto-promoted work | Low | High | Rate limiting per heartbeat. `pipeline_hold` kill switch. Slot capacity check. |
| Human loses visibility into what's being promoted | Medium | Medium | Standup reports auto-promotions. Dashboard audit trail. Events logging. |
| Auto-triage miscategorises and promotes a complex idea as simple | Low | Medium | Ideaify's complexity assessment is a guess — conservative default to `unknown` means ambiguous ideas are held. |
| Toggles confuse users who don't understand the gates | Low | Low | All default to OFF. Clear labels. "HOLD ALL" is prominent. |

---

## Success Criteria

1. **Ideas reach the pipeline faster.** Triaged-to-promoted latency drops from hours/days to minutes for qualifying ideas.
2. **Free slots get utilised.** Pipeline idle time decreases when there are promotable ideas in the inbox.
3. **Human control is preserved.** All automation is toggle-gated. Manual flow always works. Audit trail is complete.
4. **No bad promotions in first 30 days.** Zero auto-promoted ideas that had to be cancelled due to misalignment.
5. **CPO context freed up.** CPO standup time on triage decreases — it reports on auto-promoted items instead of deciding each one.
