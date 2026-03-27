# Repo Recon: Spacebot Memory System Deep Dive

**Date:** 2026-03-03
**Repo:** https://github.com/spacedriveapp/spacebot
**Focus:** Memory implementation -- storage, retrieval, architecture, and patterns worth borrowing

---

## 1. Executive Summary

Spacebot implements a **graph-backed, dual-database memory system** with typed memories, weighted associations, hybrid search (vector + full-text + graph traversal), and a cortex-driven bulletin system for context injection. The architecture is deliberately opinionated: memories are structured database rows with metadata, not markdown files. The system has three write paths (branch-initiated, compactor-initiated, cortex-initiated) and a single unified search interface with four modes.

The most interesting and reusable aspects are: the **typed memory categories with per-type default importance**, the **memory graph with typed/weighted associations**, the **Reciprocal Rank Fusion (RRF) for hybrid search**, the **cortex bulletin pattern** for ambient context injection, and the **compactor-as-memory-extractor** pattern that harvests memories from conversation context before it's discarded.

---

## 2. Storage Architecture

### Dual-Database Split

Spacebot splits memory storage across two embedded databases, each doing what it's best at:

| Database | Role | Contents |
|----------|------|----------|
| **SQLite** | Memory graph, metadata, CRUD | `memories` table, `associations` table, cortex events, compaction records |
| **LanceDB** | Embeddings, vector search, FTS | Memory embeddings (384-dim, all-MiniLM-L6-v2), full-text index (Tantivy) |

The two are joined on `memory.id`. SQLite is the source of truth for memory metadata and graph structure. LanceDB is the search engine. Both are embedded (no server processes), everything is files in a data directory.

**Key insight:** This split lets them use the right tool for each job. SQLite handles relational queries, graph traversal, metadata filtering, and maintenance. LanceDB handles vector similarity and full-text search with HNSW indexing. Neither database is forced to do something it's not good at.

### SQLite Schema

```sql
-- memories table
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    memory_type TEXT NOT NULL,
    importance REAL NOT NULL DEFAULT 0.5,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER NOT NULL DEFAULT 0,
    source TEXT,
    channel_id TEXT,
    forgotten INTEGER NOT NULL DEFAULT 0  -- soft-delete flag
);

-- associations table (graph edges)
CREATE TABLE associations (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    weight REAL NOT NULL DEFAULT 0.5,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
    UNIQUE(source_id, target_id, relation_type)
);

-- Indexes
CREATE INDEX idx_memories_type ON memories(memory_type);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_memories_created_at ON memories(created_at);
CREATE INDEX idx_memories_forgotten ON memories(forgotten);
CREATE INDEX idx_associations_source ON associations(source_id);
CREATE INDEX idx_associations_target ON associations(target_id);
```

### LanceDB Schema (Arrow)

```
id: Utf8 (memory ID, joins to SQLite)
content: Utf8 (for FTS indexing)
embedding: FixedSizeList[Float32, 384] (all-MiniLM-L6-v2)
```

Indexes: HNSW vector index on `embedding`, Tantivy FTS inverted index on `content`.

**File:** `/tmp/spacebot/src/memory/lance.rs`

---

## 3. Memory Types and Importance

### 8 Typed Memory Categories

Every memory has a mandatory type. The type determines default importance and affects decay/pruning behavior:

| Type | Default Importance | Decay Exempt? | Purpose |
|------|-------------------|---------------|---------|
| **Identity** | 1.0 | Yes | Core info about who user/agent is. Always surfaced, never pruned. |
| **Goal** | 0.9 | No | Aspirational targets spanning multiple conversations. |
| **Decision** | 0.8 | No | Choices made, with context about why. |
| **Todo** | 0.8 | No | Concrete actionable tasks or reminders. |
| **Preference** | 0.7 | No | User likes/dislikes, working style. |
| **Fact** | 0.6 | No | Things that are true. Can be updated/contradicted. |
| **Event** | 0.4 | No | Things that happened. Temporal, naturally decay. |
| **Observation** | 0.3 | No | Inferred patterns. System-noticed, not user-stated. |

**File:** `/tmp/spacebot/src/memory/types.rs`, lines 76-89

