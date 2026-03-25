# Memory Architecture Synthesis Report for Zazig

**Date:** 2026-03-03
**Author:** Claude (Opus 4.6), commissioned by Tom
**Sources:** 21 research documents (3 deep research, 13 tweet captures, 5 repo recons), ORG MODEL reference
**Purpose:** Synthesize all memory research into actionable architecture recommendations for Zazig's Layer 6

---

## 1. Landscape Summary: Agent Memory in the Wild

The field of agent memory is roughly 18 months old as a distinct engineering discipline, catalyzed by the Stanford "Generative Agents" paper (April 2023) and the MemGPT paper (October 2023). By early 2026, it has bifurcated into two ecosystems: **enterprise frameworks** (Zep, Mem0, Letta) targeting production multi-tenant platforms, and **community-built systems** (Spacebot, claude-mem, semantic-memory, MLP, Recall Protocol) targeting individual agent operators. Both matter for Zazig.

### Approach Categories

| Category | Representative Systems | How It Works | Strengths | Weaknesses |
|----------|----------------------|--------------|-----------|------------|
| **File-based** | claude-chief-of-staff, napkin.md, MEMORY.md | Markdown/YAML files read at session start | Human-readable, auditable, zero infrastructure | No search, no scaling, manual curation |
| **Vector DB** | claude-code-semantic-memory, Moltbot (layer 2) | Embeddings in SQLite-vec/ChromaDB, cosine similarity recall | Semantic retrieval, low-latency | No temporal reasoning, similarity != relevance |
| **Hybrid Vector + FTS** | Spacebot, claude-mem | Vector search + full-text search + Reciprocal Rank Fusion | Best retrieval quality, handles keyword + semantic | Two storage engines to maintain |
| **Knowledge Graph** | Zep/Graphiti, Mem0 (graph mode) | Entity nodes + fact edges with temporal validity | Temporal reasoning, conflict resolution, relationship tracking | Infrastructure complexity, write-time LLM cost |
| **Hybrid Vector + Graph** | Zep, Mem0, AWS reference architecture | Vector for retrieval, graph for relationships + temporal | Production-proven, handles all memory types | Most complex, highest infrastructure cost |
| **Protocol-based** | Recall Protocol, MLP | Standardized API for inter-agent memory sharing | Platform-neutral, interoperable | Early-stage, unproven at scale |
| **LLM-as-OS** | Letta/MemGPT | Agent self-manages memory via tool calls (paging metaphor) | Elegant abstraction, agent-driven | Quality depends on LLM judgment |

### State of the Art (March 2026)

The field is converging on **hybrid vector + graph** as the target architecture, with **tiered storage** (working/core/episodic/semantic) as the standard taxonomy. Key production evidence:

- **Zep**: Survived 30x traffic surge (thousands to millions hourly requests), 150ms P95 graph search, 99.95%+ uptime, SOC 2 Type 2 certified
- **Mem0**: 41K GitHub stars, 14M+ downloads, 90% token cost savings vs full-context, AWS official architecture reference
- **Letta/MemGPT**: $10M seed from Felicis, cloud production service, Agent File format for portable stateful agents
- **ChatGPT Memory**: 700M+ weekly users, but instructive failures (memory wipes, context rot, domain bleeding, hallucination amplification)
- **Spacebot**: 1507 likes on launch tweet, community leader in the OpenClaw ecosystem, best open-source memory graph implementation

The most important consensus finding: **most stored memories are never retrieved**. Zep retrieves top-20 facts per query; Mem0 defaults to top-3. Retrieval quality matters more than storage capacity.

---

## 2. Key Innovations Worth Stealing

Ranked by direct relevance to Zazig's multi-agent, multi-tier architecture.

### Tier 1: Must Have

| # | Innovation | Source | Why It Matters for Zazig |
|---|-----------|--------|--------------------------|
| 1 | **Cortex Bulletin Pattern** | Spacebot (repo recon) | Instead of injecting raw memories, synthesize them into a coherent brief on a schedule. Controls token budget, deduplicates, creates narrative from bullet points. Directly maps to our Position 9 in the prompt stack. |
| 2 | **Progressive Disclosure** | claude-mem (repo recon) | Inject a compact index (~800 tokens) at session start; agent fetches details on demand via MCP tools. 10x token savings. Solves the "500 memories, 4K token budget" problem our CPO will hit. |
| 3 | **Typed Memory Categories with Per-Type Defaults** | Spacebot (8 types), MLP (7 types), semantic-memory (6 types) | Not all memories are equal. Identity at 1.0, observations at 0.3 creates a natural prioritization hierarchy. Reduces need for manual importance scoring. |
| 4 | **PreToolUse Thinking-Block Injection** | @PerceptualPeak / claude-code-semantic-memory | Query the agent's own thinking blocks mid-task for additional memories. Creates a self-correcting workflow. The user's initial prompt becomes less relevant the longer the task runs; thinking blocks are the most current signal. |
| 5 | **Compactor-as-Memory-Extractor** | Spacebot, claude-code-semantic-memory | When context compacts, extract memories in the same LLM pass. This is the "memory flush" that captures information before it leaves the context window. Critical for persistent agents (CPO) that hit compaction regularly. |
| 6 | **Confidence Scoring** | MLP (4 tiers), Riley Coyote continuity framework | Each memory tagged 0-1. "User said directly" (0.95+) vs "I inferred from patterns" (0.4-0.7). Prevents confabulation. Enables threshold-based filtering at retrieval time. |
| 7 | **Per-Type Decay Rates** | MLP, @Unisone weighted categories | Facts don't decay (0.0), commitments decay fast (0.2), preferences drift slowly (0.1). Corrections weighted at 1.5x, decisions at 1.3x. Better than a single global decay rate. |

