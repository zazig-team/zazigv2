# Goals and Focus Areas: Founder Strategic Alignment

**Date:** 2026-02-27
**Status:** Design (brainstormed with Tom)
**Author:** CPO
**Related docs:** `2026-02-25-strategy-sim-proposal.md` (parent proposal), `2026-02-25-cpo-autonomous-execution-proposal.md` (autonomy levels)

---

## Overview

Two object types give the entire system a North Star: **Goals** (measurable end-states) and **Focus Areas** (current strategic themes). Every exec aligns work against these. Every feature links to a focus area. Every strategic question the system surfaces references the goals it serves.

This is the foundation layer of the Strategy Sim. The decision infrastructure, consequence tracking, and gamified questions all sit on top of this. Build this first.

---

## The Model

### Goals

Goals are measurable end-states the company is working toward. They answer: "Where are we trying to get?"

- **Title:** Plain language. "Launch for YC testers", "Raise $5M seed", "Reach 10K MRR."
- **Time horizon:** Near-term, medium-term, or long-term.
- **Metric (tiered):** Near-term goals have specific metrics and targets ("50 active YC testers by April"). Long-term goals are directional ("Build enough traction to raise"). Goals naturally crystallise as they move from long-term to near-term — the system prompts the founder to sharpen the metric when the time is right.
- **Status:** Active, achieved, abandoned.
- A company typically has 2-5 active goals.

### Focus Areas

Focus areas are current strategic themes that direct attention. They answer: "What should we be paying attention to right now?"

- **Title:** Plain language. "Pipeline stability", "Build user interface", "Marketing prep."
- **Status:** Active or paused.
- **Position:** An ordered list. First item = highest priority. The founder drags to reorder, toggles on/off.
- **Links to goals:** Many-to-many. A focus area can serve multiple goals. "Pipeline stability" serves both "Launch for YC" and "Raise $5M." Links are set during brainstorm (conversationally, not via form) and when execs propose focus areas.
- A company typically has 3-7 active focus areas.

### Derived Weight

The founder sees a simple ordered list. No percentages. Internally, the system derives a weight from:

1. **Position in the list** — first item gets more weight than last.
2. **Actual behaviour** — which focus areas are getting work approved vs deferred.

If stated priority and actual behaviour diverge significantly, the system surfaces a strategic question: "Your 'marketing prep' focus area is ranked #2 but hasn't had any activity in two weeks. Should we move it down, or push some marketing work forward?"

### The Connection Layer

```
Goals  <--many-to-many-->  Focus Areas  <--many-to-many-->  Features
                                                    ^
                                                    |
                                              (also via tags —
                                               lightweight association)
```

- Focus areas link to goals (explicit, set during brainstorm or exec proposal).
- Features link to focus areas (explicit, set during spec work by the CPO).
- Features also carry tags that can imply focus area association (lightweight, can be auto-suggested).
- The coverage map query: "Show me all features linked to 'pipeline stability', plus any features tagged `pipeline-stability` that aren't explicitly linked yet." The second group is a prompt for the CPO to confirm or dismiss.

---

## Exec Alignment

Execs don't have their own separate goal objects. They inherit from the company level.

Focus areas have natural domain relevance. "Pipeline stability" is mostly CTO territory. "User engagement" spans CPO and CMO. The system infers relevance from:

1. **Domain tags on the focus area** — set during brainstorm or by the CPO. "Pipeline stability" gets tagged `engineering`. The CTO picks it up.
2. **Feature ownership** — if most features linked to a focus area are in the CPO's domain, that focus area is de facto CPO-relevant.

Each exec sees the full list but with their relevant focus areas highlighted. When the CPO specs a feature, it suggests linking to focus areas most relevant to the CPO's domain. When the CTO reviews architecture, it weighs decisions against CTO-relevant focus areas.

### Exec-Proposed Focus Areas

There's work that's important to a domain but doesn't trace to any company goal. The CTO needs to upgrade a dependency before EOL. The CFO needs tax compliance sorted. Neither directly serves "Launch for YC" — but ignoring them creates risk.