**Key insight:** The type hierarchy encodes a natural prioritization. Identity (1.0) and Goals (0.9) are at the top because they define who you're talking to and what they want. Observations (0.3) are at the bottom because they're inferred and less reliable. This is a smart default that reduces the need for manual importance scoring.

### Importance as a First-Class Metric

Every memory has an `importance` score (0.0-1.0) that determines:
- How likely it is to be surfaced during recall
- How long it survives before pruning
- Its position in context injection

Importance is influenced by four factors:
1. **Type default** -- set at creation time based on memory type
2. **Explicit override** -- caller can set importance directly via the save tool
3. **Access frequency** -- memories recalled often get boosted
4. **Recency** -- old, unaccessed memories decay

---

## 4. The Memory Graph

### Association Types

Memories connect to each other through typed, weighted edges:

| Relation Type | Purpose | Graph Traversal Multiplier |
|--------------|---------|---------------------------|
| **Updates** | Newer version of same info | 1.5x (boosted) |
| **CausedBy** | Causal chain | 1.3x |
| **ResultOf** | Result of another event | 1.3x |
| **RelatedTo** | General semantic connection | 1.0x |
| **PartOf** | Hierarchical relationship | 0.8x |
| **Contradicts** | Conflicting information | 0.5x (penalized) |

**File:** `/tmp/spacebot/src/memory/search.rs`, lines 294-300

**Key insights:**
- The `Updates` relation type (1.5x multiplier) is the most interesting. When a new fact supersedes an old one, the system creates an `Updates` edge. This means the graph naturally tracks the evolution of knowledge over time.
- `Contradicts` is deliberately penalized (0.5x) during graph traversal. The system surfaces contradictions but doesn't let them dominate results.
- The `UNIQUE(source_id, target_id, relation_type)` constraint on associations means you can have multiple edge types between the same pair (e.g., both `RelatedTo` and `Updates`), but not duplicate edges of the same type. The `ON CONFLICT DO UPDATE SET weight` upsert keeps the latest weight.

### Graph Traversal

Graph traversal is BFS (breadth-first search) with configurable depth (default: 2). Starting from high-importance seed memories that keyword-match the query, it walks edges and scores neighbors using:

```
score = memory.importance * association.weight * type_multiplier
```

Only `RelatedTo` and `PartOf` edges continue the traversal deeper. `Updates`, `Contradicts`, `CausedBy`, and `ResultOf` are single-hop only -- they surface connected context but don't cascade further.

**File:** `/tmp/spacebot/src/memory/search.rs`, lines 254-321

### Association Validation

When the LLM saves a memory with associations, the system validates that target memories actually exist before creating edges. This prevents dangling references from hallucinated IDs:

```rust
// Verify the target memory exists before creating a graph edge
// to prevent dangling associations from LLM hallucinated IDs.
match store.load(&assoc.target_id).await {
    Ok(Some(_)) => {}
    Ok(None) => {
        tracing::warn!("skipping association to non-existent memory");
        continue;
    }
    ...
}
```

**File:** `/tmp/spacebot/src/tools/memory_save.rs`, lines 233-253

---

## 5. Search System

### Four Search Modes

| Mode | Strategy | Requires Query? | Uses Vector/FTS? |
|------|----------|-----------------|------------------|
| **Hybrid** (default) | Vector + FTS + Graph + RRF | Yes | Yes |
| **Recent** | SQLite `ORDER BY created_at DESC` | No | No |
| **Important** | SQLite `ORDER BY importance DESC` | No | No |
| **Typed** | SQLite filtered by `memory_type` | No (requires `memory_type`) | No |

Non-hybrid modes bypass the entire vector/FTS/RRF pipeline and query SQLite directly. They're fast and don't need embeddings.

**File:** `/tmp/spacebot/src/memory/search.rs`

### Hybrid Search Pipeline

The hybrid pipeline runs three search strategies in parallel, then fuses results:

1. **Full-Text Search** (LanceDB Tantivy) -- keyword matching on content
2. **Vector Similarity** (LanceDB HNSW) -- semantic similarity using cosine distance on embeddings
3. **Graph Traversal** (SQLite) -- BFS from high-importance seed memories that keyword-match the query

