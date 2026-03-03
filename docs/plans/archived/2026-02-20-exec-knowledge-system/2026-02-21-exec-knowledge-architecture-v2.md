# Exec Knowledge Architecture — Design Document (v2)

**Date:** 2026-02-21
**Status:** proposed
**Authors:** Tom (owner), CPO (agent)
**Supersedes:** `2026-02-21-exec-knowledge-architecture.md` (v1), `2026-02-20-exec-knowledge-system-sketch.md` (sketch)
**Reviewed by:** Codex (gpt-5.3-codex, xhigh reasoning), Gemini (gemini-3.1-pro-preview) — on both v1 architecture and v2 doctrine/canon split
**Informed by:** Four independent deep research reports on agent domain knowledge and expertise (Claude, Gemini, OpenAI, last30days scan — all dated 2026-02-21)

---

## Problem

Zazig execs have personality (who they are) and role prompts (what they do). They don't have domain knowledge (what they know). Without a knowledge system, the CPO can say "validate before building" but has no frameworks for *how* to validate. The CEO can say "fundraising is about storytelling" but knows nothing about SAFE mechanics, YC playbooks, or investor psychology.

The v1 design proposed a single "Knowledge Lenses" system with atomic claims. This v2 splits that into two fundamentally different systems based on a key insight: **executive knowledge has two distinct types with different architectures, retrieval patterns, and ingestion pipelines.**

---

## Core Innovation: Two Knowledge Systems

Skills are capability signposts — lightweight metadata in context, full instructions on demand. Knowledge needs TWO equivalent systems because what an exec *believes* (professional judgment) is architecturally different from what an exec has *studied* (reference material).

### The Triad

> **Skills** teach agents how to *work* (procedural capability).
> **Doctrines** teach agents what they *believe* (role-specific professional judgment).
> **Canons** teach agents what they've *studied* (shared reference knowledge).

**Canons inform Doctrines which guide how agents apply Skills.**

### Why Two Systems, Not One

Codex and Gemini independently agreed: this split is strictly necessary.

| | Doctrines | Canons |
|---|---|---|
| **What they are** | Role-specific beliefs, heuristics, frameworks, policies | Shared factual reference knowledge |
| **Who owns them** | Each exec role (CPO, CTO, CMO, CEO) | The company — all execs access them |
| **Size** | Small, curated: 10-30 claims per lens, ~200 tokens each | Massive: 30 books = millions of tokens |
| **Can they contradict?** | Yes — productively. CPO vs CTO is the value. | No — source disagreements are data quality issues |
| **Authority weights** | Yes — per-domain epistemic authority | No — facts are facts |
| **Human QA** | On the OUTPUT (founder reviews extracted claims) | On the INPUT (founder approves the source) |
| **Proactive injection** | Heavy (~1000-2000 tokens) | Light (~100-400 tokens, mostly pointers) |
| **Retrieval pattern** | Mostly proactive, some reactive | Mostly reactive, minimal proactive |
| **LLM role in prompt** | Instructions/behavior — dictates reasoning | Context/data — provides grounding |

The critical architectural reason (from Gemini): if you put doctrines and canons in the same system, the LLM struggles to distinguish between a CTO's hard rule ("Never use AWS") and a canon book explaining how to configure AWS. Separation guarantees behavioral rules are weighted over retrieved facts.

---

## Design Principles

Seven principles, drawn from the research synthesis, two architecture reviews, and the v2 deep dive:

**1. Progressive disclosure is the universal pattern.** Both doctrines and canons use tiered progressive disclosure, but with different tier structures. 30 tokens of metadata pointing to 5,000 words outperforms loading 5,000 words every time.

**2. Proactive + reactive beats either alone.** Doctrines lean proactive (inject beliefs the agent should reason with). Canons lean reactive (agent searches when it needs reference material). Both support both modes.

**3. Knowledge is not just facts — it's beliefs, heuristics, and frameworks.** This is why doctrines exist as a separate system. An executive doesn't just retrieve "our CAC is $47." They apply the heuristic "if CAC > 3-month LTV, channel is unprofitable." Doctrines capture this judgment layer.

**4. Contradictions are features, not bugs.** Doctrines contradict productively. Canons don't. This distinction drives the architectural split.

**5. Prove retrieval quality before building intelligence.** Ship Tier 1-2-3 progressive disclosure and eval first. Curator intelligence, knowledge graph automation, and archetypes are Phase 3+.

**6. The agent knows it has knowledge but never sees the config.** Same security model as personality: the orchestrator compiles knowledge into a prompt fragment at dispatch time.

**7. Human QA on output for doctrines, on input for canons.** Founders review individual doctrine claims. Founders approve canon sources. Different quality assurance for different knowledge types.

---

## Part I: Doctrines

### What Doctrines Are

A doctrine is a role-specific body of curated, opinionated expertise. It contains the heuristics, frameworks, policies, and key facts that define an exec's professional judgment.

The CPO's pricing doctrine contains heuristics like "if CAC > 3-month LTV, kill the channel." The CTO's security doctrine contains policies like "zero-trust from day one." These are beliefs — they can be wrong, they can contradict other roles' beliefs, and that tension is productive.

### Doctrine Lenses

Each doctrine is organized into lenses — curated windows into a domain of expertise using three-tier progressive disclosure.

```
Tier 1: Lens Index (always loaded, ~30-50 tokens per lens)
  "fundraising: Seed-stage fundraising — SAFEs, pitch decks, investor psychology"
  "user-research: Validating product decisions — JTBD, surveys, usability testing"

  Purpose: Agent knows WHAT it has doctrine in. Pure pointers, not reasoning.

Tier 2: Lens Map (loaded per-task, ~200-500 tokens per lens)
  Claim titles (one-line pointers, not summaries)
  Cross-references to related lenses + canon references
  Doctrine health indicators

  Purpose: Agent sees the SHAPE of relevant doctrine. Still pointers.

Tier 3: Claim Bodies (loaded on demand, ~100-300 tokens each)
  Full reasoning, examples, caveats, sources, decision frameworks
  Agent MUST fetch Tier 3 before making high-stakes recommendations.

  Purpose: Deep expertise when the agent actually needs to reason.
```

