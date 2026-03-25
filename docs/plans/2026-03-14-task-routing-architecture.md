# Task Routing Architecture: Multi-Domain Pipeline Model

**Date**: 2026-03-14
**Status**: Draft v1
**Author**: Tom + Claude

## Problem Statement

The current zazig pipeline is engineering-centric: idea → triage → spec → breakdown → build → review → ship. Every idea funnels through this single pipe. But scaling to a full C-suite (CTO, CMO, CFO, CRO, CEO) means supporting fundamentally different workflows — a CMO needs campaigns and content calendars, not specs and code reviews. A CFO needs financial models, not breakdown specialists.

**The question isn't "how do we put marketing through the engineering pipeline" — it's "how do we let each domain run its own pipeline while sharing the same orchestrator and ideas inbox."**

## Three-Layer Organisational Model

Inspired by the Spotify model (squads/guilds/tribes) adapted for AI agents:

```
LAYER 1: DOMAIN ROUTING (Orchestrator — deterministic)
┌─────────────────────────────────────────────────────────┐
│  Ideas Inbox (any source: slack, agent, web, monitoring)│
│                      ↓                                  │
│              Domain Triage                              │
│     ┌────────┬────────┬────────┬────────┬──────┐       │
│     ↓        ↓        ↓        ↓        ↓      ↓       │
│   Product  Engrg   Marketing Finance  Revenue Strategy  │
└─────────────────────────────────────────────────────────┘

LAYER 2: DOMAIN EXECUTIVES (Persistent Agents)
┌─────────┬─────────┬─────────┬─────────┬─────────┬──────┐
│  CPO    │  CTO    │  CMO    │  CFO    │  CRO    │ CEO  │
│ Product │ Engrg   │ Mktg   │ Finance │ Revenue │ Strat │
│ Pipeline│ Pipeline│ Pipeline│ Pipeline│ Pipeline│ Coord │
└─────────┴─────────┴─────────┴─────────┴─────────┴──────┘

LAYER 3: DOMAIN WORKERS (Ephemeral Specialists)
┌──────────────────────────────────────────────────────────┐
│  Equipped with skills from marketplaces + custom skills  │
│  spec-writer, campaign-strategist, financial-analyst,    │
│  content-creator, seo-specialist, pricing-analyst, ...   │
└──────────────────────────────────────────────────────────┘
```

## Domain Pipelines

Each domain exec owns a pipeline with domain-specific stages. The orchestrator doesn't need to understand the semantics — it just auto-advances based on config.

### CPO (Product) — current pipeline
```
idea → triage → spec → breakdown → build → review → ship
```

### CTO (Engineering) — infrastructure pipeline
```
idea → triage → architecture-review → implement → test → deploy
```
Owns: tech debt, infrastructure, architecture decisions, platform reliability, developer experience.

### CMO (Marketing) — campaign pipeline
```
idea → research → strategy → content-plan → create → review → publish → measure
```
Owns: brand, content, social, SEO, paid media, market positioning.

### CFO (Finance) — analysis pipeline
```
idea → data-gather → model → review → report → present
```
Owns: runway modelling, burn rate, financial reporting, expense tracking, fundraising prep.

### CRO (Revenue) — growth pipeline
```
idea → hypothesis → experiment-design → implement → measure → iterate
```
Owns: pricing, conversion, retention, sales enablement, growth experiments.

### CEO (Strategy) — coordination pipeline
```
idea → research → analysis → proposal → review → decide → delegate-to-domain
```
Owns: cross-domain coordination, strategic initiatives, investor relations, fundraising, hiring strategy.

## Routing Mechanism

### Domain Classification

The ideas table already has a `domain` field. Extend the enum:

```
Current:  product | engineering | marketing | cross-cutting | unknown
Extended: + finance | revenue | strategy | operations
```

### Routing Rules (Deterministic, in Orchestrator)

| Domain | Routes To | Pipeline |
|--------|-----------|----------|
| `product` | CPO | Product pipeline |
| `engineering` | CTO | Engineering pipeline |
| `marketing` | CMO | Campaign pipeline |
| `finance` | CFO | Analysis pipeline |
| `revenue` | CRO | Growth pipeline |
| `strategy` | CEO | Coordination pipeline |
| `cross-cutting` | CEO | CEO triages → multiple domains |

The triage-analyst expert role gets an expanded prompt to classify into the new domains. Everything else in the orchestrator stays deterministic.

## Domain Executive Pattern

Each C-suite exec is a persistent agent (generalising the existing CPO pattern) with:

| Property | Description |
|----------|-------------|
| **Pipeline stages** | Domain-specific status progressions |
| **Expert roles** | Domain-specific ephemeral workers |
| **Skills** | Equipped from marketplace + custom |
| **Proactive loops** | Autonomous monitoring patterns |
| **Slot allocation** | Dedicated slots per domain |

### New Table: `domain_pipelines`

```sql
CREATE TABLE domain_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  domain TEXT NOT NULL,           -- 'product', 'marketing', etc.
  exec_role TEXT NOT NULL,        -- 'cpo', 'cmo', etc.
  stages JSONB NOT NULL,          -- ordered list of pipeline stages
  auto_advance BOOLEAN DEFAULT false,
  proactive_schedules JSONB,     -- cron-based autonomous work
  UNIQUE(company_id, domain)
);
```

### Expert Roles Per Domain

The existing `expert_roles` table already supports this — just insert more rows:

```
Domain: Marketing (CMO)
├── content-strategist     ← writes content plans, blog posts, social copy
├── seo-specialist         ← keyword research, on-page optimisation
├── campaign-planner       ← paid media strategy, budget allocation
├── social-manager         ← platform-specific content, engagement
├── market-researcher      ← competitor analysis, market trends
└── brand-strategist       ← positioning, messaging, brand voice

Domain: Finance (CFO)
├── financial-analyst      ← runway models, burn rate analysis
├── expense-auditor        ← cost optimisation, vendor review
└── fundraising-analyst    ← investor research, deck preparation

Domain: Revenue (CRO)
├── growth-hacker          ← experiment design, conversion optimisation
├── pricing-analyst        ← pricing model analysis, competitive pricing
├── sales-engineer         ← technical sales support, demo prep
└── churn-analyst          ← retention analysis, risk identification
```

## Two Types of Domain Workers

Within each domain there are fundamentally **two types of workers**, and the plan must handle them differently:

### Type 1: Pipeline Workers (Reactive, Dispatched)

These are the workhorses dispatched by the orchestrator when work reaches a specific pipeline stage. They are the domain equivalent of junior/senior engineers in the engineering pipeline.

```
Engineering domain (current):
  build stage → junior-engineer (simple) or senior-engineer (medium/complex)

Marketing domain (new):
  create stage → content-writer (blog) or social-manager (social) or seo-specialist (seo)
  research stage → market-researcher (competitor) or market-researcher (user)

Revenue domain (new):
  experiment stage → growth-hacker (conversion) or pricing-analyst (pricing)
```

**The routing problem**: Engineering routes by a single axis (complexity → role). Other domains need multi-axis routing — a marketing "create" task could be a blog post, a social campaign, or an SEO audit. Complexity alone doesn't determine the right worker.

### Type 2: Autonomous Workers (Proactive, Self-Starting)

These workers run on schedules or event triggers. They monitor, research, and generate ideas that feed back into the ideas inbox. They are *not* dispatched by the pipeline — they generate work *for* the pipeline.

```
Marketing domain:
  competitor-scanner    — weekly scan of competitor websites/social → ideas
  trend-watcher         — monitors industry trends → ideas
  content-auditor       — analyses existing content gaps → ideas

Revenue domain:
  churn-monitor         — watches usage patterns → flags at-risk accounts → ideas
  pricing-scanner       — monitors competitor pricing → ideas
  conversion-tracker    — identifies drop-off points → ideas

Finance domain:
  burn-rate-monitor     — tracks spend vs forecast → alerts/ideas
  vendor-auditor        — reviews recurring costs → optimisation ideas
```

These are distinct from pipeline workers because:
1. They are not triggered by pipeline stage transitions
2. They generate ideas rather than processing them
3. They need their own scheduling/trigger infrastructure
4. They may run even when the domain pipeline has no active work

## Intra-Domain Routing: Generalising `complexity_routing`

### Current State: Single-Axis Routing

The existing `complexity_routing` table maps one dimension:

```
complexity_routing:
  simple  → junior-engineer (codex)
  medium  → senior-engineer (sonnet)
  complex → senior-engineer (opus)
```

This works for engineering where complexity is the primary routing signal. But it's insufficient for domains where the *type of work* matters more than its complexity.

### Target State: Multi-Axis Routing Table

Generalise to a `stage_routing` table that supports multiple routing dimensions per domain pipeline stage:

```sql
CREATE TABLE stage_routing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  domain TEXT NOT NULL,              -- 'engineering', 'marketing', etc.
  stage TEXT NOT NULL,               -- pipeline stage this applies to ('build', 'create', etc.)

  -- Routing axes (all nullable — match on non-null axes)
  complexity TEXT,                   -- 'simple' | 'medium' | 'complex'
  task_type TEXT,                    -- 'blog' | 'social' | 'seo' | 'email' | etc.

  -- Resolution
  expert_role_id UUID NOT NULL REFERENCES expert_roles(id),
  priority INT DEFAULT 0,           -- higher = preferred when multiple rows match

  UNIQUE(company_id, domain, stage, complexity, task_type)
);
```

### How It Works

**Engineering (backwards-compatible with current behaviour):**
```
domain=engineering, stage=build, complexity=simple  → junior-engineer
domain=engineering, stage=build, complexity=medium  → senior-engineer
domain=engineering, stage=build, complexity=complex → senior-engineer (opus)
domain=engineering, stage=review, complexity=*      → reviewer
```

**Marketing:**
```
domain=marketing, stage=create, task_type=blog      → content-writer
domain=marketing, stage=create, task_type=social    → social-manager
domain=marketing, stage=create, task_type=seo       → seo-specialist
domain=marketing, stage=create, task_type=email     → email-copywriter
domain=marketing, stage=research, task_type=*       → market-researcher
domain=marketing, stage=review, complexity=*        → brand-strategist
```

**Revenue:**
```
domain=revenue, stage=experiment, task_type=pricing    → pricing-analyst
domain=revenue, stage=experiment, task_type=conversion → growth-hacker
domain=revenue, stage=experiment, task_type=retention  → churn-analyst
domain=revenue, stage=measure, task_type=*             → growth-hacker
```

### Where Does `task_type` Come From?

During triage (or domain-specific auto-triage), the triage-analyst classifies the idea with both `complexity` and a new `task_type` field. This is analogous to how the current triage-analyst already sets `complexity` and `card-type` — we just formalise `task_type` as a routing-relevant field.

```sql
-- Add to ideas table
ALTER TABLE ideas ADD COLUMN task_type TEXT;
-- Values are domain-specific and freeform, validated by stage_routing matches
```

The domain exec (or their triage specialist) is responsible for setting `task_type` as ideas enter their pipeline. The orchestrator then does a deterministic lookup: `(domain, stage, complexity, task_type) → expert_role`.

### Fallback Chain

When no exact match exists, the orchestrator falls back:
1. Match on all axes (domain + stage + complexity + task_type)
2. Match on (domain + stage + task_type) — ignore complexity
3. Match on (domain + stage + complexity) — ignore task_type
4. Match on (domain + stage) alone — catch-all for the stage
5. No match → flag for domain exec to handle manually

This keeps the orchestrator deterministic while giving each domain rich routing control.

### Migration Path from `complexity_routing`

The existing `complexity_routing` table becomes a special case of `stage_routing`:
```
complexity_routing(simple, junior-engineer)
  → stage_routing(engineering, build, simple, NULL, junior-engineer)
```

We can migrate existing rows and deprecate the old table.

## Autonomous Worker Infrastructure

Autonomous workers are a distinct subsystem from pipeline dispatch. They need their own table and scheduling.

### New Table: `autonomous_workers`

```sql
CREATE TABLE autonomous_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  expert_role_id UUID NOT NULL REFERENCES expert_roles(id),

  -- Trigger configuration (one of these must be set)
  schedule TEXT,                    -- cron expression: '0 9 * * MON' (every Monday 9am)
  event_trigger TEXT,               -- event name: 'feature_shipped', 'sprint_complete', etc.

  -- Behaviour
  brief_template TEXT NOT NULL,     -- prompt template, may include {{variables}}
  output_mode TEXT NOT NULL DEFAULT 'ideas',  -- 'ideas' | 'report' | 'alert'
  enabled BOOLEAN DEFAULT true,

  -- Rate limiting
  min_interval_minutes INT DEFAULT 60,
  last_run_at TIMESTAMPTZ,

  UNIQUE(company_id, name)
);
```

### Output Modes

| Mode | Behaviour |
|------|-----------|
| `ideas` | Worker generates ideas, pushes them into the ideas inbox with `source='agent'` and pre-classified domain. They enter the normal triage pipeline. |
| `report` | Worker generates a report/analysis. Stored as an artifact, surfaced to domain exec. Does not create ideas unless the exec decides to act. |
| `alert` | Worker detects a threshold/anomaly. Creates a high-priority idea flagged for immediate attention. |

### Example Configurations