Execs can propose focus areas upward. The proposal surfaces to the founder as a strategic question: "Your CTO recommends adding 'Technical debt management' as a focus area. It doesn't serve any current goal directly, but ignoring it creates risk to pipeline stability. Add it?"

The founder approves or rejects. If approved, the focus area enters the single company list. One list, one priority order, one place to look. No shadow priority systems.

---

## Brainstorm-Assisted Goal Setting

The founder never faces a blank text box. Goals and focus areas are created through guided conversation — one question at a time, multi-choice where possible, recommendation included.

### Three Modes

**1. Initial setup (onboarding)**

First time using the system. The brainstorm walks the founder through:
- "What are you building?" (context)
- "Where do you want to be in 6 months?" (near-term goals)
- "What about 2 years?" (long-term goals)
- "What needs the most attention right now?" (focus areas)
- "How does [focus area] connect to [goal]?" (linking — conversational, one tap to confirm)

By the end: 2-4 goals and 3-5 focus areas with links between them. The system has a North Star from day one.

**2. Periodic review (scheduled)**

On a cadence — monthly, or when the system detects enough has changed. The brainstorm resurfaces:
- "Your 'Launch for YC' goal was set 6 weeks ago. You've shipped 4 features toward it. Is this still the right goal, or has it evolved?"
- "Should the metric sharpen?" (long-term goals moving to near-term)
- "Any focus areas that are no longer relevant?"
- "Anything new that needs attention?"

This is where long-term goals naturally crystallise into specifics.

**3. Event-driven (exec proposal or gap detection)**

Triggered by:
- An exec proposes a focus area
- A goal has no active focus areas serving it
- A focus area has been active for 3+ weeks with zero features linked
- Stated priority vs actual behaviour diverges

These trigger a mini-brainstorm: one question, 2-3 options, a recommendation. This is the gamification layer — the Civ-style strategic question appearing in the founder's interface.

### Phasing the Interface

1. **Terminal (now)** — brainstorm runs as a conversation in the CPO session. Multi-choice is text-based. We dogfood this. Non-technical founders will never use terminal.
2. **Web (primary product interface)** — purpose-built for multi-choice, card-based layout, mobile-responsive. This is where users live. Same foundation as the eventual Strategy Sim dashboard.
3. **Slack/Telegram (convenience)** — button interactions for quick approvals and strategic questions. Convenience channel, not primary.

---

## Data Model

### `goals` table