**Critical constraint (from Codex review):** Tier 1 and Tier 2 are *pointers only* — never compressed reasoning. Compressed reasoning at Tier 1/2 causes semantic drift where the agent confidently applies knowledge it hasn't actually read.

### Claim Taxonomy

| Type | Definition | Example | Usage Pattern |
|------|-----------|---------|---------------|
| **Fact** | Verifiable assertion | "YC's standard SAFE is post-money with a $500K investment" | Cite directly. Verify freshness. |
| **Heuristic** | Rule of thumb | "If CAC > 3-month LTV, the channel is unprofitable" | Apply with judgment. Context-dependent. |
| **Framework** | Decision-making structure | "RICE scoring: Reach × Impact × Confidence / Effort" | Invoke as a reasoning tool. |
| **Policy** | Organizational decision | "We don't ship without at least one user interview" | Enforce. Only founders change it. |

The claim type drives staleness rules, update policies, and injection priority. A stale fact is dangerous. A stale heuristic is merely imprecise. A policy should never be auto-updated.

### Context Scoping

Claims carry scope tags:

```typescript
scope: {
  stages: string[];           // ["pre-seed", "seed", "series-a"]
  markets: string[];          // ["b2b", "b2c", "b2b2c"]
  contexts: string[];         // ["prototyping", "scaling", "fundraising"]
}
```

A claim scoped to `["seed"]` won't be injected for a Series B task. Company stage (`pre-pmf`, `growth`, `scale`, `crisis`) acts as a global filter that reweights all heuristic and policy claims.

### Epistemic Authority and Dialectical Synthesis

When doctrine claims from different roles contradict, authority weights determine who has more credibility per domain. The CTO has high authority on security claims (0.9) but low authority on pricing claims (0.3).

Contradictions are surfaced as tensions in the agent's prompt:

```markdown
### Tension: Security Timeline
CTO position (high authority): 3-week security review needed before launch.
CPO position (low authority on security): Ship with basic auth and iterate.

Both positions are in your doctrine. Reason through this tension
in context of the current task. Do not suppress either perspective.
```

### Doctrine Archetypes

Pre-packaged doctrine sets per role:

```
CEO: yc-founder | bootstrapped | enterprise
CPO: growth-product | platform-product | consumer-product
CTO: startup-cto | scale-cto | security-cto
CMO: growth-cmo | brand-cmo | performance-cmo
```

Each archetype ships: 5-8 lenses, 10-15 established claims per lens, pre-computed edges. Companies select one archetype per role at setup. Founders customize on top.

### Example Doctrine Catalog

```
CEO Doctrines
├── fundraising         "Seed-stage fundraising — SAFEs, pitch decks, investor psychology"
├── strategy            "Company strategy — positioning, competitive moats, market timing"
├── hiring              "Early-stage hiring — founding team, first 10 hires, culture"
└── board-management    "Board relations — reporting, governance, managing investors"

CPO Doctrines
├── prioritisation      "Feature prioritisation — RICE/ICE, opportunity sizing, roadmap planning"
├── user-research       "Validating decisions — JTBD, usability testing, customer interviews"
├── pricing             "Packaging and monetisation — value metrics, tiers, competitor benchmarking"
├── product-market-fit  "PMF measurement — retention curves, NPS, engagement signals"
└── sprint-planning     "Sprint mechanics — velocity, estimation, backlog grooming"

CTO Doctrines
├── architecture        "System design — scalability patterns, data modeling, trade-offs"
├── security            "Application security — OWASP, auth patterns, threat modeling"
├── scaling             "Infrastructure — caching, queues, database optimization, observability"
├── developer-experience "DX — CI/CD, testing strategy, documentation, onboarding"
└── incident-response   "Incident management — runbooks, postmortems, SLOs"

CMO Doctrines
├── positioning         "Brand positioning — category design, messaging, differentiation"
├── channels            "Growth channels — SEO, paid, content, social, partnerships"
├── funnel-optimization "Conversion — landing pages, signup flow, activation"
├── analytics           "Marketing analytics — attribution, CAC, LTV, cohort analysis"
└── launch-playbooks    "Launch strategy — GTM, beta programs, PR, community building"
```

### Doctrine Agent Tools

```
doctrine_browse(lens_name) → Tier 2 map: claim titles, cross-refs, health stats
doctrine_read(claim_id) → Tier 3 body: full reasoning, examples, caveats
doctrine_search(query, opts?) → Hybrid search across doctrine claims
```

### Doctrine Ingestion

Three modes:

1. **Curated by zazig** (shipped with archetypes). Precedence: 1.
2. **Founder-provided** (LLM extracts claims → founder reviews each → activate). Precedence: 3.
3. **Agent-discovered** (from job execution → pending review). Precedence: 4.

---

## Part II: Canons

### What Canons Are

A canon is a shared body of reference knowledge that no role owns. It's what the team has studied — the essential works, reference material, and factual grounding that informs every exec's reasoning.

30 software engineering books for a VP-Engineering. 30 reference pitch decks for a CEO. All company contracts for a General Counsel. GDPR and SOC2 texts for a CTO. Industry benchmark reports. These are canons.

Canons don't contradict productively. They don't carry authority weights. If two sources in a canon disagree, that's a data quality issue to flag, not a productive tension to reason through.

### Canon Architecture: Hierarchical RAG

Canons are massive compared to doctrines. 30 books = ~3 million tokens. The doctrine model (atomic claims of ~200 tokens, hand-curated) doesn't work here. Canons use hierarchical retrieval — a document graph with three levels:

```
Level 1: Library Index (which canons and sources exist)
  "Software Engineering Canon: 30 sources — Clean Code, DDIA, Pragmatic Programmer..."
  "Fundraising Reference: 12 sources — YC playbook, SAFE mechanics, pitch templates..."

  Purpose: Agent knows what reference libraries are available.

Level 2: Section Map (chapter/section summaries for relevant sources)
  Clean Code → Ch 1: Clean Code, Ch 2: Meaningful Names, Ch 3: Functions...
  Each with a generated summary (~100-200 tokens).

  Purpose: Agent navigates to the right part of the right book.

Level 3: Passages (specific chunks with exact citations)
  Full text passages from the source material.
  Chunked by structural boundaries, not token count.
  Every passage carries source, chapter, page, and citation label.

  Purpose: The actual reference material, on demand.
```

### Canon Chunking Strategy

Structure-first chunking with modality-specific rules:

| Content Type | Primary Boundary | Target Tokens | Key Rule |
|---|---|---|---|
| **Books/prose** | Chapter → section → paragraph | 350-550, overlap 50-80 | Never cross chapter/section boundary |
| **Legal/contracts** | Numbered clause/subclause | 120-350, overlap 0-40 | Preserve clause IDs exactly (`7.2(a)`) |
| **Code** | Class/function/method + module header | 80-300 | File path + line span mandatory |
| **Tables** | One table = one chunk | Variable | Store both markdown + normalized JSON |
| **Figures/diagrams** | Caption + nearby paragraph + OCR | Variable | Vision-generated description optional |

### Chunk Metadata

Every canon chunk carries:

- `company_id`, `canon_id`, `source_id`, `source_version_id`
- `section_id`, `heading_path` (e.g., "Clean Code > Ch 3 > Functions > Small!")
- `chunk_type` (`text`, `legal`, `code`, `table`, `figure`, `quote`)
- `token_count`, `language`
- `locator` (page, paragraph, or file_path + line_start/line_end)
- `citation_label` (human-readable, e.g., "Martin, Clean Code, p.34")
- `content_hash` (for dedup/re-ingestion)
- `parser_confidence`, `ocr_confidence`

### Three-Level Retrieval (Concrete)

**L1 — Source Selection:** Hybrid search (FTS + vector + RRF) on `canon_sources` summaries. "Which books are relevant to this task?"

**L2 — Section Selection:** Hybrid search on `canon_sections` within selected sources. "Which chapters in Clean Code are relevant?" Agent sees chapter summaries, picks the right one.

**L3 — Passage Selection:** Hybrid search on `canon_chunks` within sections. Diversify by section to avoid over-representing one chapter. Expand neighbors (`ordinal ±1`) for surrounding context.

Each level uses the same RRF fusion pattern as doctrine retrieval.

### Canon Agent Tools

```
canon_library(query, {library_ids?, limit?})
  → Level 1: which sources/books match this query

canon_browse(source_id, {query?, depth?, limit?})
  → Level 2: section map for a specific source

canon_search(query, {library_ids?, source_ids?, section_ids?, top_k?, token_budget?})
  → Level 3: passage retrieval with citations

canon_read(chunk_id, {neighbors?: 1})
  → Exact passage + adjacent context for deep reading
```

### Canon Proactive Injection

Canon proactive injection is intentionally light:

- **Always:** Tiny library pointers (~80-200 tokens). "You have access to: Software Engineering Canon (30 sources), Compliance Library (12 sources)."
- **If high similarity (>0.82):** Top 1 source summary + 2 section pointers (~150-400 tokens).
- **Never:** Proactively inject many canon passages. Canons are mostly reactive — the agent searches when it needs reference material.

Total canon proactive budget: **100-400 tokens** (vs doctrine proactive: 1000-2000 tokens).

### Canon Ingestion Pipeline

For canons, the founder approves the **source** ("ingest this book"), not each chunk. The pipeline is fully automated after approval.

```
1. register_source     Founder approves source (title, type, file/URL)
2. fetch + fingerprint content_hash, mime type, metadata
3. parse               Per-type parser:
                         PDF: text layer + OCR fallback
                         EPUB: spine/chapter extraction
                         Markdown/HTML: heading AST
                         Codebase: repo tree + symbols
4. build hierarchy     source → part → chapter → section (self-referencing tree)
5. chunk leaves        Structure-first chunking by modality rules above
6. generate summaries  LLM generates:
                         Source summary (L1) — one paragraph
                         Chapter summaries (L2) — 100-200 tokens each
7. embed               Source summaries, section summaries, chunks
8. dedupe              content_hash + high-similarity near-dup threshold
9. activate version    Atomically: is_active=true on new version
10. emit metrics       Token count, chunk count, parse quality, cost
```

### Canon Re-Ingestion

When a source is updated (new edition, updated regulation):

- New source bytes → new `canon_source_versions` row
- Diff by `content_hash` at section/chunk level
- Re-embed only changed sections/chunks
- Recompute only ancestor summaries touched by changes
- Keep old version for audit/rollback

---

## Part III: Integration

### How Doctrines Reference Canons

A doctrine claim can cite canon evidence via the `doctrine_canon_refs` bridge table:

```
Doctrine claim: "Raise 18-24 months runway at seed" [CEO/fundraising, heuristic]
  └── evidence: Canon chunk from "YC Startup School, Lecture 4" [page 12, paragraph 3]
  └── deep_reading: Canon chunk from "Venture Deals, Ch 4" [p.89-91]
```

Relation types: `evidence` (supports the claim), `counterexample` (challenges it), `deep_reading` (provides detailed background).

### Unified Search

Agents can search across both systems in one query:

```
knowledge_search(query, {scope: 'doctrine' | 'canon' | 'both'})
```

