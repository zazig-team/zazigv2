# Strategy Sim: A Civilisation-Style Decision Interface for AI Executives

**Date:** 2026-02-25
**Status:** Proposal (initial design) — parked
**Author:** CPO
**Pipeline:** idea:4aa07b29
**Focus Area:** Visibility
**Related docs:** `2026-02-25-cpo-autonomous-execution-proposal.md` (autonomy levels), `2026-02-25-spec-visualiser-proposal.md` (approval UI patterns), `2026-02-25-ideas-inbox-proposal.md` (pre-pipeline capture), `2026-02-24-idea-to-job-pipeline-design.md` (pipeline reference), `ORG MODEL.md` (tier/layer model)
**Origin:** Founder (Tom) -- "What if we gamify it like a sim? Like Civ where you get multiple choice decisions plus a recommendation... You can stick it on autopilot and it will just decide for you or you can get it to wait on you."

---

## Problem Statement

The zazigv2 system has three persistent executives (CPO, CTO, CMO) running in tmux sessions, each making decisions within their domain. Today, the founder interacts with these executives through terminal conversations -- reading analysis, asking questions, saying "yes" or "no." This works but has three structural limitations:

**1. Decisions are ephemeral.** A CPO recommendation that the founder approves in the terminal has no persistent record beyond chat history. There is no decision log, no consequence tracking, no way to review what was decided and what happened as a result. Six months from now, nobody can answer "why did we prioritise Feature X over Feature Y in February?"

**2. The founder is a bottleneck or absent.** In "wait for me" mode, every exec blocks on founder input. In the current "trust but verify" mode (see autonomous execution proposal), execs proceed but the founder has no structured way to review what happened. There is no middle ground where decisions queue up, the founder reviews them at leisure, and the system continues running.

**3. There is no strategic overview.** Each exec operates in its own terminal session. The founder cannot see all pending decisions across all domains simultaneously. There is no "state of the company" view that surfaces what needs attention, what is running on autopilot, and what just happened. The founder must context-switch between three terminals to understand the full picture.

### The insight

Tom's analogy to Civilisation is precise. In Civ, you do not micromanage every unit and city. You set strategic direction, review advisor recommendations, make key decisions, and let the simulation run. The game presents decisions as multiple-choice with trade-offs, consequences, and advisor recommendations. You can automate advisors for domains you trust, or micromanage domains that need attention. The entire game state is visible from one screen.

This is exactly the interaction model zazigv2 needs. Not a terminal-first interface for one exec at a time -- a strategy game interface for running the whole company through AI executives.

---

## Design Goals

1. **Turn-based decision model.** Each exec generates discrete decision points ("turns") with multiple options, trade-offs, and a recommendation. Not yes/no -- genuine strategic choices.
2. **Three autonomy modes per exec.** Wait for me (decisions queue), recommend and proceed (exec acts on its recommendation, founder reviews the log), full autopilot (exec decides everything, founder monitors).
3. **Unified command view.** One screen shows all execs, all pending decisions, all recent outcomes. The founder sees the whole company, not one domain at a time.
4. **Consequence tracking.** When a decision is made, the system tracks what happens next. Did the recommended option play out as predicted? This builds a feedback loop for improving exec judgment over time.
5. **Regeneration.** Decisions are not static. After a turn resolves, the exec evaluates new state and generates the next set of decisions. The sim runs continuously.
6. **Pipeline-integrated.** Choosing an option triggers real pipeline actions -- create features, commission contractors, reprioritise work, change architecture decisions.
7. **Mobile-friendly.** The founder should be able to review and approve decisions on a phone during a walk.

---

## Part 1: Game Design Analysis

### What makes Civ's decision UI work

Civilisation's advisor system succeeds because of five design patterns that translate directly to business decision management:

**Pattern 1: Structured options with visible trade-offs.** Civ never presents a blank text box. Every decision is 2-5 discrete options, each with concrete costs, benefits, and predicted outcomes. The player can compare side-by-side. This reduces cognitive load from "think of the right answer" to "pick the best option from well-analysed alternatives."

**Adaptation for zazigv2:** Each exec generates 2-4 options per decision. Each option includes: a title, a one-paragraph description, resource cost (pipeline capacity, time, money), expected outcome, risk assessment, and a confidence score. The exec highlights its recommended option.

**Pattern 2: Domain-specific advisors.** Civ has a military advisor, a science advisor, a culture advisor. Each sees the same game state through their domain lens. The player can agree with one advisor and override another. Advisors occasionally disagree, which surfaces genuine trade-offs.

**Adaptation for zazigv2:** CPO, CTO, and CMO are already domain-specific advisors. The sim makes their independent perspectives visible on one screen. When two execs have opinions on the same topic (e.g., CPO wants a new feature but CTO flags tech debt risk), the sim surfaces the tension as a cross-domain decision that requires founder arbitration.

**Pattern 3: Resource constraints make choices real.** In Civ, you cannot research everything, build everything, and fight everywhere simultaneously. Limited production, gold, and science force genuine prioritisation. Choices have opportunity costs.

**Adaptation for zazigv2:** The resource context for every decision includes: pipeline capacity (how many jobs can run concurrently), exec attention (the CPO cannot spec 5 features simultaneously), calendar time (deadlines, dependencies), and budget (API costs, infrastructure spend). Options that exceed available resources are flagged.

**Pattern 4: Consequence chains.** Civ's decisions cascade. Building a wonder now means not building military units, which means vulnerability to attack, which means needing an alliance. Good players think 3-4 turns ahead.

**Adaptation for zazigv2:** Each option includes a "leads to" prediction -- what the next 2-3 decisions will likely be if this option is chosen. After a decision resolves, the system compares the prediction to reality and surfaces the delta. Over time, this builds institutional knowledge about which predictions were accurate.

**Pattern 5: Automation of trusted domains.** Experienced Civ players automate worker assignments, city production queues, and exploration. They focus their attention on diplomacy and warfare -- the high-stakes domains. Automation can be toggled per domain at any time.

**Adaptation for zazigv2:** The three autonomy modes (wait, recommend-and-proceed, autopilot) map directly. The founder can automate the CPO (trusted domain) while keeping the CTO on "wait for me" (architecture decisions are higher stakes for a new system). Modes are toggled per exec, per session, or per decision category.

### What Civ gets wrong (and how to avoid it)

**Information overload.** Late-game Civ buries the player in notifications. Dozens of turns pile up. The player clicks "next turn" without reading.

**Mitigation:** Priority-based surfacing. Decisions are ranked by urgency and impact. The dashboard shows the top 3 decisions that need attention. Lower-priority decisions auto-resolve on autopilot. The founder never faces a wall of 20 pending decisions.

**False precision.** Civ shows exact production numbers and turn counts. Business decisions are inherently uncertain.

**Mitigation:** Confidence intervals, not point estimates. "This feature will take 1-2 weeks" not "7 turns." Risk is shown as low/medium/high with reasoning, not as a percentage.

**Binary outcomes.** Civ events often have two options. Real business decisions usually have a spectrum.

**Mitigation:** Always 3-4 options minimum. Include at least one non-obvious option (the "what if we did something entirely different" wildcard). The brainstorming skill's structured exploration model influences option generation.

---

## Part 2: Decision Architecture

### What is a "decision"?

A decision is the atomic unit of the Strategy Sim. It represents a moment where an executive has analysed the current state of their domain and identified a choice point that could go multiple ways.