```yaml
# CMO domain autonomous workers
- name: competitor-scanner
  domain: marketing
  role: market-researcher
  schedule: "0 9 * * MON"           # Every Monday 9am
  brief: "Scan competitor websites and social channels for {{company_name}}.
          Identify new features, campaigns, and positioning changes.
          Generate ideas for competitive responses."
  output_mode: ideas

- name: content-gap-auditor
  domain: marketing
  role: seo-specialist
  schedule: "0 10 1 * *"            # 1st of every month
  brief: "Analyse our published content against target keywords.
          Identify gaps and opportunities. Generate content ideas."
  output_mode: ideas

# CRO domain autonomous workers
- name: churn-risk-monitor
  domain: revenue
  role: churn-analyst
  event_trigger: usage_drop_detected
  brief: "Usage dropped for {{account_name}}. Analyse patterns,
          identify risk level, recommend retention actions."
  output_mode: alert

# CFO domain autonomous workers
- name: burn-rate-tracker
  domain: finance
  role: financial-analyst
  schedule: "0 8 * * *"             # Every morning
  brief: "Calculate current burn rate, compare to forecast.
          Flag if runway projection changes by >1 month."
  output_mode: report
```

### Orchestrator Integration

The orchestrator gets a new phase in its 10-second loop:

```
Existing phases:
  1. Refresh cache
  2. Recover stale triaging
  3. Auto-triage new ideas
  4. Recover stale developing
  5. Auto-spec triaged ideas
  6. Continue spec chains
  7. Dispatch jobs
  ...

New phase (insert after auto-spec):
  6b. Check autonomous worker schedules
      - For each worker where enabled=true:
        - If schedule-based: is it past the next cron tick + min_interval?
        - If event-based: has the event fired since last_run_at?
      - Dispatch matching workers as headless expert sessions
      - Update last_run_at
```

Same dispatch mechanism as auto-triage — headless expert sessions on available slots. The only difference is the trigger (schedule/event vs new-idea-arrived).

## Skills Marketplace Integration