Results are merged with intent-aware weighting:
- Advisory/heuristic questions ("what should we do?") → doctrine weight higher
- Factual/citation requests ("what does the source say?") → canon weight higher

Merged result shape:
```
kind: doctrine | canon
id, title/snippet, score
citation (required for canon, optional for doctrine)
source_path (lens path or source → section → locator)
```

### The Full Prompt Stack (Updated)

```
Position 1: Personality prompt          (who you are — highest attention)
Position 2: Role prompt                 (what you do)
Position 3: Doctrine context            (what you believe — includes tensions)
Position 4: Canon pointers              (what reference libraries you can access)
Position 5: Skill content               (how you work — if invoked)
Position 6: Task context                (what to do now)
Position 7: Memory context              (what you remember — if relevant)
```

Doctrines at position 3 anchor reasoning and dictate behavior. Canon pointers at position 4 provide awareness of available reference material without consuming tokens until needed.

---

## Retrieval Engine: Hybrid Search

Both doctrines and canons use the same hybrid search philosophy (FTS + vector + RRF), inherited from QMD's proven patterns.

### Hybrid Search Pattern

```sql
-- BM25-equivalent keyword search + semantic vector search
-- Reciprocal Rank Fusion to merge ranked lists
-- Same pattern for both doctrine_claims and canon_chunks

WITH keyword_results AS (
  SELECT id, ts_rank(fts_column, plainto_tsquery('english', $query)) as kw_score
  FROM {table}
  WHERE {scope_filters} AND fts_column @@ plainto_tsquery('english', $query)
  ORDER BY kw_score DESC LIMIT 20
),
vector_results AS (
  SELECT id, 1 - (embedding <=> $query_embedding) as vec_score
  FROM {table}
  WHERE {scope_filters}
  ORDER BY embedding <=> $query_embedding LIMIT 20
),
fused AS (
  SELECT COALESCE(k.id, v.id) as id,
    COALESCE(1.0 / (ROW_NUMBER() OVER (ORDER BY k.kw_score DESC NULLS LAST) + 60), 0) * 2 +
    COALESCE(1.0 / (ROW_NUMBER() OVER (ORDER BY v.vec_score DESC NULLS LAST) + 60), 0)
    as rrf_score
  FROM keyword_results k FULL OUTER JOIN vector_results v ON k.id = v.id
)
SELECT * FROM fused ORDER BY rrf_score DESC LIMIT $limit;
```

### Strong-Signal Gating

When BM25 top-hit scores ≥0.85 with a ≥0.15 gap to runner-up, skip vector search entirely. Exact terminology matches ("SAFE note", "clause 7.2(a)") resolve instantly.

### Why Supabase Over QMD

Supabase wins on operational simplicity: transactional index updates (no stale indexes), one search path, one data store. QMD's GGUF reranking is better in isolation, but the stale-index problem is a dealbreaker for production knowledge systems. Recommendation: Supabase for Phase 1-3, add QMD as optional reranking layer if eval shows retrieval quality needs improvement.

---

## Injection Flow (Complete)

```
Task dispatched to exec agent
        │
        ▼
Step 1: Read company stage
  companies.stage → reweight doctrine selection
        │
        ▼
Step 2: Compile Doctrine Tier 1 (Lens Index)
  All active doctrine lenses for this role
  Format: "lens_name: description" (one line each)
  Budget: ~300-500 tokens
        │
        ▼
Step 3: Proactive Doctrine Tier 2 Loading
  Match task context → lens embeddings
  GATE: only load if similarity > 0.75
  Select top 1-2 matching lenses
  Load: summary + claim titles + edge indicators
  Budget: ~400-800 tokens
        │
        ▼
Step 4: Proactive Doctrine Tier 3 Loading
  From matched lenses, select claims by:
    1. Filter by scope (company stage + task tags)
    2. Filter by confidence >= "emerging"
    3. Rank by: salience × embedding_similarity × stage_weight
    4. Select top 3-5
  Load: full claim bodies
  Budget: ~600-1500 tokens
        │
        ▼
Step 5: Doctrine contradiction surfacing
  Check doctrine_edges for 'contradicts' edges on loaded claims
  If contradictions with other roles: include Tension blocks
        │
        ▼
Step 6: Canon library pointers
  List available canon libraries for this company
  Format: "Library name (N sources)" (one line each)
  GATE: if task context matches a canon source > 0.82,
        include that source summary + 2 section pointers
  Budget: ~100-400 tokens
        │
        ▼
Step 7: Compile knowledgeContext
  Deterministic template (no LLM):

  ## Your Doctrine
  [doctrine lenses, claims, tensions]

  ## Reference Libraries
  You have access to these canons. Use canon_search()
  and canon_browse() when you need factual grounding.
  [library pointers, optional source summary]
        │
        ▼
Step 8: Token budget enforcement
  Hard cap: 3500 tokens (configurable per role)
  Overflow priority (last dropped first):
    1. Drop speculative doctrine claims
    2. Drop canon source summary (keep pointers only)
    3. Truncate doctrine bodies → titles only
    4. Drop lowest-relevance doctrine lens
    5. NEVER drop Tier 1 doctrine index, Tension blocks, or canon pointers
        │
        ▼
Step 9: Include in StartJob payload
  personalityPrompt + rolePrompt + knowledgeContext + skillContent + taskContext
```

---

## Token Economics

### Per-Task Budget