Results are merged using **Reciprocal Rank Fusion (RRF):**

```
RRF_score(item) = sum(1 / (k + rank_in_list)) for each list where item appears
```

Where `k = 60` (standard RRF constant). An item appearing in all three lists at rank 1 gets:
```
3 * (1/61) = 0.0492
```

An item in one list at rank 1 gets:
```
1/61 = 0.0164
```

**Key insight:** RRF works on ranks, not scores. This elegantly handles the different scales of vector distances (0-2), FTS scores (arbitrary), and graph scores (importance-weighted). No normalization needed.

**File:** `/tmp/spacebot/src/memory/search.rs`, lines 371-416

### Access Tracking

Every time a memory is recalled, the system records the access:

```rust
pub async fn record_access(&self, id: &str) -> Result<()> {
    sqlx::query(
        "UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?"
    )
    .bind(now)
    .bind(id)
    .execute(&self.pool)
    .await
}
```

This feeds into:
- Sort mode `most_accessed` (for retrieval)
- Decay calculations (recently accessed memories get boosted)
- Eventual graph centrality scoring

**File:** `/tmp/spacebot/src/memory/store.rs`, lines 170-187

---

## 6. Memory Write Paths

### Path 1: Branch-Initiated (During Conversation)

The most common path. The LLM branch processing a user message decides what's worth remembering and calls `memory_save`. The branch has full conversation context and picks memory type, importance, and associations.

**Tool interface:** `memory_save` with parameters: `content`, `memory_type`, `importance`, `source`, `channel_id`, `associations[]`.

Max content size: 50,000 bytes.

**File:** `/tmp/spacebot/src/tools/memory_save.rs`

### Path 2: Compactor-Initiated (During Context Compaction)

When the context window fills up, the compactor spawns a background worker that:
1. Reads the oldest messages being removed
2. Runs an LLM to produce a summary
3. **Extracts memories using `memory_save`** in the same pass
4. Swaps the summary into the channel's history

The compactor has three thresholds:
- **Background** (configurable, ~70% usage): Remove 30% of oldest messages, LLM summarize + extract
- **Aggressive** (configurable, ~85% usage): Remove 50% of oldest messages, LLM summarize + extract
- **Emergency** (~95% usage): Drop oldest 50%, no LLM (just truncate with marker)

**Key insight:** Memory extraction happens at compaction time -- this is a "memory flush" that captures information before it leaves the context window. The compactor worker has the `memory_save` tool so it can write memories directly during the summarization pass.

**File:** `/tmp/spacebot/src/agent/compactor.rs`

### Path 3: Periodic Memory Persistence

A separate `memory_persistence` process is triggered periodically. It reviews the channel's full conversation history and saves new/updated memories with appropriate associations. This prompt instructs the LLM to:
1. Recall existing memories first (to avoid duplicates)
2. Save selectively (identity, facts, decisions, preferences, events, observations, goals, todos)
3. Build the graph (use `updates`, `contradicts`, `related_to`, `part_of` associations)

**File:** `/tmp/spacebot/prompts/en/memory_persistence.md.j2`

---

## 7. Memory Deletion

Spacebot uses **soft deletion** (the `forgotten` flag). A forgotten memory:
- Stays in the database
- Is excluded from all search results and recall
- Can be audited later
- Is never fully removed by the delete tool (only maintenance/pruning does hard deletes)

The `memory_delete` tool requires an `audit reason` field for traceability.

**File:** `/tmp/spacebot/src/tools/memory_delete.rs`

---

## 8. Maintenance System

### Decay

Applied to all non-Identity memories periodically:

```rust
let age_decay = 1.0 - (days_old * decay_rate).min(0.5);  // max 50% decay from age
let access_boost = if days_since_access < 7 { 1.1 }       // recent access boosts
                   else if days_since_access > 30 { 0.9 }  // stale access penalizes
                   else { 1.0 };
let new_importance = importance * age_decay * access_boost;
```

Default decay rate: 0.05 per day. Identity memories are exempt.

### Pruning

