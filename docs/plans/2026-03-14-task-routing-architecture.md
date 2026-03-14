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

## Skills Marketplace Integration

External marketplaces like [Agency Agents](https://github.com/msitarzewski/agency-agents) provide 128+ pre-crafted agent personalities across 11 divisions (Engineering, Design, Marketing, Sales, Product, PM, Testing, Support, Spatial Computing, Specialised). These map directly to expert role prompts.

**Implementation**: Expert role `prompt` field gets sourced/adapted from marketplace agents. The `skills` array on expert_roles can reference marketplace skill IDs. Skills are hot-swappable — update the prompt, next dispatch uses the new version.

## Autonomous / Proactive Work

Three patterns for self-starting work:

### Pattern 1: Scheduled Sweeps (Cron-Driven)

```
Every Monday:    CMO → "content-calendar-review" → generates week's content plan
Every morning:   CRO → "pipeline-health-check" → flags at-risk conversions
Monthly:         CFO → "burn-rate-analysis" → generates financial summary
Post-sprint:     CPO → "improvement-scan" → suggests refinements to shipped features
```

Implementation: `proactive_schedules` in domain_pipelines config. Orchestrator dispatches expert sessions on schedule — same mechanism as auto-triage, just time-triggered.

### Pattern 2: Event-Driven Reactions (Webhook/Monitoring)

```
PR merged       → CRO: "update changelog for customers"
Sprint done     → CMO: "draft release announcement"
Runway < 6mo    → CFO: "flag to CEO, draft fundraising prep"
NPS drops       → CPO: "investigate, create improvement ideas"
```

Implementation: Monitoring agents push ideas into the inbox with pre-classified domains (`source = 'monitoring'`). The routing layer handles the rest.

### Pattern 3: Self-Generating Loops (Agent-Initiated Ideas)

```
CMO analyses competitors weekly    → generates marketing ideas → inbox
CRO analyses usage data            → identifies upsell opportunities → inbox
CTO reviews tech debt              → proposes refactoring → inbox
CPO reviews shipped features       → suggests improvements → inbox
```

The auto-triage + auto-spec pipeline already handles agent-originated ideas (`source = 'agent'`). Exec agents just need a proactive loop that runs analysis, generates ideas, and pushes them into the inbox.

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

### Phase 2: Domain Pipelines Table + Generalised Auto-Advance
- Create `domain_pipelines` table
- Refactor orchestrator auto-spec into generic "auto-advance" per pipeline stage
- Each domain defines its own stages and advance rules

### Phase 3: CMO + Marketing Pipeline + Marketplace Skills
- Add CMO persistent agent
- Define marketing pipeline stages
- Import first marketplace skills as expert roles (content-strategist, seo-specialist)
- First proactive loop: weekly competitor scan

### Phase 4: Proactive Loops Infrastructure
- Add scheduled expert session dispatch to orchestrator
- Event-driven idea generation (monitoring → inbox)
- Self-generating loops for each active domain

### Phase 5: CEO as Cross-Domain Coordinator
- CEO persistent agent watches for `cross-cutting` and `strategy` ideas
- Decomposition logic: one idea → multiple domain-specific ideas
- Cross-domain initiative tracking

### Phase 6: CFO + CRO
- Finance pipeline + expert roles
- Revenue/growth pipeline + expert roles
- Proactive loops for financial monitoring and growth experiments

### Phase 7: UI — Domain Pipeline Views
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

## Summary

The core insight: **one inbox, many pipelines**. The orchestrator routes by domain. Each domain exec owns their pipeline, expert roles, and proactive loops. Skills from marketplaces equip the workers. The orchestrator stays deterministic. Cross-cutting work flows through CEO. The existing primitives (ideas table, expert_roles, auto-triage, orchestrator dispatch) support this with surprisingly few changes.