| Component | Budget | Notes |
|-----------|--------|-------|
| Personality prompt | ~800-1200 | Always injected |
| Role prompt | ~300-500 | Always injected |
| **Doctrine Tier 1** (lens index) | **300-500** | Always injected |
| **Doctrine Tier 2** (proactive lens maps) | **400-800** | 1-2 lenses per task |
| **Doctrine Tier 3** (proactive claims) | **600-1500** | 3-5 claims per task |
| **Doctrine tensions** | **0-300** | If contradictions found |
| **Canon pointers** | **80-200** | Always injected (library list) |
| **Canon proactive** (optional source summary) | **0-200** | Only if high similarity match |
| Skill content | ~500-2000 | If skill invoked |
| Task context | ~500-1000 | Task description |
| **Total proactive baseline** | **~3500-6500** | Leaves >85% for agent work |
| **Doctrine reactive** | **0-2000** | Agent browses/reads doctrine claims |
| **Canon reactive typical** | **0-2500** | Agent searches canon passages |
| **Canon reactive heavy** (legal/compliance) | **up to 4000** | Deep-reading a contract or regulation |

### Canon Ingestion Cost Model

**30-book ingest estimate:**

| Cost Component | Estimate | Notes |
|---|---|---|
| Raw content | 3.0M tokens | 30 books × 100K tokens avg |
| Chunks generated | ~7,500 | 350-550 tokens each |
| Chapter summaries | ~600 | One per chapter |
| Source summaries | 30 | One per book |
| **Embedding cost** | **<$1** | text-embedding-3-small on 3.5M tokens |
| **Summarization cost** | **$2-5** | Mini model on ~1.4M input tokens |
| **OCR cost** (if scanned PDFs) | **$10-40** | Dominant cost; $0 for digital-native |
| **Total** | **$3-50** | Digital-native books: $3-5. Scanned PDFs: $15-50. |
| Storage | <0.5 GB | Vectors + text + indexes |

**CPO take on the cost model:** This is surprisingly cheap. A 30-book engineering canon costs less than a single team lunch to ingest. At these economics, canons are viable for every customer — not just enterprise. This inverts the usual "knowledge base is expensive" assumption. The bottleneck isn't compute cost; it's curation quality and source licensing.

---

## Canon Library Marketplace

### The Insight

If canon ingestion is cheap ($3-50 per library) and the value to agents is high (dramatically better output quality), there's a marketplace opportunity: **zazig sells pre-curated, pre-ingested canon libraries — like an app store for executive knowledge.**

### How It Works

```
Zazig Canon Store
├── Software Engineering Essentials    $29    30 books, pre-chunked, pre-embedded
│   Clean Code, DDIA, Pragmatic Programmer, Refactoring, ...
├── YC Fundraising Playbook           $19    15 sources, curated from public YC material
│   Startup School lectures, SAFE guides, pitch deck templates, ...
├── B2B SaaS Pricing                  $24    20 sources
│   Monetizing Innovation, Price Intelligently reports, ...
├── Startup Legal Essentials          $14    12 sources
│   SAFE templates, employment law basics, IP protection, ...
├── Growth Marketing Canon            $24    25 sources
│   Traction, Hacking Growth, channel playbooks, ...
└── Enterprise Sales Playbook         $29    20 sources
    Predictable Revenue, SPIN Selling, enterprise negotiation, ...
```

### Business Model

1. **Zazig licenses or curates the content.** For published books, negotiate bulk licensing deals with publishers (like Audible/Blinkist). For public material (YC content, regulatory texts, open-source docs), curate and pre-process for free or low cost.

2. **Zazig handles ingestion.** Parse, chunk, embed, generate summaries, quality-check — all done once per canon library. The customer gets a pre-ingested, battle-tested library.

3. **Customer buys and activates.** One click: canon library appears in their company's knowledge system. All execs can immediately search it.

4. **Zazig takes a margin.** Content licensing cost + ingestion cost + margin = retail price. Recurring revenue: canon library updates (new editions, updated regulations) are included in subscription or sold as updates.

### Why This Matters

- **For founders:** Skip the curation work entirely. Buy a "CTO Security Canon" and your CTO agent instantly has deep security expertise from 20 authoritative sources. No uploading PDFs, no reviewing chunks, no prompt engineering.
- **For zazig:** Recurring revenue stream beyond subscriptions. Network effect: the more companies use a canon, the better we can tune its retrieval quality via usage analytics. Content moat: our pre-curated canons become a defensible competitive advantage.
- **For the ecosystem:** Publishers get a new distribution channel. Authors get their books "inside" AI executives. Zazig becomes the bridge between published expertise and AI agent knowledge.

### Phase 6+ Marketplace Features

- **Community canons:** Users contribute and share curated canon libraries.
- **Canon ratings:** Based on agent output quality metrics (groundedness, citation rate, founder satisfaction).
- **Custom canon ingestion service:** Enterprise founders upload proprietary material (internal wikis, company handbooks, deal memos) for private canon creation.
- **Canon composition:** Mix-and-match from multiple canon libraries into a custom collection.

---

## Storage

### Doctrine Tables

```sql
-- Doctrine Lenses (Tier 1 + Tier 2 metadata)
create table doctrine_lenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  role_id uuid references roles(id),
  name text not null,
  display_name text not null,
  description text not null,
  summary text,
  related_lenses uuid[] default '{}',
  authority_domain text,
  default_authority_weight numeric default 0.5,
  keywords text[] default '{}',
  embedding vector(1536),
  expected_topics text[] default '{}',
  claim_count int default 0,
  established_count int default 0,
  avg_staleness numeric default 0,
  last_ingestion timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, role_id, name)
);

-- Doctrine Claims (Tier 3)
create table doctrine_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  role_id uuid references roles(id),
  lens_id uuid references doctrine_lenses(id),
  title text not null,
  description text not null,
  body text not null,
  source text,
  claim_type text check (claim_type in ('fact', 'heuristic', 'framework', 'policy'))
    not null default 'fact',
  confidence text check (confidence in ('established', 'emerging', 'speculative'))
    not null default 'emerging',
  scope_stages text[] default '{}',
  scope_markets text[] default '{}',
  scope_contexts text[] default '{}',
  valid_until date,
  origin text check (origin in ('curated', 'archetype', 'founder', 'agent-discovered'))
    not null default 'founder',
  precedence int not null default 3,
  tags text[] default '{}',
  status text check (status in ('active', 'pending_review', 'archived'))
    default 'active',
  embedding vector(1536),
  usage_count int default 0,
  last_used_at timestamptz,
  reviewed_at timestamptz,
  staleness_score numeric default 0,
  salience numeric default 0.5,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Doctrine Edges (within-role and cross-role)
create table doctrine_edges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  source_claim_id uuid references doctrine_claims(id) on delete cascade,
  target_claim_id uuid references doctrine_claims(id) on delete cascade,
  source_role_id uuid references roles(id),
  target_role_id uuid references roles(id),
  relationship text check (relationship in (
    'supports', 'contradicts', 'extends', 'depends_on'
  )) not null,
  description text,
  authority_weight numeric default 0.5,
  auto_discovered boolean default false,
  approved boolean default true,
  created_at timestamptz default now(),
  unique (source_claim_id, target_claim_id)
);
```