```
Decision = {
  context:        "Here is the situation"
  options:        "Here are 2-4 ways to proceed"
  recommendation: "I think we should do X, because..."
  resource_cost:  "Each option costs this much"
  consequences:   "Each option leads to this"
  urgency:        "This needs to be decided by..."
  category:       "What kind of decision this is"
}
```

### Decision categories

Each decision falls into one of four categories, which map to the autonomy framework from the CPO autonomous execution proposal:

| Category | Description | Default mode | Example |
|----------|-------------|-------------|---------|
| **Routine** | Obvious next step in a defined workflow. The "right" answer is clear. | Autopilot | "Feature spec passed QA. Set to ready_for_breakdown?" |
| **Tactical** | Within-domain choice with moderate impact. Multiple reasonable options exist. | Recommend and proceed | "Three features are ready to spec. Which should we prioritise?" |
| **Strategic** | Cross-domain or high-impact choice. Changes the trajectory of work. | Wait for me | "Competitor launched X. Pivot, differentiate, or ignore?" |
| **Foundational** | Irreversible or structural decision. Sets a precedent. | Wait for me | "Should we create a new project for mobile?" |

The category determines the default autonomy mode for that decision. The founder can override at any level (set all strategic decisions to autopilot, or set all routine decisions to wait-for-me).

### Decision generation: how turns happen

Decisions are generated through a hybrid of scheduled sweeps and event-driven triggers:

**Scheduled sweep (periodic):** Each exec runs a "state assessment" on a heartbeat cycle. The exec reviews its domain -- pipeline state, recent events, pending work, external signals -- and identifies choice points. This produces 0-N decisions per sweep. If no decisions need to be made, the sweep produces nothing (silence is a valid output).

**Event-driven (reactive):** Pipeline events trigger immediate decision generation. A feature completing breakdown, a blocker being raised, a monitoring agent submitting a proposal -- these create decision points in real time.

**Cross-domain triggers:** When one exec's decision affects another's domain, the affected exec generates a response decision. CPO decides to build Feature X; CTO generates a decision about the technical approach. These linked decisions appear together in the UI.

```
Event-driven triggers (immediate):
  - feature_breakdown_complete    -> CPO: "Review breakdown, approve/revise?"
  - blocker_raised                -> CTO/CPO: "How to unblock?"
  - monitoring_proposal_submitted -> CPO: "Investigate, build, or ignore?"
  - job_failed                    -> CTO: "Retry, rewrite spec, or escalate?"
  - budget_threshold_exceeded     -> CPO: "Reduce scope, pause work, or increase budget?"

Scheduled sweeps (periodic):
  - CPO every 4 hours: roadmap health, idea inbox triage, priority review
  - CTO every 8 hours: tech debt assessment, security posture, dependency audit
  - CMO every 12 hours: market signals, competitor moves, content pipeline
```

### Decision lifecycle

```
                                                   +--> expired
                                                   |    (auto-resolved by timeout)
                                                   |
generated --> pending --> presented --> decided --> resolved
                |                        |           |
                |                        |           +--> consequence_tracked
                |                        |
                |                        +--> auto_decided
                |                             (autopilot chose recommendation)
                |
                +--> superseded
                     (new information invalidated this decision)
```

| Status | Meaning |
|--------|---------|
| `generated` | Exec identified a choice point. Decision is being formulated. |
| `pending` | Decision is fully formed with options and recommendation. Awaiting presentation. |
| `presented` | Decision has been surfaced to the founder in the UI. Clock is ticking. |
| `decided` | Founder (or autopilot) has chosen an option. Awaiting execution. |
| `auto_decided` | Autopilot resolved this decision using the exec's recommendation. |
| `resolved` | The chosen option has been executed. Pipeline actions taken. |
| `consequence_tracked` | Enough time has passed to evaluate the outcome. Prediction vs reality recorded. |
| `expired` | Decision was not made within the time window. Auto-resolved with recommendation or escalated. |
| `superseded` | New information made this decision irrelevant before it was resolved. |

### Expiry and time pressure

Decisions have a time window. This is a game design element borrowed from Civ's "your rival proposes a trade deal -- accept within 10 turns or it expires."

| Category | Default time window | Expiry behaviour |
|----------|-------------------|------------------|
| Routine | 1 hour | Auto-resolve with recommendation |
| Tactical | 24 hours | Auto-resolve with recommendation, notify founder |
| Strategic | 72 hours | Escalate to founder (push notification), extend 24h |
| Foundational | No expiry | Never auto-resolves. Stays pending until decided. |

Time pressure prevents decision paralysis. The founder knows that if they do not review tactical decisions within a day, the exec will proceed with its recommendation. This is functionally identical to the "inform and proceed" pattern from the autonomy proposal, but made visible and controllable.

---

## Part 3: Data Model

### `decisions` table

```sql
CREATE TABLE public.decisions (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Who generated this decision
    exec_role        text        NOT NULL,  -- 'cpo', 'cto', 'cmo'

    -- Content
    title            text        NOT NULL,
    context          text        NOT NULL,  -- markdown: situation description
    category         text        NOT NULL DEFAULT 'tactical'
                                 CHECK (category IN ('routine', 'tactical', 'strategic', 'foundational')),

    -- Options (JSONB array)
    options          jsonb       NOT NULL DEFAULT '[]'::jsonb,
    /*
    options: [
      {
        "id": "opt-1",
        "title": "Prioritise Ideas Inbox",
        "description": "Build the ideas inbox feature next. Unblocks capture pipeline.",
        "resource_cost": { "pipeline_weeks": 2, "complexity": "medium" },
        "predicted_outcomes": [
          "Agents can capture raw ideas without human presence",
          "Reduces idea loss by ~80%",
          "Defers auth feature by 2 weeks"
        ],
        "risks": ["May delay user-facing features that drive adoption"],
        "confidence": 0.8,
        "leads_to": "Next decision: which exec triages first batch of ideas"
      },
      ...
    ]
    */

    -- Recommendation
    recommended_option_id  text,          -- references an option id within the options array
    recommendation_reasoning text,        -- why the exec recommends this option

    -- Decision state
    status           text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN (
                                     'generated', 'pending', 'presented',
                                     'decided', 'auto_decided', 'resolved',
                                     'consequence_tracked', 'expired', 'superseded'
                                 )),

    -- Resolution
    chosen_option_id text,                -- which option was selected
    decided_by       text,                -- 'human:tom', 'human:chris', 'autopilot'
    decided_at       timestamptz,
    decision_notes   text,                -- founder's reasoning if they override

    -- Consequences (filled in after resolution)
    predicted_consequences jsonb,         -- snapshot of chosen option's predicted_outcomes
    actual_consequences    jsonb,         -- what actually happened
    prediction_accuracy    real,          -- 0.0-1.0, assessed later
    consequence_assessed_at timestamptz,

    -- Time pressure
    urgency          text        NOT NULL DEFAULT 'normal'
                                 CHECK (urgency IN ('low', 'normal', 'high', 'critical')),
    expires_at       timestamptz,         -- null for foundational decisions

    -- Linking
    triggered_by_event_id uuid,           -- event that triggered this decision
    triggered_by_decision_id uuid REFERENCES public.decisions(id),
    superseded_by_id uuid REFERENCES public.decisions(id),

    -- Pipeline actions (what to do when this decision resolves)
    pipeline_actions jsonb,
    /*
    pipeline_actions: [
      {
        "action": "create_feature",
        "params": { "project_id": "...", "title": "Ideas Inbox", "priority": "high" }
      },
      {
        "action": "commission_contractor",
        "params": { "role": "project-architect", "project_id": "..." }
      }
    ]
    */

    -- Tags for filtering
    tags             text[],

    -- Timestamps
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Standard trigger
CREATE TRIGGER decisions_updated_at
    BEFORE UPDATE ON public.decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Indexes
CREATE INDEX idx_decisions_company_id  ON public.decisions(company_id);
CREATE INDEX idx_decisions_exec_role   ON public.decisions(exec_role);
CREATE INDEX idx_decisions_status      ON public.decisions(status);
CREATE INDEX idx_decisions_category    ON public.decisions(category);
CREATE INDEX idx_decisions_urgency     ON public.decisions(urgency);
CREATE INDEX idx_decisions_expires_at  ON public.decisions(expires_at)
    WHERE expires_at IS NOT NULL;
CREATE INDEX idx_decisions_created_at  ON public.decisions(created_at);

-- RLS
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.decisions
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_read_own" ON public.decisions
    FOR SELECT TO authenticated
    USING (company_id = (auth.jwt() ->> 'company_id')::uuid);
```