```sql
CREATE TABLE public.goals (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    title           text        NOT NULL,
    description     text,

    -- Tiered measurement
    time_horizon    text        NOT NULL DEFAULT 'medium'
                                CHECK (time_horizon IN ('near', 'medium', 'long')),
    metric          text,       -- null for directional goals
    target          text,       -- null for directional goals
    target_date     date,       -- optional deadline

    status          text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'achieved', 'abandoned')),
    achieved_at     timestamptz,

    -- Ordering
    position        integer     NOT NULL DEFAULT 0,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### `focus_areas` table

```sql
CREATE TABLE public.focus_areas (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    title           text        NOT NULL,
    description     text,

    status          text        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active', 'paused')),

    -- Ordering (founder's stated priority)
    position        integer     NOT NULL DEFAULT 0,

    -- Domain relevance
    domain_tags     text[],     -- e.g. ['engineering', 'product']

    -- Proposal tracking
    proposed_by     text,       -- exec role that proposed this, null if founder-created
    approved_at     timestamptz,

    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### `focus_area_goals` junction table

```sql
CREATE TABLE public.focus_area_goals (
    focus_area_id   uuid        NOT NULL REFERENCES public.focus_areas(id) ON DELETE CASCADE,
    goal_id         uuid        NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
    PRIMARY KEY (focus_area_id, goal_id)
);
```

### `feature_focus_areas` junction table

```sql
CREATE TABLE public.feature_focus_areas (
    feature_id      uuid        NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
    focus_area_id   uuid        NOT NULL REFERENCES public.focus_areas(id) ON DELETE CASCADE,
    PRIMARY KEY (feature_id, focus_area_id)
);
```

### Indexes and RLS

Standard pattern — company_id composite indexes, service_role full access, authenticated read for own company. Same as ideas table.

---

## How This Wires Into the System

### CPO Behaviour Changes

When speccing a feature, the CPO:
1. Checks active focus areas
2. Links the feature to relevant focus areas during spec
3. If no focus area fits, considers whether a new one should be proposed

When triaging ideas (inbox sweep), the CPO:
1. Evaluates ideas against active focus areas and goals
2. Ideas that serve high-priority focus areas get promoted faster
3. Ideas that don't connect to any focus area are flagged for the founder

### Strategic Question Generation

The system generates questions when:
- A goal has no active focus areas serving it → "Your [goal] has no focus areas driving progress. What should we focus on?"
- A focus area has no linked features for 3+ weeks → "Should we push work into [area] or pause it?"
- Stated vs actual priority diverges → "You ranked [area] #2 but all recent approvals are for [other area]. Adjust?"
- An exec proposes a focus area → "Your CTO recommends [area]. Add it?"
- A goal's time horizon shifts (long → near) → "Your [goal] is approaching. Should we set a specific metric?"

These are the gamified Civ-style prompts. Each is a multi-choice question with 2-4 options and a recommendation.

---

## Implementation Phases

### Phase 0: Data model + terminal brainstorm
- Run migrations (goals, focus_areas, junction tables)
- Create MCP tools (create_goal, query_goals, create_focus_area, query_focus_areas, link_focus_area_to_goal, link_feature_to_focus_area)
- Build a `/set-goals` brainstorm skill for the CPO to guide founders through initial setup
- CPO can create goals and focus areas conversationally in terminal

### Phase 1: Exec alignment + founder doctrines
- CPO spec workflow prompts for focus area linking
- Coverage map query (which goals are served, which are starved)
- Exec focus area proposal mechanism
- Derived weight calculation
- **Founder doctrines** — capture founder strategic beliefs ("platform-first", "speed over polish in pre-seed") using the same brainstorm mechanism. Stored in the Goals & Focus Areas system for founder-facing display; propagated into exec prompt stacks via the knowledge architecture (Layer 4). Doctrine drift detection becomes another strategic question trigger (e.g. "You said platform-first, but 3 of your last 5 features build in-house capabilities. Still the right call?"). See [exec-knowledge-architecture-v5.md](2026-02-22-exec-knowledge-architecture-v5.md) for the doctrine injection mechanism.

### Phase 2: Web interface
- Goals and focus areas dashboard (view, reorder, toggle)
- Brainstorm flow as a web conversation (multi-choice cards)
- Coverage map visualisation
- Mobile-responsive for phone review

### Phase 3: Strategic questions
- Gap detection triggers (no focus areas for goal, no features for focus area, behaviour divergence)
- Multi-choice question generation and presentation
- Periodic review scheduling
- Decision log (which questions were asked, what was chosen)

---

## Design Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Goal structure | Two types: Goals + Focus Areas | Goals = where we're going. Focus areas = what we're paying attention to. Clean separation of purpose. |
| Metric requirements | Tiered by time horizon | Near-term: specific. Long-term: directional. Crystallises naturally as deadlines approach. |
| Focus area linking to goals | Explicit, set during brainstorm | Implicit inference risks wrong connections. Brainstorm makes linking feel conversational, not bureaucratic. |
| Focus area weighting | Binary for founder, derived internally | Founder sees ordered list. System derives weight from position + behaviour. No percentages to maintain. |
| Work connection | Tags + explicit links | Tags for lightweight association. Explicit links for the coverage map. Both serve different moments. |
| Exec alignment | Inherit from company, propose upward | One list, one priority order. Execs propose focus areas the founder approves. No shadow priority systems. |
| Founder doctrines | Captured in Goals system, injected via knowledge architecture | Founder sees doctrines alongside goals and focus areas (single interface). Under the hood, doctrines propagate into every exec's prompt stack via Layer 4 injection. Same brainstorm captures all three. |
| Interface phasing | Terminal → Web → Slack/Telegram | Terminal for us now. Web is the real product (non-technical founders). Messaging channels are convenience. |