### Canon Tables

```sql
-- Canon Libraries (named collections of sources)
create table canon_libraries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  -- Marketplace fields
  marketplace_id text,                   -- null = custom, non-null = from store
  purchased_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (company_id, name)
);

-- Canon Sources (individual books/documents within a library)
create table canon_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  source_type text not null check (source_type in (
    'pdf', 'epub', 'html', 'markdown', 'codebase', 'docx', 'txt'
  )),
  title text not null,
  canonical_uri text,
  status text not null default 'ready' check (status in (
    'pending', 'processing', 'ready', 'failed', 'archived'
  )),
  library_summary text,
  library_embedding vector(1536),
  library_tsv tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(library_summary, ''))
  ) stored,
  latest_content_hash text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Many-to-many: sources can appear in multiple libraries
create table canon_library_sources (
  library_id uuid not null references canon_libraries(id) on delete cascade,
  source_id uuid not null references canon_sources(id) on delete cascade,
  priority numeric not null default 0.5,
  primary key (library_id, source_id)
);

-- Canon Source Versions (for re-ingestion)
create table canon_source_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references canon_sources(id) on delete cascade,
  version_no int not null,
  content_hash text not null,
  parser_version text not null,
  is_active boolean not null default true,
  token_count bigint not null,
  page_count int,
  created_at timestamptz default now(),
  unique (source_id, version_no)
);

-- Canon Sections (hierarchical: book → part → chapter → section)
create table canon_sections (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references canon_sources(id) on delete cascade,
  source_version_id uuid not null references canon_source_versions(id) on delete cascade,
  parent_section_id uuid references canon_sections(id) on delete cascade,
  depth smallint not null check (depth between 0 and 6),
  ordinal int not null,
  section_type text not null check (section_type in (
    'book', 'part', 'chapter', 'section', 'subsection', 'appendix', 'file', 'module'
  )),
  title text,
  heading_path text not null,
  summary text,
  locator jsonb not null,
  content_hash text not null,
  embedding vector(1536),
  fts tsvector generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, ''))
  ) stored,
  created_at timestamptz default now()
);

-- Canon Chunks (leaf-level retrievable passages)
create table canon_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references canon_sources(id) on delete cascade,
  source_version_id uuid not null references canon_source_versions(id) on delete cascade,
  section_id uuid not null references canon_sections(id) on delete cascade,
  ordinal int not null,
  chunk_type text not null check (chunk_type in (
    'text', 'legal', 'code', 'table', 'figure', 'quote'
  )),
  body text not null,
  token_count int not null,
  locator jsonb not null,
  attributes jsonb not null default '{}'::jsonb,
  content_hash text not null,
  embedding vector(1536) not null,
  fts tsvector generated always as (to_tsvector('english', body)) stored,
  created_at timestamptz default now(),
  unique (source_version_id, section_id, ordinal)
);

-- Canon Generated Summaries (LLM-generated at source/chapter/section level)
create table canon_generated_summaries (
  id uuid primary key default gen_random_uuid(),
  source_version_id uuid not null references canon_source_versions(id) on delete cascade,
  section_id uuid references canon_sections(id) on delete cascade,
  level text not null check (level in ('source', 'chapter', 'section')),
  summary text not null,
  key_points jsonb not null default '[]'::jsonb,
  model text not null,
  prompt_version text not null,
  embedding vector(1536),
  created_at timestamptz default now()
);

-- Bridge: Doctrine claims cite canon evidence
create table doctrine_canon_refs (
  doctrine_claim_id uuid not null references doctrine_claims(id) on delete cascade,
  canon_chunk_id uuid not null references canon_chunks(id) on delete cascade,
  relation text not null default 'evidence' check (relation in (
    'evidence', 'counterexample', 'deep_reading'
  )),
  confidence numeric not null default 0.7,
  primary key (doctrine_claim_id, canon_chunk_id)
);
```

### Indexes

