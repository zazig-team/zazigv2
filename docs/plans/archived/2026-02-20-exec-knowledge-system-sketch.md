# Exec Knowledge System — Design Sketch

**Date:** 2026-02-20
**Status:** sketch (not yet proposed)
**Depends on:** Personality System (Phase 1), Pipeline (Tasks 1–6)
**Informed by:** [arscontexta recon](../../../zazig/docs/research/2026-02-20-agenticnotetaking-arscontexta.md)

---

## Problem

Zazig execs have personality (who they are) but not domain knowledge (what they know). The CPO has philosophy beliefs like "Validate before building" but no actual frameworks for *how* to validate. The CEO archetype could say "fundraising is about storytelling" but has zero knowledge of YC's playbook, SAFE note mechanics, or investor psychology.

Without a knowledge system, execs are personality skins over a generic LLM. With one, they're domain experts whose advice is grounded in specific, curated sources.

**Example:** A founder asks the CEO to review their pitch deck. Today, the CEO gives generic LLM advice. With the knowledge system, the CEO's response is informed by YC's pitch deck template, specific fundraising claims about what investors look for at seed stage, and patterns from successful decks — all injected contextually because the card is tagged `fundraising`.

---

## Relationship to Personality System

| | Personality | Knowledge |
|---|---|---|
| **Answers** | How the agent behaves | What the agent knows |
| **Data shape** | 9 numeric dimensions + structured beliefs | Corpus of atomic claims with metadata |
| **Size** | Small (~2KB compiled prompt) | Large (hundreds of claims per role, growing) |
| **Injection** | Always-on (every dispatch) | Selective (matched to card context) |
| **Evolution** | Slow, signal-driven, bounded | Grows via explicit ingestion (you feed it sources) |
| **Storage** | `exec_personalities` table | `knowledge_claims` + `knowledge_topics` tables |
| **StartJob field** | `personalityPrompt` | `knowledgeContext` |

Both compile at dispatch time. Both are injected by the orchestrator. The agent never sees the config for either. Same security model, different data source.

---

## Architecture

### Knowledge Graph Structure

Each exec role has a knowledge domain: a flat collection of **atomic claims** organized by **topics**.

```
CEO knowledge domain
├── fundraising/           (topic)
│   ├── "YC recommends raising 18-24 months of runway at seed"
│   ├── "SAFE notes defer valuation to the next priced round"
│   ├── "Investors pattern-match on team, market, traction — in that order"
│   └── ... (20-50 claims per topic)
├── strategy/              (topic)
├── hiring/                (topic)
└── board-management/      (topic)

CPO knowledge domain
├── prioritisation/        (topic)
├── user-research/         (topic)
├── pricing/               (topic)
└── product-market-fit/    (topic)

CTO knowledge domain
├── architecture/          (topic)
├── security/              (topic)
├── scaling/               (topic)
└── developer-experience/  (topic)
```

### Claim Schema

```typescript
interface KnowledgeClaim {
  id: string;
  role_id: string;              // which exec role owns this
  topic: string;                // e.g. "fundraising"
  title: string;                // prose sentence: "YC recommends raising 18-24 months runway at seed"
  description: string;          // ~150 chars, adds info beyond title (for matching)
  body: string;                 // full claim with reasoning, examples, caveats
  source: string | null;        // "YC Startup School, Lecture 4" or null for synthesised
  confidence: "established" | "emerging" | "speculative";
  tags: string[];               // freeform, for cross-topic matching
  related_claims: string[];     // references to other claim IDs (wikilink equivalent)
  created_at: string;
  updated_at: string;
}
```

Key design choices (borrowed from arscontexta, adapted):
- **Prose-sentence titles** — each claim makes one assertion. Enables scanning without reading body.
- **Description as retrieval filter** — adds information beyond the title. The orchestrator matches against title + description, not body.
- **Flat within topic** — no nested hierarchies. Topics are the only grouping. Cross-cutting connections use `related_claims` and `tags`.
- **Source attribution** — every claim traces back to where it came from. Enables "why does the CEO think this?" auditing.

### Topic Schema