### Tier 2: High Value

| # | Innovation | Source | Why It Matters for Zazig |
|---|-----------|--------|--------------------------|
| 8 | **Reciprocal Rank Fusion (RRF) for Hybrid Search** | Spacebot | Fuses vector, FTS, and graph search results using rank-based scoring. Elegant because it works on ranks not scores, avoiding normalization across different distance metrics. |
| 9 | **Tombstone Pattern** | MLP | Instead of deleting memories, create a tombstone that supersedes the original. Preserves audit trail. Critical for multi-agent systems where one agent's correction needs to propagate. |
| 10 | **ContextPack with Token Budgeting** | MLP | Score candidate memories by relevance, fill a token budget greedily from highest-scored. Log a compilation trace (considered vs. included vs. denied). Makes memory injection deterministic and auditable. |
| 11 | **Memory Graph with Typed/Weighted Associations** | Spacebot | `Updates` (1.5x), `Contradicts` (0.5x), `CausedBy` (1.3x), `RelatedTo` (1.0x). Graph edges track knowledge evolution. The `Updates` chain lets you trace how a fact changed over time. |
| 12 | **Sleep-Time Agents** | Letta, Gemini deep research | Asynchronous processes that run between sessions to extract beliefs, resolve conflicts, reorganize memory. Decouples memory maintenance from conversation latency. Maps to our orchestrator scheduling memory-maintenance contractor jobs. |
| 13 | **QMD for Local Knowledge Search** | @andrarchy, @code_rams, @intellectronica | BM25 + vector embeddings for local markdown files. 96% token savings. Relevant for the local-agent daemon side where agents work with file-based context. |

### Tier 3: Worth Noting

| # | Innovation | Source | Why It Matters for Zazig |
|---|-----------|--------|--------------------------|
| 14 | **Observer Agent Architecture** | claude-mem | Dedicated Claude subprocess watches the main session and extracts structured observations. Worker never knows it's being observed. Context windows stay clean. |
| 15 | **Questions-from-Reflection** | MLP | After processing memories, generate curiosity questions (gap/implication/clarification). Turns passive memory into active learning. CPO could proactively follow up on stalled features. |
| 16 | **Access Tracking** | Spacebot | `last_accessed_at`, `access_count` on every memory. Cheap to maintain, feeds decay calculations and popularity-based boosting. |
| 17 | **Token Economics/ROI Tracking** | claude-mem | Track discovery_tokens (cost to create memory) vs read tokens (cost to inject). Data-driven answer to "is our memory system worth the overhead?" |
| 18 | **Recall Protocol Trust Tiers** | @statezero / Recall Protocol | Agent reputation derived from retrieval metrics, not social signals. Per-tier rate limiting. Relevant for the contractor marketplace where cross-company memory needs governance. |

---

## 3. Memory Taxonomy: A Unified Model for Zazig

### Comparison of Source Taxonomies

| Source | Types | Notes |
|--------|-------|-------|
| **CoALA Framework** (academic) | Working, Episodic, Semantic, Procedural | Canonical academic taxonomy. Every framework references it. |
| **Spacebot** (8 types) | Identity, Goal, Decision, Todo, Preference, Fact, Event, Observation | Most granular. Per-type default importance. Operational focus. |
| **MLP** (7 types) | Fact, Preference, Relationship, Principle, Commitment, Moment, Skill | Per-type decay rates. Confidence scoring. Philosophical focus. |
| **claude-mem** (6 types x 7 concepts) | bugfix, feature, refactor, change, discovery, decision x how-it-works, why-it-exists, what-changed, problem-solution, gotcha, pattern, trade-off | Dual-axis. Code-centric. 42-cell matrix. |
| **semantic-memory** (6 types) | WORKING_SOLUTION, GOTCHA, PATTERN, DECISION, FAILURE, PREFERENCE | Confidence scored. No decay. Code-centric. |
| **chief-of-staff** (5 implicit) | Identity, Entity, Priority, Task, Style | Human-curated. File-based. No infrastructure. |
| **Gemini deep research** (5 tiers) | Working, Short-term, Episodic, Semantic, Procedural | Duration-based hierarchy. Academic alignment. |