```sql
-- Doctrine indexes
create index idx_doctrine_lenses_role on doctrine_lenses(company_id, role_id);
create index idx_doctrine_claims_lens on doctrine_claims(lens_id) where status = 'active';
create index idx_doctrine_claims_role on doctrine_claims(company_id, role_id) where status = 'active';
create index idx_doctrine_claims_salience on doctrine_claims(company_id, role_id, salience desc)
  where status = 'active';
create index idx_doctrine_claims_tags on doctrine_claims using gin(tags) where status = 'active';
create index idx_doctrine_claims_fts on doctrine_claims
  using gin(to_tsvector('english', title || ' ' || description || ' ' || body))
  where status = 'active';
create index idx_doctrine_claims_embedding on doctrine_claims
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index idx_doctrine_lenses_embedding on doctrine_lenses
  using ivfflat (embedding vector_cosine_ops) with (lists = 20);
create index idx_doctrine_edges_source on doctrine_edges(source_claim_id);
create index idx_doctrine_edges_target on doctrine_edges(target_claim_id);
create index idx_doctrine_edges_contradicts on doctrine_edges(company_id)
  where relationship = 'contradicts';

-- Canon indexes
create index idx_canon_sources_company_status on canon_sources(company_id, status);
create index idx_canon_library_sources_library on canon_library_sources(library_id, source_id);
create index idx_canon_versions_source_active on canon_source_versions(source_id, is_active);
create index idx_canon_sections_source_depth on canon_sections(source_id, depth);
create index idx_canon_chunks_source_section on canon_chunks(source_id, section_id);
create index idx_canon_sources_fts on canon_sources using gin(library_tsv);
create index idx_canon_sections_fts on canon_sections using gin(fts);
create index idx_canon_chunks_fts on canon_chunks using gin(fts);
create index idx_canon_sources_embedding on canon_sources
  using ivfflat (library_embedding vector_cosine_ops) with (lists = 50);
create index idx_canon_sections_embedding on canon_sections
  using ivfflat (embedding vector_cosine_ops) with (lists = 200);
create index idx_canon_chunks_embedding on canon_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 1000);
```

---

## Evaluation Harness

### Doctrine Metrics

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **Retrieval recall@5** | Do the right claims surface for a given task? | >80% |
| **Tool invocation rate** | How often does the agent use doctrine tools? | >60% |
| **Tier 3 fetch rate** | How often does the agent read full claim bodies? | >40% |
| **Groundedness** | Does agent output cite injected doctrine? | >70% |
| **Wrong-frame rate** | How often does proactive injection miss entirely? | <15% |
| **Doctrine token efficiency** | Actual doctrine tokens per job | <2500 avg |

### Canon Metrics

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **Canon tool invocation rate** | How often does the agent use canon tools? | >30% (when canons available) |
| **Citation accuracy** | Do citations point to real, relevant passages? | >90% |
| **L1→L2→L3 navigation success** | Does hierarchical drill-down find what's needed? | >70% |
| **Canon token efficiency** | Actual canon tokens per job | <2000 avg |
| **Parse quality score** | Chunk coherence, metadata completeness | >85% per source |

### How to Measure

- Log every doctrine/canon injection per job
- Log every knowledge tool call per job
- After each job, run lightweight eval: compare output against injected knowledge
- Weekly: generate eval dashboard for founders
- **Ship eval in Phase 1.** Costs almost nothing.

---

## Knowledge Dynamics

### Memory Consolidation (Episodic → Semantic)

When agents complete jobs, the orchestrator tracks outcomes. Claims that lead to good outcomes gain salience. Claims that get overridden lose salience. Knowledge gaps (jobs with no matching claims) become gap signals.

### Hypothesis Generation

For novel problems, agents create provisional hypotheses (speculative, pending_review, never auto-promoted). The agent can reference its hypothesis in the current job, but it doesn't enter the doctrine until the founder approves.

### Canon-to-Doctrine Promotion

When agents repeatedly cite the same canon passages across multiple jobs, the system can surface these as candidate doctrine claims: "Your CTO has cited Clean Code Chapter 3 (small functions) in 8 of the last 12 code review jobs. Promote to a doctrine claim?" This is the canon-to-doctrine graduation path — reference material becoming institutional belief through repeated use.

---

## Phases

### Phase 1: Doctrine Foundation + Eval

**Build:**
- Schema migrations: `doctrine_lenses`, `doctrine_claims`, `doctrine_edges` (empty)
- Doctrine lens CRUD in orchestrator
- Proactive Tier 1 + Tier 2 + Tier 3 injection at dispatch
- Confidence threshold gate (0.75)
- Company stage filter
- `knowledgeContext` field in StartJob payload
- Eval logging: which claims injected, token counts
- CLI: `zazig doctrine list`, `zazig doctrine show`, `zazig doctrine add`
- Seed data: 2-3 lenses per role, 10-15 hand-written claims per lens

**Skip:** Agent tools, canon system, curator, knowledge graph, ingestion, archetypes.
**Estimated effort:** 4-5 days

### Phase 2: Doctrine Agent Tools + Reactive Retrieval

**Build:**
- `doctrine_browse()`, `doctrine_read()`, `doctrine_search()` tools
- Embedding computation on claim insert/update
- Forced reactive triggers in role prompts
- Eval: tool invocation rate, Tier 3 fetch rate, groundedness

**Estimated effort:** 3-4 days

### Phase 3: Canon Foundation

**Build:**
- Schema migrations: all canon tables
- Canon ingestion pipeline (parse → hierarchy → chunk → summarize → embed)
- `canon_library()`, `canon_browse()`, `canon_search()`, `canon_read()` tools
- Canon proactive injection (library pointers + optional source summary)
- `doctrine_canon_refs` bridge table
- Unified `knowledge_search` with scope parameter
- Eval: canon metrics

**Estimated effort:** 5-7 days

### Phase 4: Doctrine Knowledge Graph + Curator v1

**Build:**
- `doctrine_edges` population: manual edges + curator-discovered
- Link discovery (within-role, then cross-role)
- Contradiction surfacing in injection flow
- Epistemic authority weights
- Dialectical synthesis in prompts
- Staleness detection + health report
- Gap detection

**Estimated effort:** 4-5 days

### Phase 5: Doctrine Ingestion + Private Knowledge

**Build:**
- Source-to-doctrine ingestion CLI with LLM claim extraction
- Dedup via embeddings
- Founder review/approve workflow
- Agent-discovered claim capture
- Private doctrine notes (per-agent scratchpad)
- Canon-to-doctrine promotion signals

**Estimated effort:** 5-6 days

### Phase 6: Archetypes + Marketplace Foundation