```typescript
interface KnowledgeTopic {
  id: string;
  role_id: string;
  name: string;                 // e.g. "fundraising"
  description: string;          // what this topic covers
  claim_count: number;          // denormalised for quick scanning
  keywords: string[];           // for card-to-topic matching
}
```

---

## Injection Flow

```
Card dispatched to exec agent
        │
        ▼
Orchestrator reads card annotations:
  card-type: "fundraising"
  complexity: "medium"
  description: "Review pitch deck for seed round"
        │
        ▼
Topic matching:
  1. Exact match: card-type → topic name ("fundraising" → fundraising topic)
  2. Keyword match: card description keywords → topic keywords
  3. Tag match: card labels → claim tags
        │
        ▼
Claim selection (within matched topics):
  - All claims from matched topics (if topic is small, <20 claims)
  - Top-N by relevance if topic is large (description similarity to card)
  - Always include "established" confidence claims
  - Include "emerging" if complexity >= medium
        │
        ▼
Compile to knowledgeContext:
  Deterministic template, no LLM involved.
  Format: topic header → claim titles + bodies (truncated if over budget)
        │
        ▼
Token budget enforcement:
  knowledgeContext has a hard cap (configurable, default 4000 tokens).
  If over budget: drop speculative claims, then truncate bodies to titles-only,
  then drop lowest-relevance topics.
        │
        ▼
Include in StartJob payload alongside personalityPrompt
        │
        ▼
Local agent prepends both to system prompt:
  [personalityPrompt] + [knowledgeContext] + [card instructions]
```

### Compiled Knowledge Prompt (example)

```markdown
## Domain Knowledge

The following is established knowledge relevant to this task. Apply it directly.

### Fundraising

- **YC recommends raising 18-24 months of runway at seed.** This gives enough
  time for 2-3 pivots if needed. Under 12 months creates desperation; over 24
  months signals lack of ambition to investors.

- **SAFE notes defer valuation to the next priced round.** Simpler than
  convertible notes (no interest, no maturity date). Standard post-money SAFE
  from YC is the default for most seed deals.

- **Investors pattern-match on team, market, traction — in that order at seed.**
  At seed, team is 60% of the decision. By Series A, traction dominates.
  Optimise pitch deck order accordingly.

[3 more claims...]
```

---

## Knowledge Ingestion

How knowledge gets into the system. Three modes:

### 1. Curated by zazig team (shipped with product)

Zazig ships starter knowledge packs per role. Like archetypes but for knowledge.

```
Starter packs:
  CEO: YC playbook, a16z guides, fundraising basics, hiring frameworks
  CPO: RICE/ICE scoring, Jobs-to-be-Done, sprint planning, user research methods
  CTO: OWASP top 10, 12-factor app, scaling patterns, incident response
  CMO: funnel frameworks, channel playbooks, positioning (April Dunford)
```

These are rows in `knowledge_claims` with `source` attribution. Shipped as seed migrations, same pattern as archetype seeds.

### 2. Founder-provided sources (org-specific)

Founders feed the system their own material:

```
zazig knowledge ingest --role ceo --topic fundraising --source "path/to/yc-lecture-notes.md"
```

The ingestion pipeline:
1. Source text → LLM extraction → atomic claims (title, description, body, source)
2. Claims reviewed by founder (approve/reject/edit) — no auto-publish
3. Approved claims inserted into `knowledge_claims` for that org + role

This is where arscontexta's `/reduce` pattern applies — extract atomic claims from a source document. But the extraction is a batch job, not a real-time agent operation.

### 3. Agent-discovered (from card execution)

When an exec discovers something useful during card execution, the orchestrator can capture it as a candidate claim:

```
Orchestrator detects: CTO wrote "Note: Supabase RLS policies must use
security definer functions for cross-table joins" in a card deliverable.
        │
        ▼
Creates candidate claim (status: "pending_review")
        │
        ▼
Surfaces in founder dashboard for approval
        │
        ▼
If approved → promoted to knowledge_claims with confidence: "emerging"
```

This is the friction/observation capture pattern from arscontexta, scoped to knowledge discovery. No autonomous publishing — founder approves.