### `decision_outcomes` table (consequence tracking)

A separate table for tracking what happened after a decision was made. This is the feedback loop that makes the sim learn.

```sql
CREATE TABLE public.decision_outcomes (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id      uuid        NOT NULL REFERENCES public.decisions(id) ON DELETE CASCADE,
    company_id       uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- What was predicted
    predicted_outcome text       NOT NULL,

    -- What actually happened
    actual_outcome    text,
    outcome_status    text       DEFAULT 'pending'
                                 CHECK (outcome_status IN ('pending', 'accurate', 'partially_accurate',
                                                           'inaccurate', 'unexpected', 'too_early')),

    -- Assessment
    assessed_by       text,      -- 'cpo', 'cto', 'cmo', 'human'
    assessed_at       timestamptz,
    assessment_notes  text,

    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_decision_outcomes_decision_id ON public.decision_outcomes(decision_id);
CREATE INDEX idx_decision_outcomes_status ON public.decision_outcomes(outcome_status);
```

### Schema design rationale

**Why JSONB for options instead of a separate `decision_options` table?** Options are always read and written as a set. They are never queried independently (you never ask "show me all options across all decisions that mention auth"). JSONB keeps the read path simple -- one query returns the full decision with all options. If option-level analytics become important later (e.g., "how often does the founder override the recommendation?"), a materialised view or ETL process can extract from JSONB.

**Why `pipeline_actions` as JSONB?** Actions are heterogeneous -- creating a feature, commissioning a contractor, reprioritising work, updating a status. A polymorphic JSONB column with an action type discriminator is more flexible than a rigid relational model. The action executor reads the action type and routes to the appropriate handler.

**Why a separate `decision_outcomes` table?** Outcomes are 1:N per decision (one decision can have multiple predicted outcomes, each tracked independently). They are also assessed at different times -- some outcomes are immediate, some take weeks. A separate table allows independent lifecycle management.

**Why `triggered_by_decision_id`?** Decisions chain. Choosing "build auth" creates a follow-up decision "which auth approach?" Decision chaining creates the consequence chains that make the sim feel like a game -- your choices shape the next set of choices.

---

## Part 4: The Autopilot System

### Three modes

The autopilot system is the core innovation. It maps directly to the autonomy levels from the CPO autonomous execution proposal, but makes them visible, controllable, and per-exec.

#### Mode 1: Wait for Me

The exec generates decisions and queues them. Nothing happens until the founder explicitly chooses an option. This is the current default behaviour -- the exec presents analysis and the human says yes/no.

**When to use:** New execs the founder does not yet trust. High-stakes domains. During onboarding.

**UX:** Decisions accumulate in the queue with a notification badge. The founder sees "3 pending decisions from CPO" and reviews them when convenient.

**Timeout behaviour:** If the founder does not respond within the decision's time window, the decision enters a "stale" state. The exec generates a reminder. After a second expiry, the decision auto-resolves with the recommendation and the founder is notified.

```
Decision generated
    |
    v
[Pending] -----> Founder reviews -----> Founder chooses -----> [Resolved]
    |                                       |
    |                                       +--> Founder overrides recommendation
    |
    +---- Time window expires
    |
    v
[Stale] -----> Reminder sent -----> Founder reviews -----> [Resolved]
    |
    +---- Second expiry
    |
    v
[Auto-resolved with recommendation, founder notified]
```

#### Mode 2: Recommend and Proceed

The exec generates a decision, announces it, and immediately proceeds with its recommendation. The founder has a time window to override. If the founder does nothing, the exec's choice stands.

**When to use:** Trusted execs operating in well-understood domains. The founder wants to stay informed but does not want to be a bottleneck.

**UX:** Decisions appear in the feed as "CPO decided: Prioritise Ideas Inbox (recommended). Override within 4h." The card shows a countdown timer. The founder can tap "Override" and select a different option, or let the timer expire.

**This is the "trust but verify" model made tangible.** The founder sees every decision, can intervene on any decision, but is never required to act.

```
Decision generated
    |
    v
[Announced] + [Exec proceeds with recommendation]
    |
    |---- Override window open
    |         |
    |         +--> Founder overrides -----> Exec changes course -----> [Resolved]
    |
    +---- Override window closes
    |
    v
[Resolved with recommendation]
```

#### Mode 3: Full Autopilot

The exec makes all decisions autonomously. Decisions are logged but not presented for review. The founder can review the decision log at any time but is never prompted.

**When to use:** Mature, trusted execs in stable domains. When the founder is unavailable for extended periods (holidays, deep work).

**UX:** The decision feed shows resolved decisions as a timeline: "CPO decided X at 14:30, Y at 16:00, Z at 09:15." Each entry is expandable to see the full decision context and options that were not chosen. The founder can retroactively flag a decision as "I would have chosen differently" which feeds back into the exec's judgment calibration.

**Safety rail:** Even in full autopilot, foundational decisions always pause. The exec cannot autonomously create new projects, reject founder ideas, or make irreversible structural changes without surfacing a decision. This is a hard constraint.

```
Decision generated
    |
    v
[Auto-resolved immediately with recommendation]
    |
    v
[Logged in decision feed]
    |
    +---- Founder retroactively reviews
    |         |
    |         +--> "I agree" -----> Reinforces exec judgment
    |         +--> "I disagree" --> Logged as calibration signal
    |
    v
[Consequence tracked normally]
```

### Per-exec autonomy configuration

The founder sets a default autonomy mode per exec, and can override per category:

```jsonc
{
  "cpo": {
    "default_mode": "recommend_and_proceed",
    "overrides": {
      "routine": "autopilot",
      "tactical": "recommend_and_proceed",
      "strategic": "wait_for_me",
      "foundational": "wait_for_me"
    }
  },
  "cto": {
    "default_mode": "wait_for_me",
    "overrides": {
      "routine": "recommend_and_proceed"
    }
  },
  "cmo": {
    "default_mode": "autopilot",
    "overrides": {
      "foundational": "wait_for_me"
    }
  }
}
```

This configuration is stored per company in a `company_settings` table or as a JSONB column on the `companies` table. Execs read their autonomy config at session start.