### What's Missing from All of Them

None of the source taxonomies address:

1. **Cross-agent decision provenance** -- who decided what, when, and why, visible to all agents
2. **Role-scoped memory** -- a CPO's product insight should not appear in a CTO's technical context unless it was explicitly shared
3. **Tier-appropriate memory** -- an Executive's memory (rich, evolving, persistent) is fundamentally different from a Contractor's memory (job-scoped, optional, narrow)
4. **Doctrine-memory boundary** -- when does a repeatedly-confirmed memory get promoted to a doctrine? None define the promotion pipeline.
5. **Project lifecycle memory** -- memories that are relevant only while a project is active and should archive when the project completes

### Recommended Taxonomy for Zazig

| Memory Type | Default Importance | Decay Rate | Description | Zazig Example |
|-------------|-------------------|------------|-------------|---------------|
| **Identity** | 1.0 | 0.0 (never) | Core facts about who the agent or user is | "I am the CPO. I own product strategy." |
| **Decision** | 0.85 | 0.0 (superseded, not decayed) | Choices made with context about why | "We chose Supabase over custom infra because..." |
| **Principle** | 0.9 | 0.0 (never) | Learned rules and heuristics | "Always use Gherkin AC for job specs" |
| **Correction** | 0.85 | 0.0 (persists until superseded) | Mistakes to avoid, with context | "pgvector needs `<=>` not `<->` for cosine distance" |
| **Fact** | 0.7 | 0.0 (superseded, not decayed) | Things that are true about the codebase/project/company | "The orchestrator is in supabase/functions/orchestrator/" |
| **Preference** | 0.65 | 0.1 (shifts gradually) | User/team working style preferences | "Tom prefers concise commit messages" |
| **Observation** | 0.4 | 0.15 (inferred, less reliable) | Patterns the agent noticed but didn't confirm | "Feature specs with fewer than 3 AC tend to come back for revision" |
| **Event** | 0.3 | 0.2 (temporal, naturally fades) | Things that happened, with timestamp | "PR #94 was merged on 2026-02-24" |
| **Goal** | 0.9 | 0.0 (archived on completion) | Active objectives and targets | "Ship memory v1 by end of March" |
| **Relationship** | 0.6 | 0.05 (evolves slowly) | Inter-agent or inter-person dynamics | "CTO reviews CPO's feature specs before breakdown" |

**Key design choice:** Ten types, not five or twenty. Fewer loses granularity that matters (the difference between a Correction and a Fact is operationally important). More creates classification overhead that wastes LLM tokens on taxonomy decisions instead of content.

Each memory also carries:
- `confidence_score` (0.0-1.0)
- `confidence_source` (user_stated, user_confirmed, context_implied, pattern_inferred, agent_generated)
- `scope` (company, project, feature, job, personal)
- `role_origin` (which role created this memory)
- `tags` (freeform, for retrieval filtering)

---

## 4. The Three Options

### Option A: Fully Roll Our Own on Supabase/pgvector

**Build:** Memory table schema, embedding pipeline, write pipeline (extraction prompts), read pipeline (hybrid search), decay/maintenance jobs, context injection logic, sharing/scoping model.

| Pros | Cons |
|------|------|
| Total architectural control -- memory scoping matches our 3-tier org model exactly | 3-6 months of engineering effort for a production-quality system |
| Single infrastructure (Supabase) -- no new dependencies | We would reinvent solutions to problems Zep/Mem0/Letta already solved (conflict resolution, deduplication, temporal reasoning) |
| Perfect integration with our existing prompt stack (6 layers) | Embedding infrastructure needs to be built (API-based or pgvector) |
| pgvector is sufficient for our scale (sub-50M vectors for years) | No community, no ecosystem, no benchmarks to compare against |
| Memory schema evolves with our needs, not an upstream project's roadmap | Every edge case (concurrent writes, memory corruption, compaction race conditions) we discover ourselves |
| No licensing concerns (Mem0 is Apache 2.0, but Zep is BSL, claude-mem is AGPL) | |

**Honest assessment:** This is the right choice for Zazig, with caveats. We already have Supabase, we already have the orchestrator, and no existing tool handles multi-agent multi-tier memory well. The risk is scope creep -- the memory system must be built incrementally, not as a monolith.

### Option B: Fully Adopt an Existing Tool

The candidates:

| Tool | Architecture | Multi-Agent | Multi-Tenant | License | Fit for Zazig |
|------|-------------|-------------|--------------|---------|---------------|
| **Zep/Graphiti** | Temporal knowledge graph + Neo4j | No native support | Yes (cloud) | BSL 1.1 (not OSS) | Poor -- BSL license, Neo4j dependency, no multi-agent scoping |
| **Mem0** | Hybrid vector + graph, managed cloud | Agent-scoped writes | Yes | Apache 2.0 | Medium -- good API, but we'd need to map our 3-tier model onto their flat agent/user/session scoping |
| **Letta/MemGPT** | Self-editing memory, cloud service | Per-agent state | Yes (cloud) | Apache 2.0 | Medium -- elegant single-agent model, but our agents don't self-manage their memory (orchestrator does) |
| **Honcho** | User modeling, hosted service | No | Yes (cloud) | OSS | Poor -- user-modeling focus, not agent-memory focus |
| **claude-mem** | Observer + SQLite + ChromaDB | No | No | AGPL 3.0 | Poor -- single-user, AGPL license, local-only |
| **Recall Protocol** | Shared memory protocol, FastAPI + pgvector | Yes (protocol-native) | No | MIT | Interesting but very early (6 commits, 1 star). Protocol ideas worth studying, not production-ready. |

| Pros | Cons |
|------|------|
| Faster to start -- skip the storage/retrieval engineering | None of these handle our 3-tier model (Executive/Employee/Contractor memory semantics) |
| Battle-tested under production load (Zep, Mem0) | External dependency on another team's roadmap |
| Community and documentation | Impedance mismatch -- we'd spend as much time adapting as building |
| Benchmarks and performance data available | Additional infrastructure (Neo4j for Zep, hosted services for Mem0/Letta) |
| | Licensing risk (BSL, AGPL) |
| | Our orchestrator already handles the "when to read/write memory" question -- we'd be duplicating orchestration logic |

**Honest assessment:** No existing tool fits Zazig's multi-agent, multi-tier architecture. Every option would require significant adaptation, and the most capable tools (Zep, Mem0) are either BSL-licensed or cloud-hosted services we'd depend on. The patterns from these tools are worth stealing; the tools themselves are not worth adopting wholesale.

### Option C: Hybrid -- Use Existing Tools for Parts, Build Custom for Others

The pragmatic middle ground:

| Component | Build or Borrow | Rationale |
|-----------|----------------|-----------|
| **Storage layer** | Build (Supabase/pgvector) | Already have the infrastructure, need custom scoping |
| **Embedding pipeline** | Borrow (OpenAI text-embedding-3-small via API) | Don't build an embedding model, use an API |
| **Memory extraction prompts** | Borrow (MLP classifier + scorer prompts, adapted) | The extraction prompts from MLP and claude-mem are high-quality |
| **Search pipeline** | Build, borrowing RRF pattern from Spacebot | Postgres FTS + pgvector + RRF fusion is implementable in pure SQL |
| **Decay/maintenance** | Build, borrowing formulas from Spacebot + MLP | Simple math, needs to integrate with our orchestrator |
| **Context injection** | Build, borrowing progressive disclosure from claude-mem + bulletin from Spacebot | Must integrate with our existing 6-layer prompt stack |
| **Graph relationships** | Build (simple associations table in Postgres) | Don't need Neo4j -- our graph is small enough for Postgres |

| Pros | Cons |
|------|------|
| Leverage proven patterns without inheriting dependencies | Still significant engineering effort (2-4 months) |
| Single infrastructure (Supabase) | Must validate borrowed patterns against our specific architecture |
| Best ideas from 5+ systems, adapted to our needs | Risk of Frankenstein architecture if integration is not deliberate |
| No licensing concerns (borrowing patterns, not code) | |

**Recommendation:** Option C. Build on Supabase, borrow patterns aggressively, adapt to our 3-tier model. The patterns worth borrowing are clearly identified in Section 2. No code needs to be copied -- only architectural patterns and prompt templates.

---

## 5. Memory Lifecycle

### 5.1 Creation (Write Pipeline)

Memories are created through four paths, synthesized from the best ideas across all sources:

**Path 1: Extraction-on-Completion (Primary)**
When a job completes, the orchestrator triggers a memory extraction step. Borrows from Spacebot's compactor-as-memory-extractor and claude-mem's observer agent.

```
Job completes
    |
    v
Orchestrator reads job report + transcript summary
    |
    v
Extraction prompt (adapted from MLP classifier + scorer):
  - Classify each insight into memory types
  - Score confidence (0.0-1.0)
  - Tag with scope (company/project/feature/job)
  - Check for contradictions against existing memories
    |
    v
New memories written to memory_chunks table
Old contradicted memories get superseded_by pointer (tombstone pattern)
```

**Path 2: Mid-Session Memory Save (Persistent Agents Only)**
For Executives and Employees, expose `memory_save` as an MCP tool (borrowing from Spacebot). The agent decides what's worth remembering during conversation.

**Path 3: Compaction Memory Flush (Persistent Agents Only)**
When context compacts, extract memories from the outgoing context before it's lost. Borrows from Spacebot and claude-code-semantic-memory.

**Path 4: Human-Supervised Correction**
Humans can directly create/edit/delete memories via the admin interface (or Slack gateway for Executives). Borrows the correction loop from claude-chief-of-staff, but formalizes it into the DB.

### 5.2 Storage

All memories live in a single Postgres table in Supabase with a pgvector column for embeddings:

```sql
CREATE TABLE memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id),

    -- Content
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,  -- enum: identity/decision/principle/correction/fact/preference/observation/event/goal/relationship

    -- Scoring
    importance REAL NOT NULL DEFAULT 0.5,
    confidence_score REAL NOT NULL DEFAULT 0.5,
    confidence_source TEXT NOT NULL DEFAULT 'agent_generated',

    -- Scoping
    scope TEXT NOT NULL DEFAULT 'company',  -- company/project/feature/job
    scope_id UUID,  -- project_id, feature_id, or job_id depending on scope
    role_origin TEXT,  -- which role created this
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

-- Graph edges (borrowed from Spacebot)
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

### 5.3 Retrieval (Read Pipeline)

A three-mode search pipeline, borrowed from Spacebot's architecture but adapted for Postgres:

**Mode 1: Hybrid Search (default for semantic queries)**
Runs three strategies in parallel, fuses with RRF:
1. pgvector cosine similarity (semantic)
2. Postgres FTS tsvector (keyword)
3. Association graph traversal (relational)

```sql
-- Pseudo-query for RRF fusion
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
rrf AS (
    SELECT id, SUM(1.0 / (60.0 + rank)) as rrf_score
    FROM (
        SELECT id, rank FROM vector_results
        UNION ALL
        SELECT id, rank FROM fts_results
    ) combined
    GROUP BY id
    ORDER BY rrf_score DESC
    LIMIT $3
)
SELECT m.* FROM memories m JOIN rrf ON m.id = rrf.id ORDER BY rrf.rrf_score DESC;
```

**Mode 2: Typed Retrieval (for structured queries)**
Direct Postgres queries filtered by memory_type, scope, importance. No embeddings needed.

**Mode 3: Recent/Important (for context injection)**
`ORDER BY created_at DESC` or `ORDER BY importance DESC`. Fast, no search overhead.

### 5.4 Context Injection

Two patterns, used based on worker tier:

**For Persistent Agents (Executives, Employees): Bulletin Pattern**
Borrowing from Spacebot's cortex bulletin. On a schedule (configurable, default every 30 minutes), synthesize a coherent brief from the agent's relevant memories. Inject this brief as the Position 9 (Memory Context) in the prompt stack. Fixed token budget (default 2000 tokens).

```
Bulletin Assembly:
1. Query top 15 identity + principles (always)
2. Query top 10 decisions (by recency)
3. Query top 10 corrections (by importance)
4. Query top 10 facts (by relevance to active features)
5. Query top 5 observations (by recency)
6. LLM synthesis -> coherent brief under token budget
7. Store as agent's current bulletin
8. Inject into every prompt at Position 9
```

**For Ephemeral Agents (Contractors): ContextPack Pattern**
Borrowing from MLP. At dispatch time, the orchestrator assembles a ContextPack:

```
ContextPack Assembly:
1. Query memories scoped to the job's project + feature
2. Query role-type shared memories (if opt-in for this contractor type)
3. Score by relevance to job spec (cosine similarity of job spec embedding vs memory embeddings)
4. Fill token budget (default 1500 tokens) greedily from highest-scored
5. Inject into job workspace as ## Relevant Memory section
```

**For Progressive Disclosure (future enhancement):**
Borrowing from claude-mem. Instead of pre-loading all memories, inject a compact index and expose MCP tools for on-demand fetch. This becomes valuable when memory volume exceeds what fits in a single bulletin.

### 5.5 Decay and Maintenance

A scheduled maintenance job (Supabase pg_cron or orchestrator-scheduled contractor) runs nightly:

**Decay Formula** (adapted from Spacebot + MLP):

```
For each non-forgotten, non-identity memory:
  days_old = (now - created_at) / 86400
  days_since_access = (now - last_accessed_at) / 86400

  type_decay = memory.decay_rate  -- per-type, from taxonomy
  age_decay = max(0.5, 1.0 - (days_old * type_decay))  -- max 50% decay from age

  access_boost = 1.1 if days_since_access < 7    -- recent access boosts
                 0.9 if days_since_access > 30    -- stale access penalizes
                 1.0 otherwise

  new_importance = importance * age_decay * access_boost
```

**Pruning:**
Memories below importance 0.1 that are older than 30 days are soft-deleted (forgotten = true). Identity and Principle memories are exempt. Soft-deleted memories are hard-deleted after 90 days.

**Deduplication:**
New memories are checked against existing memories using pgvector cosine similarity. If >= 0.92 similarity exists, the new memory is either rejected (duplicate) or merged (if it adds new information). Borrows threshold from Spacebot.

**Conflict Resolution:**
When a new memory contradicts an existing one (detected via semantic similarity + type match), the system:
1. Creates a `contradicts` association edge
2. If the new memory has higher confidence, supersedes the old one (tombstone)
3. If confidence is similar, flags both for human review
4. Never silently applies last-write-wins (the O'Reilly warning)

### 5.6 Memory Promotion Pipeline

When a memory repeatedly proves correct across multiple jobs (high access count, never contradicted), it is a candidate for promotion:

```
Episodic memory (observed pattern)
    -> 5+ consistent signals, no contradictions
    -> Proposed as skill update or doctrine candidate
    -> Human review (for doctrine promotion)
    -> Skill modification (for procedural promotion)