---

## Storage

### Supabase Tables

```sql
-- Topics per role per org
create table knowledge_topics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  role_id uuid references exec_roles(id),
  name text not null,
  description text,
  keywords text[] default '{}',
  created_at timestamptz default now(),
  unique (company_id, role_id, name)
);

-- Atomic claims
create table knowledge_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  role_id uuid references exec_roles(id),
  topic_id uuid references knowledge_topics(id),
  title text not null,
  description text not null,
  body text not null,
  source text,
  confidence text check (confidence in ('established', 'emerging', 'speculative')),
  tags text[] default '{}',
  related_claims uuid[] default '{}',
  status text check (status in ('active', 'pending_review', 'archived')) default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for topic matching at dispatch time
create index idx_claims_role_topic on knowledge_claims(company_id, role_id, topic_id)
  where status = 'active';

-- Index for keyword/tag matching
create index idx_claims_tags on knowledge_claims using gin(tags)
  where status = 'active';
```

### Local Agent Cache

Same pattern as personality cache:
- Refreshed on Supabase connection
- Read-only locally
- Stale-tolerant (use last-known if Supabase briefly unreachable)
- Cache is per-role topic index + claim titles/descriptions (not full bodies — fetched on demand at dispatch)

---

## Token Economics

| Component | Budget | Notes |
|-----------|--------|-------|
| Personality prompt | ~800-1200 tokens | Always injected |
| Knowledge context | 2000-4000 tokens (configurable) | Selectively injected per card |
| Card instructions | ~500-1000 tokens | From Trello card |
| **Total injection** | **~3500-6000 tokens** | Leaves >90% of context for agent work |

The knowledge budget is the key constraint. At 4000 tokens, you can inject ~15-20 full claims or ~50 title-only claims. Topic matching + relevance ranking keeps this focused.

---

## Phases

### Phase 1: Foundation (after personality ships)
- Schema migrations (knowledge_topics, knowledge_claims)
- Claim CRUD in orchestrator
- Topic matching at dispatch (exact match on card-type → topic name)
- `knowledgeContext` field in StartJob
- Local agent reads and prepends
- CLI: `zazig knowledge list --role ceo`, `zazig knowledge show <claim-id>`
- Seed data: 10-15 starter claims per role (hand-written, not ingested)

### Phase 2: Ingestion pipeline
- Source ingestion CLI: `zazig knowledge ingest --role ceo --source file.md`
- LLM-based atomic claim extraction from source documents
- Founder review/approve workflow (CLI or dashboard)
- Agent-discovered claim capture (candidate → pending_review → approved)

### Phase 3: Smart matching
- Keyword + semantic matching (card description → claim descriptions)
- Cross-role knowledge sharing (CTO claim relevant to CPO card)
- Knowledge gap detection (cards where no claims matched → signal to ingest more)
- Analytics: which claims get injected most, which never fire

---

## Open Questions

1. **Shared vs per-org claims?** Starter packs are shared (shipped by zazig). Org-specific claims are per-org. Can orgs contribute claims back to shared packs? Probably not in v1.
2. **Claim conflicts?** What if two claims in the same topic contradict? Include both and let the agent reason about the tension? Or require founder to resolve? Lean toward including both with explicit "Note: tension between X and Y" in compiled prompt.
3. **Knowledge decay?** Claims about fast-moving domains (e.g., "current YC SAFE template") go stale. Add `reviewed_at` field and surface stale claims for periodic review?
4. **Cross-role visibility?** Should the CPO be able to see/use CTO knowledge claims? Probably yes for read, no for auto-injection. Explicit cross-role injection only when card explicitly involves multiple domains.

---

*Sketch informed by [arscontexta recon](../../../zazig/docs/research/2026-02-20-agenticnotetaking-arscontexta.md). Key patterns borrowed: atomic claims with prose-sentence titles, description-as-retrieval-filter, topic clustering, progressive disclosure, source attribution. Key adaptation: orchestrator-side injection (not agent-side traversal), founder-gated ingestion (not autonomous learning), Supabase storage (not filesystem).*