### Autonomy mode transitions

The founder can change an exec's mode at any time through the UI:

- **Slider control per exec:** Drag from "Wait" to "Recommend" to "Autopilot"
- **Quick toggles:** "Going dark for 4 hours -- all execs to autopilot" / "Back -- reset to defaults"
- **Per-decision override:** On any pending decision, tap "Let them decide" (one-off autopilot) or "I want to decide this" (one-off wait)

---

## Part 5: UI Design

### The Command Board (primary view)

The Command Board is the single-screen overview. It borrows from Civ's main map -- everything is visible, and the founder drills into detail as needed.

```
+------------------------------------------------------------------+
|  ZAZIG COMMAND BOARD                     [Settings] [History]     |
+------------------------------------------------------------------+
|                                                                    |
|  COMPANY HEALTH                                                    |
|  +-----------+  +-----------+  +-----------+  +-----------+       |
|  | Pipeline  |  | Quality   |  | Velocity  |  | Budget    |       |
|  |   ████░░  |  |   █████░  |  |   ███░░░  |  |   ████░░  |       |
|  |   68%     |  |   82%     |  |   50%     |  |   72%     |       |
|  +-----------+  +-----------+  +-----------+  +-----------+       |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  CPO                    CTO                    CMO                 |
|  [Recommend & Proceed]  [Wait for Me]          [Autopilot]        |
|  ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐   |
|  │ 2 pending        │    │ 1 pending        │    │ 0 pending    │   |
|  │ 1 deciding now   │    │ 3 decided today  │    │ 5 auto today │   |
|  │                  │    │                  │    │              │   |
|  │ ★ Feature        │    │ ★ Tech debt      │    │ Last: 2h ago │   |
|  │   Priority       │    │   approach       │    │ Next: ~6h    │   |
|  │   [Tactical]     │    │   [Strategic]    │    │              │   |
|  │                  │    │                  │    │              │   |
|  │ Next turn: ~2h   │    │ Next turn: ~6h   │    │              │   |
|  └─────────────────┘    └─────────────────┘    └──────────────┘   |
|                                                                    |
+------------------------------------------------------------------+
|                                                                    |
|  DECISION FEED (latest)                                           |
|  ┌─────────────────────────────────────────────────────────────┐  |
|  │ 14:30 CPO [auto] Set Dark Mode to ready_for_breakdown       │  |
|  │ 13:15 CTO [decided] Chose: Refactor alongside next feature  │  |
|  │ 11:00 CPO [auto] Triaged 4 ideas from inbox                 │  |
|  │ 09:45 CPO [pending] Which initiative to prioritise? ← YOU   │  |
|  │ 09:00 CMO [auto] Published weekly competitor digest          │  |
|  └─────────────────────────────────────────────────────────────┘  |
|                                                                    |
+------------------------------------------------------------------+
```

### Company Health Meters

Borrowed from Civ's happiness/economy/military indicators. Four composite metrics that give the founder an instant read on company health:

| Meter | What it measures | Data sources |
|-------|-----------------|-------------|
| **Pipeline** | Work throughput: features in progress, jobs queued, blockers | `features` and `jobs` tables, status distributions |
| **Quality** | Output quality: spec self-assessment scores, verification pass rates, job failure rates | `decision_outcomes` accuracy, verification results |
| **Velocity** | Speed: time from idea to shipped, decisions per day, pipeline cycle time | Timestamps across pipeline stages |
| **Budget** | Resource usage: API costs, pipeline capacity utilisation, time allocation | API billing data, job duration stats |

Each meter is a 0-100% composite score with a colour indicator (green/amber/red). The founder glances at the meters and knows immediately if something needs attention.

### The Decision Card (detail view)

Tapping a decision in the Command Board opens the full Decision Card:

```
+------------------------------------------------------------------+
|  ← Back to Board                                                  |
|                                                                    |
|  [Tactical] [CPO]                              Expires in 18h     |
|                                                                    |
|  Feature Priority Decision                                        |
|  ─────────────────────                                            |
|  Three features have completed outline review and are ready to     |
|  be specced. Pipeline capacity supports one feature at a time.     |
|  Current roadmap has no blocking dependencies between them.        |
|                                                                    |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  OPTION A: Ideas Inbox                          ★ RECOMMENDED │ |
|  │                                                                │ |
|  │  Build the pre-pipeline capture system. Agents can capture    │ |
|  │  raw ideas, CPO triages autonomously, ideas graduate to       │ |
|  │  features when ready.                                         │ |
|  │                                                                │ |
|  │  Cost: ~2 weeks, 4-6 jobs, medium complexity                  │ |
|  │  Enables: Autonomous idea capture, reduced idea loss          │ |
|  │  Risks: Defers user-facing features by 2 weeks                │ |
|  │  Confidence: 80%                                              │ |
|  │                                                                │ |
|  │  Leads to: "Which exec triages first?" → "Inbox UI design"   │ |
|  │                                                                │ |
|  │  [Choose This Option]                                         │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  OPTION B: User Authentication                                │ |
|  │                                                                │ |
|  │  Build login, session management, and permissions. Required   │ |
|  │  for multi-user access to the dashboard.                      │ |
|  │                                                                │ |
|  │  Cost: ~3 weeks, 8-10 jobs, high complexity                   │ |
|  │  Enables: Chris can access the dashboard, multi-user support  │ |
|  │  Risks: Large scope, may uncover architectural issues         │ |
|  │  Confidence: 65%                                              │ |
|  │                                                                │ |
|  │  Leads to: "OAuth provider?" → "Permission model design"     │ |
|  │                                                                │ |
|  │  [Choose This Option]                                         │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │  OPTION C: Notification System                                │ |
|  │                                                                │ |
|  │  Build real-time notifications for pipeline events. Founder   │ |
|  │  gets push notifications for important decisions.             │ |
|  │                                                                │ |
|  │  Cost: ~1 week, 3 jobs, low complexity                        │ |
|  │  Enables: Mobile awareness, faster founder response times     │ |
|  │  Risks: Low standalone value without other features           │ |
|  │  Confidence: 90%                                              │ |
|  │                                                                │ |
|  │  Leads to: "Push vs Telegram vs email?" → "Urgency levels"   │ |
|  │                                                                │ |
|  │  [Choose This Option]                                         │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  ─────────────────────────────────────────────────────────────    |
|  CPO Recommendation: Option A (Ideas Inbox)                       |
|  "Ideas Inbox unblocks the autonomous capture pipeline. Without   |
|   it, every idea requires a human to be present in a terminal     |
|   session. Auth is important but not urgent -- only two users     |
|   exist today. Notifications are quick but low standalone value." |
|  ─────────────────────────────────────────────────────────────    |
|                                                                    |
|  [Accept Recommendation] [Add Note...] [Defer Decision]          |
+------------------------------------------------------------------+
```

### The Decision Timeline (history view)

A chronological view of all decisions, filterable by exec, category, and outcome:

```
+------------------------------------------------------------------+
|  DECISION TIMELINE                [Filter: All] [Range: 7 days]  |
+------------------------------------------------------------------+
|                                                                    |
|  Today                                                            |
|  ├── 14:30  CPO  [routine] [autopilot]                           |
|  │         Set Dark Mode to ready_for_breakdown                   |
|  │         Outcome: Breakdown completed successfully (accurate)   |
|  │                                                                |
|  ├── 13:15  CTO  [tactical] [human decided]                      |
|  │         Tech debt approach: Refactor alongside next feature    |
|  │         Outcome: pending                                       |
|  │                                                                |
|  ├── 11:00  CPO  [routine] [autopilot]                           |
|  │         Triaged 4 ideas: 2 promoted, 1 parked, 1 rejected     |
|  │         Outcome: accurate (all 4 assessed correctly)           |
|  │                                                                |
|  Yesterday                                                        |
|  ├── 16:00  CMO  [tactical] [autopilot]                          |
|  │         Content strategy: Focus on technical blog posts        |
|  │         Outcome: partially accurate (engagement lower than     |
|  │         predicted, but SEO traffic up)                         |
|  ...                                                              |
+------------------------------------------------------------------+
```

### Mobile Layout

On mobile (< 768px), the Command Board becomes a vertical stack:

1. **Health meters** as a horizontal scroll row
2. **Exec cards** as a vertical stack, each showing pending count and top decision
3. **Decision feed** as a compact list
4. **Tapping an exec** opens their full decision queue
5. **Tapping a decision** opens the Decision Card (full-screen modal)

The Decision Card on mobile uses vertical option cards instead of side-by-side comparison. Swipe gestures for quick actions: swipe right to accept recommendation, swipe left to defer.

---

## Part 6: Gamification Elements

### What to gamify (and what not to)

Gamification should make the system more engaging and informative without trivialising business decisions. The line: gamify the meta-game (how well you are running the company), do not gamify individual decisions (no points for choosing Option A over Option B).

#### Include: Company Health Dashboard

The four meters (Pipeline, Quality, Velocity, Budget) are inherently gamified -- they are progress bars that the founder wants to keep high. This is the Civ equivalent of happiness, economy, science, and military ratings.

Each meter has:
- **Current value:** 0-100%
- **Trend arrow:** up/down/stable compared to last week
- **Historical sparkline:** 30-day trend at a glance
- **Breakdown on tap:** what is contributing positively and negatively

#### Include: Decision Accuracy Tracking

Over time, the system tracks how accurate each exec's predictions are. This creates a natural scorecard:

```
CPO Decision Accuracy (30 days)
  Predictions made: 24
  Accurate: 18 (75%)
  Partially accurate: 4 (17%)
  Inaccurate: 2 (8%)
  Trend: improving (was 68% last month)
```

This is not a gamification gimmick -- it is a genuine quality metric that helps the founder calibrate trust. If the CPO's predictions are 90% accurate, the founder can confidently run it on autopilot. If accuracy drops to 50%, it is time to switch to "wait for me."

#### Include: Milestone Tracking

Key milestones in the company's journey, tracked and celebrated:

- "First feature shipped through the full pipeline"
- "10th decision made -- company running for 1 week"
- "CPO accuracy above 80% for 30 consecutive days"
- "All execs on autopilot for the first time"
- "100th decision milestone"

These are presented as subtle achievements in the sidebar, not as pop-up notifications. They serve as progress markers, not dopamine triggers.

#### Include: Decision History Replay

A "this quarter in review" feature that summarises decision patterns:

- Total decisions made: 340 (120 CPO, 80 CTO, 140 CMO)
- Human decided: 45 (13%)
- Auto-decided: 295 (87%)
- Average time-to-decision: 2.4 hours
- Biggest course correction: "Pivoted from Feature X to Feature Y on Feb 15"
- Most accurate prediction: "CPO predicted auth would take 3 weeks -- took 3.2 weeks"

This is the "year in review" concept applied to business decisions. Valuable for founder reflection and for demonstrating zazig's value to potential customers.

#### Exclude: Points and leaderboards

No points for making decisions. No leaderboard between execs. No XP system. These patterns trivialise genuine business choices and create perverse incentives (making fast decisions to earn points rather than making good decisions).

#### Exclude: Streaks for the sake of streaks

No "14-day streak of daily decisions" counter. This incentivises busywork -- generating decisions to maintain a streak when there are no genuine choice points. If no decisions are needed today, that is fine.

#### Consider (future): Company "Score"

A single composite number that represents overall company health. Like a credit score for how well the AI org is running. Composed from:
- Pipeline throughput
- Decision accuracy
- Feature cycle time
- Budget efficiency
- Quality pass rates

This is appealing but risks oversimplification. Defer to v2 and evaluate whether the four individual meters are sufficient.

---

## Part 7: The Brainstorming Connection

Tom's brief references the brainstorming skill as an influence. The brainstorming skill (from the Claude Code superpowers plugin) follows a structured exploration pattern:

1. **Requirements discovery** -- ask questions to understand the problem
2. **Option generation** -- produce multiple approaches creatively
3. **Evaluation** -- assess each option against criteria
4. **Recommendation** -- synthesise into a preferred approach

The Strategy Sim's decision generation follows this same pattern, but makes it persistent and game-like:

| Brainstorming Skill | Strategy Sim Decision |
|---------------------|----------------------|
| Requirements discovery | Exec analyses current state and context |
| Option generation | Exec generates 2-4 options with trade-offs |
| Evaluation | Each option has costs, benefits, risks, confidence |
| Recommendation | Exec highlights preferred option with reasoning |

The difference: brainstorming is a one-shot session that produces a recommendation. A sim decision persists, queues, tracks consequences, and chains into future decisions.

### Decision generation as structured brainstorming

Each exec should generate decisions using a process inspired by the brainstorming skill:

1. **State scan:** Read the current pipeline state, recent events, and pending work
2. **Choice point identification:** What needs to be decided? What has changed since the last scan?
3. **Option generation:** For each choice point, generate at least 3 options (brainstorming mode -- be creative, include non-obvious alternatives)
4. **Trade-off analysis:** For each option, assess cost, benefit, risk, and second-order effects
5. **Recommendation synthesis:** Pick the best option, explain why, note what would change the recommendation

This process can be formalised as a `/generate-decisions` skill that each exec invokes during their state assessment sweep.

---

## Part 8: Integration with Existing Pipeline

### Pipeline actions

When a decision resolves, the system executes the associated pipeline actions. These are real operations, not just records:

| Action type | What it does | MCP tool |
|-------------|-------------|----------|
| `create_feature` | Creates a feature in the pipeline | `create_feature` |
| `update_feature` | Updates feature status, priority, or spec | `update_feature` |
| `commission_contractor` | Commissions a project architect, breakdown specialist, or verification specialist | `commission_contractor` |
| `create_idea` | Captures something in the ideas inbox | `create_idea` |
| `promote_idea` | Graduates an idea to a feature or job | `promote_idea` |
| `update_priority` | Reorders the roadmap | `update_feature` (priority field) |
| `notify_exec` | Sends a decision to another exec for their input | Events system |
| `create_decision` | Chains into a follow-up decision | New internal action |

The `pipeline_actions` JSONB on the decision row defines what happens. The action executor reads the array and processes each action in sequence. If any action fails, the decision moves to an error state and the founder is notified.

### Event integration

Decision lifecycle events integrate with the existing events table:

```sql
-- New event types
'decision_generated', 'decision_presented', 'decision_decided',
'decision_auto_decided', 'decision_resolved', 'decision_expired',
'decision_superseded', 'decision_outcome_assessed'
```

These events enable:
- The orchestrator to trigger follow-up actions
- Other execs to react to decisions in their domain
- The dashboard to update in real time via Supabase Realtime
- The audit trail to capture the full decision lifecycle

