# Memory Architecture Synthesis v2: Definitive Recommendation

**Date:** 2026-03-03
**Author:** Merged synthesis (Claude Opus 4.6 + Gemini CLI), commissioned by Tom
**Sources:** 21 research documents (3 deep research, 13 tweet captures, 5 repo recons), ORG MODEL reference, two independent synthesis reports
**Purpose:** Definitive architecture recommendation for Zazig's Layer 6 (Memory)

---

## How This Document Was Made

Two independent synthesis reports were produced from the same 21-source research corpus:

- **Claude synthesis** (~850 lines): Detailed landscape analysis, 10-type taxonomy, hybrid build recommendation (Option C), full SQL DDL, 6-scope visibility matrix, 3-phase implementation plan.
- **Gemini synthesis** (~95 lines): Compressed, opinionated, 7-type taxonomy, full roll-own recommendation (Option A), strong emphasis on "Reasoning Memory" as differentiator, 3-phase implementation plan.

This v2 document resolves every disagreement, takes the strongest position from each, and produces a single canonical reference. Where both agree, the consensus is stated without attribution. Where they disagree, the better position is chosen with reasoning.

---

## 1. Landscape Summary

The field of agent memory is roughly 18 months old as a distinct engineering discipline, catalysed by the Stanford "Generative Agents" paper (April 2023) and MemGPT (October 2023). By early 2026, it has bifurcated into two ecosystems: **enterprise frameworks** (Zep, Mem0, Letta) targeting production multi-tenant platforms, and **community-built systems** (Spacebot, claude-mem, semantic-memory, MLP, Recall Protocol) targeting individual agent operators.

### The Three Waves

Both syntheses identify the same progression, which Gemini frames crisply:

1. **RAG-as-Memory** (2023-2024): Naive vector search over chat history. The baseline everyone has surpassed.
2. **Tiered Cognitive Architectures** (2024-2025): Treating LLMs as CPUs and memory as the file system/RAM hierarchy. Spacebot, MLP, claude-mem.
3. **Memory-as-OS-Kernel** (2025-2026): Hybrid Postgres + pgvector + graph. Graph-based relational memory for multi-hop reasoning (Zep, Spacebot). The current state of the art.

Zazig enters at Wave 3 but with a structural advantage no existing system has: a multi-tier AI workforce with an orchestrator that controls memory assembly. Every existing system is single-agent or flat-multi-agent. None have Executive/Employee/Contractor tiers, scoped visibility, or orchestrator-driven retrieval.

### Approach Categories

| Category | Representative Systems | How It Works | Strengths | Weaknesses |
|----------|----------------------|--------------|-----------|------------|
| **File-based** | claude-chief-of-staff, napkin.md, MEMORY.md | Markdown/YAML files read at session start | Human-readable, auditable, zero infrastructure | No search, no scaling, manual curation |
| **Vector DB** | claude-code-semantic-memory, Moltbot (layer 2) | Embeddings in SQLite-vec/ChromaDB, cosine similarity recall | Semantic retrieval, low-latency | No temporal reasoning, similarity != relevance |
| **Hybrid Vector + FTS** | Spacebot, claude-mem | Vector search + full-text search + Reciprocal Rank Fusion | Best retrieval quality, handles keyword + semantic | Two storage engines to maintain |
| **Knowledge Graph** | Zep/Graphiti, Mem0 (graph mode) | Entity nodes + fact edges with temporal validity | Temporal reasoning, conflict resolution, relationship tracking | Infrastructure complexity, write-time LLM cost |
| **Hybrid Vector + Graph** | Zep, Mem0, AWS reference architecture | Vector for retrieval, graph for relationships + temporal | Production-proven, handles all memory types | Most complex, highest infrastructure cost |
| **Protocol-based** | Recall Protocol, MLP | Standardised API for inter-agent memory sharing | Platform-neutral, interoperable | Early-stage, unproven at scale |
| **LLM-as-OS** | Letta/MemGPT | Agent self-manages memory via tool calls (paging metaphor) | Elegant abstraction, agent-driven | Quality depends on LLM judgment |

### Production Evidence

- **Zep**: Survived 30x traffic surge (thousands to millions hourly requests), 150ms P95 graph search, 99.95%+ uptime, SOC 2 Type 2 certified
- **Mem0**: 41K GitHub stars, 14M+ downloads, 90% token cost savings vs full-context, AWS official architecture reference
- **Letta/MemGPT**: $10M seed from Felicis, cloud production service, Agent File format for portable stateful agents
- **ChatGPT Memory**: 700M+ weekly users, but instructive failures (memory wipes, context rot, domain bleeding, hallucination amplification)
- **Spacebot**: 1507 likes on launch tweet, community leader in the OpenClaw ecosystem, best open-source memory graph implementation

### The Critical Consensus Finding

Both syntheses converge on the same fundamental insight: **most stored memories are never retrieved.** Zep retrieves top-20 facts per query; Mem0 defaults to top-3. Retrieval quality matters exponentially more than storage capacity. This shapes the entire architecture: optimise for recall precision, not memory volume.

---

## 2. Key Innovations Worth Stealing

Both syntheses identified overlapping sets of innovations. The merged ranking below takes the best framing from each, sorted into must-have, high-value, and worth-noting tiers.

### Tier 1: Must Have

| # | Innovation | Source | Why It Matters for Zazig |
|---|-----------|--------|--------------------------|
| 1 | **Cortex Bulletin Pattern** | Spacebot | Instead of injecting raw memories, synthesise them into a coherent brief on a schedule. Controls token budget, deduplicates, creates narrative from bullet points. Directly maps to Position 9 in our prompt stack. |
| 2 | **Progressive Disclosure** | claude-mem | Inject a compact index (~800 tokens) at session start; agent fetches details on demand via MCP tools. 10x token savings. Solves the "500 memories, 4K token budget" problem the CPO will hit. |
| 3 | **Typed Memory Categories with Per-Type Defaults** | Spacebot (8 types), MLP (7 types), semantic-memory (6 types) | Not all memories are equal. Identity at 1.0, observations at 0.3 creates a natural prioritisation hierarchy. Reduces need for manual importance scoring. |
| 4 | **PreToolUse Thinking-Block Injection** | @PerceptualPeak / claude-code-semantic-memory | Query the agent's own thinking blocks mid-task for additional memories. Creates a self-correcting workflow. The user's initial prompt becomes less relevant the longer the task runs; thinking blocks are the most current signal. Gemini ranks this #1; Claude ranks it #4. Both agree it is critical. |
| 5 | **Compactor-as-Memory-Extractor** | Spacebot, claude-code-semantic-memory | When context compacts, extract memories in the same LLM pass. The "memory flush" that captures information before it leaves the context window. Critical for persistent agents (CPO) that hit compaction regularly. |
| 6 | **Confidence Scoring** | MLP (4 tiers), Riley Coyote continuity framework | Each memory tagged 0-1. "User said directly" (0.95+) vs "I inferred from patterns" (0.4-0.7). Prevents confabulation. Enables threshold-based filtering at retrieval time. Gemini ranks this #3 for preventing "hallucination amplification." |
| 7 | **Per-Type Decay Rates** | MLP, @Unisone weighted categories | Facts don't decay (0.0), commitments decay fast (0.2), preferences drift slowly (0.1). Better than a single global decay rate. |
| 8 | **Observer Agent Pattern** | claude-mem | A secondary "shadow" process extracts memories so the worker agent stays focused on the task. Context windows stay clean. Gemini ranks this #2 for ROI on retrieval quality. |