Memories below the prune threshold (default: 0.1 importance) that are older than `min_age_days` (default: 30 days) are hard-deleted. Identity memories are exempt.

### Merging

Placeholder in the code. The design doc says: memories with >0.95 embedding similarity should be merged, keeping the higher-importance one and updating associations. Not yet implemented.

**File:** `/tmp/spacebot/src/memory/maintenance.rs`

### Maintenance Config Defaults

```rust
MaintenanceConfig {
    prune_threshold: 0.1,
    decay_rate: 0.05,         // per day
    min_age_days: 30,
    merge_similarity_threshold: 0.95,
}
```

---

## 9. Context Injection: The Cortex Bulletin

This is one of the most interesting patterns in the system. Rather than injecting raw memories into every conversation, Spacebot uses a **cortex bulletin** -- a periodically refreshed, LLM-synthesized summary of the agent's current knowledge.

### How It Works

1. **Gather sections** -- programmatically query the memory store across 8 dimensions:
   - Identity & Core Facts (typed: identity, by importance, top 15)
   - Recent Memories (recent mode, top 15)
   - Decisions (typed: decision, by recency, top 10)
   - High-Importance Context (important mode, top 10)
   - Preferences & Patterns (typed: preference, by importance, top 10)
   - Active Goals (typed: goal, by recency, top 10)
   - Recent Events (typed: event, by recency, top 10)
   - Observations (typed: observation, by recency, top 5)

2. **LLM synthesis** -- pass all raw sections to a synthesis LLM with instructions to:
   - Prioritize recent and high-importance information
   - Connect related facts into coherent narratives
   - Note contradictions or open questions
   - Merge duplicates across sections
   - Stay under a word limit

3. **Store and inject** -- the synthesized bulletin is stored in `RuntimeConfig.memory_bulletin` and injected into every channel's system prompt.

### Why This Is Good

- **Deduplication at synthesis time** -- the same memory might appear in both "Recent" and "Decisions" sections. The LLM merges them.
- **Narrative over list** -- raw memories are bullet points. The bulletin is a coherent brief.
- **Fixed token budget** -- the bulletin has a word limit, so context usage is predictable regardless of how many memories exist.
- **Periodic refresh** -- the bulletin is regenerated on a configurable interval, not on every conversation turn. This amortizes the LLM cost.

**File:** `/tmp/spacebot/src/agent/cortex.rs`, lines 614-901

---

## 10. Embedding System

### Model

Spacebot uses **fastembed** with the default `all-MiniLM-L6-v2` model (384 dimensions). The model is loaded locally -- no API calls for embeddings.

```rust
pub struct EmbeddingModel {
    model: Arc<fastembed::TextEmbedding>,
}
```

Since fastembed's `TextEmbedding` is not `Send`, it's wrapped in `Arc` and all calls go through `spawn_blocking` for async compatibility.

**File:** `/tmp/spacebot/src/memory/embedding.rs`

### Embedding Pipeline

On memory save:
1. Save memory metadata to SQLite
2. Create graph associations
3. Generate embedding via fastembed (`spawn_blocking`)
4. Store embedding + content in LanceDB
5. Ensure FTS index exists

On memory recall (hybrid mode):
1. Generate query embedding via fastembed
2. Vector search in LanceDB (HNSW)
3. FTS search in LanceDB (Tantivy)
4. Graph traversal in SQLite
5. RRF fusion

---

## 11. Memory Graph Visualization

Spacebot includes a full interactive graph visualization component (React + Sigma.js + graphology):

- Force-directed layout (ForceAtlas2 in a web worker)
- Color-coded nodes by memory type (8 colors)
- Color-coded edges by relation type (6 colors)
- Node size scales with importance
- Edge size scales with weight
- Click to inspect, double-click to expand neighbors (lazy graph loading)
- Hover highlights connected nodes, fades unconnected
- Stats bar showing node/edge counts

The graph loads up to 300 nodes initially and supports on-demand neighbor expansion via API.

**File:** `/tmp/spacebot/interface/src/components/MemoryGraph.tsx`

---

## 12. What's Reusable for Zazig

### Directly Borrowable