### Cross-exec decisions

When two execs have competing perspectives on the same topic, the system generates a **cross-domain decision** that surfaces both viewpoints:

```
Cross-domain Decision: Auth Implementation Timing

CPO perspective:
  "Auth is not urgent. Only 2 users exist. Defer to Q2."

CTO perspective:
  "Auth should be built now. Adding it later requires retrofitting
   every endpoint. The cost increases 3x if we defer."

Options:
  A) Build now (CTO recommendation)
  B) Defer to Q2 (CPO recommendation)
  C) Build minimal auth now, full auth later (compromise)

Founder decides.
```

Cross-domain decisions are always "Wait for Me" regardless of autonomy settings. They represent genuine strategic tensions that require human judgment.

### Relationship to existing autonomy model

The Strategy Sim does not replace the CPO autonomous execution model from the companion proposal. It layers on top of it:

| Layer | What it handles | Mechanism |
|-------|----------------|-----------|
| **Exec autonomy (existing)** | Within-session decision-making: whether the CPO asks permission before setting ready_for_breakdown | Role prompt instructions, action categories |
| **Strategy Sim (new)** | Cross-session strategic decisions: what to prioritise, how to respond to signals, where to invest | Decision queue, autopilot modes, Command Board UI |

The exec autonomy model handles the moment-to-moment "should I proceed?" decisions within a terminal session. The Strategy Sim handles the higher-level "what should we be working on?" decisions that persist across sessions and affect multiple execs.

Routine decisions in the Strategy Sim correspond to Category 2 (inform and proceed) actions in the autonomy model. The sim makes these visible and trackable. Strategic and foundational decisions in the sim correspond to Category 3 (pause and ask) actions. The sim provides a structured UI for these decisions instead of a free-form terminal conversation.

---

## Part 9: Multi-Player Support

### Tom and Chris as co-founders

Both founders should be able to interact with the sim:

**Shared view:** Both see the same Command Board, the same pending decisions, the same decision feed. Changes by one founder are visible to the other in real time (Supabase Realtime).

**Independent decisions:** Either founder can decide a pending decision. The `decided_by` field records who decided. If both founders are active, the first to choose "wins" (optimistic concurrency -- the decision moves to decided state, and the other founder sees it as already resolved).

**Delegation preferences:** Each founder can set their own notification preferences. Tom gets push notifications for strategic decisions; Chris gets email summaries of all decisions daily.

**Voting (future):** For truly contentious decisions, a voting mechanism where both founders must agree before the decision resolves. This is overkill for a two-person founding team but becomes relevant if zazig serves larger organisations.

### Permission model

```
| Action | Tom (founder) | Chris (co-founder) | CPO (exec) | Public |
|--------|--------------|-------------------|------------|--------|
| View decisions | Yes | Yes | Own domain | No |
| Decide pending | Yes | Yes | Autopilot only | No |
| Change autonomy modes | Yes | Yes | No | No |
| Override auto-decisions | Yes | Yes | No | No |
| Generate decisions | No | No | Yes | No |
| View health metrics | Yes | Yes | Yes (own) | No |
| View decision history | Yes | Yes | Own domain | No |
```

---

## Part 10: Technical Architecture

### Frontend

**Framework:** React (matches existing dashboard). The Command Board is a single-page application.

**State management:** Supabase Realtime subscriptions for live updates. Decision feed updates in real time as execs generate and resolve decisions.

**Hosting:** Firebase Hosting or Vercel, behind Supabase Auth. Same authentication as the existing dashboard.

**Mobile:** Responsive web app, not a native app. PWA capabilities (add to home screen, push notifications via service worker) provide a near-native mobile experience.

### Backend

**Decision storage:** Supabase Postgres (the `decisions` and `decision_outcomes` tables above).

**Decision execution:** A new edge function `execute-decision-actions` that processes the `pipeline_actions` array when a decision is resolved. This function calls existing edge functions (`create-feature`, `commission-contractor`, etc.) in sequence.

**Decision generation:** Execs generate decisions via a new MCP tool `create_decision`. The decision generation logic lives in the exec's skill set (a `/generate-decisions` skill).

**Expiry processing:** A scheduled Supabase function that checks for expired decisions every 15 minutes. Expired decisions auto-resolve or escalate based on category.

**Health metrics:** A scheduled function that computes health meter scores hourly by querying pipeline state tables. Scores are cached in a `company_metrics` table for fast dashboard reads.

### MCP tools

Four new tools for the agent MCP server:

```typescript
// Execs generate decisions
server.tool("create_decision", "Generate a new strategic decision", {
  title: z.string(),
  context: z.string(),
  category: z.enum(["routine", "tactical", "strategic", "foundational"]),
  options: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    resource_cost: z.object({}).passthrough(),
    predicted_outcomes: z.array(z.string()),
    risks: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    leads_to: z.string().optional(),
  })),
  recommended_option_id: z.string(),
  recommendation_reasoning: z.string(),
  urgency: z.enum(["low", "normal", "high", "critical"]).optional(),
  pipeline_actions: z.array(z.object({}).passthrough()).optional(),
  tags: z.array(z.string()).optional(),
});

// Execs and humans query decisions
server.tool("query_decisions", "Query decisions with filters", {
  decision_id: z.string().optional(),
  exec_role: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  limit: z.number().optional(),
});

// Humans (via dashboard) resolve decisions
server.tool("resolve_decision", "Choose an option for a pending decision", {
  decision_id: z.string(),
  chosen_option_id: z.string(),
  decided_by: z.string(),
  decision_notes: z.string().optional(),
});

// Execs assess outcomes
server.tool("assess_decision_outcome", "Record the actual outcome of a decision", {
  decision_id: z.string(),
  predicted_outcome: z.string(),
  actual_outcome: z.string(),
  outcome_status: z.enum(["accurate", "partially_accurate", "inaccurate", "unexpected"]),
  assessment_notes: z.string().optional(),
});
```

### Notification channels

When decisions need attention, the system can notify the founder through:

| Channel | When | Mechanism |
|---------|------|-----------|
| **Dashboard badge** | Always | Supabase Realtime counter update |
| **Push notification** | Strategic/foundational decisions | Web Push API via service worker |
| **Telegram** | If configured | Telegram adapter (existing infra) |
| **Email digest** | Daily summary | Scheduled edge function |

The founder configures notification preferences per channel and per decision category.

---

## Part 11: Implementation Plan

### Phase 1: Decision Infrastructure (MVP)

**Goal:** Execs can generate decisions, humans can resolve them via API. No UI yet.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 1.1 | Migration: `decisions` table + `decision_outcomes` table | Simple | Nothing |
| 1.2 | Edge function: `create-decision` | Simple | 1.1 |
| 1.3 | Edge function: `query-decisions` | Simple | 1.1 |
| 1.4 | Edge function: `resolve-decision` | Medium | 1.1 + action executor |
| 1.5 | Edge function: `execute-decision-actions` | Medium | 1.4 + existing pipeline edge functions |
| 1.6 | MCP server: add 4 decision tools | Medium | 1.2-1.4 |
| 1.7 | CPO skill: `/generate-decisions` (decision generation protocol) | Medium | 1.6 |

**Effort:** 6-8 jobs. Estimated 1-2 weeks.

**What this enables:** The CPO can generate decisions and they persist in the database. Decisions can be resolved via MCP tools (founder tells CPO "choose option A" in terminal). Pipeline actions execute on resolution. This is the Strategy Sim without the game UI -- functional but not visual.