```

This borrows from the MACLA paper's approach (compress experience trajectories into reusable procedures via Bayesian posteriors) and from Zazig's own design decision: "Memory should never auto-update doctrines -- beliefs require deliberate revision."

---

## 6. Organisational vs Individual Memory

This is Zazig's novel challenge. No existing tool handles this well because no existing tool operates a multi-tier AI workforce. Here is the recommended scoping model:

### 6.1 Four Memory Scopes

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

| Tier | Reads From | Writes To |
|------|-----------|-----------|
| **Executive** | Company + all projects they manage + individual | Company (decisions), project, individual |
| **Employee** | Company + assigned projects + role-type shared + individual | Project, feature, role-type shared, individual |
| **Contractor** | Job-scoped + role-type shared (if opt-in) | Job (always), role-type shared (if opt-in) |

### 6.4 The Contractor Marketplace Problem

When contractors serve multiple companies, their role-type shared memory creates a privacy challenge:

**Option A (Launch): Per-Company Shared Memory**
A Cybersecurity Tester's shared memory is specific to one company's patterns. Safe, simple, no privacy concerns.

**Option B (Future): Anonymized Cross-Company Patterns**
The tester learns patterns from all companies but memories are stripped of company-identifying information before sharing. Example: "React apps often have XSS vulnerabilities in user-generated content components" (pattern) vs "Company X's dashboard has an XSS vulnerability" (company-specific fact, never shared).

**Implementation:** Two memory pools per contractor role-type:
- `role_shared_memories` (company-scoped, always readable)
- `role_universal_memories` (anonymized, cross-company, opt-in per customer)

The anonymization pipeline would need to be a dedicated step with human review before any memory enters the universal pool.

### 6.5 Cross-Agent Communication via Memory

Borrowing Manus AI's principle: **"Share memory by communicating, don't communicate by sharing memory."**

Agents should not read each other's individual memory directly. Instead:
- Inter-agent decisions are stored in the shared scope as structured outcomes (who, what, why, when)
- The orchestrator mediates all cross-agent memory access
- An agent reading another agent's private memory would require explicit orchestrator approval (not implemented in v1)

---

## 7. How to 10X OpenClaw/Spacebot

Spacebot is the acknowledged community leader in agent memory. Their implementation is impressive: 8 typed categories, graph associations, hybrid search with RRF, cortex bulletin, compactor-as-memory-extractor. Yet their default memory is, by the community's own admission, "average." Why?

### What Spacebot Gets Wrong (or Incomplete)

1. **Single-agent architecture.** Spacebot is one bot per community. There is no concept of multiple agents with different roles sharing memory with scoped access. Every memory is visible to the one bot. This is the single biggest limitation.

2. **No confidence scoring.** Every memory is treated with equal trustworthiness. A fact the user stated directly and a pattern the bot inferred have the same standing. This leads to agents acting on uncertain information with unwarranted confidence.

3. **No progressive disclosure.** The cortex bulletin is synthesized from all memories and injected into every conversation. As memory grows, the bulletin either exceeds its token budget (losing memories) or gets compressed to the point of uselessness. There is no on-demand fetch mechanism.

4. **No memory promotion pipeline.** A correction that has been validated 50 times stays as a memory with the same importance as one validated once. There is no path from observation -> principle -> doctrine.

5. **Merge is unimplemented.** The code has a placeholder for merging memories with >0.95 similarity, but the actual merging logic does not exist. This means near-duplicate memories accumulate.

6. **No orchestrator integration.** Memory is managed entirely within the bot process. There is no external system deciding what memories to surface for what tasks. The bot makes all retrieval decisions itself, which means retrieval quality depends entirely on the LLM's judgment at query time.

7. **No scoped memory.** All memories live in one flat namespace per bot instance. There is no project/feature/role scoping.

### What Would Make Zazig 10X Better

| Dimension | Spacebot (Current SOTA) | Zazig (Target) | Multiplier |
|-----------|------------------------|----------------|------------|
| **Multi-agent memory** | Single bot, all memories visible | N agents, scoped by role/project/company | Structural advantage -- no competitor has this |
| **Confidence scoring** | None | 4-tier with source attribution | Prevents acting on uncertain information |
| **Orchestrator-driven retrieval** | Bot retrieves its own memories | Orchestrator assembles context at dispatch | Retrieval quality independent of agent LLM judgment |
| **Memory promotion** | None | Observation -> Principle -> Doctrine pipeline | Institutional learning across the org |
| **Progressive disclosure** | Bulletin only | Bulletin + index + on-demand MCP fetch | Scales to 10,000+ memories without context bloat |
| **Cross-agent decisions** | N/A | Structured outcomes in shared scope with provenance | Multiple agents converge on shared truth |
| **Tier-appropriate memory** | One-size-fits-all | Executive (rich, persistent), Employee (focused, persistent), Contractor (job-scoped, optional shared) | Right-sized memory for right-sized workers |
| **Contractor marketplace** | N/A | Anonymized cross-company patterns | Network effect on specialist knowledge |

**The actual differentiator is the orchestrator.** Spacebot's memory is agent-managed: the bot decides what to remember and what to recall. Zazig's memory would be orchestrator-managed: the orchestrator decides what memories to assemble for each job based on the job's context, the worker's tier, the project scope, and the role's memory permissions. The agent never sees the retrieval logic -- it receives a pre-built context with the right memories already in place.

This is the same architectural insight that makes Zazig's prompt stack work: the agent never sees the raw config. It receives a compiled prompt. Memory should follow the same pattern.

---

## 8. Recommended Architecture

### 8.1 Storage Layer

**Primary store:** Supabase Postgres with two tables (`memories` + `memory_associations`), as defined in Section 5.2.

**Embedding:** OpenAI `text-embedding-3-small` (1536 dimensions) via API call at memory write time. Stored in pgvector column. For retrieval, same model embeds the query.

**Full-text search:** Postgres `tsvector` with `gin` index on memory content. No external FTS engine needed.

**Graph:** The `memory_associations` table in Postgres, not Neo4j. Our graph is small enough (likely under 100K nodes in the first year) that Postgres handles it well. BFS traversal via recursive CTE.

**No Redis for v1.** Working memory is the context window itself. We do not need a separate cache layer until we have multiple concurrent sessions for the same agent accessing the same memory store.

### 8.2 Write Pipeline

```
Four Write Paths:

1. POST-JOB EXTRACTION (Primary)
   Job completes -> orchestrator triggers extraction
   -> extraction prompt classifies + scores memories
   -> dedup check (pgvector similarity >= 0.92)
   -> write to memories table
   -> create associations (updates/contradicts/related)

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
   -> Inject into Position 9 of prompt stack

2. ON-DEMAND FETCH (Persistent agents only, Phase 2)
   Agent uses memory_search MCP tool mid-session:
   -> Hybrid search (vector + FTS + graph, RRF fusion)
   -> Filter by scope permissions
   -> Return top-K results
   -> Agent decides what to use
```

### 8.4 Decay/Maintenance

```
Nightly Maintenance Job (pg_cron or orchestrator-scheduled):

1. DECAY: Apply per-type decay formula to all non-exempt memories
2. PRUNE: Soft-delete memories below 0.1 importance, older than 30 days
3. DEDUP: Find memories with >= 0.92 cosine similarity, merge or flag
4. CONFLICT: Find active contradictions, resolve by confidence or flag for human
5. HARD DELETE: Remove soft-deleted memories older than 90 days
6. STATS: Log memory counts by type, scope, age distribution (for monitoring)
```

### 8.5 Sharing Model

```
Memory Visibility Matrix:

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
Position 9: MEMORY CONTEXT              (Layer 6 - what you remember)  <-- NEW
```

Position 9 contains either:
- **Bulletin** (for persistent agents) -- LLM-synthesized, periodically refreshed
- **ContextPack** (for ephemeral agents) -- orchestrator-assembled at dispatch time

**Priority hierarchy at inference time:** Role Prompt > Doctrines > Skills > Canons > Memory. When a memory conflicts with a doctrine, the doctrine wins. The memory gets flagged for review but is not injected. This prevents the documented "experience-following" failure mode where recalled memories override established beliefs.

**Memory-Doctrine deduplication at retrieval time:** Before injecting memories, check against active doctrines using semantic similarity. Suppress memories that merely restate what's already in doctrines. This prevents redundancy in the context window.

---

## 9. Implementation Phases

### Phase 1: Foundation (2-3 weeks)

**Goal:** Working memory storage and retrieval. Manual writes, orchestrator-assembled reads. No decay, no graph, no sharing.

**Deliverables:**

1. **Migration: `memories` table** -- schema from Section 5.2, minus the associations table and embedding column (add those in Phase 2)
2. **Memory extraction prompt** -- single prompt adapted from MLP classifier + scorer, callable as an Edge Function
3. **Post-job extraction step** -- when a job completes, orchestrator calls the extraction Edge Function with the job report, stores results in `memories`
4. **MCP tool: `memory_save`** -- for persistent agents (CPO) to manually save memories
5. **MCP tool: `memory_search`** -- simple text-match search (Postgres FTS), no embeddings yet
6. **ContextPack assembly** -- at job dispatch, query relevant memories by scope + type, inject as markdown section in workspace
7. **Memory type enum and validation** -- the 10-type taxonomy enforced at write time

**What this gives you:** Every job leaves behind structured memories. CPO can save memories manually. Contractors receive relevant project memories in their workspace. No intelligence in retrieval yet (just FTS), but the data is accumulating.

**What it does NOT give you:** No semantic search, no graph, no decay, no sharing, no bulletin.

### Phase 2: Intelligence (3-4 weeks)

**Goal:** Semantic search, memory graph, decay, bulletin pattern, confidence scoring.

**Deliverables:**

1. **Migration: add `embedding` column** (vector(1536)) to `memories` table
2. **Migration: `memory_associations` table** -- graph edges with typed relations
3. **Embedding pipeline** -- on memory write, call OpenAI embedding API, store in pgvector
4. **Hybrid search** -- pgvector cosine similarity + Postgres FTS + RRF fusion
5. **Deduplication** -- pgvector nearest-neighbor check on write (>= 0.92 = duplicate)
6. **Confidence scoring** -- add to extraction prompt, store in DB, filter at retrieval
7. **Cortex bulletin** -- scheduled synthesis for Executive agents, injected at Position 9
8. **Decay maintenance job** -- nightly cron: per-type decay, pruning, stats logging
9. **Tombstone pattern** -- `superseded_by` column, never hard-delete recent memories
10. **Association creation** -- extraction prompt identifies `updates`/`contradicts`/`related_to` relationships

**What this gives you:** Semantic retrieval that actually finds relevant memories. The CPO gets a coherent briefing synthesized from its accumulated knowledge. Old memories fade naturally. Contradictions are detected and flagged.

### Phase 3: Multi-Agent and Scale (4-6 weeks)

**Goal:** Scoped memory sharing, progressive disclosure, contractor shared memory, memory promotion, active learning.

**Deliverables:**

1. **Scoped visibility** -- RLS policies on `memories` table enforcing the sharing matrix from Section 8.5
2. **Role-type shared memory pool** -- contractor types can opt-in to reading/writing shared patterns
3. **Progressive disclosure** -- compact memory index injected at session start, MCP tools for on-demand fetch
4. **PreToolUse thinking-block injection** -- for persistent agents, query memories against the agent's current reasoning mid-task
5. **Memory promotion pipeline** -- when a memory has 5+ accesses and no contradictions, flag as candidate for doctrine/skill promotion
6. **Questions-from-reflection** -- after significant interactions, CPO generates follow-up questions for the next human session
7. **Memory dashboard** -- admin view in future UI: memory graph visualization, search, edit, delete, approve/reject
8. **Cross-project memory search** -- Executives can search memories across all projects they manage
9. **Token economics tracking** -- track memory creation cost vs retrieval savings

**What this gives you:** The full vision. Multiple agents share institutional knowledge with appropriate boundaries. Contractors arrive with relevant patterns from previous jobs. The CPO actively learns and follows up. Memory quality improves through promotion and human review.

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
| @honchodotdev (Honcho) | Tweet | User modeling for Claude Code, continual learning |
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

**Spacebot decay:**
```
age_decay = max(0.5, 1.0 - (days_old * decay_rate))
access_boost = 1.1 if recent, 0.9 if stale, 1.0 otherwise
new_importance = importance * age_decay * access_boost
```

**Spacebot graph traversal score:**
```
score = memory.importance * association.weight * type_multiplier
```

**RRF fusion:**
```
RRF_score(item) = sum(1 / (60 + rank_in_list)) for each list where item appears
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
| Storage | Supabase Postgres + pgvector | Neo4j, dedicated vector DB, local SQLite | Already have the infrastructure, sufficient at our scale |
| Embedding model | OpenAI text-embedding-3-small (1536d) | Local Ollama (nomic-embed-text), fastembed (MiniLM) | Cloud-based, no local infrastructure needed, best quality |
| Graph database | Postgres (associations table) | Neo4j, separate graph DB | Small graph, Postgres handles it, no new dependency |
| Memory taxonomy | 10 types (custom) | 8 (Spacebot), 7 (MLP), 6 (semantic-memory), 4 (CoALA) | Covers our operational needs without over-classifying |
| Search fusion | RRF (Reciprocal Rank Fusion) | Weighted score fusion, single-strategy | Rank-based avoids normalization problems across metrics |
| Context injection | Bulletin (persistent) + ContextPack (ephemeral) | Raw memory injection, full progressive disclosure only | Matches our tier model, controls token budget |
| Decay model | Per-type decay rates + access boosting | Single global decay, no decay, LLM-decided | Different memory types have genuinely different lifespans |
| Deletion model | Soft-delete (tombstone) + 90-day hard delete | Immediate hard delete, never delete | Audit trail without unbounded growth |
| Sharing model | Scoped by company/project/feature/role | Flat namespace, full sharing, no sharing | Matches our 3-tier org model |
| Conflict resolution | Confidence-based with human escalation | Last-write-wins, agent-decided | "Silent last-write-wins is almost never correct" (O'Reilly) |
| Existing tool adoption | None (borrow patterns, not tools) | Zep (BSL license), Mem0 (cloud dependency), Letta (single-agent model) | No tool fits our multi-agent, multi-tier architecture |