1. **Typed memory categories with per-type default importance.** The 8 types (fact, preference, decision, identity, event, observation, goal, todo) map well to agent knowledge. Identity at 1.0, observations at 0.3 is a natural hierarchy. For Zazig, we'd probably want:
   - `doctrine` (replaces identity -- what the agent believes)
   - `decision` (architecture/design choices)
   - `fact` (codebase/project facts)
   - `correction` (mistakes to avoid)
   - `preference` (user/team preferences)
   - `observation` (inferred patterns)

2. **Association graph with typed edges.** The `Updates`, `Contradicts`, `RelatedTo`, `CausedBy`, `ResultOf`, `PartOf` relation types cover most knowledge relationships. The `Updates` chain is especially valuable -- it lets you trace how a piece of knowledge evolved.

3. **Soft deletion with `forgotten` flag.** Better than hard delete because you preserve audit trail and can un-forget if needed.

4. **Access tracking** (`last_accessed_at`, `access_count`). Cheap to maintain, valuable for decay and relevance scoring.

5. **Compactor-as-memory-extractor.** When context gets compacted, extracting memories in the same LLM pass is efficient and ensures nothing is lost.

6. **Cortex bulletin pattern.** Instead of injecting raw memories into prompts, synthesize them into a coherent brief on a schedule. Controls token budget and improves quality.

7. **RRF for hybrid search.** Simple, effective, and avoids the normalization problems of weighted score fusion.

### Worth Adapting

1. **Dual-database split.** The SQLite + LanceDB split is specific to their Rust embedded deployment. For Zazig (Supabase), we'd likely use:
   - Supabase Postgres for everything SQLite does (metadata, graph, CRUD)
   - pgvector extension for embeddings (instead of LanceDB)
   - Postgres full-text search (instead of Tantivy)

   This simplifies to one database but preserves the logical separation.

2. **Maintenance loop.** Decay + prune + merge running periodically is right, but their merge implementation is still a placeholder. We'd need to actually build it.

3. **Memory persistence prompt.** Their periodic "review conversation and extract memories" prompt is good. For Zazig's multi-agent setup, each agent role might need different extraction patterns (CPO extracts strategic decisions, CTO extracts technical facts, etc.).

### Novel Approaches

1. **Branch-as-recall-intermediary.** The LLM never gets raw search results. A disposable "branch" absorbs the search noise and returns only curated, relevant memories to the channel. The branch's context is thrown away. This is an extra LLM call but keeps the main context clean. Worth considering for CPO, which needs to stay focused.

2. **Memory-save validation of association targets.** Before creating a graph edge, verify the target memory exists. Prevents hallucinated IDs from creating dangling references. Simple guard, high value.

3. **Multiple search modes in one interface.** The `SearchMode` enum (Hybrid/Recent/Important/Typed) with the `SearchConfig` struct makes the search API flexible without being complex. Non-hybrid modes skip all the expensive vector/FTS/RRF machinery and go straight to SQLite.

4. **Importance-as-score vs importance-as-label.** Spacebot uses a continuous 0.0-1.0 score, not discrete labels (high/medium/low). This allows natural decay math and fine-grained ordering. Combined with type-based defaults, the agent rarely needs to set importance explicitly.

---

## 13. Architecture Diagram

```
                    WRITE PATHS                          READ PATH
                    ──────────                          ─────────

  Branch (conversation)  ──┐
                           │
  Compactor (compaction) ──┤── memory_save ──┬─→ SQLite (metadata + graph)
                           │                 │
  Persistence (periodic) ──┘                 └─→ LanceDB (embedding + FTS)
                                                       │
                                                       │
                    CONTEXT INJECTION                   │
                    ─────────────────                   │
                                                       │
  Cortex bulletin loop ────────────────────────────────┘
       │
       │  1. Query memory store (8 section types)
       │  2. LLM synthesis → concise bulletin
       │  3. Store in RuntimeConfig
       │
       └─→ Injected into every channel's system prompt


                    MAINTENANCE
                    ───────────

  Periodic background job:
    1. Decay (age × access × rate)
    2. Prune (importance < 0.1, age > 30d, not identity)
    3. Merge (similarity > 0.95) [placeholder]
    4. Reindex (graph centrality) [placeholder]


                    SEARCH PIPELINE (Hybrid mode)
                    ─────────────────────────────

  Query → embed → ┬─ LanceDB vector search (HNSW)  ───┐
                   ├─ LanceDB full-text search (FTS) ──┤─→ RRF fusion → curate → results
                   └─ SQLite graph traversal ──────────┘
```