### Phase 2: Command Board (Core UI)

**Goal:** A web dashboard showing the Command Board with exec cards and decision feed.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 2.1 | React app scaffold (reuse dashboard design system) | Simple | Phase 1 |
| 2.2 | Command Board layout: exec cards + decision feed | Medium | 2.1 |
| 2.3 | Decision Card detail view with option cards | Medium | 2.2 |
| 2.4 | Resolve decision via UI (choose option, add notes) | Medium | 2.3 + Phase 1.4 |
| 2.5 | Supabase Realtime subscriptions for live updates | Medium | 2.2 |
| 2.6 | Mobile-responsive layout | Medium | 2.2-2.4 |

**Effort:** 6-8 jobs. Estimated 2-3 weeks.

**What this enables:** The founder can see all pending decisions, review options, and choose from the web dashboard on desktop or mobile.

### Phase 3: Autopilot System

**Goal:** Execs auto-resolve decisions based on autonomy configuration.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 3.1 | Autonomy config schema (per-exec, per-category) | Simple | Phase 1 |
| 3.2 | Auto-resolution logic in the decision pipeline | Medium | 3.1 |
| 3.3 | Expiry processing (scheduled function) | Simple | Phase 1 |
| 3.4 | Autonomy mode UI controls (slider, quick toggles) | Medium | Phase 2 |
| 3.5 | Override window for recommend-and-proceed mode | Medium | 3.2 + Phase 2 |

**Effort:** 5-6 jobs. Estimated 1-2 weeks.

**What this enables:** The founder can set execs to different autonomy modes. Routine decisions auto-resolve. Tactical decisions proceed with recommendations. The sim runs continuously.

### Phase 4: Health Metrics and Gamification

**Goal:** Company health meters, decision accuracy tracking, milestone badges.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 4.1 | Health metric calculation (scheduled function) | Medium | Pipeline data exists |
| 4.2 | Health meter UI components | Medium | Phase 2 |
| 4.3 | Decision outcome assessment flow | Medium | Phase 1 |
| 4.4 | Accuracy tracking and exec scorecard | Medium | 4.3 |
| 4.5 | Milestone detection and display | Simple | 4.4 |
| 4.6 | Decision timeline / history view | Medium | Phase 2 + Phase 1 |

**Effort:** 6-8 jobs. Estimated 2-3 weeks.

### Phase 5: Cross-Domain and Multi-Player

**Goal:** Cross-exec decisions, multi-founder support, notifications.

| Step | What | Complexity | Depends on |
|------|------|-----------|------------|
| 5.1 | Cross-domain decision generation (exec tension detection) | Complex | Phase 1 + all exec skills |
| 5.2 | Multi-founder auth and permission model | Medium | Supabase Auth |
| 5.3 | Push notifications (service worker) | Medium | Phase 2 |
| 5.4 | Telegram notification integration | Simple | Existing Telegram adapter |
| 5.5 | Email digest (scheduled function) | Simple | Phase 1 data |

**Effort:** 5-7 jobs. Estimated 2 weeks.

### Total estimated effort

| Phase | Jobs | Time | Priority |
|-------|------|------|----------|
| Phase 1: Decision Infrastructure | 6-8 | 1-2 weeks | Critical (enables everything) |
| Phase 2: Command Board | 6-8 | 2-3 weeks | High (the "game" without UI is just a database) |
| Phase 3: Autopilot | 5-6 | 1-2 weeks | High (the killer feature) |
| Phase 4: Health & Gamification | 6-8 | 2-3 weeks | Medium (polish, not core) |
| Phase 5: Cross-Domain & Multi-Player | 5-7 | 2 weeks | Low (future, nice to have) |
| **Total** | **28-37** | **8-12 weeks** | |

---

## Relationship to Other Proposals

### Ideas Inbox

The Ideas Inbox is a natural input to the Strategy Sim. When the CPO triages ideas and identifies a promising one, it can generate a decision: "This idea looks ready for promotion. Promote as feature, send to research, or park?" The idea inbox feeds the sim with choice points.

### Spec Visualiser

The Spec Visualiser's approval workflow and the Strategy Sim's decision resolution are complementary UI patterns. The visualiser handles document-level approvals (section by section). The sim handles strategic-level approvals (option by option). Both use the same design system and could share UI components (approval buttons, status badges, comment fields).

### CPO Autonomous Execution

The autonomous execution model defines *how* the CPO behaves when nobody is watching. The Strategy Sim defines *what* the CPO surfaces when it encounters a genuine choice point. Together they form a complete loop: the CPO operates autonomously for routine work and generates sim decisions for non-routine work.

### Pipeline Design

The pipeline's existing stages (ideation, design, breakdown, execution, verification) remain unchanged. The sim sits above the pipeline as a strategic layer. Pipeline events generate decisions; decision resolutions trigger pipeline actions. The sim does not replace the pipeline -- it provides a human interface to the pipeline's strategic decision points.

---

## Open Questions

### 1. Decision generation frequency

How often should execs generate decisions? Options:
- **Heartbeat-aligned:** CPO generates decisions on its 4-hour sweep, CTO on 8-hour sweep, CMO on 12-hour sweep
- **Event-driven only:** Decisions generated only when pipeline events occur
- **Hybrid:** Scheduled sweeps + event-driven urgent decisions

**Current lean:** Hybrid. Sweeps catch strategic decisions that no single event triggers. Events catch urgent decisions that cannot wait for the next sweep.

### 2. Decision UI: web app or integrated into existing dashboard?

Should the Command Board be a standalone app or a new page in the existing zazigv2 dashboard?

**Current lean:** Integrated into the existing dashboard. The dashboard already has the design system, auth, and Supabase connection. Adding a "Command Board" route is less work than building a new app.

### 3. How do execs learn from outcome assessments?

When a decision's outcome is assessed as "inaccurate," how does the exec improve? Options:
- **Memory injection:** The outcome assessment is stored in the exec's memory and influences future decisions
- **Doctrine update:** Patterns from inaccurate predictions become new doctrine entries ("when X, we tend to overestimate Y")
- **Skill refinement:** The `/generate-decisions` skill includes a "review past accuracy" step

**Current lean:** Memory injection for v1 (simplest). Doctrine-level learning is more powerful but requires the knowledge architecture to support automated doctrine generation.

### 4. Should routine decisions appear in the UI at all?

Routine decisions (autopilot, auto-resolved) generate noise. Options:
- **Show everything:** All decisions in the feed, routine ones are greyed out / collapsed
- **Filter by default:** Only tactical and above appear. Routine available via filter toggle.
- **Log only:** Routine decisions are logged in the database but never shown in the feed unless specifically searched.

**Current lean:** Filter by default. Show tactical and above. Routine available via "show all" toggle. The timeline/history view shows everything for audit purposes.

### 5. What happens when the sim and terminal coexist?

Execs still run in tmux terminals. The founder can still talk to them directly. If the founder resolves a decision in the terminal conversation (telling the CPO "do option A"), should that be reflected in the sim?

**Current lean:** Yes. The exec should call `resolve_decision` via MCP when a decision is resolved in conversation. The sim and terminal are two views of the same state. This requires exec awareness of pending decisions -- the CPO checks for pending decisions before starting a conversation and links terminal decisions to sim decisions.

### 6. Decision complexity vs option count