### Tier 2: High Value

| # | Innovation | Source | Why It Matters for Zazig |
|---|-----------|--------|--------------------------|
| 9 | **Reciprocal Rank Fusion (RRF)** | Spacebot | Fuses vector, FTS, and graph search results using rank-based scoring. Works on ranks not scores, avoiding normalisation across different distance metrics. Both syntheses agree this is how you beat 90% of naive RAG setups. |
| 10 | **Tombstone Pattern** | MLP | Instead of deleting memories, create a tombstone that supersedes the original. Preserves audit trail. Critical for multi-agent systems where one agent's correction needs to propagate. |
| 11 | **ContextPack with Token Budgeting** | MLP | Score candidate memories by relevance, fill a token budget greedily from highest-scored. Log a compilation trace (considered vs. included vs. denied). Makes memory injection deterministic and auditable. |
| 12 | **Memory Graph with Typed/Weighted Associations** | Spacebot | `Updates` (1.5x), `Contradicts` (0.5x), `CausedBy` (1.3x), `RelatedTo` (1.0x). Graph edges track knowledge evolution. The `Updates` chain lets you trace how a fact changed over time. |
| 13 | **Sleep-Time Agents / Heartbeat Reflection Loops** | Letta, Gemini deep research | Asynchronous processes that run between sessions to extract beliefs, resolve conflicts, reorganise memory. Maps to our orchestrator scheduling memory-maintenance contractor jobs. Gemini's framing: agents process their own "experiences" during idle time, consolidating logs into facts and procedures. |

### Tier 3: Worth Noting

| # | Innovation | Source | Why It Matters for Zazig |
|---|-----------|--------|--------------------------|
| 14 | **Questions-from-Reflection** | MLP | After processing memories, generate curiosity questions (gap/implication/clarification). Turns passive memory into active learning. CPO could proactively follow up on stalled features. |
| 15 | **Access Tracking** | Spacebot | `last_accessed_at`, `access_count` on every memory. Cheap to maintain, feeds decay calculations and popularity-based boosting. |
| 16 | **Token Economics/ROI Tracking** | claude-mem | Track discovery_tokens (cost to create memory) vs read tokens (cost to inject). Data-driven answer to "is our memory system worth the overhead?" |
| 17 | **Recall Protocol Trust Tiers** | @statezero / Recall Protocol | Agent reputation derived from retrieval metrics, not social signals. Per-tier rate limiting. Relevant for the contractor marketplace where cross-company memory needs governance. |
| 18 | **QMD for Local Knowledge Search** | @andrarchy, @code_rams, @intellectronica | BM25 + vector embeddings for local markdown files. 96% token savings. Relevant for the local-agent daemon side. |

---

## 3. Memory Taxonomy: Resolved

### The Disagreement

Claude proposes 10 types: Identity, Decision, Principle, Correction, Fact, Preference, Observation, Event, Goal, Relationship.

Gemini proposes 7 types: Identity, Facts, Decisions, Preferences, Gotchas, Relationships, Moments.

### Resolution: 8 Types

The right answer is 8. Here is the reasoning for each type and why it earns its place or gets cut:

| Type | Verdict | Reasoning |
|------|---------|-----------|
| **Identity** | KEEP | Consensus. Both include it. Permanent, highest priority. |
| **Decision** | KEEP | Consensus. "Why we did X instead of Y" prevents re-arguing. Operationally critical in a multi-agent org where different agents make decisions that affect each other. |
| **Principle** | MERGE with Correction into **Gotcha** | Claude separates Principle (learned rules) from Correction (mistakes to avoid). Gemini combines them into Gotcha. In practice, the difference between "always use Gherkin AC" (principle) and "pgvector needs `<=>` not `<->` for cosine distance" (correction) is the same operationally: it is a hard-won lesson that prevents repeating a mistake. The distinction costs classification tokens without improving retrieval. Use **Gotcha** (Gemini's term) for both. |
| **Fact** | KEEP | Consensus. Verifiable project data, schemas, hard truths. Zero decay. |
| **Preference** | KEEP | Consensus. User/org style, tone, tooling choices. Slow drift. |
| **Observation** | KEEP | Claude has this; Gemini folds it into Moments. But observations ("Feature specs with fewer than 3 AC tend to come back for revision") are qualitatively different from events ("PR #94 was merged on 2026-02-24"). Observations are inferred patterns; events are timestamped occurrences. Observations are the raw material for Gotchas -- they promote up the chain when confirmed. Worth keeping. |
| **Event** | MERGE into **Moment** | Gemini's "Moment" and Claude's "Event" cover the same ground: high-signal episodic snapshots. "Moment" is the better name -- it implies significance, not just temporal occurrence. Aggressive decay. |
| **Goal** | CUT | Claude includes this; Gemini omits it. Goals in Zazig are already tracked in the features/jobs tables with explicit lifecycle states. Duplicating them in the memory system creates a synchronisation problem. When a feature moves to `complete`, do you also archive the memory? This is the orchestrator's job, not the memory system's. Goals live in the pipeline, not in memory. |
| **Relationship** | KEEP | Both include it. Trust scores, inter-agent dynamics, human preferences. Slow evolution. |

### The Definitive Taxonomy: 8 Types

| Memory Type | Default Importance | Decay Rate | Description | Zazig Example |
|-------------|-------------------|------------|-------------|---------------|
| **Identity** | 1.0 | 0.0 (permanent) | Core self-model, name, role, evolution | "I am the CPO. I own product strategy." |
| **Decision** | 0.85 | 0.0 (superseded, not decayed) | Choices made with context about why. Prevents re-arguing. | "We chose Supabase over custom infra because..." |
| **Gotcha** | 0.9 | 0.0 (permanent) | Lessons learned from failure, bugs, or hard-won experience. Includes both corrective knowledge ("don't do X") and prescriptive principles ("always do Y"). | "pgvector needs `<=>` not `<->` for cosine distance" / "Always use Gherkin AC for job specs" |
| **Fact** | 0.7 | 0.0 (superseded, not decayed) | Verifiable project data, schemas, hard truths | "The orchestrator is in supabase/functions/orchestrator/" |
| **Preference** | 0.65 | 0.1 (shifts gradually) | User/team working style preferences | "Tom prefers concise commit messages" |
| **Observation** | 0.4 | 0.15 (inferred, less reliable) | Patterns the agent noticed but didn't confirm | "Feature specs with fewer than 3 AC tend to come back for revision" |
| **Moment** | 0.3 | 0.2 (aggressive decay) | High-signal episodic snapshots of key events | "PR #94 was merged on 2026-02-24" |
| **Relationship** | 0.6 | 0.05 (evolves slowly) | Inter-agent or inter-person dynamics, trust scores | "CTO reviews CPO's feature specs before breakdown" |

**Why 8 and not 10 or 7:** Seven loses Observation, which is the raw material for the promotion pipeline (observations that survive become Gotchas). Ten adds Goal (redundant with pipeline state) and splits Principle/Correction (a distinction that costs more in classification than it gains in retrieval). Eight is the sweet spot: every type earns its place through distinct operational behaviour (different decay rates, different importance defaults, different promotion paths).

Each memory also carries:
- `confidence_score` (0.0-1.0)
- `confidence_source` (user_stated, user_confirmed, context_implied, pattern_inferred, agent_generated)
- `scope` (company, project, feature, job, personal)
- `role_origin` (which role created this memory)
- `tags` (freeform, for retrieval filtering)

---

## 4. Build vs Buy vs Hybrid: Resolved

### The Disagreement

Claude recommends **Option C (Hybrid)**: Build on Supabase, borrow patterns aggressively from existing tools, adapt to our 3-tier model. No code copied, only architectural patterns and prompt templates.

Gemini recommends **Option A (Full Roll-Own)**: Build everything natively on Supabase. You already have pgvector. Use pg_cron for decay/maintenance and Realtime for inter-agent memory sync. No external tools.

### Resolution: Option A is Correct. The Disagreement is Smaller Than It Appears.

When you read both positions carefully, they are saying nearly the same thing. Both recommend:
- Build on Supabase Postgres + pgvector
- No external dependencies (no Neo4j, no Zep, no Mem0)
- No new infrastructure beyond what we already have
- Borrow patterns (not code) from the research

Claude calls this "Hybrid" because it emphasises borrowing patterns. Gemini calls this "Full Roll-Own" because it emphasises no external dependencies. They are describing the same architecture from different angles.

The correct label is **Roll-Own (Pattern-Informed)**. Zazig builds everything on Supabase. The patterns from Spacebot, MLP, claude-mem, and others inform the design -- but no external tool is adopted, no library is imported, no service is called (except OpenAI for embeddings, which is an API call, not a tool adoption).

### Why Not a True Hybrid (importing Mem0/Zep libraries into Edge Functions)?

Claude's Option C analysis already explains this, and Gemini's rejection of Option C is correct:

1. **Impedance mismatch.** Every existing tool assumes a flat agent model. Mapping our 3-tier workforce onto Mem0's agent/user/session scoping or Zep's single-agent temporal graph would cost as much engineering as building from scratch.
2. **Two schemas.** Running Mem0's schema alongside our orchestrator's schema means two sources of truth for memory state. This always goes wrong.
3. **Licensing risk.** Zep is BSL 1.1 (not OSS). claude-mem is AGPL 3.0. Mem0 is Apache 2.0 but their interesting features are in the hosted cloud service.
4. **We already have the orchestrator.** The "when to read/write memory" question is already solved by our orchestrator. Importing a tool that also wants to manage memory lifecycle creates authority conflicts.

### What We Build, What We Borrow

| Component | Build or Borrow Pattern | Source of Pattern |
|-----------|------------------------|-------------------|
| **Storage layer** | Build (Supabase/pgvector) | Own infrastructure |
| **Embedding pipeline** | API call (OpenAI text-embedding-3-small) | Standard practice |
| **Memory extraction prompts** | Borrow pattern (MLP classifier + scorer prompts, adapted) | MLP repo recon |
| **Search pipeline** | Build, borrowing RRF pattern | Spacebot repo recon |
| **Decay/maintenance** | Build, borrowing formulas | Spacebot + MLP |
| **Context injection** | Build, borrowing progressive disclosure + bulletin patterns | claude-mem + Spacebot |
| **Graph relationships** | Build (associations table in Postgres) | Spacebot (simplified) |
| **Confidence scoring** | Build, borrowing tier model | MLP + Riley Coyote |
| **Conflict resolution** | Build, borrowing tombstone pattern | MLP |

### The Tool Assessment (for the record)

| Tool | Architecture | Multi-Agent | License | Verdict |
|------|-------------|-------------|---------|---------|
| **Zep/Graphiti** | Temporal knowledge graph + Neo4j | No native support | BSL 1.1 (not OSS) | No -- BSL license, Neo4j dependency, no multi-agent scoping |
| **Mem0** | Hybrid vector + graph, managed cloud | Agent-scoped writes | Apache 2.0 | No -- flat agent model, cloud dependency |
| **Letta/MemGPT** | Self-editing memory, cloud service | Per-agent state | Apache 2.0 | No -- single-agent model, our orchestrator manages memory, not the agent |
| **Honcho** | User modelling, hosted service | No | OSS | No -- user-modelling focus, not agent-memory |
| **claude-mem** | Observer + SQLite + ChromaDB | No | AGPL 3.0 | No -- single-user, AGPL, local-only |
| **Recall Protocol** | Shared memory protocol, FastAPI + pgvector | Yes (protocol-native) | MIT | No -- 6 commits, 1 star, not production-ready. Protocol ideas worth studying. |

**Bottom line:** No existing tool fits Zazig's multi-agent, multi-tier architecture. The patterns from these tools are worth stealing. The tools themselves are not worth adopting.

---

## 5. Memory Lifecycle

### 5.1 Creation (Write Pipeline)

Memories are created through four paths:

**Path 1: Post-Job Extraction (Primary)**

When a job completes, the orchestrator triggers a memory extraction step. This is the main source of institutional memory.

```
Job completes
    |
    v
Orchestrator reads job report + transcript summary
    |
    v
Extraction prompt (adapted from MLP classifier + scorer):
  - Classify each insight into 8 memory types
  - Score confidence (0.0-1.0) with source attribution
  - Tag with scope (company/project/feature/job)
  - Check for contradictions against existing memories
    |
    v
Deduplication check (pgvector cosine similarity >= 0.92)
    |
    v
New memories written to memories table
Old contradicted memories get superseded_by pointer (tombstone pattern)
Association edges created (updates/contradicts/related_to)
```

**Path 2: Agent Tool Call (Persistent Agents Only)**

For Executives and Employees, expose `memory_save` as an MCP tool. The agent decides what is worth remembering during conversation. The orchestrator validates scope permissions before writing.

**Path 3: Compaction Memory Flush (Persistent Agents Only)**

When context compacts, extract memories from the outgoing context before it is lost. This is the "memory flush" -- the last chance to capture information before it leaves the context window. Critical for the CPO, which hits compaction regularly during long strategy sessions.

**Path 4: Human-Supervised Correction**

Humans can directly create, edit, or delete memories via the admin interface (or Slack gateway for Executives). These memories are written with `confidence_source = 'user_stated'` and highest confidence. When editing an existing memory, the old version gets tombstoned and a new version is created.

### 5.2 Validation

Every memory write goes through a validation step before storage (per Gemini synthesis, this is an explicit pipeline stage):

1. **Type classification:** Extract prompt assigns one of the 8 types
2. **Confidence scoring:** Explicit (user said it, 0.9+) vs Inferred (agent guessed it, 0.3-0.7)
3. **Deduplication:** pgvector nearest-neighbour check -- >= 0.92 cosine similarity is a duplicate
4. **Contradiction detection:** Semantic similarity + type match against existing memories
5. **Scope validation:** Does the writing agent have permission to write to this scope?

### 5.3 Storage

All memories live in Supabase Postgres with pgvector:

```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),

    -- Content
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,  -- identity/decision/gotcha/fact/preference/observation/moment/relationship

    -- Scoring
    importance REAL NOT NULL DEFAULT 0.5,
    confidence_score REAL NOT NULL DEFAULT 0.5,
    confidence_source TEXT NOT NULL DEFAULT 'agent_generated',
    -- enum: user_stated/user_confirmed/context_implied/pattern_inferred/agent_generated

    -- Scoping
    scope TEXT NOT NULL DEFAULT 'company',  -- company/project/feature/job/role_shared/individual
    scope_id UUID,  -- project_id, feature_id, or job_id depending on scope
    role_origin TEXT,  -- which role created this
    worker_id UUID,  -- which worker instance (for individual scope)
    worker_tier TEXT,  -- exec/employee/contractor

    -- Retrieval
    embedding vector(1536),  -- text-embedding-3-small
    tags TEXT[] DEFAULT '{}',

    -- Lifecycle
    decay_rate REAL NOT NULL DEFAULT 0.0,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_count INTEGER NOT NULL DEFAULT 0,
    superseded_by UUID REFERENCES memories(id),
    forgotten BOOLEAN NOT NULL DEFAULT FALSE,

    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_job_id UUID,  -- which job created this memory
    source_session_id TEXT  -- which session created this
);

-- Graph edges
CREATE TABLE memory_associations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,  -- updates/contradicts/caused_by/result_of/related_to/part_of
    weight REAL NOT NULL DEFAULT 0.5,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, target_id, relation_type)
);

-- Indexes
CREATE INDEX idx_memories_company ON memories(company_id);
CREATE INDEX idx_memories_type ON memories(memory_type);
CREATE INDEX idx_memories_scope ON memories(scope, scope_id);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_memories_forgotten ON memories(forgotten);
CREATE INDEX idx_memories_embedding ON memories USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_memories_fts ON memories USING gin(to_tsvector('english', content));
CREATE INDEX idx_associations_source ON memory_associations(source_id);
CREATE INDEX idx_associations_target ON memory_associations(target_id);
```

**Design notes:**
- Single table for all memory types. The `memory_type` column + per-type decay rates handle behavioural differences.
- `scope` + `scope_id` handles hierarchical scoping without separate tables per scope.
- `worker_id` is nullable -- company-scope memories have no specific worker.
- No Redis for v1. Working memory is the context window itself. Add a cache layer only when concurrent sessions for the same agent create contention.
- Graph is in Postgres, not Neo4j. Our graph will be under 100K nodes for the first year. Postgres handles this via recursive CTEs for BFS traversal.

### 5.4 Retrieval (Read Pipeline)

A three-mode search pipeline:

**Mode 1: Hybrid Search (default for semantic queries)**

Runs three strategies in parallel, fuses with Reciprocal Rank Fusion:

```sql
-- RRF fusion query (simplified)
WITH vector_results AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY embedding <=> query_embedding) as rank
    FROM memories
    WHERE company_id = $1 AND NOT forgotten AND superseded_by IS NULL
    ORDER BY embedding <=> query_embedding LIMIT 20
),
fts_results AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY ts_rank(to_tsvector('english', content), query) DESC) as rank
    FROM memories
    WHERE company_id = $1 AND NOT forgotten AND superseded_by IS NULL
      AND to_tsvector('english', content) @@ plainto_tsquery('english', $2)
    LIMIT 20
),
graph_results AS (
    -- BFS from seed memories found in vector/FTS results
    -- weighted by association.weight * type_multiplier
    SELECT target_id as id, ROW_NUMBER() OVER (ORDER BY score DESC) as rank
    FROM graph_traversal($seed_ids)
    LIMIT 20
),
rrf AS (
    SELECT id, SUM(1.0 / (60.0 + rank)) as rrf_score
    FROM (
        SELECT id, rank FROM vector_results
        UNION ALL
        SELECT id, rank FROM fts_results
        UNION ALL
        SELECT id, rank FROM graph_results
    ) combined
    GROUP BY id
    ORDER BY rrf_score DESC
    LIMIT $3
)
SELECT m.* FROM memories m JOIN rrf ON m.id = rrf.id ORDER BY rrf.rrf_score DESC;
```

**Mode 2: Typed Retrieval (for structured queries)**

Direct Postgres queries filtered by memory_type, scope, importance. No embeddings needed. Used when the orchestrator knows exactly what it wants (e.g., "all Decisions for Project X").

**Mode 3: Recent/Important (for context injection)**

`ORDER BY created_at DESC` or `ORDER BY importance DESC`. Fast, no search overhead. Used for bulletin assembly.

### 5.5 Context Injection

Two patterns, matched to worker tier:

**For Persistent Agents (Executives, Employees): Bulletin Pattern**

On a schedule (configurable, default every 30 minutes), synthesise a coherent brief from the agent's relevant memories. Inject as Position 9 (Memory Context) in the prompt stack. Fixed token budget (default 2000 tokens).

```
Bulletin Assembly:
1. Query top 15 identity + gotchas (always included)
2. Query top 10 decisions (by recency)
3. Query top 10 facts (by relevance to active features/projects)
4. Query top 5 observations (by recency)
5. Query top 5 relationships (by relevance)
6. LLM synthesis -> coherent brief under token budget
7. Store as agent's current bulletin
8. Inject into every prompt at Position 9
```

The injection format uses XML for structured parsing (per Gemini synthesis):

```xml
<memory-context tier="executive" budget="2000_tokens">
  <recalled-learnings count="12">
    <memory type="GOTCHA" confidence="0.98" source="user_confirmed">
      We don't use Tailwind; prefer Vanilla CSS for this project.
    </memory>
    <memory type="DECISION" confidence="0.92" source="context_implied">
      Chose Supabase over custom infra because single-vendor reduces ops overhead.
    </memory>
    ...
  </recalled-learnings>
</memory-context>
```

**For Ephemeral Agents (Contractors): ContextPack Pattern**

At dispatch time, the orchestrator assembles a ContextPack:

```
ContextPack Assembly:
1. Query memories scoped to the job's project + feature
2. Query role-type shared memories (if opt-in for this contractor type)
3. Score by relevance to job spec (cosine similarity of job spec embedding vs memory embeddings)
4. Fill token budget (default 1500 tokens) greedily from highest-scored
5. Log compilation trace (considered vs included vs denied)
6. Inject into job workspace as ## Relevant Memory section
```

**For Progressive Disclosure (Phase 3 enhancement):**

Instead of pre-loading all memories, inject a compact index and expose MCP tools for on-demand fetch. This becomes valuable when memory volume exceeds what fits in a single bulletin. The agent receives a brief summary ("You have 47 memories about Project X, including 3 decisions, 8 gotchas, and 12 facts") and can query for specific memories mid-task.

### 5.6 Decay and Maintenance

A scheduled maintenance job (pg_cron or orchestrator-scheduled) runs nightly:

**Decay Formula** (synthesised from Spacebot + MLP + Ebbinghaus):

```
For each non-forgotten, non-identity memory:
  days_old = (now - created_at) / 86400
  days_since_access = (now - last_accessed_at) / 86400

  type_decay = memory.decay_rate  -- per-type, from taxonomy
  age_decay = max(0.5, 1.0 - (days_old * type_decay))  -- max 50% decay from age

  access_boost = 1.1 if days_since_access < 7    -- recent access boosts
                 0.9 if days_since_access > 30    -- stale access penalises
                 1.0 otherwise

  new_importance = importance * age_decay * access_boost
```

**Pruning:** Memories below importance 0.1 that are older than 30 days are soft-deleted (forgotten = true). Identity, Decision, and Gotcha memories are exempt from pruning. Soft-deleted memories are hard-deleted after 90 days.

**Deduplication:** New memories are checked against existing memories using pgvector cosine similarity. If >= 0.92 similarity exists, the new memory is either rejected (duplicate) or merged (if it adds new information).

**Conflict Resolution:** When a new memory contradicts an existing one (detected via semantic similarity + type match):
1. Create a `contradicts` association edge
2. If the new memory has higher confidence, supersede the old one (tombstone)
3. If confidence is similar, flag both for human review
4. Never silently apply last-write-wins

Per Gemini synthesis: when a new fact contradicts an old memory, don't just store both. This is a "Reflection Conflict" that requires resolution -- either automated (confidence-based) or escalated (human or executive review). Silent contradiction accumulation is memory rot.

### 5.7 Memory Promotion Pipeline

When a memory repeatedly proves correct across multiple jobs (high access count, never contradicted), it is a candidate for promotion:

```
Observation (inferred pattern, low confidence)
    -> 3+ consistent signals, no contradictions
    -> Promoted to Gotcha (confirmed lesson, high confidence)

Gotcha (confirmed lesson)
    -> 5+ accesses across multiple projects, universal applicability
    -> Proposed as doctrine candidate
    -> Human review required for doctrine promotion
    -> Skill modification for procedural promotion

Decision (project-scoped choice)
    -> Same decision made across 3+ projects
    -> Promoted to company-scope Fact or Gotcha
```

This pipeline is Zazig's unique contribution. No existing system has a promotion path from episodic memory to institutional knowledge. The key constraint: **memory never auto-updates doctrines.** Beliefs require deliberate revision. The promotion pipeline surfaces candidates; humans (or executives) approve them.

---

## 6. Organisational vs Individual Memory

This is Zazig's novel challenge. No existing tool handles this because no existing tool operates a multi-tier AI workforce with scoped access.

### 6.1 Memory Scopes

Both syntheses agree on the hierarchical structure. Claude identifies 6 scopes; Gemini identifies 3 tiers (Executive Suite, Role-Shared, Job-Scoped RAM). The merged model uses Claude's 6 scopes because they map cleanly to existing DB entities, but incorporates Gemini's tier-based access framing:

```
Company Memory (institutional knowledge)
    |
    +-- Project Memory (everyone on Project X)
    |       |
    |       +-- Feature Memory (agents working on Feature Y)
    |               |
    |               +-- Job Memory (one specific job execution)
    |
    +-- Role-Type Shared Memory (all Senior Engineers)
    |
    +-- Individual Worker Memory (CPO's personal episodic)
```

### 6.2 Scope Definitions

| Scope | Content | Who Writes | Who Reads | Example |
|-------|---------|-----------|-----------|---------|
| **Company** | Strategy, org structure, tech stack, key decisions | Executives, Human | All agents in company | "We use Supabase for all persistence" |
| **Project** | Architecture decisions, codebase facts, project-specific patterns | Any agent on project | Any agent on project | "Project X uses a monorepo with turborepo" |
| **Feature** | Feature-specific context, AC clarifications, implementation decisions | Agents working on feature | Agents working on feature | "Feature Y's auth flow uses PKCE" |
| **Job** | Execution-specific context, intermediate results | Job worker | Same worker (multi-phase), post-job extractor | "The test suite requires `--no-cache` flag" |
| **Role-Type Shared** | Patterns learned by all instances of a role | Any agent with that role | Any agent with that role | "Senior Engineers: always check for index migrations" |
| **Individual** | Personal episodic memory, style preferences, relationship context | Specific worker instance | Same worker instance | "CPO: Tom prefers bullet-point status updates" |

### 6.3 Scope by Worker Tier

This maps directly to the ORG MODEL's three tiers:

| Tier | Reads From | Writes To | Gemini's Framing |
|------|-----------|-----------|-------------------|
| **Executive** | Company + all projects they manage + individual | Company (decisions), project, individual | "Executive Suite" -- full episodic access, shared exec memory |
| **Employee** | Company + assigned projects + role-type shared + individual | Project, feature, role-type shared, individual | "Role-shared expertise" -- individual + role-type shared |
| **Contractor** | Job-scoped + role-type shared (if opt-in) | Job (always), role-type shared (if opt-in) | "RAM-only" with "Tombstone commit" to org memory at job completion |

Gemini's "Tombstone commit" framing is worth keeping: when a contractor completes a job, the post-job extraction step is their "tombstone commit" -- the last memories they leave behind before being deallocated. It is the only way contractor-discovered knowledge enters the permanent record.

### 6.4 Memory Visibility Matrix

```
                    Company  Project  Feature  Job  Role-Shared  Individual
Executive READ:       Y        Y        Y      N*      Y           Y (own)
Executive WRITE:      Y        Y        Y      N       N           Y (own)
Employee READ:        Y        Y*       Y*     N       Y (own role) Y (own)
Employee WRITE:       N        Y*       Y*     N       Y (own role) Y (own)
Contractor READ:      N        N        N      Y (own) Y* (opt-in)  N
Contractor WRITE:     N        N        N      Y (own) Y* (opt-in)  N

* = scoped to assigned projects/features
N* = Executives don't read individual job memories, but read job reports
```

This matrix is enforced via Supabase Row-Level Security policies on the `memories` table, not application-level checks.

### 6.5 The Cortex Bulletin (Organisational Memory)

Per Gemini synthesis: the "Cortex Bulletin" is a synthesised summary of the entire org's state, injected into all agents. This is distinct from individual memory -- it is the organisation's shared consciousness.

In practice, this maps to Position 9 for Executives: the bulletin includes not just their personal memories but a synthesis of company-scope memories relevant to their current work. The CPO's bulletin includes "CTO decided to migrate to edge functions last week" (a company-scope Decision memory created by the CTO). The agent never queries the CTO's individual memory directly -- it reads the shared Decision that the CTO's post-job extraction committed to company scope.

This implements Manus AI's principle: **"Share memory by communicating, don't communicate by sharing memory."** Agents do not read each other's individual memory. Instead, inter-agent decisions are stored in shared scope as structured outcomes (who, what, why, when). The orchestrator mediates all cross-agent memory access.

### 6.6 The Contractor Marketplace Problem

When contractors serve multiple companies, their role-type shared memory creates a privacy challenge:

**Phase 1 (Launch): Per-Company Shared Memory**

A Cybersecurity Tester's shared memory is specific to one company's patterns. Safe, simple, no privacy concerns.

**Phase 2 (Future): Anonymised Cross-Company Patterns**

The tester learns patterns from all companies but memories are stripped of company-identifying information before sharing. Example: "React apps often have XSS vulnerabilities in user-generated content components" (pattern -- shareable) vs "Company X's dashboard has an XSS vulnerability" (company-specific fact -- never shared).

Implementation: two memory pools per contractor role-type:
- `role_shared_memories` (company-scoped, always readable)
- `role_universal_memories` (anonymised, cross-company, opt-in per customer)

The anonymisation pipeline requires human review before any memory enters the universal pool. This is the marketplace differentiator but needs careful design -- defer to Phase 3.

---

## 7. How to 10X the Competition

Both syntheses agree that Spacebot is the current state of the art for open-source agent memory. Both also agree that Spacebot's memory is, by the community's own admission, "average" despite impressive architecture. The question is: why is it average, and how does Zazig avoid the same fate?

### What Spacebot Gets Wrong

1. **Single-agent architecture.** One bot per community. No concept of multiple agents with different roles sharing memory with scoped access. Every memory is visible to the one bot.
2. **No confidence scoring.** Every memory is treated with equal trustworthiness. A fact the user stated directly and a pattern the bot inferred have the same standing.
3. **No progressive disclosure.** The cortex bulletin is synthesised from all memories and injected into every conversation. As memory grows, the bulletin either exceeds its token budget or gets compressed to uselessness.
4. **No memory promotion pipeline.** A correction validated 50 times stays as a memory with the same importance as one validated once. No path from observation to principle to doctrine.
5. **Merge is unimplemented.** The code has a placeholder for merging memories with >0.95 similarity, but the actual merging logic does not exist. Near-duplicate memories accumulate.
6. **No orchestrator integration.** Memory is managed entirely within the bot process. Retrieval quality depends entirely on the LLM's judgment at query time.
7. **No scoped memory.** All memories live in one flat namespace per bot instance.

### The 10X Differentiators

Both syntheses identify differentiators. Claude focuses on structural advantages (multi-agent, orchestrator-driven). Gemini focuses on cognitive advantages (belief revision, procedural synthesis, active curiosity). The truth is both are needed -- structural advantages enable cognitive advantages.

| Dimension | Spacebot (Current SOTA) | Zazig (Target) | Why It Matters |
|-----------|------------------------|----------------|----------------|
| **Multi-agent memory** | Single bot, all memories visible | N agents, scoped by role/project/company | Structural advantage -- no competitor has this |
| **Orchestrator-driven retrieval** | Bot retrieves its own memories | Orchestrator assembles context at dispatch | Retrieval quality independent of agent LLM judgment |
| **Confidence scoring** | None | 5-tier with source attribution | Prevents acting on uncertain information |
| **Belief Revision** | Store both contradictions silently | Trigger "Reflection Conflict" and resolve | Prevents memory rot and hallucination amplification (per Gemini) |
| **Memory promotion** | None | Observation -> Gotcha -> Doctrine pipeline | Institutional learning across the org |
| **Procedural Synthesis** | None | Convert "I did X then Y then Z" into "When project is type A, use Workflow B" | Transforms episodic memory into reusable procedures (per Gemini) |
| **Progressive disclosure** | Bulletin only | Bulletin + index + on-demand MCP fetch | Scales to 10,000+ memories without context bloat |
| **Active Curiosity** | None | Agents generate "Gap Questions" -- things they don't know but need to | Turns passive memory into proactive research (per Gemini) |
| **Tier-appropriate memory** | One-size-fits-all | Executive (rich, persistent), Employee (focused, persistent), Contractor (job-scoped, tombstone commit) | Right-sized memory for right-sized workers |
| **Contractor marketplace** | N/A | Anonymised cross-company patterns | Network effect on specialist knowledge |

### The Actual Differentiator: The Orchestrator

Both syntheses converge on this: **the orchestrator is the differentiator.** Spacebot's memory is agent-managed -- the bot decides what to remember and what to recall. Zazig's memory is orchestrator-managed -- the orchestrator decides what memories to assemble for each job based on the job's context, the worker's tier, the project scope, and the role's memory permissions. The agent never sees the retrieval logic -- it receives a pre-built context with the right memories already in place.

This is the same architectural insight that makes Zazig's prompt stack work: the agent never sees the raw config. It receives a compiled prompt. Memory follows the same pattern. The agent does not manage its own memory any more than it manages its own personality or doctrines. The orchestrator compiles all six layers into a coherent prompt, and memory is simply Layer 6 made concrete.

### Reasoning Memory: The Cognitive Differentiator (per Gemini synthesis)

Gemini's strongest unique contribution is the emphasis on "Reasoning Memory" -- memory that does not just store and retrieve, but actively reasons about itself:

1. **Belief Revision:** When a new fact contradicts an old memory, the system does not just store both. It triggers a Reflection Conflict and forces resolution -- either by confidence comparison (automated) or by escalating to a human or executive (supervised). This prevents the "two contradictory facts, random selection at retrieval time" failure mode.

2. **Procedural Synthesis:** Converting episodic sequences ("I did X then Y then Z across three similar projects") into reusable procedures ("When project is type A, use Workflow B"). This is the memory promotion pipeline in action -- but specifically targeting procedural knowledge, not just declarative facts.

3. **Active Curiosity:** After reflection, agents generate "Gap Questions" -- things they do not know but need to. "What testing framework does Project X use?" or "Has the CTO approved the new auth approach?" These become proactive retrieval queries or follow-up items for the next human session. This transforms memory from a passive store into an active learning system.

These three capabilities are what separate a memory system that merely remembers from one that genuinely learns. Phase 3 of the implementation plan targets all three.

---

## 8. Recommended Architecture

### 8.1 Storage Layer

**Primary store:** Supabase Postgres with two tables (`memories` + `memory_associations`), as defined in Section 5.3.

**Embedding:** OpenAI `text-embedding-3-small` (1536 dimensions) via API call at memory write time. Stored in pgvector column. Same model embeds queries at retrieval time.

**Full-text search:** Postgres `tsvector` with `gin` index on memory content. No external FTS engine needed.

**Graph:** The `memory_associations` table in Postgres. Our graph is small enough (under 100K nodes in year one) that Postgres handles it via recursive CTEs for BFS traversal. No Neo4j.

**No Redis for v1.** Working memory is the context window itself. Add a cache layer only when concurrent sessions for the same agent accessing the same memory store create contention.

### 8.2 Write Pipeline

```
Four Write Paths:

1. POST-JOB EXTRACTION (Primary)
   Job completes -> orchestrator triggers extraction
   -> extraction prompt classifies + scores memories (8 types)
   -> validation: confidence scoring + source attribution
   -> dedup check (pgvector similarity >= 0.92)
   -> contradiction check against existing memories
   -> write to memories table
   -> create associations (updates/contradicts/related_to)

2. AGENT TOOL CALL (Persistent agents only)
   Agent calls memory_save MCP tool
   -> same extraction + dedup pipeline
   -> agent provides type, content, importance
   -> orchestrator validates scope permissions

3. COMPACTION FLUSH (Persistent agents only)
   Context compaction event
   -> extract memories from outgoing context
   -> same pipeline as #1

4. HUMAN OVERRIDE
   Admin creates/edits/deletes memory
   -> direct DB write
   -> confidence_source = 'user_stated'
   -> if editing: tombstone old, create new
```

### 8.3 Read Pipeline

```
Two Read Patterns:

1. DISPATCH-TIME ASSEMBLY (All agents)
   Orchestrator assembling job workspace:
   -> Determine worker tier and role
   -> Determine scope (company + project + feature)
   -> If Executive/Employee: generate bulletin (or use cached)
   -> If Contractor: assemble ContextPack from relevant memories
   -> Memory-Doctrine deduplication (suppress memories that restate active doctrines)
   -> Inject into Position 9 of prompt stack

2. ON-DEMAND FETCH (Persistent agents only, Phase 3)
   Agent uses memory_search MCP tool mid-session:
   -> Hybrid search (vector + FTS + graph, RRF fusion)
   -> Filter by scope permissions
   -> Return top-K results
   -> Agent decides what to use
```

### 8.4 Decay/Maintenance

```
Nightly Maintenance Job (pg_cron):

1. DECAY: Apply per-type decay formula to all non-exempt memories
2. PRUNE: Soft-delete memories below 0.1 importance, older than 30 days
3. DEDUP: Find memories with >= 0.92 cosine similarity, merge or flag
4. CONFLICT: Find active contradictions, resolve by confidence or flag for human
5. HARD DELETE: Remove soft-deleted memories older than 90 days
6. STATS: Log memory counts by type, scope, age distribution
7. REFLECTION (Phase 3): Generate Gap Questions from unresolved observations
```

### 8.5 Sharing Model

The Memory Visibility Matrix from Section 6.4, enforced via Supabase RLS policies.

### 8.6 Integration with Existing 6-Layer Prompt Stack

Memory becomes the concrete implementation of Position 9 in the existing prompt stack:

```
Position 1: Personality prompt          (Layer 1 - who you are)
Position 2: Role prompt                 (Layer 2 - what you do)
Position 3: Doctrine Tier 1 index       (Layer 4 - what you believe)
Position 3b: Canon library pointers     (Layer 5 - what you've studied)
--- cache break line ---
Position 4: Proactive doctrine claims   (Layer 4 - task-relevant beliefs)
Position 5: Doctrine tension blocks     (Layer 4 - cross-role contradictions)
Position 6: Canon source summaries      (Layer 5 - if high-similarity match)
Position 7: Skill content               (Layer 3 - how to work)
Position 8: Task context                (job spec, AC, dependencies)
Position 9: MEMORY CONTEXT              (Layer 6 - what you remember)  <-- THIS DOCUMENT
```

Position 9 contains either:
- **Bulletin** (for persistent agents) -- LLM-synthesised, periodically refreshed, XML-structured
- **ContextPack** (for ephemeral agents) -- orchestrator-assembled at dispatch time

**Priority hierarchy at inference time:** Role Prompt > Doctrines > Skills > Canons > Memory. When a memory conflicts with a doctrine, the doctrine wins. The memory gets flagged for review but is not injected. This prevents the "experience-following" failure mode where recalled memories override established beliefs.

**Memory-Doctrine deduplication at retrieval time:** Before injecting memories, check against active doctrines using semantic similarity. Suppress memories that merely restate what is already in doctrines. This prevents redundancy in the context window and saves token budget for memories that add genuinely new information.

### 8.7 PreToolUse Integration (Phase 2)

For persistent agents, hook into the PreToolUse event to query memories against the agent's current reasoning mid-task. When the agent is about to call a tool, the system:

1. Extracts the agent's current thinking/reasoning
2. Embeds it and queries the memory store
3. If high-relevance memories are found that were not in the original bulletin, injects them as additional context
4. The agent receives a "memory refresh" that keeps it aligned with past experience as the task evolves

This is the innovation from @PerceptualPeak that both syntheses rank as critical. It prevents "workflow drift" where the agent's initial prompt becomes less relevant the longer the task runs.

---

## 9. Implementation Phases

### Phase 1: Foundation (2-3 weeks)

**Goal:** Working memory storage and retrieval. Manual writes, orchestrator-assembled reads. No embeddings, no decay, no graph, no sharing.

**Deliverables:**

1. **Migration: `memories` table** -- full schema from Section 5.3, minus the embedding column and associations table (add those in Phase 2)
2. **Memory extraction prompt** -- single prompt adapted from MLP classifier + scorer, callable as an Edge Function. Classifies into 8 types, scores confidence.
3. **Post-job extraction step** -- when a job completes, orchestrator calls the extraction Edge Function with the job report, stores results in `memories`
4. **MCP tool: `memory_save`** -- for persistent agents (CPO) to manually save memories
5. **MCP tool: `memory_search`** -- simple text-match search (Postgres FTS), no embeddings yet
6. **ContextPack assembly** -- at job dispatch, query relevant memories by scope + type, inject as markdown section in workspace
7. **Memory type enum and validation** -- the 8-type taxonomy enforced at write time

**What this gives you:** Every job leaves behind structured memories. CPO can save memories manually. Contractors receive relevant project memories in their workspace. No intelligence in retrieval yet (just FTS), but the data is accumulating.

**What it does NOT give you:** No semantic search, no graph, no decay, no sharing, no bulletin, no confidence scoring beyond basic extraction prompt classification.

### Phase 2: Intelligence (3-4 weeks)

**Goal:** Semantic search, memory graph, decay, bulletin pattern, confidence scoring, PreToolUse injection.

**Deliverables:**

1. **Migration: add `embedding` column** (vector(1536)) to `memories` table
2. **Migration: `memory_associations` table** -- graph edges with typed relations
3. **Embedding pipeline** -- on memory write, call OpenAI embedding API, store in pgvector
4. **Hybrid search** -- pgvector cosine similarity + Postgres FTS + RRF fusion
5. **Deduplication** -- pgvector nearest-neighbour check on write (>= 0.92 = duplicate)
6. **Confidence scoring** -- add to extraction prompt, store in DB, filter at retrieval
7. **Cortex bulletin** -- scheduled synthesis for Executive agents, injected at Position 9
8. **Decay maintenance job** -- nightly pg_cron: per-type decay, pruning, stats logging
9. **Tombstone pattern** -- `superseded_by` column, never hard-delete recent memories
10. **Association creation** -- extraction prompt identifies `updates`/`contradicts`/`related_to` relationships
11. **Conflict resolution** -- confidence-based automated resolution + human escalation for ties
12. **PreToolUse hooks** -- mid-task semantic recall for persistent agents

**What this gives you:** Semantic retrieval that actually finds relevant memories. The CPO gets a coherent briefing synthesised from its accumulated knowledge. Old memories fade naturally. Contradictions are detected and resolved (not silently accumulated). Mid-task memory refresh prevents workflow drift.

### Phase 3: Multi-Agent, Reasoning, and Scale (4-6 weeks)

**Goal:** Scoped memory sharing, progressive disclosure, contractor shared memory, memory promotion, reasoning memory (belief revision, procedural synthesis, active curiosity).

**Deliverables:**

1. **Scoped visibility** -- RLS policies on `memories` table enforcing the sharing matrix from Section 6.4
2. **Role-type shared memory pool** -- contractor types can opt-in to reading/writing shared patterns
3. **Progressive disclosure** -- compact memory index injected at session start, MCP tools for on-demand fetch
4. **Belief revision** -- when contradictions are detected, trigger Reflection Conflict workflow with resolution path
5. **Procedural synthesis** -- reflection loops that convert episodic sequences into reusable procedures (Gotchas or skill candidates)
6. **Active curiosity / Gap Questions** -- after significant interactions, generate follow-up questions for the next human session or proactive research
7. **Memory promotion pipeline** -- when a memory has 5+ accesses and no contradictions, flag as candidate for doctrine/skill promotion
8. **Cross-project memory search** -- Executives can search memories across all projects they manage
9. **Memory dashboard** -- admin view: memory graph visualisation, search, edit, delete, approve/reject
10. **Token economics tracking** -- track memory creation cost vs retrieval savings
11. **Heartbeat reflection loops** -- during idle time, agents consolidate session logs into permanent memories

**What this gives you:** The full vision. Multiple agents share institutional knowledge with appropriate boundaries. Contractors arrive with relevant patterns from previous jobs. The CPO actively learns, follows up, and generates curiosity questions. Memory quality improves through promotion, reflection, and human review. The system does not just remember -- it learns.

---

## Appendix A: Source Reference

| Source | Type | Key Contribution |
|--------|------|-----------------|
| Claude deep research | Deep research | CoALA taxonomy, production evidence (Zep/Mem0/Letta), priority hierarchy, hybrid storage recommendation |
| Gemini deep research | Deep research | 5-tier taxonomy, LLM-as-OS paradigm, context rot analysis, belief revision framework |
| Perplexity deep research | Deep research | Framework comparison, consolidation strategies, production implementation patterns |
| Spacebot repo recon | Repo recon | 8 typed categories, memory graph, RRF hybrid search, cortex bulletin, compactor-as-memory-extractor, decay formula |
| claude-mem repo recon | Repo recon | Observer agent, progressive disclosure, 6x7 taxonomy, session summaries, token economics |
| claude-code-semantic-memory repo recon | Repo recon | PreToolUse thinking-block injection, 6 learning types, auto-extraction on compaction, duplicate detection |
| MLP repo recon | Repo recon | 7-type taxonomy, 4-tier confidence scoring, per-type decay rates, ContextPack with token budgeting, tombstone pattern |
| claude-chief-of-staff repo recon | Repo recon | Contact files as entity memory, goal-aligned retrieval, tiered staleness, correction loop pattern |
| @jamiepine (Spacebot) | Tweet | Architecture overview, community positioning |
| @PerceptualPeak (Zac) | Tweet | PreToolUse semantic memory hooks, self-correcting workflows |
| @jumperz | Tweet | 31-piece memory stack in 3 phases |
| @RileyRalmuto (Riley Coyote) | Tweet | Continuity framework, reflection triggers, confidence scores |
| @dr_cintas (claude-mem) | Tweet | 95% fewer tokens, 20x more tool calls |
| @honchodotdev (Honcho) | Tweet | User modelling for Claude Code, continual learning |
| @lucatac0 (Moltbot) | Tweet | Two-layer memory (file-based + vector search) |
| @andrarchy (QMD) | Tweet | 96% token savings with local BM25 + vector search |
| @code_rams (QMD multi-agent) | Tweet | QMD for multi-agent context management |
| @intellectronica (Obsidian) | Tweet | Agentic Obsidian with QMD for structured note management |
| @Legendaryy | Tweet | 911 memories in 2 weeks, memory dashboard, agent self-assigned identity |
| @Unisone | Tweet | 8 weighted categories, 14-day half-life decay, nightly maintenance |
| @statezero (Recall Protocol) | Tweet | Shared memory protocol, pgvector + Redis, trust tiers |

## Appendix B: Key Formulas

**Stanford Generative Agents retrieval score:**
```
score = alpha * recency + beta * importance + gamma * relevance
```
Where recency uses exponential decay (0.995 per hour, ~5.8 day half-life).

**Zazig decay formula:**
```
age_decay = max(0.5, 1.0 - (days_old * decay_rate))
access_boost = 1.1 if recent, 0.9 if stale, 1.0 otherwise
new_importance = importance * age_decay * access_boost
```

**Ebbinghaus forgetting curve (alternative, per Gemini):**
```
new_importance = importance * (1 - decay_rate * days_old)
```
Note: The Zazig formula above with the max(0.5) floor is preferred because it prevents importance from going negative and guarantees even decaying memories maintain a minimum 50% importance floor rather than approaching zero.

**RRF fusion:**
```
RRF_score(item) = sum(1 / (60 + rank_in_list)) for each list where item appears
```

**Spacebot graph traversal score:**
```
score = memory.importance * association.weight * type_multiplier
```

**MLP relevance scoring:**
```
score = 0.25 * recency + 0.20 * kindMatch + 0.25 * tagMatch + 0.15 * valueAlignment + 0.15 * riskScore
```

**Zazig recommended composite retrieval score:**
```
score = 0.30 * semantic_similarity + 0.25 * recency + 0.20 * importance + 0.15 * type_match + 0.10 * confidence
```

## Appendix C: Decisions Log

| Decision | Chosen | Rejected | Rationale |
|----------|--------|----------|-----------|
| Architecture approach | Roll-Own (Pattern-Informed) | True Hybrid (import libs), Full External Tool | No tool fits multi-agent multi-tier model; patterns worth stealing, tools are not |
| Storage | Supabase Postgres + pgvector | Neo4j, dedicated vector DB, local SQLite | Already have infrastructure, sufficient at our scale |
| Embedding model | OpenAI text-embedding-3-small (1536d) | Local Ollama, fastembed | Cloud-based, no local infrastructure needed, best quality |
| Graph database | Postgres (associations table) | Neo4j, separate graph DB | Small graph, Postgres handles it, no new dependency |
| Memory taxonomy | 8 types | 10 (Claude v1), 7 (Gemini v1), 8 (Spacebot), 4 (CoALA) | Gotcha merges Principle+Correction; Goal cut (redundant with pipeline); Observation kept (promotion pipeline input) |
| Search fusion | RRF (Reciprocal Rank Fusion) | Weighted score fusion, single-strategy | Rank-based avoids normalisation problems across metrics |
| Context injection | Bulletin (persistent) + ContextPack (ephemeral) | Raw memory injection, full progressive disclosure only | Matches tier model, controls token budget |
| Decay model | Per-type decay rates + access boosting | Single global decay, no decay, LLM-decided | Different memory types have genuinely different lifespans |
| Deletion model | Soft-delete (tombstone) + 90-day hard delete | Immediate hard delete, never delete | Audit trail without unbounded growth |
| Sharing model | 6-scope hierarchy with RLS | Flat namespace, full sharing, no sharing | Matches 3-tier org model |
| Conflict resolution | Confidence-based with human escalation | Last-write-wins, agent-decided | "Silent last-write-wins is almost never correct" |
| Injection format | XML-structured within bulletin | Raw markdown, JSON | XML is parseable by LLMs and supports typed attributes (confidence, source) |
| Build label | "Roll-Own (Pattern-Informed)" not "Hybrid" | "Full Roll-Own", "Hybrid" | Accurate: we build everything ourselves, informed by stolen patterns. Not importing external code or services. |

## Appendix D: Mapping to ORG MODEL

| ORG MODEL Concept | Memory System Implementation |
|--------------------|------------------------------|
| Layer 6 (Memory) | This entire document |
| Position 9 (Memory Context) | Bulletin (persistent) or ContextPack (ephemeral), Section 8.6 |
| Executive tier | Full episodic memory, bulletin pattern, company+project+individual scopes |
| Employee tier | Focused episodic memory, bulletin pattern, project+role-shared+individual scopes |
| Contractor tier | Job-scoped memory, ContextPack pattern, optional role-shared, tombstone commit |
| Orchestrator prompt compiler | Calls memory retrieval pipeline at Step 6 (Load memory context), Section 8.3 |
| Heartbeat cycles | Memory reflection loops during idle time (Phase 3) |
| Doctrine vs Memory boundary | Doctrines win conflicts; promotion pipeline surfaces memory candidates for doctrine review |
| MCP tools (role-scoped) | `memory_save` (persistent agents), `memory_search` (persistent agents, Phase 3) |
| Contractor marketplace | Anonymised cross-company shared memory (Phase 3), per-company shared memory (Phase 1) |