External marketplaces like [Agency Agents](https://github.com/msitarzewski/agency-agents) provide 128+ pre-crafted agent personalities across 11 divisions (Engineering, Design, Marketing, Sales, Product, PM, Testing, Support, Spatial Computing, Specialised).

These map to both worker types:

| Marketplace Agent | Zazig Worker Type | Domain |
|-------------------|-------------------|--------|
| SEO Content Strategist | Pipeline (create stage) | Marketing |
| Social Media Strategist | Pipeline (create stage) | Marketing |
| Market Intelligence Analyst | Autonomous (weekly scan) | Marketing |
| Growth Strategist | Pipeline (experiment stage) | Revenue |
| Strategic Outbound Specialist | Pipeline (outreach stage) | Revenue |
| Financial Compliance Analyst | Autonomous (monthly audit) | Finance |
| Brand Identity Architect | Pipeline (review stage) | Marketing |
| Technical Sales Engineer | Pipeline (demo stage) | Revenue |

**Implementation**: Expert role `prompt` field gets sourced/adapted from marketplace agents. The `skills` array on expert_roles can reference marketplace skill IDs. Skills are hot-swappable — update the prompt, next dispatch uses the new version. Each marketplace agent gets classified as pipeline or autonomous based on whether it processes existing work or generates new work.

## Cross-Domain Coordination

### Case 1: Feature Launch (Product + Marketing + Revenue)
```
CPO ships feature → creates cross-cutting idea: "Launch feature X"
  → CEO routes to: CMO (announce), CRO (enable sales), CPO (docs)
  → Each exec runs their domain pipeline independently
  → CEO tracks completion across domains
```

### Case 2: Strategic Initiative (CEO-Driven)
```
CEO: "Enter enterprise market"
  → Creates ideas in multiple domains simultaneously:
     CPO: "Enterprise feature gap analysis"
     CMO: "Enterprise marketing strategy"
     CRO: "Enterprise sales playbook"
     CFO: "Enterprise pricing model"
  → Each runs independently, CEO synthesises
```

### Case 3: Escalation (Any Domain → CEO)
```
Any exec encounters cross-cutting blocker
  → Escalates to CEO (idea with domain='strategy')
  → CEO mediates and creates follow-up ideas in relevant domains
```

## UI Impact: Decouple Ideas from Engineering Pipeline

### Current State
The pipeline board shows: Ideas Inbox → Triage → Proposal → [engineering columns...]

### Target State
- **Ideas page** (already built): Universal inbox across all domains. Shows domain classification. Entry point for all ideas regardless of destination.
- **Pipeline board**: Shows only domain-specific pipeline columns. Each domain gets its own board view (or tab). Engineering pipeline starts at "Ready for Breakdown" not "Ideas Inbox".
- **Domain selector**: Toggle between domain pipelines in the UI.

This is straightforward because:
1. Ideas page already exists separately
2. Pipeline columns for Ideas Inbox, Triage, and Proposal just get hidden from the engineering board
3. Each domain pipeline gets its own set of columns

## Spotify Model Mapping

| Spotify | Zazig |
|---------|-------|
| **Tribe** | Domain (Product, Marketing, Finance...) |
| **Squad** | Cross-domain initiative (CEO-coordinated) |
| **Chapter** | Expert role type across domains (analysts, strategists) |
| **Guild** | Skill marketplace category (Agency divisions) |
| **Chapter Lead** | Domain executive (CPO, CMO, etc.) |

## Implementation Phases

### Phase 1: Foundation — Add CTO as Second Domain Exec
- Split `engineering` ideas away from CPO to CTO
- CTO gets own persistent agent slot
- Proves the multi-exec pattern works
- Minimal orchestrator changes (just routing by domain)

### Phase 2: `stage_routing` Table — Generalise Intra-Domain Routing
- Create `stage_routing` table
- Migrate existing `complexity_routing` rows into `stage_routing`
- Add `task_type` to ideas table
- Update orchestrator dispatch to use new routing table
- Backwards-compatible: engineering routing works identically, just via new table

### Phase 3: Domain Pipelines Table + Generalised Auto-Advance
- Create `domain_pipelines` table
- Refactor orchestrator auto-spec into generic "auto-advance" per pipeline stage
- Each domain defines its own stages and advance rules

### Phase 4: CMO + Marketing Pipeline + Marketplace Skills
- Add CMO persistent agent
- Define marketing pipeline stages
- Import first marketplace skills as expert roles (content-writer, seo-specialist)
- Configure `stage_routing` for marketing stages (create → content-writer/social-manager/etc.)

### Phase 5: Autonomous Worker Infrastructure
- Create `autonomous_workers` table
- Add schedule/event check phase to orchestrator loop
- First autonomous worker: competitor-scanner for CMO domain
- Self-generating loops: autonomous workers push ideas into inbox

### Phase 6: CEO as Cross-Domain Coordinator
- CEO persistent agent watches for `cross-cutting` and `strategy` ideas
- Decomposition logic: one idea → multiple domain-specific ideas
- Cross-domain initiative tracking

### Phase 7: CFO + CRO
- Finance pipeline + expert roles + stage routing
- Revenue/growth pipeline + expert roles + stage routing
- Autonomous workers for financial monitoring and growth experiments

### Phase 8: UI — Domain Pipeline Views
- Hide Ideas Inbox / Triage / Proposal from engineering board
- Add domain selector / tabs for pipeline views
- Each domain shows its own pipeline columns
- Ideas page becomes the universal entry point

## Open Questions

1. **Slot allocation across domains**: Fixed per-domain? Shared pool? Priority-based?
2. **Domain exec hosting**: All on one machine? Distributed? Does each need dedicated machine?
3. **MCP tools per domain**: Marketing execs need different tools (analytics APIs, social APIs, CMS). How do we provision these?
4. **Cross-domain dependencies**: Beyond CEO coordination, do we need explicit dependency tracking between domain pipelines?
5. **Domain exec model selection**: All Opus? Or lighter models for lower-stakes domains?
6. **Skill marketplace curation**: Import all 128 agents? Or curate per-company?
7. **Autonomous worker slot contention**: Should autonomous workers have their own slot pool, or compete with pipeline workers? (Probably: lower priority, only use idle slots, with a reserved minimum for time-sensitive monitors.)
8. **`task_type` taxonomy**: Freeform per-domain? Or a curated enum per domain pipeline? (Probably: freeform initially, evolve to validated sets as domains mature.)
9. **Autonomous worker observability**: How do we surface what autonomous workers discovered vs what got triaged into the pipeline? Need a dashboard or report view.

## Summary

Three core insights:

1. **One inbox, many pipelines.** The orchestrator routes ideas by domain to domain-specific pipelines, each owned by a persistent exec agent.

2. **Two types of workers, not one.** Pipeline workers are reactive — dispatched when work hits their stage, routed by multi-axis `stage_routing` (complexity + task_type → expert_role). Autonomous workers are proactive — scheduled or event-triggered, they monitor, research, and generate ideas that feed back into the inbox.

3. **The orchestrator stays dumb.** All routing is config-driven and deterministic. Domain pipelines, stage routing, and autonomous worker schedules are all DB tables. The LLM reasoning happens in the exec agents and workers, never in the orchestrator.

The existing primitives (ideas table with domain field, expert_roles, auto-triage, orchestrator dispatch loop) support this with surprisingly few new tables: `domain_pipelines`, `stage_routing`, and `autonomous_workers`.