Should complex decisions have more options? Or should all decisions have 3-4 options regardless?

**Current lean:** 3-4 options always. Complex decisions should be decomposed into multiple sequential decisions rather than presented as one decision with 8 options. The game design principle: never overwhelm the player with too many choices at once.

### 7. How to handle "none of the above"?

What if the founder does not like any of the exec's options?

**Current lean:** Every decision card has a "None of these -- let me explain" button that opens a free-text input. The exec receives the founder's alternative direction and generates a new decision incorporating the feedback. The original decision is marked as "superseded."

---

## Summary

The Strategy Sim transforms zazigv2's executive interaction model from terminal conversations to a Civilisation-style strategic interface. Three execs generate discrete decisions with multiple options, trade-offs, and recommendations. The founder reviews decisions on a Command Board that shows the entire company state at a glance. Three autonomy modes (wait, recommend-and-proceed, autopilot) let the founder control how much attention each domain requires. Consequence tracking creates a feedback loop that improves exec judgment over time.

The core insight: running a company through AI executives is fundamentally a strategy game. The founder is the player. The execs are the advisors. The pipeline is the game engine. The decisions are the turns. The Strategy Sim makes this metaphor literal.

Implementation follows a phased approach: decision infrastructure first (database, MCP tools, skills), then the Command Board UI, then the autopilot system, then gamification elements. Phases 1-3 deliver the core experience in 4-7 weeks. Phases 4-5 add polish and advanced features over the following 4-5 weeks.

The sim integrates with every other proposal in the pipeline: it consumes ideas from the Ideas Inbox, surfaces strategic tensions between execs, displays decisions through the Spec Visualiser's design system, and builds on the CPO autonomous execution model's autonomy levels. It is not a standalone feature -- it is the interface layer that ties the entire zazigv2 system together for the human founders.

---

## Addendum: Living Business Model View (2026-02-25, post-proposal)

Tom raised the idea of a top-level business strategy layer on the Command Board — inspired by the Business Model Canvas but maintained by AI execs rather than a one-off workshop.

### Why the Business Model Canvas failed

The BMC (Osterwalder, 2008) had the right structure — 9 blocks covering value proposition, customers, channels, revenue, costs, partners, activities, resources, relationships. The problem was never the model. The problems were:

1. **Static** — created in a workshop, never updated, became wall decoration
2. **Nobody's job** — no one owned keeping it current
3. **Not actionable** — knowing your "key partners" are X doesn't tell you what to do next
4. **Not connected to execution** — changes in strategy didn't flow to changes in work

### What an AI-maintained version fixes

Every one of those problems disappears when AI execs own the blocks:

| BMC Block | Exec Owner | How it stays current |
|-----------|-----------|---------------------|
| Value Propositions | CPO | Updated when features ship, user feedback arrives, or market changes |
| Customer Segments | CPO + CMO | Updated from analytics, user research, campaign data |
| Channels | CMO | Updated from marketing performance, new channel experiments |
| Customer Relationships | CMO + CPO | Updated from support data, retention metrics, feature usage |
| Revenue Streams | CPO | Updated from pricing decisions, new product launches |
| Key Activities | CTO | Updated from pipeline state, what the system is actually building |
| Key Resources | CTO | Updated from infrastructure state, team composition, tool inventory |
| Key Partners | CPO | Updated from integration decisions, vendor relationships |
| Cost Structure | CPO + CTO | Updated from infrastructure costs, API spend, model costs |

Each block becomes a **living summary** — not a sticky note from a workshop but a concise, current description maintained by the exec who owns that domain. When the CPO specs a new feature that changes the value proposition, the value proposition block updates. When the CTO deploys new infrastructure, the key resources block updates.

### How it fits the Command Board

The Business Model View is a **top-level tab** on the Command Board, alongside the Decision Feed and Health Meters:

```
┌─────────────────────────────────────────────────────────────┐
│ [Decisions]  [Business Model]  [Timeline]  [Health]         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Key Partners ──┐  ┌─ Key Activities ─┐  ┌─ Value Prop ─────┐  ┌─ Relationships ─┐  ┌─ Segments ──┐ │
│  │ (CPO)           │  │ (CTO)            │  │ (CPO)             │  │ (CMO + CPO)      │  │ (CPO + CMO) │ │
│  │ Supabase        │  │ Building:        │  │ AI-powered dev    │  │ Terminal-first    │  │ Solo devs   │ │
│  │ Anthropic       │  │  5 features      │  │ pipeline that     │  │ with exec         │  │ Small teams │ │
│  │ OpenAI (STT)    │  │  12 jobs active  │  │ ships software    │  │ conversations     │  │ Agencies    │ │
│  │                 │  │ Maintaining:     │  │ autonomously      │  │                   │  │             │ │
│  │ Updated: 2h ago │  │  orchestrator    │  │                   │  │ Updated: 1d ago   │  │ Updated: 3d │ │
│  └─────────────────┘  └─────────────────┘  └───────────────────┘  └──────────────────┘  └─────────────┘ │
│                                                             │
│  ┌─ Key Resources ─┐  ┌─ Cost Structure ─┐                 │
│  │ (CTO)           │  │ (CPO + CTO)      │  ┌─ Channels ────────┐  ┌─ Revenue ──────┐ │
│  │ 3 persistent    │  │ API: $47/day     │  │ (CMO)              │  │ (CPO)          │ │
│  │  agents (CPO,   │  │ Infra: $12/day   │  │ Terminal (direct)  │  │ Not yet —      │ │
│  │  CTO, CMO)      │  │ Total: ~$59/day  │  │ Slack integration  │  │ pre-revenue,   │ │
│  │ 1 orchestrator  │  │                  │  │ Telegram (planned) │  │ building for    │ │
│  │ Supabase DB     │  │ Updated: today   │  │ Web dashboard      │  │ product-market  │ │
│  │                 │  │                  │  │                    │  │ fit             │ │
│  │ Updated: today  │  │                  │  │ Updated: today     │  │ Updated: 5d     │ │
│  └─────────────────┘  └─────────────────┘  └────────────────────┘  └────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### What makes it useful (unlike the original BMC)

1. **Always current** — execs update their blocks as part of their normal work, not as a separate exercise
2. **Connected to execution** — each block links to the features, jobs, and decisions that affect it
3. **Surfaces drift** — if a block hasn't been updated in weeks, it's flagged. If the value prop has changed but channels haven't adapted, the system notices.
4. **Decision context** — when the CPO generates a strategic decision, the Business Model View provides the "big picture" context. "This decision affects the Value Proposition and Customer Segments blocks."
5. **Founder alignment** — Tom and Chris can see at a glance whether the execs' understanding of the business matches their own. If the CPO's value prop description is wrong, that's a signal.

### Implementation

This is a **Phase 5 addition** to the Strategy Sim, not a separate system. Requirements:
- A `business_model_blocks` table in Supabase (block_type, owner_role, content, last_updated_by, last_updated_at, linked_features[], linked_decisions[])
- Execs prompted to review and update their blocks periodically (session start check, like inbox sweep)
- Command Board tab that renders the 9-block layout
- Staleness detection (warn if a block is >7 days old)
- Change history (what changed, when, why — linked to the decision that caused the update)

Low effort relative to the core sim — the data model is simple and the UI is a grid of text blocks with metadata. The hard part is getting execs to maintain it naturally, which is a prompt engineering problem, not an infrastructure problem.