---

## 14. Key File Reference

| File | Purpose |
|------|---------|
| `src/memory.rs` | Module root, re-exports |
| `src/memory/types.rs` | Memory, Association, MemoryType, RelationType structs |
| `src/memory/store.rs` | SQLite CRUD, graph ops, sorted queries |
| `src/memory/search.rs` | Hybrid search, RRF, SearchConfig, SearchMode |
| `src/memory/lance.rs` | LanceDB table management, vector/FTS search |
| `src/memory/embedding.rs` | fastembed wrapper (all-MiniLM-L6-v2, 384-dim) |
| `src/memory/maintenance.rs` | Decay, prune, merge (partially placeholder) |
| `src/tools/memory_save.rs` | Memory save tool (branch/compactor use) |
| `src/tools/memory_recall.rs` | Memory recall tool (4 search modes) |
| `src/tools/memory_delete.rs` | Soft-delete tool |
| `src/agent/compactor.rs` | Context compaction + memory extraction |
| `src/agent/cortex.rs` | Bulletin generation, warmup, cortex signals |
| `prompts/en/compactor.md.j2` | Compactor LLM prompt |
| `prompts/en/memory_persistence.md.j2` | Periodic memory extraction prompt |
| `prompts/en/cortex_bulletin.md.j2` | Bulletin synthesis prompt |
| `prompts/en/fragments/system/cortex_synthesis.md.j2` | Synthesis fragment |
| `interface/src/components/MemoryGraph.tsx` | Interactive graph visualization |
| `migrations/20260211000001_memories.sql` | Memories + associations schema |
| `migrations/20260212000001_forgotten_memories.sql` | Soft-delete column |
| `migrations/20260212000002_memory_created_at_index.sql` | Temporal query index |

---

## 15. Comparison with Zazig's Current State

| Aspect | Spacebot | Zazig (current) | Gap |
|--------|----------|-----------------|-----|
| Memory storage | SQLite + LanceDB (embedded) | Supabase `memory_chunks` table | Need typed categories, graph, embeddings |
| Memory types | 8 typed categories | Untyped chunks | Need type taxonomy |
| Graph | Weighted associations in SQLite | None | Need association model |
| Search | Hybrid (vector + FTS + graph + RRF) | None (no search) | Need search infrastructure |
| Context injection | LLM-synthesized bulletin | Manual MEMORY.md equivalent | Need automated bulletin |
| Compaction | 3-tier with memory extraction | None | Need compaction + extraction |
| Decay/maintenance | Periodic decay + prune | None | Need maintenance loop |
| Soft delete | `forgotten` flag | None | Simple migration |
| Access tracking | `last_accessed_at`, `access_count` | None | Simple migration |
| Visualization | Interactive Sigma.js graph | None | Nice-to-have, not critical |

---

## 16. Recommended Next Steps for Zazig Memory System

1. **Define Zazig memory types** -- adapt from Spacebot's 8, add `doctrine` and `correction`, possibly remove `todo` (Zazig has jobs for that).

2. **Design the Postgres schema** -- `memories` + `associations` tables in Supabase, with pgvector column for embeddings. Use Supabase Postgres full-text search instead of LanceDB/Tantivy.

3. **Implement the save/recall/delete tool triad** -- expose as MCP tools for all agent roles, role-scoped (CPO can save doctrines, engineers can save facts/corrections).

4. **Build the bulletin pattern** -- CPO's routing prompt stays lean (~200 tokens), memory bulletin is synthesized periodically and injected as additional context.

5. **Add memory extraction to compaction** -- when ephemeral agent workspaces are cleaned up, extract memories in the same pass.

6. **Defer graph visualization** -- useful for debugging but not critical for v1. The data model (associations) should support it from day one even if the UI comes later.
