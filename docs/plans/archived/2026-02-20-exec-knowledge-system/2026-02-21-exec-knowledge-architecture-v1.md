# Exec Knowledge Architecture — Design Document

**Date:** 2026-02-21
**Status:** proposed
**Authors:** Tom (owner), CPO (agent)
**Supersedes:** `2026-02-20-exec-knowledge-system-sketch.md` (sketch)
**Reviewed by:** Codex (gpt-5.3-codex, xhigh reasoning), Gemini (gemini-3.1-pro-preview)
**Informed by:** Four independent deep research reports on agent domain knowledge and expertise (Claude, Gemini, OpenAI, last30days scan — all dated 2026-02-21)

---

## Problem

Zazig execs have personality (who they are) and role prompts (what they do). They don't have domain knowledge (what they know). Without a knowledge system, the CPO can say "validate before building" but has no frameworks for *how* to validate. The CEO can say "fundraising is about storytelling" but knows nothing about SAFE mechanics, YC playbooks, or investor psychology.

The existing sketch (`2026-02-20-exec-knowledge-system-sketch.md`) proposed flat atomic claims organized by topics. This design takes that foundation and addresses seven problems the sketch didn't:

1. **Navigation** — How does an agent know what it knows? (Flat topic lists don't scale)
2. **Cross-role connections** — Knowledge domains aren't siloed. Pricing affects CPO, CEO, and CMO.
3. **Progressive disclosure** — Skills solved this for capabilities. Knowledge needs the same.
4. **Active retrieval** — Vercel benchmark showed agents fail to invoke dynamic retrieval 56% of the time. Knowledge needs both passive injection AND active tools.
5. **Knowledge health** — Claims go stale, topics have gaps, nobody's tracking.
6. **Knowledge dynamics** — Knowledge isn't static. It evolves through use, differs by context, and emerges from agent reasoning.
7. **Multi-agent epistemics** — When execs disagree, how is that productive rather than chaotic?

---

## Design Principles

Six principles, drawn from the research synthesis and two independent architecture reviews:

**1. Progressive disclosure is the universal pattern.** 30 tokens of metadata pointing to 5,000 words of knowledge outperforms loading 5,000 words every time. Reasoning degrades at ~3,000 tokens of instructions; a focused 300-token context outperforms an unfocused 113,000-token context. (Claude research, confirmed by all four sources.)

**2. Proactive + reactive beats either alone.** Static knowledge injection gets 100% adherence but wastes tokens. Dynamic retrieval is efficient but agents under-utilize it 56% of the time. Use both: orchestrator passively injects the best-match baseline, agent actively retrieves deeper. (Vercel benchmark + Google developer recommendations.)

**3. Knowledge is not just facts — it's beliefs, heuristics, and frameworks.** An executive doesn't just retrieve "our CAC is $47." They apply the heuristic "if CAC > 3-month LTV, channel is unprofitable" and the framework "evaluate channels quarterly against payback period." Claims must distinguish fact from heuristic from policy. (Gemini review.)

**4. Contradictions are features, not bugs.** When the CPO says "ship fast to learn" and the CTO says "don't ship without security review," that tension is the value of an exec team. Don't auto-resolve — use contradictions as inputs to structured reasoning. (Gemini review, supported by research on adversarial multi-agent design.)

**5. Prove retrieval quality before building intelligence.** Ship Tier 1-2-3 progressive disclosure and eval first. Curator intelligence, knowledge graph automation, and archetypes are Phase 3+ — layer complexity only after proving the foundation retrieves accurately. (Codex review.)

**6. The agent knows it has knowledge but never sees the config.** Same security model as personality: the orchestrator compiles knowledge into a prompt fragment at dispatch time. The agent can browse and search its knowledge via tools, but cannot modify claims, see confidence scores used for ranking, or alter the knowledge graph. All mutations go through the orchestrator + founder approval.

---

## Core Innovation: Knowledge Lenses

**The insight:** Skills are capability signposts — lightweight metadata in context, full instructions on demand. Knowledge Lenses are the expertise equivalent.

A Knowledge Lens is a curated window into a domain of expertise that uses the same three-tier progressive disclosure pattern.

### How Knowledge Lenses Work

```
Tier 1: Lens Index (always loaded, ~30-50 tokens per lens)
  "fundraising: Seed-stage fundraising — SAFEs, pitch decks, investor psychology"
  "user-research: Validating product decisions — JTBD, surveys, usability testing"
  "pricing: Packaging, monetisation, value metrics, competitor benchmarking"

  Purpose: Agent knows WHAT it has expertise in. Pure pointers, not reasoning.

Tier 2: Lens Map (loaded per-task, ~200-500 tokens per lens)
  Topic headers + claim titles (one-line pointers, not summaries)
  Cross-references to related lenses
  Knowledge health indicators

  Purpose: Agent sees the SHAPE of relevant knowledge. Still pointers.

Tier 3: Claim Bodies (loaded on demand, ~100-300 tokens each)
  Full reasoning, examples, caveats, sources, decision frameworks
  Agent MUST fetch Tier 3 before making high-stakes recommendations.

  Purpose: Deep expertise when the agent actually needs to reason.
```

**Critical constraint (from Codex review):** Tier 1 and Tier 2 are *pointers only* — never compressed reasoning. Compressed reasoning at Tier 1/2 causes semantic drift where the agent confidently applies knowledge it hasn't actually read. Titles must be handles for retrieval, not standalone assertions.

**Token economics:**
- Tier 1: ~40 tokens × 8 lenses = **320 tokens** (always loaded)
- Tier 2: ~350 tokens × 2 relevant lenses = **700 tokens** (per-task)
- Tier 3: ~200 tokens × 5 claims drill-down = **1000 tokens** (if agent needs detail)
- **Typical total: 1000-2000 tokens** (vs sketch's flat 4000 token budget)

---

## Architecture

### Three-Tier Knowledge Stack

```
┌─────────────────────────────────────────────────────────────────┐
│  TIER 1: LENS INDEX (always injected at dispatch)                │
│                                                                  │
│  Lightweight catalog of what this exec knows about.             │
│  One line per lens: name + description (pointers only).          │
│  Budget: 300-500 tokens total.                                   │
│  Loaded by: Orchestrator (passive, every dispatch)               │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  TIER 2: LENS MAP (loaded per-task by orchestrator + agent)      │
│                                                                  │
│  Claim titles (pointers) + cross-lens refs + health stats.       │
│  Two loading paths:                                              │
│    Proactive: orchestrator pre-loads best-match lenses           │
│      (confidence threshold: only if similarity > 0.75)           │
│    Reactive: agent calls knowledge_browse(lens_name)             │
│  Budget: 200-500 tokens per lens, 1-3 lenses per task.          │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│  TIER 3: CLAIM BODIES (loaded on demand by agent)                │
│                                                                  │
│  Full claim text with reasoning, frameworks, sources.            │
│  Agent calls knowledge_read(claim_id) or                         │
│  knowledge_search(query) for semantic retrieval.                 │
│  Budget: 100-300 tokens per claim, as many as agent needs.       │
│  MANDATORY for: cross-role decisions, high-stakes recs,          │
│  any output that cites specific knowledge.                       │
└─────────────────────────────────────────────────────────────────┘
```

### Dual Loading: Proactive + Reactive

```
Card dispatched to exec
        │
        ├── PROACTIVE (orchestrator, deterministic)
        │   1. Match card context → lenses (embedding similarity)
        │   2. Gate: only pre-load if similarity > 0.75 (avoid wrong-frame anchoring)
        │   3. Pre-load top 1-2 lens maps (Tier 2)
        │   4. Pre-load top 3-5 "established" claims from matched lenses (Tier 3)
        │   5. Inject as knowledgeContext in StartJob payload
        │
        └── REACTIVE (agent, on-demand)
            Agent has three knowledge tools:
            1. knowledge_browse(lens_name) → Tier 2 map
            2. knowledge_read(claim_id) → Tier 3 body
            3. knowledge_search(query, opts?) → semantic search

            FORCED REACTIVE TRIGGERS:
            - Cross-functional decisions → must browse other role's lenses
            - Ambiguous or novel problems → must search before asserting
            - High-stakes recommendations → must read Tier 3 bodies
```

The proactive path ensures foundational knowledge is always there. The reactive path lets agents drill deeper. The confidence gate (0.75 threshold) prevents the orchestrator from anchoring the agent on a wrong frame — better to inject nothing proactively than inject the wrong lens.

---

## Claim Taxonomy: Facts, Heuristics, Frameworks, and Policies

The sketch treated all knowledge as undifferentiated "claims." But executive knowledge has fundamentally different types with different usage patterns.

### Claim Types

| Type | Definition | Example | Usage Pattern |
|------|-----------|---------|---------------|
| **Fact** | Verifiable assertion about the world | "YC's standard SAFE is post-money with a $500K investment" | Cite directly. Verify freshness. |
| **Heuristic** | Rule of thumb from experience | "If CAC > 3-month LTV, the channel is unprofitable" | Apply with judgment. Context-dependent. |
| **Framework** | Decision-making structure | "RICE scoring: Reach × Impact × Confidence / Effort" | Invoke as a reasoning tool. May include formulas. |
| **Policy** | Organizational decision | "We don't ship features without at least one user interview" | Enforce. Comes from founders, not external sources. |

Why this matters: a `fact` that's stale is dangerous (wrong information). A `heuristic` that's stale is merely imprecise. A `policy` should never be auto-updated — only founders change it. A `framework` is stable but may need different parameters per context. The claim type drives staleness rules, update policies, and injection priority.

### Context Scoping

Claims aren't universally true. "Speed over perfection" applies to prototyping but not to security reviews. Each claim carries scope tags:

```typescript
scope: {
  stages: string[];           // ["pre-seed", "seed", "series-a"]
  markets: string[];          // ["b2b", "b2c", "b2b2c"]
  contexts: string[];         // ["prototyping", "scaling", "fundraising"]
}
```

At dispatch, the orchestrator filters claims by scope match against the card's context. A claim scoped to `["seed"]` won't be injected for a Series B fundraising task. This prevents heuristics from being applied in the wrong context — the failure mode Gemini identified as "contextual dimensionality."

### Company Stage as Global Filter

A single global variable — **company stage** — reweights all heuristic and policy claims.

| Stage | Effect on Knowledge |
|-------|-------------------|
| **Pre-PMF** | Weight user-research and rapid-iteration heuristics higher. Weight scaling patterns lower. |
| **Growth** | Weight acquisition, funnel, and channel knowledge higher. Weight exploratory heuristics lower. |
| **Scale** | Weight reliability, security, and process knowledge higher. Weight "move fast" heuristics lower. |
| **Crisis** | Weight cash management, runway, and cost-cutting knowledge higher. Suppress long-term strategy. |

Stored as `companies.stage` in Supabase. When the stage changes, every dispatch immediately reflects the reweighting — no per-claim updates needed. This is the "Overton window" concept from Gemini's review: a single variable that globally shifts which knowledge surfaces.

---

## Knowledge Graph: Edges and Navigation

### Single Edge Table (Codex recommendation: merge link tables)

All relationships — within-role and cross-role — stored in one typed edge table:

```typescript
interface KnowledgeEdge {
  id: string;
  company_id: string;
  source_claim_id: string;
  target_claim_id: string;
  source_role_id: string;       // enables cross-role queries
  target_role_id: string;       // enables cross-role queries
  relationship: "supports" | "contradicts" | "extends" | "depends_on";
  description: string;          // why this link exists
  auto_discovered: boolean;     // curator-created vs manual
  approved: boolean;            // false = pending founder review
  authority_weight: number;     // 0.0-1.0, for conflict resolution
}
```

**Phase 1 scope (Codex recommendation: start sparse):** Only `depends_on` and `contradicts` edges. These have the highest ROI — dependencies prevent orphaned reasoning, contradictions surface productive tension. `supports` and `extends` add value at scale but aren't needed early.

### Epistemic Authority Weights

When claims from different roles contradict, the edge carries an `authority_weight`:

```
CTO claims "We need 3 weeks for security review" (authority: 0.9 on security)
CPO claims "We can ship with basic auth and iterate" (authority: 0.3 on security)

The CEO, when presented both via cross-role search, sees:
  CONTRADICTION: Security timeline
  CTO (authority 0.9): 3-week security review needed
  CPO (authority 0.3): Ship with basic auth and iterate
```

Authority weights are per-domain, not per-role. The CTO has high authority on security claims but low authority on pricing claims. Set at the lens level and inherited by claims.

### Dialectical Synthesis Protocol

When a contradiction is relevant to a task, the orchestrator doesn't resolve it — it presents both sides with authority context and asks the agent to reason through the tension.

The compiled knowledge prompt includes:

```markdown
### Tension: Security Timeline
CTO position (high authority): 3-week security review needed before launch.
CPO position (low authority on security): Ship with basic auth and iterate.

Both positions are in your knowledge base. Reason through this tension
in context of the current task. Do not suppress either perspective.
```

This is the dialectical approach Gemini recommended — contradictions as productive inputs, not bugs to fix. In future phases, contradictions between persistent agents (CPO vs CTO) could trigger a structured debate job, but for now, single-agent reasoning through presented tensions is sufficient.

---

## Claim Schema (Complete)

```typescript
interface KnowledgeClaim {
  id: string;
  company_id: string;
  role_id: string;
  lens_id: string;

  // === Content ===
  title: string;                      // Prose-sentence pointer: "YC recommends 18-24 months runway at seed"
  description: string;                // ~150 chars, for embedding match (not for display)
  body: string;                       // Full claim: reasoning, examples, caveats
  source: string | null;              // "YC Startup School, Lecture 4 (Seibel)" or null

  // === Taxonomy (from review) ===
  claim_type: "fact" | "heuristic" | "framework" | "policy";
  confidence: "established" | "emerging" | "speculative";
  scope: {
    stages: string[];                 // ["seed", "series-a"]
    markets: string[];                // ["b2b"]
    contexts: string[];               // ["fundraising", "board-meeting"]
  };
  valid_until: string | null;         // ISO date — null = no expiry

  // === Provenance (from review) ===
  origin: "curated" | "archetype" | "founder" | "agent-discovered";
  precedence: number;                 // 1=curated, 2=archetype, 3=founder, 4=agent-discovered
                                      // Higher precedence overrides lower on conflicts

  // === Health ===
  status: "active" | "pending_review" | "archived";
  embedding: number[];                // pgvector(1536)
  usage_count: number;
  last_used_at: string | null;
  reviewed_at: string | null;
  staleness_score: number;            // Computed by curator
  salience: number;                   // 0.0-1.0. High-salience claims promote into proactive injection.

  created_at: string;
  updated_at: string;
}
```

### Precedence Hierarchy

When two claims in the same lens cover the same ground:

```
curated (zazig ships it)         — lowest precedence, baseline truth
   ↓ overridden by
archetype (company selected)     — archetype-specific refinement
   ↓ overridden by
founder (explicitly added)       — org-specific reality
   ↓ overridden by
agent-discovered (approved)      — experiential, most recent signal
```

If a founder adds a claim that contradicts an archetype claim, the founder's claim wins for injection. The archetype claim stays (for reference) but is deprioritized in ranking.

### Salience-Based Promotion

Instead of static tier assignment, claims earn their way into proactive injection:

```
Salience = (usage_frequency × recency_weight × confidence_score) / staleness

High salience (>0.8): Always included in proactive Tier 3 loading
Medium salience (0.4-0.8): Included if lens matches
Low salience (<0.4): Only retrievable via reactive tools
Zero salience (unused for 90+ days): Flagged for review or archival
```

This implements Gemini's "attention-decay" recommendation: heavily-used, recently-confirmed knowledge rises to the surface. Rarely-used knowledge sinks but remains searchable. Nothing is deleted — just deprioritized.

---

## Knowledge Lenses: Schema and Examples

### Lens Schema

```typescript
interface KnowledgeLens {
  id: string;
  company_id: string;
  role_id: string;
  name: string;                       // kebab-case: "fundraising"
  display_name: string;               // "Fundraising"
  description: string;                // ~100 chars for Tier 1 index
  summary: string;                    // 2-3 sentences for Tier 2 header

  // === Navigation ===
  related_lenses: string[];           // lens IDs in same role
  authority_domain: string;           // for epistemic authority: "security", "pricing", etc.
  default_authority_weight: number;   // 0.0-1.0, inherited by claims

  // === Health ===
  claim_count: number;
  established_count: number;
  avg_staleness: number;
  last_ingestion: string | null;

  // === Matching ===
  keywords: string[];
  embedding: number[];                // pgvector(1536)
  expected_topics: string[];          // for gap detection

  created_at: string;
  updated_at: string;
}
```

### Example Lens Catalog

```
CEO
├── fundraising         "Seed-stage fundraising — SAFEs, pitch decks, investor psychology"
├── strategy            "Company strategy — positioning, competitive moats, market timing"
├── hiring              "Early-stage hiring — founding team, first 10 hires, culture"
└── board-management    "Board relations — reporting, governance, managing investors"

CPO
├── prioritisation      "Feature prioritisation — RICE/ICE, opportunity sizing, roadmap planning"
├── user-research       "Validating decisions — JTBD, usability testing, customer interviews"
├── pricing             "Packaging and monetisation — value metrics, tiers, competitor benchmarking"
├── product-market-fit  "PMF measurement — retention curves, NPS, engagement signals"
└── sprint-planning     "Sprint mechanics — velocity, estimation, backlog grooming"

CTO
├── architecture        "System design — scalability patterns, data modeling, trade-offs"
├── security            "Application security — OWASP, auth patterns, threat modeling"
├── scaling             "Infrastructure — caching, queues, database optimization, observability"
├── developer-experience "DX — CI/CD, testing strategy, documentation, onboarding"
└── incident-response   "Incident management — runbooks, postmortems, SLOs"

CMO
├── positioning         "Brand positioning — category design, messaging, differentiation"
├── channels            "Growth channels — SEO, paid, content, social, partnerships"
├── funnel-optimization "Conversion — landing pages, signup flow, activation"
├── analytics           "Marketing analytics — attribution, CAC, LTV, cohort analysis"
└── launch-playbooks    "Launch strategy — GTM, beta programs, PR, community building"
```

---

## Agent Knowledge Tools

Three tools available to all exec agents during job execution.

### knowledge_browse(lens_name)

Returns Tier 2 map: claim titles as pointers, link indicators, health stats.

```
Agent calls: knowledge_browse("fundraising")

Returns:
## Fundraising
Seed-stage fundraising — SAFEs, pitch decks, investor psychology.
8 claims (6 established, 2 emerging). Last updated: 2026-02-15.

### Claims
1. [claim-abc] YC recommends raising 18-24 months runway at seed [fact, established]
   → CTO/architecture (due diligence), CPO/user-research (traction signals)
2. [claim-def] SAFE notes defer valuation to next priced round [fact, established]
3. [claim-ghi] Investors pattern-match: team > market > traction at seed [heuristic, established]
   ⚡ CONTRADICTS: [claim-xyz] in CEO/strategy — "At seed, market size matters more than team"

### Related Lenses
Same role: hiring, strategy, board-management
Cross-role: CPO/pricing, CTO/security
```

### knowledge_read(claim_id)

Returns full Tier 3 body. **Agent must call this before making recommendations based on a claim.**

```
Agent calls: knowledge_read("claim-abc")

Returns:
## YC recommends raising 18-24 months of runway at seed
Type: fact | Confidence: established | Source: YC Startup School, Lecture 4 (Seibel)
Scope: seed stage, all markets
Valid until: null (evergreen, but check current YC guidance)

This gives enough time for 2-3 pivots if needed. Under 12 months creates
desperation signaling that damages negotiating position. Over 24 months
signals lack of ambition — "if you need that much runway, you're not
confident in your path."

Practical range: $500K-$3M for most seed rounds (2025-2026).
YC standard: $500K on a post-money SAFE for the batch.

Caveats:
- Numbers shift with market conditions. Check current YC guidance.
- Different for hardware/biotech (need more) vs software (need less).
- Crisis stage: different rules apply — extend runway, cut burn.

Framework reference: See [claim-uvw] for SAFE vs convertible note decision tree.
```

### knowledge_search(query, options?)

Semantic search across all claims. Optionally cross-role.

```
Agent calls: knowledge_search("how to evaluate growth channels", { cross_role: true })

Returns:
Found 4 relevant claims:

1. [claim-mno] CMO/channels: "Evaluate channels by payback period, not raw CAC" [heuristic]
   Relevance: 0.94 | Authority: 0.9 (CMO domain)

2. [claim-pqr] CPO/product-market-fit: "Channel-market fit precedes product-market fit" [heuristic]
   Relevance: 0.87 | Authority: 0.7 (CPO cross-domain)

3. [claim-stu] CEO/strategy: "First channel should be founder-led, second should scale without founders" [heuristic]
   Relevance: 0.82 | Authority: 0.5 (CEO general)

4. [claim-vwx] CMO/analytics: "Attribution: use first-touch for awareness, last-touch for conversion" [framework]
   Relevance: 0.79 | Authority: 0.9 (CMO domain)
```

---

## Retrieval Engine: Hybrid Search Inspired by QMD

The knowledge tools above (`knowledge_browse`, `knowledge_read`, `knowledge_search`) need a retrieval engine underneath them. The design is directly informed by zazig v1's integration with [QMD](docs/research/2026-02-19-tobi-qmd.md) — Tobi Lütke's on-device hybrid search engine that combines BM25 + vector + LLM reranking over markdown files.

### What QMD Gets Right That We Should Steal

QMD's key insight: **hybrid search (keywords + semantics) dramatically outperforms either alone.** Pure vector search misses exact terminology ("SAFE note" vs "convertible instrument"). Pure keyword search misses conceptual matches ("how to extend runway" matching a claim about "reducing burn rate"). QMD combines both with Reciprocal Rank Fusion (RRF) and gets better results than either.

Five QMD patterns that directly apply to the knowledge retrieval layer:

**1. Hybrid search: BM25 + vector in Postgres**

Instead of relying solely on pgvector, we combine Postgres full-text search with vector similarity:

```sql
-- Combined search: keyword (BM25-equivalent) + semantic (vector)
-- Reciprocal Rank Fusion to merge the two ranked lists

WITH keyword_results AS (
  SELECT id, ts_rank(to_tsvector('english', title || ' ' || description || ' ' || body),
         plainto_tsquery('english', $query)) as kw_score
  FROM knowledge_claims
  WHERE company_id = $company_id AND role_id = $role_id AND status = 'active'
    AND to_tsvector('english', title || ' ' || description || ' ' || body)
        @@ plainto_tsquery('english', $query)
  ORDER BY kw_score DESC LIMIT 20
),
vector_results AS (
  SELECT id, 1 - (embedding <=> $query_embedding) as vec_score
  FROM knowledge_claims
  WHERE company_id = $company_id AND role_id = $role_id AND status = 'active'
  ORDER BY embedding <=> $query_embedding LIMIT 20
),
fused AS (
  SELECT COALESCE(k.id, v.id) as id,
    -- RRF: 1/(rank+60) gives diminishing returns to lower ranks
    COALESCE(1.0 / (ROW_NUMBER() OVER (ORDER BY k.kw_score DESC NULLS LAST) + 60), 0) * 2 +
    COALESCE(1.0 / (ROW_NUMBER() OVER (ORDER BY v.vec_score DESC NULLS LAST) + 60), 0)
    as rrf_score
  FROM keyword_results k FULL OUTER JOIN vector_results v ON k.id = v.id
)
SELECT * FROM fused ORDER BY rrf_score DESC LIMIT $limit;
```

The `* 2` on keyword results mirrors QMD's first-query weighting: keyword matches get 2× weight because they indicate the user knows the exact terminology they're looking for.

**2. Strong-signal gating: skip expensive work when BM25 is confident**

When the keyword search top-hit scores ≥0.85 with a ≥0.15 gap to the runner-up, we have a high-confidence match. Skip the vector comparison entirely — it's an unnecessary cost.

```
if keyword_results[0].score >= 0.85
   and (keyword_results[0].score - keyword_results[1].score) >= 0.15:
    return keyword_results[:limit]  # fast path, no vector search needed
else:
    run full hybrid search  # expensive path
```

This is QMD's most underrated pattern. For knowledge retrieval, it means searches like `knowledge_search("SAFE note")` resolve instantly via keyword match without touching embeddings. Searches like `knowledge_search("how to extend our financial runway")` fall through to hybrid because no single keyword matches strongly.

**3. Structured multi-query for the knowledge_search tool**

QMD supports typed sub-queries: `lex` (keywords), `vec` (semantic), `hyde` (hypothetical document). We expose this to agents:

```
knowledge_search("SAFE note terms", { mode: "keyword" })   → BM25 only (fast, exact)
knowledge_search("how to evaluate fundraising readiness")   → hybrid (default)
knowledge_search("what would good runway advice look like", { mode: "hyde" })
  → generates hypothetical claim, searches for nearest real matches
```

HyDE (Hypothetical Document Embedding) is particularly powerful for the orchestrator's proactive matching: given a card description, generate "what would the perfect knowledge claim for this task look like?" and search for the closest real claim. This should improve proactive Tier 2/3 selection quality significantly vs raw card-text-to-claim similarity.

**4. Context tree: lens hierarchy as search metadata**

QMD attaches hierarchical path metadata to search results (`qmd://agents/cpo/memory`). We do the equivalent with lens paths:

```
Search result: "YC recommends 18-24 months runway at seed"
Context: CEO / fundraising / established / source: YC Startup School

Search result: "Evaluate channels by payback period, not raw CAC"
Context: CMO / channels / heuristic / authority: 0.9
```

The lens hierarchy serves as context tree — every search result carries its position in the knowledge graph, giving the agent richer context without additional queries. This is "quality per effort is excellent" as the QMD Codex review noted.

**5. Chunk-first: claims are already atomic**

QMD reranks the best *chunk* per document (~900 tokens) rather than full documents. Our design borrows this insight at the architecture level: claims are already atomic (~100-300 tokens each). There's nothing to chunk. This means reranking is inherently fast — we're always comparing small units, never full documents.

For the **ingestion pipeline** though, the chunk-first pattern applies directly: when extracting claims from a source document, chunk at ~900 tokens with heading-boundary preference (just like QMD), then extract claims per chunk. This keeps extraction focused and prevents the LLM from trying to summarise an entire document into one claim.

### Additional Indexes for Hybrid Search

```sql
-- Full-text search index (BM25-equivalent in Postgres)
CREATE INDEX idx_claims_fts ON knowledge_claims
  USING gin(to_tsvector('english', title || ' ' || description || ' ' || body))
  WHERE status = 'active';

-- Existing vector index (already in schema)
-- CREATE INDEX idx_claims_embedding ON knowledge_claims
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

### The Re-Indexing Problem (Why QMD Has a Hard Ceiling)

QMD's biggest operational pain point is **index staleness**. The QMD index is a separate SQLite artifact from the source markdown files. When files change, the index doesn't update automatically — you must run `qmd index` and `qmd embed` to rebuild it. Community feedback confirms this is a real friction point:

> "I tried this but don't you have to qmd index and qmd embed after each feature developed or the qmd index becomes stale? I found that to be annoying and eventually gave up on qmd for codebases."
> — @bWgibb, 2026-02-21

The workaround is git hooks (`post-commit` hook to re-index when markdown files change), but this adds infrastructure, doesn't cover non-git changes, and the re-indexing process itself takes time proportional to the corpus size.

**This is a structural advantage of the Supabase approach.** When a claim is inserted or updated in `knowledge_claims`:
- The Postgres GIN full-text index updates **transactionally** — there's no separate index to rebuild
- The pgvector index updates on insert (IVFFlat requires periodic `REINDEX` for optimal recall at scale, but is correct immediately)
- The only async operation is computing the embedding vector itself (one API call per claim, can be batched)

There is no "stale index" failure mode. The data and the search index are the same system. This eliminates an entire class of operational pain that QMD users hit in practice.

### QMD in v2: Daemon or Replace?

In v1, zazig shells out to `qmd query --json` per search — cold models, subprocess overhead, 30s timeout risk. The QMD recon recommended switching to `qmd mcp --http --daemon` for warm models and persistent connections.

In v2, the question is whether to:

**Option A: Keep QMD for memory, use Postgres for knowledge.** Memory chunks (experiential, from past jobs) stay in QMD's local index with its superior BM25 + GGUF reranking. Knowledge claims live in Supabase with the hybrid search above. Two systems, different strengths. But: two systems means two re-indexing stories, two search APIs, and no cross-data-type queries.

**Option B: Everything in Supabase.** Both memory and knowledge use Postgres full-text + pgvector. Simpler ops, one search path, one data store. No index staleness problem. Loses QMD's local GGUF reranking but gains operational simplicity, transactional index consistency, and cross-data-type queries (search across both memory and knowledge in one call).

**Recommendation: Option B for Phase 1-3, revisit for Phase 4+.** Operational simplicity and index consistency win early. Postgres hybrid search is "good enough" for hundreds of claims. If retrieval quality needs improvement at scale, add QMD as an optional local reranking layer that sits in front of Supabase — query Postgres for candidates, rerank locally with QMD's GGUF models. But don't build that complexity until the eval harness shows retrieval quality is the bottleneck.

---

## Worked Example: YC Fundraising Corpus → CEO Knowledge

To make the architecture concrete, here's an end-to-end trace of how a real knowledge source flows through the system.

### Step 1: Ingestion

A founder has notes from YC Startup School lectures and wants the CEO agent to have this knowledge.

```bash
zazig knowledge ingest --role ceo --lens fundraising --source "yc-startup-school-notes.md"
```

The pipeline chunks the source, LLM-extracts atomic claims, and classifies each one:

| Extracted Claim | claim_type | Why this type |
|----------------|-----------|---------------|
| "YC standard SAFE is post-money, $500K investment" | **fact** | Verifiable, specific, can go stale |
| "Raise 18-24 months runway at seed" | **heuristic** | Rule of thumb, context-dependent |
| "Pitch deck order: problem → solution → traction → team → ask" | **framework** | Decision structure, reusable across decks |
| "Don't raise from more than 20 investors at seed" | **heuristic** | Experience-derived, not absolute |

Every claim gets:
- `origin: "founder"`, `precedence: 3` (overrides archetype defaults)
- `source: "YC Startup School, Lecture 4 (Seibel)"` (attribution)
- `scope: { stages: ["pre-seed", "seed"], markets: [], contexts: ["fundraising"] }`
- `confidence: "established"` (YC is an authoritative source)
- `valid_until: null` (evergreen, but the staleness score will flag them if unused after 90 days)

The founder reviews each candidate (approve/edit/reject). Approved claims land in the **fundraising lens** under the CEO role.

### Step 2: What the Lens Looks Like After Ingestion

If the company selected the `yc-founder` CEO archetype at setup, the fundraising lens already had ~15 baseline claims (precedence: 2). The ingested claims sit on top:

```
Fundraising lens (CEO, Acme Corp)
├── 15 claims from yc-founder archetype     (precedence 2, shipped by zazig)
├── 20 claims from founder's YC notes       (precedence 3, founder-provided)
├── 3 claims agent discovered during jobs   (precedence 4, founder-approved)
└── Deduped: ~30 unique claims after embedding similarity merge (>0.95 = duplicate)
```

If one of the ingested claims contradicts an archetype claim on the same topic, the founder's claim (precedence 3) wins for injection ranking. The archetype claim stays for reference but is deprioritized.

### Step 3: Runtime — CEO Gets a "Review This Pitch Deck" Card

**Tier 1 (always loaded, ~320 tokens):**

The CEO's lens index is in context:
```
fundraising: Seed-stage fundraising — SAFEs, pitch decks, investor psychology
strategy: Company strategy — positioning, competitive moats, market timing
hiring: Early-stage hiring — founding team, first 10 hires, culture
board-management: Board relations — reporting, governance, managing investors
```

**Proactive Tier 2 + 3 Loading:**

The orchestrator matches "review pitch deck for seed round" against lens embeddings. `fundraising` scores 0.93 similarity (well above the 0.75 gate). The orchestrator loads:

- Tier 2: Fundraising lens map (claim titles, cross-refs) — ~350 tokens
- Tier 3: Top 5 claims ranked by `salience × embedding_similarity × stage_weight`:
  1. "Pitch deck order: problem → solution → traction → team → ask" [framework, salience 0.9]
  2. "Investors pattern-match: team > market > traction at seed" [heuristic, salience 0.85]
  3. "Raise 18-24 months runway at seed" [heuristic, salience 0.82]
  4. "YC standard SAFE is post-money, $500K investment" [fact, salience 0.78]
  5. "Don't raise from more than 20 investors at seed" [heuristic, salience 0.71]

Total proactive injection: ~1400 tokens of fundraising knowledge, targeted to this specific task.

**What the CEO agent sees in its prompt:**

```markdown
## Your Expertise

You have deep knowledge in the following domains. Use knowledge_browse()
and knowledge_search() to access additional detail. You MUST read full
claim bodies (knowledge_read) before making recommendations.

Domains: fundraising, strategy, hiring, board-management

### Fundraising
Seed-stage fundraising — SAFEs, pitch decks, investor psychology.

Key knowledge:
- Pitch deck order: problem → solution → traction → team → ask.
  [Framework from YC Startup School. Traction section is where seed
  investors spend the most time. Team slide should include relevant
  experience, not just names.]

- Investors pattern-match: team > market > traction at seed.
  [At seed, team is ~60% of the decision. By Series A, traction
  dominates. Optimise deck emphasis accordingly.]

- Raise 18-24 months of runway at seed.
  [Under 12 months = desperation. Over 24 months = lack of ambition.
  Practical range: $500K-$3M for most seed rounds in 2025-2026.]

[Browse more: knowledge_browse("fundraising")]
```

**Reactive retrieval during the job:**

The CEO starts reviewing the deck and notices the founder has included a convertible note term sheet instead of a SAFE. The CEO calls:

```
knowledge_search("SAFE vs convertible note comparison")
```

This pulls up claims it didn't get proactively — the detailed SAFE mechanics fact claims, plus a framework claim about when convertible notes make sense vs SAFEs. The agent reasons with the full depth of knowledge, but only loaded what it needed, when it needed it.

### Step 4: After the Job

- Usage counts increment for the 5 proactively injected claims + 2 reactively retrieved claims
- Salience scores adjust: heavily-used claims rise, unused claims in the lens decay slightly
- If the founder rates the output "helpful," that's a positive signal for those claims
- If the founder overrides a recommendation, the claim that backed it gets a salience penalty
- Next time the CEO gets a fundraising task, the ranking may be slightly different based on this feedback loop

### What the founder did NOT need to do:

- Write prompt engineering instructions for the CEO
- Manually select which YC facts are relevant to pitch deck reviews
- Worry about 20 pages of YC notes being dumped into context (progressive disclosure handled it)
- Configure which claims link to which (the curator discovers that over time)

The founder fed a source, approved the extracted claims, and the system handles the rest.

---

## Knowledge Dynamics: How Knowledge Evolves

### Memory Consolidation (Episodic → Semantic)

The Gemini review identified a critical missing piece: knowledge should emerge from experience, not just ingestion.

When agents complete jobs, the orchestrator tracks outcomes. Over time, patterns emerge:

```
Job outcome tracking:
  Job 1: CPO reviewed pitch deck. Used claims from fundraising lens.
         Founder rated output: helpful.
         → Usage counts increment for used claims.

  Job 2: CTO did security review. No claims from security lens matched.
         CTO made a finding not in any claim.
         → Gap signal: security lens may be missing "Supabase RLS" claims.
         → Agent-discovered candidate claim created.

  Job 3: CPO did pricing analysis. Used "price anchoring" heuristic.
         Founder overrode recommendation.
         → Signal: heuristic may be wrong for this org's context.
         → Salience penalty for that claim.
```

**Phase 3+ (Memory Consolidation job):**
- Nightly, scan job outcomes for the past 7 days
- Identify claims that were used and led to good outcomes → boost salience
- Identify claims that were used and led to overrides → flag for review
- Identify knowledge gaps (jobs where no claims matched) → create gap signals
- Surface patterns for founder review: "The CPO has used the RICE framework claim 12 times this month. The 'jobs-to-be-done' claim has never been used."

This is distinct from the Knowledge Curator (which maintains the graph) — this is a **Knowledge Outcomes Tracker** that connects knowledge to results.

### Hypothesis Generation

For novel problems where no existing claims match, agents should be able to create provisional hypotheses:

```
Agent encounters novel situation → no matching claims
Agent calls: knowledge_hypothesize("Based on user interviews, our B2B buyers
  care more about compliance than features")

Creates:
  - Provisional claim (type: heuristic, confidence: speculative, origin: agent-discovered)
  - Status: pending_review (never auto-promoted)
  - Tagged with job context for traceability
  - Surfaced in next founder review batch
```

The agent can reference its own hypothesis in the current job ("I'm operating on the hypothesis that...") but the hypothesis doesn't enter the knowledge base until the founder approves it.

---

## Knowledge Spaces: Corporate and Private

### Corporate Knowledge (shared)

Everything described above — lenses, claims, edges — is corporate knowledge. All exec agents in a company share one knowledge graph. Cross-role references are first-class.

### Private Knowledge (per-agent)

Each exec agent has a private scratchpad — observations, working theories, and notes about the organization that inform strategy but shouldn't be in the shared graph.

```typescript
interface PrivateNote {
  id: string;
  company_id: string;
  role_id: string;
  content: string;              // freeform text
  related_claims: string[];     // links to corporate claims
  created_at: string;
  expires_at: string;           // auto-expire after 30 days unless refreshed
}
```

Private notes are injected only for that agent's jobs. They're not visible to other agents or the founder dashboard. They auto-expire to prevent stale private context from accumulating.

**Use case:** The CPO notices that the founder consistently overrides aggressive pricing recommendations. Private note: "Founder is risk-averse on pricing. Frame pricing changes as experiments, not permanent shifts." This shapes the CPO's approach without altering the shared knowledge graph.

**Phase 4+ implementation. Phase 1-3 uses corporate knowledge only.**

---

## Storage

### Supabase Tables

```sql
-- Knowledge Lenses (Tier 1 + Tier 2 metadata)
create table knowledge_lenses (
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

-- Atomic Claims (Tier 3)
create table knowledge_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  role_id uuid references roles(id),
  lens_id uuid references knowledge_lenses(id),
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

-- Knowledge Edges (unified — within-role and cross-role)
create table knowledge_edges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  source_claim_id uuid references knowledge_claims(id) on delete cascade,
  target_claim_id uuid references knowledge_claims(id) on delete cascade,
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

-- Company stage (global knowledge filter)
-- Already in companies table: add column
-- ALTER TABLE companies ADD COLUMN stage text
--   CHECK (stage in ('pre-pmf', 'growth', 'scale', 'crisis'))
--   DEFAULT 'pre-pmf';

-- Indexes
create index idx_lenses_role on knowledge_lenses(company_id, role_id);
create index idx_claims_lens on knowledge_claims(lens_id) where status = 'active';
create index idx_claims_role on knowledge_claims(company_id, role_id) where status = 'active';
create index idx_claims_salience on knowledge_claims(company_id, role_id, salience desc)
  where status = 'active';
create index idx_claims_tags on knowledge_claims using gin(tags) where status = 'active';
create index idx_claims_embedding on knowledge_claims
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);
create index idx_lenses_embedding on knowledge_lenses
  using ivfflat (embedding vector_cosine_ops) with (lists = 20);
create index idx_edges_source on knowledge_edges(source_claim_id);
create index idx_edges_target on knowledge_edges(target_claim_id);
create index idx_edges_contradicts on knowledge_edges(company_id)
  where relationship = 'contradicts';
```

---

## Injection Flow (Complete)

```
Card dispatched to exec agent
        │
        ▼
Step 1: Read company stage
  companies.stage → used to reweight claim selection
        │
        ▼
Step 2: Compile Tier 1 (Lens Index)
  Read all active lenses for this role
  Format: "lens_name: description" (one line each)
  Budget: ~300-500 tokens
        │
        ▼
Step 3: Proactive Tier 2 Loading
  Match card context → lens embeddings
  GATE: only load if similarity > 0.75 (prevent wrong-frame anchoring)
  Select top 1-2 matching lenses
  Load: summary + claim titles + edge indicators
  Budget: ~400-800 tokens
        │
        ▼
Step 4: Proactive Tier 3 Loading
  From matched lenses, select claims by:
    1. Filter by scope (company stage + card context tags)
    2. Filter by confidence >= "emerging"
    3. Rank by: salience × embedding_similarity × stage_weight
    4. Select top 3-5
  Load: full claim bodies
  Budget: ~600-1500 tokens
        │
        ▼
Step 5: Contradiction surfacing
  Check knowledge_edges for 'contradicts' edges on loaded claims
  If contradictions exist with claims from other roles:
    Load both sides with authority weights
    Include as "Tension:" block in prompt
        │
        ▼
Step 6: Compile knowledgeContext
  Deterministic template (no LLM):

  ## Your Expertise

  You have deep knowledge in the following domains. Use knowledge_browse()
  and knowledge_search() to access additional detail. You MUST read full
  claim bodies (knowledge_read) before making recommendations.

  Domains: {lens_index}

  ### {matched_lens_name}
  {summary}

  Key knowledge:
  - {claim_title}: {claim_body_truncated}
  - {claim_title}: {claim_body_truncated}

  [Browse more: knowledge_browse("{lens_name}")]

  {if tensions:}
  ### Tensions
  {tension_block}
        │
        ▼
Step 7: Token budget enforcement
  Hard cap: 3000 tokens (configurable per role)
  Overflow strategy:
    1. Drop speculative claims
    2. Truncate bodies → titles only
    3. Drop lowest-relevance lens
    4. NEVER drop Tier 1 index or Tension blocks
        │
        ▼
Step 8: Include in StartJob payload
  personalityPrompt + rolePrompt + knowledgeContext + skillContent + taskContext
```

---

## Token Economics

| Component | Budget | Notes |
|-----------|--------|-------|
| Personality prompt | ~800-1200 | Always injected |
| Role prompt | ~300-500 | Always injected |
| **Knowledge Tier 1** (lens index) | **300-500** | Always injected |
| **Knowledge Tier 2** (proactive lens maps) | **400-800** | 1-2 lenses per task |
| **Knowledge Tier 3** (proactive claims) | **600-1500** | 3-5 claims per task |
| **Tension blocks** | **0-300** | If contradictions found |
| Skill content | ~500-2000 | If skill invoked |
| Task context | ~500-1000 | Card description |
| **Total baseline** | **~3500-5500** | Leaves >90% for agent work |
| **Reactive additions** | **0-3000** | Agent uses knowledge tools |

---

## Evaluation Harness (from Codex review: ship eval before intelligence)

Before building the curator or ingestion pipeline, ship observability:

### Metrics to Track

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **Retrieval recall@5** | Do the right claims surface for a given card? | >80% |
| **Tool invocation rate** | How often does the agent use knowledge tools? | >60% |
| **Tier 3 fetch rate** | How often does the agent read full claim bodies? | >40% |
| **Groundedness** | Does agent output cite injected knowledge? | >70% |
| **Wrong-frame rate** | How often does proactive injection miss entirely? | <15% |
| **Token efficiency** | Actual knowledge tokens per job | <3000 avg |
| **Staleness hit rate** | How often does an expired claim get injected? | <5% |

### How to measure

- Log every knowledge injection (which claims, which lenses) per job
- Log every knowledge tool call per job
- After each job, run a lightweight eval: compare agent output against injected claims
- Weekly: generate eval dashboard for founders

**Ship this in Phase 1.** It costs almost nothing (log writes + a weekly aggregation query) and provides the signal needed to tune everything else.

---

## Knowledge Ingestion Pipeline

### Three Modes

**1. Curated by zazig (shipped with archetypes)**
Hand-written, sourced claims. Highest quality. Precedence: 1.

**2. Source ingestion (founder-provided)**
```bash
zazig knowledge ingest --role ceo --lens fundraising --source "yc-notes.md"
```

Pipeline:
1. Source text → chunk by section
2. Each chunk → LLM extraction → candidate claims (title, description, body, source, claim_type)
3. Auto-tag with lens keywords and scope
4. Auto-compute embeddings
5. Dedup against existing claims (embedding similarity > 0.95 = likely duplicate)
6. Present to founder for review (approve/edit/reject)
7. Approved → `knowledge_claims` with origin: "founder", precedence: 3
8. Trigger link discovery on new claims

**3. Agent-discovered (from job execution)**
```
Agent output contains insight → orchestrator extracts candidate
→ status: pending_review, origin: agent-discovered, precedence: 4
→ founder reviews in next batch
```

### Bulk Bootstrap

```bash
zazig knowledge bootstrap --role ceo --archetype yc-founder
```

Seeds archetype claims, creates lenses, computes embeddings. One command.

---

## Knowledge Archetypes

Pre-packaged knowledge sets per role. Parallel to personality archetypes.

```
CEO Archetypes:
├── yc-founder        "YC-style: lean fundraising, rapid iteration, demo day mechanics"
├── bootstrapped      "Revenue-first: profitability focus, organic growth, self-funding"
└── enterprise        "Enterprise: large rounds, board governance, strategic partnerships"

CPO Archetypes:
├── growth-product    "Growth: A/B testing, funnel optimization, activation metrics"
├── platform-product  "Platform: developer experience, APIs, ecosystem strategy"
└── consumer-product  "Consumer: engagement loops, social features, viral mechanics"

CTO Archetypes:
├── startup-cto       "Startup: speed over perfection, monolith-first, pragmatic security"
├── scale-cto         "Scale: microservices, observability, reliability engineering"
└── security-cto      "Security-first: compliance, auditing, zero-trust architecture"

CMO Archetypes:
├── growth-cmo        "Growth: SEO, content marketing, inbound funnels, product-led"
├── brand-cmo         "Brand: positioning, PR, category creation, thought leadership"
└── performance-cmo   "Performance: paid ads, attribution, CRO, data-driven decisions"
```

Each archetype ships: 5-8 lenses, 10-15 established claims per lens, pre-computed edges, expected topic lists, scope tags pre-set.

Companies select one archetype per role at setup. Archetype claims (precedence: 2) seed the company's knowledge base. Founders customize on top (precedence: 3).

**Archetype updates:** When zazig ships updated archetype claims, they appear as "zazig-suggested" in the founder's review queue. Never auto-overwrite founder customizations.

---

## Knowledge Curator

### Scope and Timing

Runs nightly as a background job. Deterministic code with targeted LLM calls for classification. Not an autonomous agent.

### Phase 1 (ship with eval)
- **Staleness detection:** Flag claims where age > 90 days AND usage_count < 3 AND reviewed_at is null. Flag claims past `valid_until`.
- **Usage analytics:** Per-lens claim usage distribution. Identify unused claims and over-relied-on claims.
- **Simple health report:** Markdown output, one per company.

### Phase 3 (after proving retrieval quality)
- **Link discovery:** Pairwise embedding comparison within role. Threshold > 0.85 → LLM classification → pending approval.
- **Cross-role link discovery:** Cross-role comparison. Threshold > 0.80 → same process.
- **Gap detection:** Compare lenses against expected topics. Flag thin lenses.
- **Contradiction surfacing:** Flag contradictions for founder awareness.

### Phase 4+ (Memory Consolidation)
- **Outcomes tracking:** Connect claim usage to job outcomes (founder ratings, override frequency).
- **Salience recalculation:** Boost claims that correlate with good outcomes. Penalize claims that get overridden.
- **Pattern extraction:** When agents repeatedly make similar observations across jobs, surface as candidate claims.

---

## Relationship to Existing Systems

| System | Layer | How Knowledge Interacts |
|--------|-------|------------------------|
| **Personality** | Who the agent is | Knowledge is what the agent knows. Same injection pipeline, different data source. Personality shapes *how* knowledge is applied (cautious CTO cites security claims more readily). |
| **Role Prompts** | What the agent does | Role defines scope; knowledge provides depth within that scope. Role says "review pitch deck"; knowledge provides the frameworks for reviewing. |
| **Skills** | How the agent works | Skills are procedural (workflows). Knowledge is declarative (facts, frameworks). Agent uses skills to execute and knowledge to reason. A skill might say "run RICE scoring"; the knowledge provides what RICE factors to weight. |
| **Memory** | What the agent remembers | Memory is experiential (past jobs). Knowledge is curated (from sources). Memory: "last time we reviewed a deck, founder wanted 3 slides max." Knowledge: "YC recommends 10 slides." Both inform, but memory is personal and knowledge is institutional. |

### The Full Prompt Stack

```
Position 1: Personality prompt          (who you are — highest attention)
Position 2: Role prompt                 (what you do)
Position 3: Knowledge context           (what you know — includes tensions)
Position 4: Skill content               (how you work — if invoked)
Position 5: Task context                (what to do now)
Position 6: Memory context              (what you remember — if relevant)
```

Position 3 is the sweet spot: high enough to anchor reasoning, low enough not to override identity. Tensions at position 3 ensure the agent reasons through conflicts before diving into the task.

---

## Phases

### Phase 1: Foundation + Eval (after personality + role prompts ship)

**Build:**
- Schema migrations: `knowledge_lenses`, `knowledge_claims`, `knowledge_edges` (empty)
- Lens CRUD in orchestrator
- Proactive Tier 1 + Tier 2 + Tier 3 injection at dispatch
- Confidence threshold gate (0.75)
- Company stage filter
- `knowledgeContext` field in StartJob payload
- Eval logging: which claims injected per job, token counts
- CLI: `zazig knowledge list`, `zazig knowledge show`, `zazig knowledge add`
- Seed data: 2-3 lenses per role, 10-15 hand-written claims per lens

**Skip:** Agent tools, curator intelligence, knowledge graph, ingestion pipeline, archetypes.

**Estimated effort:** 4-5 days

### Phase 2: Agent Tools + Reactive Retrieval

**Build:**
- `knowledge_browse()`, `knowledge_read()`, `knowledge_search()` tools
- Embedding computation on claim insert/update
- Forced reactive triggers in role prompts
- Eval: tool invocation rate, Tier 3 fetch rate, groundedness

**Estimated effort:** 3-4 days

### Phase 3: Knowledge Graph + Curator v1

**Build:**
- `knowledge_edges` population: manual edges + curator-discovered
- Link discovery (within-role, then cross-role)
- Contradiction surfacing in injection flow
- Epistemic authority weights
- Dialectical synthesis in prompts
- Staleness detection + health report
- Gap detection

**Estimated effort:** 4-5 days

### Phase 4: Ingestion Pipeline + Private Knowledge

**Build:**
- Source ingestion CLI with LLM extraction
- Dedup via embeddings
- Founder review/approve workflow
- Agent-discovered claim capture
- Bulk bootstrap command
- Private knowledge notes (per-agent scratchpad)

**Estimated effort:** 5-6 days

### Phase 5: Knowledge Archetypes + Memory Consolidation

**Build:**
- Archetype definitions (3-4 per role)
- Seed claim packages
- Company setup: select archetype → seed knowledge
- Archetype update propagation ("zazig-suggested")
- Outcomes tracking (claim usage → job outcome correlation)
- Salience recalculation
- Pattern extraction from repeated agent observations

**Estimated effort:** 5-6 days

---

## Open Questions

1. **Embedding model:** OpenAI `text-embedding-3-small` (1536 dims, cheap, fast) is the pragmatic choice. Anthropic embeddings could reduce vendor dependency. Decision: start with OpenAI, abstract the interface.

2. **Confidence threshold for proactive loading:** 0.75 is a starting guess. The eval harness will tell us the right number. Too high = proactive injection fires rarely (defeats the purpose). Too low = wrong-frame anchoring. Tune empirically.

3. **Knowledge vs Memory boundary:** Memory is automatic (pre-compaction flush), knowledge requires founder approval. Clear in theory, fuzzy in practice. When an agent discovers "Supabase RLS needs security definer functions" — is that memory (operational note) or knowledge (institutional claim)? Rule: if it's specific to this codebase, it's memory. If it's generalizable, it's knowledge.

4. **Cross-role injection automation:** Current design: never automatic, always via agent tool call. Future option: "critical cross-role" flag on edges that auto-injects relevant cross-role claims when a contradiction or dependency fires. Defer to Phase 3 eval results.

5. **Company stage transitions:** Who sets `companies.stage`? Founder manually? Or should the system detect stage transitions from signals (revenue data, team size, funding events)? Start manual, automate later.

6. **Claim versioning:** When a founder edits a claim, keep history? Yes — simple `knowledge_claim_versions` table. Defer to Phase 4+.

---

## Future Research Directions (Phase 6+)

From Gemini's review — genuinely novel approaches that are beyond current scope but worth tracking:

- **Executable knowledge:** Claims that include micro-models, decision trees, or simulation parameters — not just text. A pricing claim that can *run* a pricing calculator.
- **Theory of Mind edges:** Agent-model sub-graphs. "What the CEO believes the CTO believes about security." Enables executive negotiation patterns.
- **Bayesian belief updating:** Real-time confidence adjustment when job outcomes contradict claims. Currently batch (curator). Could be streaming.
- **Dynamic LoRA adapters:** Instead of injecting archetype knowledge as text, fine-tune lightweight model adapters per archetype. Agent *becomes* a YC-style CEO at the neural level. Requires model fine-tuning infrastructure.
- **Prediction markets for knowledge:** Agents "bet" belief tokens on claims. Successful claims earn tokens (authority). Darwinian knowledge curation via multi-agent RL.
- **Latent space communication:** Agents pass embeddings instead of text for cross-role knowledge sharing. Dramatically reduces token costs. Requires custom model serving.

---

## Review Synthesis

### Where the two reviewers agreed:
- Three-tier progressive disclosure is the right pattern
- Dual proactive + reactive loading is necessary (keep both)
- Start sparse, prove retrieval quality, then add intelligence
- Need governance primitives (precedence, validity, claim types)

### Where they diverged:

| Dimension | Codex (pragmatic) | Gemini (provocative) |
|-----------|------------------|---------------------|
| Core risk | Building too much before proving quality | Building a library system instead of a cognitive architecture |
| Phase 1 focus | Eval harness + simple injection | Same, but also consider knowledge dynamics |
| Contradictions | Surface for founder resolution | Use as productive inputs to agent reasoning |
| Evolution | Track usage, flag staleness | Bayesian updating, memory consolidation, hypothesis generation |
| Long-term vision | Well-organized, reliable knowledge retrieval | Active epistemology, belief systems, executable knowledge |

### What this design chose:

Phase 1-3 follows Codex's pragmatism: simple schema, eval-first, prove retrieval quality. Phase 4-5 incorporates Gemini's dynamics: memory consolidation, hypothesis generation, private knowledge. Phase 6+ tracks Gemini's radical ideas as research directions.

The design is operationally practical (ships in weeks) while architecturally ambitious (the schema supports everything from flat claims to knowledge graphs to dialectical synthesis). The phases are sequenced so nothing is wasted — each phase builds on proven foundations from the one before.

---

*This design treats knowledge the way skills treat capability: as a navigable, discoverable, progressively-disclosed domain that the agent is aware of but doesn't carry in full. The Lens Index is to knowledge what the skill catalog is to capabilities — a lightweight signpost that says "you know about this, go deeper when you need to." The innovation isn't any single feature — it's the composition: progressive disclosure + claim taxonomy + salience promotion + contradiction surfacing + company stage filtering + epistemic authority. No existing system combines all of these.*