**Build:**
- Doctrine archetype definitions (3-4 per role)
- Seed claim packages per archetype
- Company setup: select archetype → seed doctrines
- Archetype update propagation ("zazig-suggested")
- Canon marketplace data model (`marketplace_id`, `purchased_at`)
- First 2-3 pre-curated canon libraries (Software Engineering, Fundraising, Marketing)
- Canon store UI in founder dashboard
- Purchase → activate flow

**Estimated effort:** 6-8 days

### Phase 7: Memory Consolidation + Outcomes

**Build:**
- Outcomes tracking (claim usage → job outcome correlation)
- Salience recalculation
- Pattern extraction from repeated agent observations
- Canon-to-doctrine promotion workflow
- Community canon contributions (Phase 7+)

**Estimated effort:** 5-6 days

---

## Open Questions

1. **Embedding model:** OpenAI `text-embedding-3-small` (1536 dims, cheap, fast) is the pragmatic choice. Start with OpenAI, abstract the interface for future swap.

2. **Confidence threshold for proactive loading:** 0.75 for doctrines, 0.82 for canons (higher threshold because wrong-canon anchoring wastes more tokens). Tune empirically via eval harness.

3. **Knowledge vs Memory boundary:** If it's specific to this codebase, it's memory. If it's generalizable, it's doctrine. If it's published reference material, it's canon.

4. **Company stage transitions:** Who sets `companies.stage`? Start manual, automate later from signals.

5. **Claim versioning:** Simple `doctrine_claim_versions` table. Defer to Phase 5+.

6. **Canon parse quality gate:** The founder approves the source but never sees the chunks. If the parser produces garbage from a badly-formatted PDF, the agent silently gets bad reference material. The `emit metrics` step should surface to the founder dashboard: parse confidence scores, chunk count, sample passages for spot-checking. A "parse quality report" per source — showing 3-5 random chunks for human sanity-checking — costs almost nothing and prevents garbage-in-garbage-out. **This needs design before Phase 3 ships.**

7. **Canon licensing for marketplace:** Selling pre-curated book collections requires licensing agreements with publishers. Options: (a) negotiate bulk licensing (like Audible), (b) sell only curation/ingestion of books the founder already owns (bring-your-own-book), (c) curate from open/public sources only (YC content, regulatory texts, open-source docs) for the first canon libraries, then explore publisher deals. Start with (c), prove the model, then pursue (a).

8. **Canon library pricing:** How to price marketplace canons? Options: one-time purchase, included in subscription tier, per-canon subscription for updates. The ingestion cost ($3-50) is tiny — the value is curation quality and retrieval tuning. Pricing should reflect curation value, not compute cost.

9. **Cross-company canon analytics:** If 500 companies buy the "Software Engineering Canon," we have aggregate usage data: which passages get cited most, which books provide the most grounded outputs. This data improves retrieval quality for everyone and informs future curation. Privacy: only aggregate, never per-company. Design the analytics pipeline before marketplace launch.

---

## Future Research Directions (Phase 8+)

From Gemini's review and the v2 deep dive:

- **Executable knowledge:** Doctrine claims that include micro-models, decision trees, or simulation parameters. A pricing claim that can *run* a pricing calculator.
- **Theory of Mind edges:** "What the CEO believes the CTO believes about security." Enables executive negotiation patterns.
- **Bayesian belief updating:** Real-time confidence adjustment when job outcomes contradict claims.
- **Dynamic LoRA adapters:** Fine-tune lightweight model adapters per archetype. Agent *becomes* a YC-style CEO at the neural level.
- **Canon-aware citations in output:** Agent outputs that include footnote-style citations to canon sources, verifiable by the founder.
- **Canon freshness monitoring:** Automated detection of updated editions, new regulations, or superseded sources. Alert founders when their canon content may be stale.
- **Publisher API integration:** Direct ingestion from publisher APIs (O'Reilly, Manning, etc.) for always-current technical canons.

---

## Review Synthesis

### Where all three reviewers agreed (Codex, Gemini, CPO):
- Three-tier progressive disclosure is the right pattern for both systems
- Doctrines and canons are architecturally distinct and should be separate
- Dual proactive + reactive loading is necessary
- Start sparse, prove retrieval quality, then add intelligence
- Ingestion pipelines must differ: human QA on output (doctrines) vs input (canons)

### Where they diverged:

| Dimension | Codex (pragmatic) | Gemini (provocative) | CPO (product) |
|-----------|------------------|---------------------|---------------|
| Canon naming | "Canon" works | "Reference" is clearer | "Canon" — implies curation, matches "Doctrine" |
| Marketplace timing | Phase 6+ | Not discussed | Phase 6, but design the data model in Phase 3 |
| Canon quality gate | "Fix the parser, re-run" | Not discussed | Surface parse quality to founders — prevention > repair |
| Knowledge dynamics | Track usage, flag staleness | Bayesian updating, memory consolidation | Canon-to-doctrine promotion is the missing link |

### What this design chose:

The v2 architecture cleanly separates doctrines (what agents believe) from canons (what agents have studied). Phases 1-2 prove doctrine retrieval quality. Phase 3 adds the canon system. Phases 4-5 add intelligence (knowledge graph, ingestion, private knowledge). Phase 6 introduces the marketplace. Phase 7+ adds memory consolidation and outcomes tracking.

The design is operationally practical (ships incrementally) while architecturally ambitious (the schema supports everything from hand-curated claims to 30-book hierarchical RAG to a canon marketplace). Each phase builds on proven foundations from the one before.

---

*Skills teach agents how to work. Doctrines teach agents what they believe. Canons teach agents what they've studied. The triad — Skills, Doctrines, Canons — is zazig's complete agent enhancement model. Each uses progressive disclosure. Each has its own ingestion pipeline, retrieval engine, and injection strategy. Together, they transform a generic LLM into a domain expert whose advice is grounded in curated beliefs AND authoritative sources.*
