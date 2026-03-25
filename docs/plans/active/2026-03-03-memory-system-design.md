# Memory System Design Document

**Date:** 2026-03-03
**Status:** design (v5.1, founder-reviewed + second opinion)
**Authors:** Tom (owner), Claude Opus 4.6 (agent)
**Part of:** [Zazig Org Model](ORG%20MODEL.md) -- covers Layer 6 (Memory)
**Informed by:** Memory Architecture Synthesis v3 (`docs/research/2026-03-02-Memory/2026-03-03-memory-synthesis-v3.md`) -- 22 research documents, three independent synthesis efforts (Claude, Gemini, OpenAI Deep Research)
**Companion docs:** [`exec-knowledge-architecture-v5.md`](active/2026-02-22-exec-knowledge-architecture-v5.md) (Layers 4-5: Doctrines + Canons), [`orchestration-server-design.md`](shipped/2026-02-18-orchestration-server-design.md) (dispatch + lifecycle), [`software-development-pipeline-design.md`](shipped/2026-02-24-software-development-pipeline-design.md) (job lifecycle), [`idea-to-job-pipeline-design.md`](active/2026-02-24-idea-to-job-pipeline-design.md) (full pipeline stages)

### Revision History

| Version | Date | Changes |
|---------|------|---------|
| v1 | 2026-03-03 | Initial design document |
| v2 | 2026-03-03 | Incorporated founder feedback: token budgets, Identity type redefinition, Context Handoff Protocol, bulletin scoping clarification |
| v3 | 2026-03-03 | Incorporated Codex second-opinion feedback: added Procedure type, hardened Context Handoff Protocol, tier-specific memory budgets, mandatory slot reservation. |
| v4 | 2026-03-06 | Added active consolidation ("sleep cycle") from Google always-on-memory-agent recon. Added LLM rerank step for Phase 1 retrieval. New Section 4.6, schema + pipeline updates. |
| v5 | 2026-03-07 | Added Job Reflections (Section 4.7): structured "went well / even better if" self-evaluation at job completion. Enriches Path 1 extraction, feeds consolidation pipeline. Inspired by [@bread_'s tiered orchestration post](https://x.com/bread_/status/2030110540614488228). |
| v5.1 | 2026-03-07 | Added Discovery memory type (10th type). Added retrieval feedback to reflections (`context_used`/`context_irrelevant`). Added Discovery generation to consolidation. Inspired by [@ashpreetbedi's context-agent post](https://x.com/ashpreetbedi/status/2029953139856531528) -- "navigate, don't search." |

---

## 1. Problem Statement

Zazig's workers complete jobs, discover patterns, make mistakes, learn preferences, and accumulate institutional knowledge. Today, all of this is lost when a job ends and the worker's context window is deallocated. Every new job starts from zero. Every contractor re-discovers the same codebase quirks. Every executive re-asks the same clarifying questions.

Without memory:

- **Context loss.** The CPO designs a feature with the founder on Monday. By Wednesday, a contractor implementing part of it has no knowledge of the design conversation -- just a spec. Nuance, intent, and "why we chose this approach" are gone.
- **Repeated mistakes.** A Senior Engineer discovers that `pgvector` needs `<=>` not `<->` for cosine distance. This costs an hour. Next week, a different Senior Engineer makes the same mistake on a different project.
- **No institutional learning.** After 100 completed jobs, Zazig's organisation knows exactly as much as it did after job 1. Patterns that a human team would internalise ("features with fewer than 3 AC tend to come back for revision") are never captured.
- **Stale decisions.** The CTO makes an architecture decision in January. In March, a contractor makes the opposite choice because the decision exists only in a job report nobody reads.
- **No personality continuity.** The CPO's personality persists across sessions (Layer 1), but its experiential knowledge does not. It has identity without biography.

Memory is Layer 6 in Zazig's [six-layer prompt stack](ORG%20MODEL.md). It is the last layer assembled and injected at Position 9 -- the recency-biased end of the context window. It turns workers from amnesiac function-callers into entities that accumulate experience.

---

## 2. Design Principles

Seven principles govern the memory system. Each is a decision, not a platitude.

### P1: Retrieval quality over storage quantity

Most stored memories are never retrieved. Zep retrieves top-20 facts per query. Mem0 defaults to top-3. Optimise for recall precision, not memory volume. A system with 50 perfectly-retrieved memories beats one with 5,000 poorly-ranked ones.

### P2: Orchestrator-assembled, not agent-self-managed

The orchestrator compiles memory into the prompt at dispatch time. The agent never manages its own memory store, never queries it directly (except via scoped MCP tools for persistent agents), and never decides what to forget. This is the same architectural principle that governs personality (Layer 1), doctrines (Layer 4), and canons (Layer 5): the agent receives a compiled context, never the raw config.

### P3: Memory never writes to doctrines

Doctrines (Layer 4) are normative beliefs. Memory (Layer 6) is empirical experience. A memory can *propose* promotion to a doctrine via the promotion pipeline, but it cannot modify doctrines directly. The orchestrator enforces this boundary. When a memory contradicts a doctrine, the doctrine wins at inference time and the conflict is flagged for human review.

### P4: Scope-appropriate, not one-size-fits-all

Executives get full episodic memory across projects. Employees get focused memory for their specialty. Contractors get job-scoped memory plus optional shared patterns. The memory system respects the [three-tier workforce model](ORG%20MODEL.md) -- right-sized memory for right-sized workers.

### P5: Tombstone, never silently overwrite

When a new memory contradicts an existing one, the old memory is tombstoned (superseded), not silently replaced. The audit trail is preserved. Silent last-write-wins is the source of memory rot in every system that tried it (ChatGPT memory wipes, Spacebot's unimplemented merge logic).

### P6: Decay is per-type, not global

Identity does not decay. Moments decay aggressively. Preferences drift slowly. A single global decay rate forces a choice between "memories disappear too fast" and "stale memories pollute context forever." Per-type decay rates solve this.

### P7: Measure before scaling

The 2026 MAG (Memory-Augmented Generation) survey warns that system-level costs of memory maintenance are frequently overlooked. Teams build sophisticated pipelines, then discover the latency and token overhead make their agents slower and more expensive than agents without memory. Cost instrumentation is a Phase 1 deliverable, not a Phase 3 afterthought.

---

## 3. Memory Taxonomy

Ten types. Every type earns its place through distinct operational behaviour: different default importance, different decay rate, different promotion path.

| Memory Type | Default Importance | Decay Rate | Supersession | Description | Example |
|---|---|---|---|---|---|
| **Identity** | 1.0 | 0.0 (permanent) | Never | Biographical history: what the agent has done, who they have worked with, their track record and experience profile. NOT self-modifying personality (that is Layer 1, orchestrator-controlled per [`exec-personality-system-design.md`](active/2026-02-20-exec-personality-system-design.md)). | "Reviewed 47 PRs for Project Aurora." / "Collaborated with @chris on 12 features." / "Last 5 API design decisions followed RESTful convention." / "Have worked on 3 authentication systems." |
| **Decision** | 0.85 | 0.0 (superseded, not decayed) | By newer Decision | Choices with context about why. Prevents re-arguing. | "We chose Supabase over custom infra because single-vendor reduces ops overhead." |
| **Gotcha** | 0.9 | 0.0 (permanent) | Never | Hard-won lessons. Merges "principle" and "correction" -- both are operationally the same: knowledge that prevents repeating a mistake. | "pgvector needs `<=>` not `<->` for cosine distance." |
| **Fact** | 0.7 | 0.0 (superseded, not decayed) | By newer Fact | Verifiable project data, schemas, hard truths | "The orchestrator Edge Function is at `supabase/functions/orchestrator/`." |
| **Preference** | 0.65 | 0.1 (gradual drift) | Gradual | User or team working style preferences | "Tom prefers concise commit messages with bullet-point bodies." |
| **Observation** | 0.4 | 0.15 (inferred, less reliable) | Via promotion to Gotcha | Patterns the agent noticed but has not confirmed | "Feature specs with fewer than 3 AC tend to come back for revision." |
| **Moment** | 0.3 | 0.2 (aggressive) | Natural decay | High-signal episodic snapshots of key events | "PR #94 was merged on 2026-02-24 after CTO architecture review." |
| **Relationship** | 0.6 | 0.05 (slow evolution) | Gradual | Inter-agent or inter-person dynamics | "CTO reviews CPO's feature specs before breakdown dispatch." |
| **Procedure** | 0.8 | 0.05 (slow -- procedures stay relevant) | By newer Procedure | Reusable step-by-step sequences for accomplishing specific tasks. Distinct from gotchas (what to avoid) and facts (what is true). | "Deploy edge functions: set SUPABASE_ACCESS_TOKEN, run npx supabase functions deploy \<name\> --no-verify-jwt" / "Run migrations via Management API: POST to /v1/projects/{ref}/database/query with SQL body" |
| **Discovery** | 0.75 | 0.1 (moderate -- source maps evolve as codebase changes) | By newer Discovery for same scope | A map of *where* information lives, not the information itself. Points to files, tables, memories, and external sources relevant to a topic. Generated primarily by consolidation (Section 4.6). Enables navigation-first retrieval: check Discovery entries before falling back to broad search. | "Project Aurora auth context: migration 048 (schema), `src/middleware/rbac.ts` (implementation), CTO Decision 2026-02-20 (rationale), 3 Gotchas tagged 'auth'." / "Supabase Edge Function deployment: Procedure memory #abc, `deno.json` import map, `supabase/functions/` directory." |

### Why 10 types

The original v4 design had 9 types. v5.1 adds Discovery as the 10th, based on the "context agent" pattern from [Agno's Pal](https://x.com/ashpreetbedi/status/2029953139856531528): agents that navigate to known locations outperform agents that search from scratch every time. Discovery earns its place because it has a unique operational profile: it is the only type that is *meta-referential* (pointing to other memories and external sources rather than containing knowledge directly), and it is primarily generated by consolidation rather than by agents. It could not be a sub-type of Fact (facts are about what is true; discoveries are about where things are) or Procedure (procedures are how-to sequences; discoveries are source maps). Seven (Gemini's original proposal) loses Observation, which is the raw material for the promotion pipeline. Claude's original 10-type proposal added Goal (redundant with pipeline state) and split Principle/Correction (no retrieval benefit). Codex identified Procedure as the biggest gap. Discovery fills the remaining gap: retrieval navigation.

### Per-type generation and consumption by tier

| Memory Type | Executive | Employee | Contractor |
|---|---|---|---|
| **Identity** | Creates + reads own (biographical: track record, experience, collaboration history) | Creates + reads own (role-scoped biographical history) | Does not use |
| **Decision** | Creates + reads all company/project | Creates project-scoped + reads | Reads via ContextPack |
| **Gotcha** | Creates + reads all | Creates role-scoped + reads | Reads via ContextPack; creates via tombstone commit |
| **Fact** | Creates + reads all | Creates project-scoped + reads | Reads via ContextPack; creates via tombstone commit |
| **Preference** | Creates + reads own + company | Creates own + reads company | Reads company-scoped via ContextPack |
| **Observation** | Creates + reads own | Creates + reads own + role-shared | Creates job-scoped only |
| **Moment** | Creates + reads own | Creates + reads own | Creates job-scoped only |
| **Relationship** | Creates + reads all | Creates + reads assigned | Does not use |
| **Procedure** | Creates + reads all | Creates project-scoped + reads | Creates job-scoped via tombstone commit; reads via ContextPack |
| **Discovery** | Reads all (generated by consolidation) | Reads project-scoped (generated by consolidation) | Reads via ContextPack (generated by consolidation) |

---

## 4. Architecture

### 4.0 Per-Layer Token Budgets

The total prompt injection across ALL layers of the prompt stack must stay under ~5,000 tokens. The orchestrator enforces these as **hard caps**, not suggestions. If a layer exceeds its budget, it gets truncated/compressed -- it is never allowed to overflow into other layers' budgets.

| Layer | Budget | Notes |
|-------|--------|-------|
| Personality | ~200 tokens | Compiled from numeric dimensions |
| Role prompt | ~500 tokens | Operational scope, responsibilities |
| Doctrines (Tier 1 index) | ~300 tokens | Stable pointers, not full text |
| Canons (pointers) | ~200 tokens | Library references only |
| Skills | ~1,000-2,000 tokens | Varies by role, loaded per job |
| Task context | ~500-1,000 tokens | Job spec, AC, dependencies |
| **Memory (bulletin/ContextPack)** | **~300-1,500 tokens (tier-dependent)** | **Hard cap, orchestrator-enforced** |

**Tier-specific memory budgets:**

| Tier | Memory Budget | Rationale |
|------|--------------|-----------|
| Executive | 1000-1500 tokens | Longest sessions, most context needed, cross-project awareness |
| Employee | 700-1200 tokens | Focused domain, fewer but deeper memories |
| Contractor | 300-800 tokens | Short-lived, needs only job-relevant context |

**Mandatory slot reservation:** Before free-form memory fill, always reserve capacity for:
- 2 gotcha slots (~100 tokens each)
- 2 decision slots (~100 tokens each)
- 1 open risk/blocker slot (~80 tokens)

This guarantees the most operationally critical memory types always have space, even when the budget is tight. Remaining budget is filled greedily by relevance score.

The key insight: **most stored memories are never retrieved, and that is fine.** Quality of the top 10 memories matters infinitely more than having 500 memories available. The memory budget is deliberately tight to force the retrieval pipeline to be ruthlessly selective. A bulletin that injects 800 tokens of highly relevant, well-scoped memories will outperform one that dumps 3,000 tokens of loosely related context and starves other layers of their budget.

The orchestrator's prompt compiler validates total token count after assembly. If the sum exceeds the budget, layers are compressed in reverse priority order (Memory first, then Task context, then Skills). Personality, Role prompt, Doctrines, and Canons are never compressed -- they are the agent's identity and beliefs, which must remain intact.

### 4.1 Storage Schema

A new `memories` table replaces the existing `memory_chunks` table from migration 003. The old table was a v1 prototype -- flat text blobs with embeddings, no typing, no scoping, no lifecycle. The new schema is purpose-built for the 10-type taxonomy, scoped visibility, and the full write/read/decay lifecycle.

```sql
-- ============================================================
-- memories
-- Layer 6 of the prompt stack. Replaces memory_chunks.
-- ============================================================

CREATE TABLE public.memories (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

    -- Content
    content         TEXT        NOT NULL,
    memory_type     TEXT        NOT NULL
        CHECK (memory_type IN (
            'identity','decision','gotcha','fact',
            'preference','observation','moment','relationship','procedure','discovery'
        )),

    -- Scoring
    importance      REAL        NOT NULL DEFAULT 0.5,
    confidence_score REAL       NOT NULL DEFAULT 0.5
        CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
    confidence_source TEXT      NOT NULL DEFAULT 'agent_generated'
        CHECK (confidence_source IN (
            'user_stated','user_confirmed','context_implied',
            'pattern_inferred','agent_generated'
        )),

    -- Scoping
    scope           TEXT        NOT NULL DEFAULT 'company'
        CHECK (scope IN (
            'company','project','feature','job',
            'role_shared','individual'
        )),
    scope_id        UUID,       -- project_id, feature_id, or job_id depending on scope
    role_origin     TEXT,       -- which role created this memory
    worker_id       UUID,       -- for individual-scope memories
    worker_tier     TEXT        -- exec / employee / contractor
        CHECK (worker_tier IS NULL OR worker_tier IN ('exec','employee','contractor')),

    -- Retrieval
    embedding       vector(1536),  -- OpenAI text-embedding-3-small
    tags            TEXT[]      DEFAULT '{}',

    -- Lifecycle
    decay_rate      REAL        NOT NULL DEFAULT 0.0,
    last_accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    access_count    INTEGER     NOT NULL DEFAULT 0,
    superseded_by   UUID        REFERENCES public.memories(id),
    forgotten       BOOLEAN     NOT NULL DEFAULT FALSE,
    consolidated    BOOLEAN     NOT NULL DEFAULT FALSE, -- true after sleep cycle has synthesised this memory into an insight

    -- Audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source_job_id   UUID,       -- which job produced this memory
    source_session_id TEXT      -- which session produced this memory
);

-- Associations (graph edges between memories)
CREATE TABLE public.memory_associations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id       UUID        NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
    target_id       UUID        NOT NULL REFERENCES public.memories(id) ON DELETE CASCADE,
    relation_type   TEXT        NOT NULL
        CHECK (relation_type IN (
            'updates','contradicts','caused_by',
            'result_of','related_to','part_of'
        )),
    weight          REAL        NOT NULL DEFAULT 0.5,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_id, target_id, relation_type)
);

-- Indexes: retrieval performance
CREATE INDEX idx_memories_company         ON public.memories(company_id);
CREATE INDEX idx_memories_type            ON public.memories(memory_type);
CREATE INDEX idx_memories_scope           ON public.memories(scope, scope_id);
CREATE INDEX idx_memories_importance      ON public.memories(importance DESC);
CREATE INDEX idx_memories_forgotten       ON public.memories(forgotten) WHERE NOT forgotten;
CREATE INDEX idx_memories_worker          ON public.memories(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX idx_memories_role_origin     ON public.memories(role_origin);
CREATE INDEX idx_memories_source_job      ON public.memories(source_job_id) WHERE source_job_id IS NOT NULL;

-- Vector index for semantic search (Phase 2 -- embedding column is nullable in Phase 1)
CREATE INDEX idx_memories_embedding       ON public.memories
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search index
CREATE INDEX idx_memories_fts             ON public.memories
    USING gin(to_tsvector('english', content));

-- Association indexes
CREATE INDEX idx_associations_source      ON public.memory_associations(source_id);
CREATE INDEX idx_associations_target      ON public.memory_associations(target_id);

-- RLS
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_associations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON public.memories
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access" ON public.memory_associations
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE TRIGGER set_memories_updated_at
    BEFORE UPDATE ON public.memories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

**Design notes:**

- Single table for all 9 memory types. The `memory_type` column plus per-type decay rates handle behavioural differences. No table-per-type.
- `scope` + `scope_id` handles hierarchical scoping without separate tables per scope.
- `worker_id` is nullable -- company-scope memories belong to no specific worker.
- `embedding` column is nullable for Phase 1 (FTS-only search). Phase 2 backfills embeddings and enables vector search.
- Graph is in Postgres via `memory_associations`, not Neo4j. Our graph will be under 100K nodes for year one.
- No Redis for Phase 1. Working memory is the context window itself.

### 4.2 Write Pipeline

Memories are created through four paths. All paths converge on the same validation pipeline before storage.

```
                          ┌────────────────────────────────────┐
                          │        VALIDATION PIPELINE         │
                          │                                    │
Path 1: Post-Job ────────>│  1. Type classification (10 types) │
Path 2: Agent MCP Tool ──>│  2. Confidence scoring + source    │
Path 3: Compaction Flush ->│  3. Dedup check (FTS / vector)    │
Path 4: Human Override ──>│  4. Contradiction detection        │
                          │  5. Scope permission check         │
                          │  6. Write to memories table        │
                          │  7. Create association edges       │
                          └────────────────────────────────────┘
```

**Path 1: Post-Job Extraction (primary path)**

When a job completes, the local agent daemon sends a completion event to the orchestrator. The orchestrator then calls a memory extraction Edge Function with the job report. This is the main source of institutional memory.

Decision: memory extraction happens in an **orchestrator Edge Function**, not in the local agent daemon and not in the worker agent itself.

Justification:
- The orchestrator already processes job completion events (`dispatchQueuedJobs`, `checkUnblockedJobs`, `notifyCPO` per PR #91). Adding extraction to this pipeline is a natural extension.
- The local agent daemon is a thin execution layer. Adding LLM-based extraction to the daemon means running inference locally, which conflicts with the architecture principle that the daemon does not make intelligent decisions.
- The worker agent could extract via MCP tool, but this burdens the agent with meta-cognitive overhead during the job, and agents that are about to terminate (contractors) have no incentive to invest context window space on memory extraction.
- An Edge Function can use a cheaper model (Sonnet or Haiku) for extraction, independent of the job's execution model.

```
Job completes
    │
    ▼
Local agent sends completion event + job report + reflection to orchestrator
    │
    ▼
Orchestrator calls extract-memories Edge Function:
    ├── Input: job report, job context, role, project metadata, reflection (Section 4.7)
    ├── Extraction prompt classifies insights into 10 types
    ├── Scores confidence (0.0-1.0) with source attribution
    ├── Tags with scope (company/project/feature/job)
    │
    ▼
Validation pipeline:
    ├── Dedup: FTS match against existing memories (Phase 1)
    │          pgvector cosine similarity >= 0.92 (Phase 2)
    ├── Contradiction: semantic match + type match against existing
    │   ├── Higher confidence new memory → tombstone old (superseded_by)
    │   ├── Similar confidence → flag both for human review
    │   └── Lower confidence new memory → store but do not supersede
    ├── Scope: validate writer has permission for target scope
    │
    ▼
Write to memories table + create association edges
```

**Path 2: Agent MCP Tool (persistent agents only)**

Executives and Employees can save memories during their session via the `memory_save` MCP tool. The agent provides content, type, and suggested importance. The orchestrator validates scope permissions before writing.

**Path 3: Compaction Memory Flush (persistent agents only)**

When a persistent agent's context compacts, extract memories from the outgoing context before it is lost. This is the "memory flush" -- the last chance to capture information before it leaves the context window. Critical for the CPO, which hits compaction regularly during long strategy sessions.

Implementation: a PreCompaction hook in the local agent daemon intercepts the compaction event, sends the outgoing context to the extraction Edge Function, and stores the results before compaction proceeds.

**Path 4: Human-Supervised Correction**

Humans can create, edit, or delete memories via the admin interface or Slack gateway. These memories are written with `confidence_source = 'user_stated'` and maximum confidence (0.95+). When editing, the old version is tombstoned and a new version created.

### 4.3 Read Pipeline

Two read patterns, matched to worker lifecycle.

**Pattern 1: Dispatch-Time Assembly (all agents)**

When the orchestrator assembles a job workspace, it queries relevant memories and injects them at Position 9 of the prompt stack. This is the primary read path.

**The bulletin is NOT a generic dump of all memories.** It is assembled per-job at dispatch time. The orchestrator knows what role this worker has, what project/feature/job they are about to work on, and what type of task it is. The bulletin query is scoped accordingly: "Give me the top memories for role=X, project=Y, type IN (decision, gotcha, fact)." It uses the job context to filter and score memories for relevance.

For persistent agents on heartbeat (where there is no specific job context), the bulletin falls back to recency + importance scoring -- a "what is important right now" brief, not "everything you have ever remembered."

```
Orchestrator assembling StartJob payload
    │
    ▼
Determine worker tier + role + scope context
    │
    ├── Executive / Employee → Bulletin Pattern
    │   0. Discovery shortcut: query Discovery memories for this project/feature.
    │      If found, use source pointers to scope subsequent queries (skip broad FTS).
    │      If not found, fall through to broad retrieval below.
    │   1. Query top 15 Identity + Gotcha memories (always included)
    │   2. Query top 10 Decisions (by recency, scoped to active projects)
    │   3. Query top 10 Facts (by relevance to current task)
    │   4. Query top 5 Observations (by recency)
    │   5. Query top 5 Relationships (by relevance)
    │   6. LLM rerank (Phase 1+): pass top 25 FTS candidates + job context to Haiku,
    │      return top 10 ranked by semantic relevance (see Section 4.3.1)
    │   7. Memory-Doctrine dedup: suppress memories restating active doctrines
    │   8. Memory-Doctrine conflict check: suppress contradicting memories, flag for review
    │   9. Assemble into XML-structured bulletin (see Section 4.4)
    │   10. Apply mandatory slot reservation (see below)
    │   11. Fill remaining budget greedily by relevance score
    │   12. Inject at Position 9 (token budget: tier-dependent, per Section 4.0)
    │
    └── Contractor → ContextPack Pattern
        0. Discovery shortcut: query Discovery memories for this feature/project.
           If found, use source pointers to pre-scope retrieval.
        1. Query memories scoped to job's project + feature
        2. Query role-type shared memories (if opt-in for this contractor role)
        3. Score by relevance to job spec (FTS match in Phase 1; cosine similarity in Phase 2)
        4. LLM rerank (Phase 1+): pass top 25 FTS candidates + job spec to Haiku,
           return top 10 ranked by semantic relevance (see Section 4.3.1)
        5. Apply mandatory slot reservation, then fill remaining token budget (tier-dependent, per Section 4.0) greedily from highest-scored
        6. Log compilation trace (considered vs included vs denied)
        7. Inject as ## Relevant Memory section in workspace
```

**Mandatory Slot Reservation (all tiers):**

Before free-form memory fill, the retrieval pipeline reserves capacity for operationally critical types:

```
Retrieval priority:
1. Fill mandatory slots first (2 gotchas, 2 decisions, 1 risk) — highest-scored per type
2. Fill remaining budget greedily by overall relevance score, regardless of type
3. If mandatory slots can't be filled (fewer than 2 gotchas exist), budget redistributes to free-form
```

This ensures that even in a tight 300-token contractor budget, the most dangerous gotchas and most relevant decisions always make it through. The mandatory slots consume ~480 tokens at maximum, leaving at least 320 tokens of free-form budget even in the smallest contractor allocation.

#### 4.3.1 LLM Rerank (Phase 1+)

FTS retrieval is keyword-based -- it misses semantic relevance. Rather than waiting for Phase 2 embeddings, the retrieval pipeline includes an optional LLM rerank step that bridges the gap.

**How it works:**

```
FTS query returns top 25 candidate memories (oversampled)
    │
    ▼
Haiku/Flash-Lite rerank call:
    Input:  job context (spec, role, project) + 25 candidate memory summaries
    Prompt: "Given the job context, rank these memories by relevance.
             Return the top 10 as a JSON array of memory IDs, most relevant first."
    Output: ordered list of 10 memory IDs
    │
    ▼
Reranked candidates fed into mandatory slot reservation + budget fill
```

**Cost:** ~500 input tokens (context) + ~2,500 tokens (25 memories at ~100 tokens each) = ~3,000 tokens per dispatch. At Haiku rates ($0.25/1M input), this is ~$0.001 per dispatch -- negligible.

**Fallback:** If the rerank call fails or times out (>2s), fall through to the original FTS ranking. The rerank is an enhancement, not a gate.

**Why not wait for embeddings:** Embeddings (Phase 2) give better recall at scale, but the rerank gives 80% of the benefit immediately. When Phase 2 ships, the rerank step runs on the hybrid search candidates instead of FTS candidates -- same pipeline, better inputs.

Inspired by Google's always-on-memory-agent pattern of using LLM inference instead of vector similarity for retrieval relevance. Adapted from their "read everything" approach to a bounded candidate set that stays within token budget.

**Pattern 2: On-Demand Fetch (persistent agents only, Phase 2+)**

Persistent agents can use the `memory_search` MCP tool mid-session to query for specific memories. This implements the progressive disclosure pattern -- the bulletin provides an overview, and the agent fetches details when needed.

### 4.4 Context Injection Format

Memory context is injected at Position 9 in the prompt stack, after task context (Position 8) and before the end of the system prompt. This placement leverages the "Lost in the Middle" attention pattern -- Position 9 is in the recency-biased tail of the context window.

**Bulletin Format (Executives + Employees):**

```xml
<memory-context tier="executive" budget="1500_tokens" last-updated="2026-03-03T10:00:00Z">
  <recalled-learnings count="12">
    <memory type="GOTCHA" confidence="0.98" source="user_confirmed">
      We don't use Tailwind; prefer Vanilla CSS for this project.
    </memory>
    <memory type="DECISION" confidence="0.92" source="context_implied">
      Chose Supabase over custom infra because single-vendor reduces ops overhead.
    </memory>
    <memory type="FACT" confidence="0.85" source="agent_generated">
      The orchestrator Edge Function is at supabase/functions/orchestrator/.
    </memory>
    <memory type="OBSERVATION" confidence="0.55" source="pattern_inferred">
      Feature specs with fewer than 3 AC tend to come back for revision.
    </memory>
    <memory type="RELATIONSHIP" confidence="0.80" source="context_implied">
      Tom prefers to iterate on specs in Slack before committing to design docs.
    </memory>
  </recalled-learnings>
</memory-context>
```

**ContextPack Format (Contractors):**

```markdown
## Relevant Memory

The following context was assembled from prior work on this project and feature.
Use it to avoid repeating known mistakes and to align with established decisions.

**Decisions:**
- Chose Supabase over custom infra (rationale: single-vendor, reduced ops overhead)
- Feature Y uses PKCE auth flow (CTO decision, 2026-02-20)

**Gotchas:**
- pgvector needs `<=>` not `<->` for cosine distance
- Always check for index migrations when modifying schema

**Facts:**
- The orchestrator Edge Function is at `supabase/functions/orchestrator/`
- Jobs table `context` column stores the job spec (not `spec`)
```

The ContextPack uses markdown (not XML) because contractors receive their workspace as markdown files and do not need the structured metadata attributes that persistent agents use for mid-session memory reasoning.

**Example: Scoped Bulletin Query**

When a Senior Engineer is dispatched a job on Project Aurora (feature: "add RBAC to API"), the orchestrator runs:

```sql
-- Scoped bulletin query for dispatch-time assembly
SELECT m.content, m.memory_type, m.confidence_score, m.importance
FROM memories m
WHERE m.company_id = $1                          -- company scope
  AND NOT m.forgotten
  AND m.superseded_by IS NULL
  AND (
    -- Always include Identity + Gotcha regardless of project
    m.memory_type IN ('identity', 'gotcha')
    OR (
      -- Scope Decisions, Facts, Observations to this project + feature
      m.memory_type IN ('decision', 'fact', 'observation')
      AND (
        m.scope = 'company'
        OR (m.scope = 'project' AND m.scope_id = $2)     -- Project Aurora
        OR (m.scope = 'feature' AND m.scope_id = $3)     -- RBAC feature
      )
    )
    OR (
      -- Role-shared memories for this worker's role
      m.scope = 'role_shared'
      AND m.role_origin = $4                              -- senior-engineer
    )
  )
ORDER BY
  CASE m.memory_type
    WHEN 'gotcha' THEN 1                                  -- gotchas first
    WHEN 'decision' THEN 2
    WHEN 'identity' THEN 3
    WHEN 'fact' THEN 4
    WHEN 'observation' THEN 5
    ELSE 6
  END,
  m.importance DESC,
  m.last_accessed_at DESC
LIMIT 25;                                                 -- oversample, then truncate to token budget
```

For a heartbeat-driven persistent agent (no specific job), the WHERE clause drops the project/feature scoping and uses recency + importance:

```sql
-- Heartbeat bulletin: "what's important right now" brief
SELECT m.content, m.memory_type, m.confidence_score, m.importance
FROM memories m
WHERE m.company_id = $1
  AND NOT m.forgotten
  AND m.superseded_by IS NULL
  AND m.memory_type IN ('decision', 'gotcha', 'fact', 'relationship', 'procedure')
ORDER BY m.importance DESC, m.last_accessed_at DESC
LIMIT 20;
```

### 4.5 Decay and Maintenance

A nightly maintenance job handles memory lifecycle. In Phase 1, this runs as a scheduled Edge Function invoked by pg_cron. In Phase 2, it becomes a dedicated maintenance contractor.

**Decay Formula:**

```
For each non-forgotten, non-Identity, non-Gotcha memory:
    days_old = (now() - created_at) / 86400
    days_since_access = (now() - last_accessed_at) / 86400

    type_decay = memory.decay_rate          -- from taxonomy defaults
    age_factor = max(0.5, 1.0 - (days_old * type_decay))   -- floor at 50%

    access_boost = CASE
        WHEN days_since_access < 7  THEN 1.1    -- recent access boosts
        WHEN days_since_access > 30 THEN 0.9    -- stale access penalises
        ELSE 1.0
    END

    new_importance = importance * age_factor * access_boost
```

The `max(0.5)` floor ensures that even decaying memories retain a minimum 50% of their original importance rather than approaching zero.

**Pruning rules:**

| Rule | Condition | Action |
|---|---|---|
| Soft delete | `importance < 0.1` AND `age > 30 days` | `SET forgotten = true` |
| Exempt from pruning | `memory_type IN ('identity', 'decision', 'gotcha')` | Never pruned |
| Hard delete | `forgotten = true` AND `age > 90 days` | `DELETE FROM memories` |

**Nightly maintenance sequence:**

1. **Decay** -- apply per-type formula to all non-exempt memories (note: consolidated source memories decay at 1.5x their base rate)
2. **Prune** -- soft-delete memories below threshold
3. **Dedup** -- find memories with >= 0.92 cosine similarity (Phase 2), merge or flag
4. **Conflict** -- find active contradictions, resolve by confidence or flag for human
5. **Hard delete** -- remove soft-deleted memories older than 90 days
6. **Stats** -- log memory counts by type, scope, age distribution, and consolidation stats (consolidated vs unconsolidated)
7. **Cost tracking** -- log token costs for extraction, retrieval, consolidation, and synthesis operations

Note: Consolidation ("sleep cycle") runs on a separate 6-hour schedule via its own pg_cron job (see Section 4.6). The nightly maintenance job handles decay, pruning, and cleanup. They are complementary: consolidation creates value, maintenance removes entropy.

### 4.6 Consolidation ("Sleep Cycle")

Decay and pruning are *reactive* memory management -- they remove or diminish existing memories. Consolidation is *proactive* -- it creates new knowledge by synthesising connections between existing memories, much like the human brain replays and connects information during sleep.

This pattern is adapted from Google's [always-on-memory-agent](https://github.com/GoogleCloudPlatform/generative-ai/tree/main/gemini/agents/always-on-memory-agent), which runs a `ConsolidateAgent` every 30 minutes to find cross-cutting insights. We scope it to Zazig's architecture: per-project consolidation, typed outputs, association graph edges, and accelerated decay on source memories.

**Trigger:** A pg_cron job runs every 6 hours (configurable). More frequent than nightly decay (which runs once per 24h) because consolidation produces value, whereas decay is maintenance.

**Process:**

```
pg_cron fires consolidation job
    │
    ▼
For each active project with >= 3 unconsolidated memories:
    │
    ├── Query unconsolidated memories:
    │   SELECT * FROM memories
    │   WHERE consolidated = false
    │     AND scope IN ('project', 'feature')
    │     AND scope_id = $project_id
    │     AND NOT forgotten
    │     AND memory_type NOT IN ('identity')  -- identity doesn't consolidate
    │   ORDER BY importance DESC, created_at DESC
    │   LIMIT 20
    │
    ├── Call consolidate-memories Edge Function (Haiku):
    │   Input:  20 unconsolidated memories with their types + content
    │   Prompt: "Review these memories from project X. Find:
    │            1. Cross-cutting patterns or themes
    │            2. Connections between memories that aren't obvious individually
    │            3. Emerging insights or recurring signals
    │            For each insight, cite the source memory IDs."
    │   Output: 1-3 insights, each with source_ids and a relationship description
    │
    ├── For each generated insight:
    │   ├── Create a new memory:
    │   │   memory_type = 'observation'
    │   │   confidence_source = 'pattern_inferred'
    │   │   importance = 0.6 (default for consolidation-generated observations)
    │   │   scope = same as source memories (project-scoped)
    │   │   tags = ['consolidation', 'sleep-cycle']
    │   │   source_job_id = NULL (not from a job -- from consolidation)
    │   │
    │   └── Create association edges:
    │       For each source memory:
    │           memory_associations(source_id=insight, target_id=source, relation_type='result_of')
    │
    ├── Mark source memories: SET consolidated = true
    │
    └── Optionally accelerate decay on consolidated source memories:
        For non-exempt types (not identity/decision/gotcha):
            SET decay_rate = decay_rate * 1.5  -- consolidated memories age faster,
                                                -- their insight is the higher-value artifact
```

**What consolidation produces vs what decay removes:**

| | Consolidation | Decay |
|---|---|---|
| **Direction** | Creates new memories | Diminishes existing memories |
| **Trigger** | Scheduled (every 6h) | Scheduled (nightly) |
| **Input** | Unconsolidated memories in a scope | All non-exempt memories |
| **Output** | New `observation` + `discovery` memories with association edges | Updated `importance` scores, soft-deletes |
| **Relationship** | Complementary -- consolidation creates, then decay cleans up the sources |

**Discovery generation (navigate, don't search):**

In addition to cross-cutting observations, the consolidation prompt generates **Discovery** memories -- source maps that record where information about a topic lives. This is the "context agent" pattern from [Agno's Pal](https://x.com/ashpreetbedi/status/2029953139856531528): agents that navigate to known locations outperform agents that search from scratch every time.

```
Consolidation prompt (extended):
    "...Additionally, for each topic or entity that appears in 3+ source memories,
     generate a Discovery memory listing where information about that topic lives:
     - Which memory IDs contain relevant knowledge
     - Which files, tables, or external sources are referenced
     - Which roles have contributed knowledge about this topic

     Format: 'Topic X context: [source 1], [source 2], [source 3].'
     Discovery memories are source maps, not knowledge. They tell the retrieval
     pipeline WHERE to look, not WHAT to find."
```

When the retrieval pipeline (Section 4.3) finds a Discovery entry for the current job's project or feature, it uses the source pointers to scope its queries instead of running broad FTS. This is step 0 in both the Bulletin and ContextPack patterns. Over time, as Discovery entries accumulate and are superseded by more complete versions, retrieval becomes navigation: the system knows where things are before it searches.

**Consolidation does NOT:**
- Consolidate across projects (project boundaries are firm)
- Create `gotcha` or `decision` type memories (those require higher confidence; consolidation creates `observation` and `discovery` which can be promoted later via the Phase 3 promotion pipeline)
- Run on company-scope memories (too broad; company-scope consolidation is a Phase 3+ feature)
- Delete source memories (they are marked `consolidated = true` and their decay is accelerated, but they persist until natural decay prunes them)

**Interaction with the promotion pipeline (Phase 3):**

Consolidation-generated observations are the primary fuel for the promotion pipeline. An observation that appears in 3+ consolidation cycles across different features = strong signal for promotion to `gotcha`. An observation that spans multiple projects = candidate for doctrine promotion. The `consolidation` tag makes these easy to query.

```
Sleep Cycle (Phase 1):  memories → consolidation → observations + discoveries
                        retrieval feedback → discovery refinement
Promotion (Phase 3):    observations → gotchas → doctrine candidates
```

**Cost:** ~3,000 tokens per project per consolidation cycle (20 memories at ~100 tokens each + prompt + output). At Haiku rates, ~$0.001 per project per cycle. With 10 active projects and 4 cycles per day, total cost is ~$0.04/day.

### 4.7 Job Reflections

Job reports capture *what happened* -- files changed, tests passed, AC completed. Reflections capture *how it felt to do the work* -- what went smoothly, what the agent would do differently, and how confident it is in the result. This is the subjective signal that makes Path 1 extraction dramatically richer.

Inspired by evaluation/reflection patterns in tiered agent orchestration (see [bread_'s Nanoclaw post](https://x.com/bread_/status/2030110540614488228)), where post-quest grading and self-evaluation drive compounding agent effectiveness.

**Structure:**

Every worker writes a structured reflection before reporting job completion. This is appended to the job completion payload alongside the job report.

```yaml
reflection:
  went_well: "AC were precise enough to implement without ambiguity"
  even_better_if: "I'd planned TDD before jumping into implementation"
  confidence: 0.75  # how confident the agent is in the correctness of its work
  context_used:       # which injected memories actually helped (IDs or descriptions)
    - "Gotcha: pgvector needs <=> not <-> for cosine distance"
    - "Decision: use Supabase RLS over application-level checks"
  context_irrelevant: # which injected memories were noise
    - "Fact: orchestrator Edge Function location"  # not relevant to this frontend job
```

The five fields serve distinct purposes:

| Field | Purpose | Maps to memory type |
|---|---|---|
| `went_well` | What worked -- reinforces effective patterns | **Procedure** ("When AC are well-defined, implement directly") or **Observation** ("Gherkin AC reduce ambiguity in implementation") |
| `even_better_if` | What the agent would improve next time -- self-identified growth edge | **Observation** ("Jobs go better when TDD is planned before implementation") → candidate for **Gotcha** promotion after repeated signals |
| `confidence` | Self-assessed correctness (0.0-1.0) | Calibration signal -- tracked against verification outcomes (see below) |
| `context_used` | Which injected memories the agent actually relied on | **Retrieval feedback** -- boosts `access_count` and `last_accessed_at` on used memories, improving their future retrieval ranking |
| `context_irrelevant` | Which injected memories were noise for this job | **Retrieval feedback** -- signals that these memories were poorly scoped for this job type/role. Feeds Discovery generation (Section 4.6) by identifying which source maps need refinement |

**Capture mechanism:**

The reflection is prompted by a standard section in the worker's skill or CLAUDE.md, not by the orchestrator. The worker writes the reflection as part of its natural job completion flow. The local agent daemon includes it in the completion event payload.

```
Worker completing job
    │
    ▼
Worker writes reflection (prompted by skill/CLAUDE.md):
    ├── went_well: one sentence on what worked
    ├── even_better_if: one sentence on what to improve
    ├── confidence: 0.0-1.0
    ├── context_used: list of injected memories that helped
    ├── context_irrelevant: list of injected memories that were noise
    │
    ▼
Local agent sends completion event:
    ├── job_report (existing)
    ├── reflection (new)
    │
    ▼
Orchestrator receives completion event:
    ├── Passes both job_report AND reflection to extract-memories
    ├── Processes retrieval feedback (see below)
    └── Continues with existing verification flow (non-blocking)
```

**Extraction prompt enrichment:**

The `extract-memories` Edge Function receives the reflection as a dedicated input section. The extraction prompt includes:

> "The agent also provided this reflection on their experience. Extract memories from it:
> - `went_well` statements indicate effective patterns -- extract as Procedure or Observation memories.
> - `even_better_if` statements indicate self-identified improvement opportunities -- extract as Observation memories with `confidence_source = 'agent_generated'`. These are high-value candidates for promotion to Gotcha if the same signal appears across multiple jobs.
> - Give particular weight to `even_better_if` statements. They represent the gap between current and ideal performance -- the exact knowledge that compounds over time."

**Confidence calibration:**

The `confidence` field enables a feedback loop that no other signal provides. By tracking `confidence` against actual verification outcomes, the system builds a calibration profile per role:

```
For each role, over the last N jobs:
    predicted_confidence = average of reflection.confidence
    actual_pass_rate = jobs that passed verification / total jobs

    calibration_gap = predicted_confidence - actual_pass_rate
```

| Calibration gap | Signal | Action |
|---|---|---|
| > 0.15 (overconfident) | Agent thinks it's right more than it is | Inject Observation: "You tend to overestimate correctness. Double-check before completing." |
| < -0.15 (underconfident) | Agent is better than it thinks | Inject Observation: "Your work passes verification more often than you expect. Trust your implementation." |
| -0.15 to 0.15 | Well-calibrated | No action needed |

Calibration observations are stored as `role_shared` scope, so they benefit all workers in that role. They are generated by the nightly maintenance job (Section 4.5), not in real-time, to avoid noisy single-job swings.

**Retrieval feedback (closing the loop):**

The `context_used` and `context_irrelevant` fields close the loop between what the orchestrator injects and what the worker actually needs. This is the "learnings as compass" pattern from [Agno's Pal](https://x.com/ashpreetbedi/status/2029953139856531528) -- the system learns not just what to remember, but how to retrieve better.

When the orchestrator processes retrieval feedback from a reflection:

```
For each memory in context_used:
    UPDATE memories SET
        access_count = access_count + 1,
        last_accessed_at = NOW()
    WHERE id = memory_id;
    -- Boosts future retrieval ranking (importance * access_boost)

For each memory in context_irrelevant:
    -- Do NOT penalise the memory itself (it may be useful for other job types).
    -- Instead, log a retrieval_miss event:
    INSERT INTO events (type, payload) VALUES (
        'retrieval_miss',
        { memory_id, job_role, job_type, project_id, feature_id }
    );
```

Retrieval miss events feed two downstream processes:

1. **Discovery refinement (Section 4.6):** When the consolidation sleep cycle sees a memory appearing in 3+ retrieval_miss events for the same role, it refines the relevant Discovery entry to exclude that memory from future scope maps for that role. The memory isn't wrong -- it's just not useful for that context.

2. **Retrieval strategy observations:** The nightly maintenance job (Section 4.5) analyses retrieval_miss patterns and generates Observations: "Fact memories about infrastructure are consistently irrelevant for frontend jobs" → the retrieval pipeline learns to down-rank infra Facts when assembling ContextPacks for frontend roles.

This is the key insight from context agents: the retrieval system should learn from its own performance, not just from the knowledge it stores. Over time, the combination of Discovery entries (where to look) and retrieval feedback (what works for which roles) makes the retrieval pipeline increasingly precise -- it navigates rather than searches.

**Interaction with consolidation (Section 4.6):**

Reflections are the highest-signal input to the sleep cycle. When three different workers all reflect "even better if: the AC had included error handling cases," the consolidation synthesises: *"Feature specs that omit error handling AC consistently cause rework."* That observation, after enough repetitions, becomes a Gotcha candidate via the Phase 3 promotion pipeline -- and eventually a doctrine candidate ("All feature AC must include error handling scenarios").

```
Reflections (per-job)
    → Observations (extracted by extract-memories)
        → Consolidated Observations (sleep cycle, cross-job patterns)
            → Gotcha (promotion pipeline, 3+ consistent signals)
                → Doctrine candidate (5+ accesses, multi-project)
```

This is the self-learning loop: individual job reflections compound into institutional knowledge without any human curation.

**Cost:** Zero additional LLM calls. The reflection is written by the worker as part of its existing job completion (the worker is already running). The reflection is passed to the existing `extract-memories` Edge Function as enriched input -- no separate extraction step. The only new cost is ~50 tokens of reflection content per job completion payload.

**Pre-memory-system implementation:**

Reflections can ship before the memory system. The minimal v1 is:

1. Add `reflection` to the job completion JSON schema (executor change, ~10 lines)
2. Add a "before completing, reflect" prompt section to the worker skill/CLAUDE.md
3. Store the reflection in the job report archive (`~/.claude/job-reports/`)

When the memory system ships (Phase 1), the `extract-memories` function reads the reflection block as enriched input. Until then, reflections are stored in job reports and are valuable as human-readable learning.

---

## 5. Integration with Existing Systems

### 5.1 Orchestrator Integration

The orchestrator is the sole gateway for memory reads and writes. No agent accesses the `memories` table directly.

**At dispatch time** (extending the existing prompt compiler from the [ORG MODEL](ORG%20MODEL.md)):

```
Existing prompt compiler flow:
    1. Read worker tier → compile personality (Layer 1)
    2. Read role prompt (Layer 2)
    3. Load skill content (Layer 3)
    4. Compile knowledge context: doctrines + canons (Layers 4-5)
    5. Load task context (Layer 8)

NEW step 6: Load memory context (Layer 6)
    ├── Determine scope boundaries (company + project + feature)
    ├── If persistent agent → use cached bulletin (or regenerate)
    ├── If ephemeral agent → assemble ContextPack
    ├── Memory-Doctrine dedup check
    ├── Memory-Doctrine conflict check
    └── Inject at Position 9
```

**At job completion** (extending the existing completion handler from [orchestration-server-design.md](shipped/2026-02-18-orchestration-server-design.md)):

```
Existing job completion flow:
    Agent reports complete
        → Job status → verifying
        → Run verification (tests, lint, code review)
        → If pass: merge, check feature completion, etc.

NEW branch after "Agent reports complete":
    → Call extract-memories Edge Function with job report + reflection (Section 4.7)
    → Store extracted memories in memories table
    → Track reflection.confidence for calibration (Section 4.7)
    → Continue with existing verification flow (non-blocking)
```

Memory extraction is **non-blocking** -- it runs in parallel with the existing verification pipeline and does not delay the job's progression through the state machine.

### 5.2 Local Agent Daemon Integration

The local agent daemon's role in the memory system is minimal, consistent with its design as a thin execution layer.

**Responsibilities:**
- Relay job reports to the orchestrator (existing behaviour). The orchestrator handles extraction.
- Forward compaction events from persistent agent sessions to the orchestrator for memory flush (new behaviour, Phase 2).
- Expose MCP tools (`memory_save`, `memory_search`) to persistent agents by proxying to orchestrator Edge Functions (new behaviour, Phase 1).

**Not responsible for:**
- Running extraction prompts locally
- Querying the memory store directly
- Making decisions about what to remember or forget

### 5.3 Pipeline Integration

Memory operations map to specific pipeline lifecycle events from the [software development pipeline](shipped/2026-02-24-software-development-pipeline-design.md):

| Pipeline Event | Memory Operation |
|---|---|
| Job status → `executing` | Orchestrator assembles ContextPack / bulletin and includes in StartJob payload |
| Job status → `complete` (agent reports done) | Orchestrator triggers post-job memory extraction with reflection (Section 4.7) |
| Job status → `complete` (reflection) | Reflection `went_well` → Procedure/Observation; `even_better_if` → Observation; `confidence` → calibration tracking |
| Job status → `verify_failed` | Failure context attached to job; extracted as Gotcha memory ("test X failed because Y"). Calibration: compare against reflection.confidence |
| Job status → `rejected` (human feedback) | Human feedback extracted as Preference or Gotcha memory |
| Feature status → `complete` | Orchestrator runs feature-level memory consolidation (merge job-scoped memories into project scope) |
| Feature status → `cancelled` | Job-scoped memories for that feature are left to decay naturally (not forcefully deleted) |

### 5.4 Knowledge System Boundary

The boundary between memory (Layer 6) and the knowledge system (Layers 4-5, per [exec-knowledge-architecture-v5.md](active/2026-02-22-exec-knowledge-architecture-v5.md)) is enforced by explicit contracts.

```
┌───────────────────────────────────────────────────────────────┐
│  LAYER 4: DOCTRINES (normative beliefs)                       │
│  Memory -> Doctrines: NEVER WRITE                             │
│  "Always use Gherkin AC" is a doctrine, not a memory.         │
│  Memory can observe that this doctrine exists and must not     │
│  contradict it. Promotion requires explicit pipeline +        │
│  human approval.                                              │
├───────────────────────────────────────────────────────────────┤
│  LAYER 5: CANONS (reference knowledge)                        │
│  Memory -> Canons: PROPOSE ONLY                               │
│  Memory can propose updates to canon material through the     │
│  promotion pipeline, but only after validation.               │
├───────────────────────────────────────────────────────────────┤
│  LAYER 3: SKILLS (procedural capability)                      │
│  Memory -> Skills: GATED UPDATES                              │
│  When episodic memory reveals a better procedure, it is a     │
│  candidate for skill improvement -- but requires code review, │
│  human approval, or offline evaluation.                       │
├───────────────────────────────────────────────────────────────┤
│  LAYER 6: MEMORY (empirical experience)                       │
│  This layer. Mutable. Decays. Scoped. Never normative.       │
└───────────────────────────────────────────────────────────────┘
```

**The boundary heuristic** from the knowledge architecture (Open Question #3): "If it is specific to this codebase, it is memory. If it is generalisable, it is doctrine. If it is published reference material, it is canon." Memory is where codebase-specific, project-specific, and ephemeral knowledge lives. When a memory proves universal, the promotion pipeline moves it up.

**Memory-Doctrine deduplication at retrieval time:** Before injecting memories into the prompt, the orchestrator checks against active doctrines using text matching (Phase 1) or semantic similarity (Phase 2). Memories that merely restate what is already in doctrines are suppressed. This prevents redundancy in the context window and preserves the token budget for memories that add genuinely new information.

**Memory-Doctrine conflict suppression:** If a memory contradicts an active doctrine, the memory is not injected. The doctrine wins at inference time. The conflict is logged and flagged for human review. This prevents the "experience-following" failure mode where recalled memories override established beliefs.

### 5.5 MCP Tools

Three MCP tools for memory operations, scoped by tier.

**`memory_save`** -- available to Executives and Employees

```typescript
{
    name: "memory_save",
    description: "Save a memory for future reference. Use this when you learn something important that should persist across sessions.",
    parameters: {
        content: string,       // The memory content
        memory_type: string,   // One of: identity, decision, gotcha, fact, preference, observation, moment, relationship, procedure
        importance: number,    // 0.0-1.0, suggested importance
        scope: string,         // company, project, feature
        scope_id?: string,     // UUID of project/feature if scoped
        tags?: string[]        // Freeform tags for retrieval
    }
}
```

**`memory_search`** -- available to Executives and Employees

```typescript
{
    name: "memory_search",
    description: "Search your memories for relevant information. Use this when you need to recall past decisions, patterns, or context.",
    parameters: {
        query: string,         // Natural language search query
        memory_type?: string,  // Filter by type
        scope?: string,        // Filter by scope
        limit?: number         // Max results (default 10)
    }
}
```

**`memory_delete`** -- available to Executives only

```typescript
{
    name: "memory_delete",
    description: "Mark a memory as forgotten. Use this when a memory is outdated, incorrect, or no longer relevant.",
    parameters: {
        memory_id: string,     // UUID of the memory to forget
        reason?: string        // Why this memory is being removed
    }
}
```

Contractors have no MCP tools for memory. Their memories are injected via ContextPack at dispatch time and extracted via post-job extraction at completion.

### 5.6 Context Handoff Protocol

Long-running persistent agents (executives and employees) can exhaust their context window before completing a task. The Context Handoff Protocol formalises what happens when this occurs, complementing the compaction flush write path (Path 3 in Section 4.2).

**The Protocol:**

1. **At >=80% context usage:** the agent warns and saves a structured handoff document to `memory/YYYY-MM-DD-HHMM-context-handoff.md` in its workspace.
2. **Handoff document must include:**
   - Objective (what was being worked on)
   - What is done (completed subtasks, decisions made)
   - What is pending (remaining work, open questions)
   - Exact resume command (how to pick up where this left off)
   - Blockers and decisions made during the session
3. **Agent sends message:** "I need to stop here. This session exceeded 80% of context capacity. I saved a full handoff at `<path>`. Please start a fresh chat and send: `resume <task> from <path>`."
4. **Resume only in fresh session.** Never attempt to continue in a degraded context.
5. **The handoff IS a memory extraction trigger.** The orchestrator extracts memories from the handoff document, not just from the final job report. This catches the case where long-running sessions accumulate context that would otherwise be lost when the agent terminates without completing.

**Scope:** This pattern applies to executives and employees (persistent agents with long sessions). Contractors are short-lived enough to rarely hit 80% context -- they complete and report before context is an issue.

**Integration with existing flows:**

The handoff document becomes an additional input to the post-job extraction Edge Function. When the orchestrator receives a `context_handoff` event (vs a `job_completed` event), it:

1. Runs the same `extract-memories` pipeline on the handoff document
2. Creates a `resume_job` in the job queue with the handoff document as task context
3. The `resume_job` inherits the original job's project, feature, and dependency metadata
4. On dispatch, the orchestrator includes the handoff's extracted memories in the bulletin/ContextPack alongside normal memories

```
Persistent agent hits 80% context
    │
    ▼
Agent writes structured handoff document to workspace
    │
    ▼
Agent sends context_handoff event to orchestrator
    │
    ▼
Orchestrator receives context_handoff event:
    ├── Run extract-memories Edge Function on handoff document
    │   (same pipeline as post-job extraction, Section 4.2 Path 1)
    ├── Store extracted memories in memories table
    ├── Create resume_job in job queue:
    │   ├── status = 'queued'
    │   ├── context = handoff document content
    │   ├── depends_on = [] (ready to dispatch immediately)
    │   ├── feature_id, project_id = inherited from original job
    │   └── metadata.resumed_from = original job ID
    └── Original job status → 'context_handoff' (terminal, not 'complete')
```

This ensures that no knowledge is lost when an agent runs out of context, and that the work resumes cleanly in a fresh session with full context capacity. The handoff document serves double duty: it is both the resume briefing for the next session and a memory extraction source for institutional learning.

**Failure Modes and Safeguards:**

The Context Handoff Protocol has four known failure modes, each with a designed safeguard.

**Failure Mode 1: Crash-before-handoff**

The agent crashes or loses connection before reaching 80% and writing the handoff document.

*Safeguard:* Periodic incremental checkpoints every 20 minutes (or every N tool calls). Lightweight JSON snapshots of current objective + progress, stored in the job workspace. If the agent crashes, the orchestrator can recover from the last checkpoint.

```json
// Example checkpoint: ~/.zazigv2/job-<id>/.checkpoint.json
{
    "timestamp": "2026-03-03T14:20:00Z",
    "objective": "Implement RBAC middleware for API routes",
    "progress": "3 of 7 AC complete",
    "completed": ["AC-1: role enum defined", "AC-2: middleware created", "AC-3: route guards applied"],
    "pending": ["AC-4: error responses", "AC-5: tests", "AC-6: docs", "AC-7: migration"],
    "decisions_made": ["Used Supabase RLS instead of application-level checks"],
    "checkpoint_seq": 3
}
```

**Failure Mode 2: Resume loops**

An agent that repeatedly hits 80% context creates an infinite chain of handoffs.

*Safeguard:* Maximum handoff depth per root job (default: 3). If a job has already been handed off 3 times, the orchestrator escalates to the managing exec or flags for human review instead of creating another `resume_job`. The `resume_job` carries a `handoff_depth` counter incremented from the parent.

**Failure Mode 3: Duplicate resumes**

Network issues or orchestrator retries could create duplicate `resume_job`s from the same handoff.

*Safeguard:* Idempotency key on `(root_job_id, handoff_seq)`. The `resume_job` creation is idempotent -- submitting the same handoff twice produces the same job, not two jobs. The orchestrator checks for an existing `resume_job` with the same root job ID and sequence number before creating a new one.

**Failure Mode 4: Side-effect safety on resume**

A resumed agent might re-execute actions (DB writes, API calls, file changes) that were already completed in the previous session.

*Safeguard:* The handoff document must include an "Actions Completed" section listing all external side effects. The resume prompt instructs the agent to skip these. For critical side effects (DB mutations, API calls), the agent should verify state before re-executing.

```markdown
## Actions Completed (do not re-execute)
- Migration 048 applied: added `rbac_role` column to users table
- Edge function `check-permissions` deployed (v3)
- POST /v1/projects/{ref}/database/query: created RLS policy `rbac_read_own`
```

---

## 6. Memory by Tier

### 6.1 Executives (CPO, CTO, VP-Eng)

Executives are persistent, autonomous, and operate across all projects in their domain. They accumulate the richest memory.

| Attribute | Value |
|---|---|
| **Memory scope** | Company + all projects they manage + individual |
| **Write permissions** | Company, project, feature, individual |
| **Read pattern** | Bulletin (synthesised, refreshed periodically) |
| **MCP tools** | `memory_save`, `memory_search`, `memory_delete` |
| **Compaction flush** | Yes -- memories extracted before context compaction |
| **Memory volume** | Unbounded; managed by decay + pruning |
| **Key memory types** | Decision (cross-project), Relationship (inter-agent dynamics), Preference (founder working style) |

The CPO's bulletin includes company-scope Decisions created by other executives. The CPO does not read the CTO's individual memories directly -- it reads the shared Decisions that the CTO's post-job extraction committed to company scope. This implements the Manus AI principle: "Share memory by communicating, do not communicate by sharing memory."

### 6.2 Employees (Senior Engineer, Product Manager, PR Reviewer)

Employees are persistent with focused scope. They build expertise in their specialty over time.

| Attribute | Value |
|---|---|
| **Memory scope** | Company (read) + assigned projects + role-type shared + individual |
| **Write permissions** | Project, feature, role-type shared, individual |
| **Read pattern** | Bulletin (focused, project-scoped) |
| **MCP tools** | `memory_save`, `memory_search` |
| **Compaction flush** | Yes -- for heartbeat-driven recurring tasks |
| **Memory volume** | Moderate; role-scoped, project-scoped |
| **Key memory types** | Gotcha (role expertise), Fact (codebase knowledge), Observation (pattern recognition) |

Role-type shared memory is the mechanism for institutional learning within a specialty. When a Senior Engineer discovers a codebase quirk, it is written to `scope = 'role_shared'` and available to all Senior Engineers on the next dispatch.

### 6.3 Contractors (Breakdown Specialist, Verification Specialist, etc.)

Contractors are ephemeral. Their memory model has two tiers, both opt-in per role config.

| Attribute | Value |
|---|---|
| **Memory scope** | Job-scoped (always) + role-type shared (opt-in per role config) |
| **Write permissions** | Job (always) + role-type shared (opt-in) |
| **Read pattern** | ContextPack (assembled at dispatch, injected into workspace) |
| **MCP tools** | None |
| **Compaction flush** | No -- contractors are short-lived |
| **Memory volume** | Small; job-scoped memories decay aggressively |
| **Key memory types** | Fact, Gotcha (job-specific discoveries) |

**Tombstone commit:** When a contractor completes a job, the post-job extraction is their "tombstone commit" -- the last memories they leave behind before being deallocated. It is the only way contractor-discovered knowledge enters the permanent record. The reflection (Section 4.7) is part of this tombstone -- a contractor's `even_better_if` is particularly valuable because it captures friction that the contractor experienced but cannot self-correct (being ephemeral). The system corrects on their behalf by feeding the observation to the next contractor in the same role.

**Role config for shared memory:**

```jsonc
// In the roles table, contractor roles can opt-in to shared memory
{
    "role": "verification-specialist",
    "tier": "contractor",
    "memory_config": {
        "shared_memory": true,     // reads and writes role-type shared pool
        "shared_read_limit": 10    // max shared memories injected per dispatch
    }
}

{
    "role": "junior-engineer",      // codex delegate -- stateless
    "tier": "contractor",
    "memory_config": {
        "shared_memory": false      // no shared memory, just job-scoped
    }
}
```

### Memory Visibility Matrix

```
                    Company  Project  Feature  Job  Role-Shared  Individual
Executive READ:       Y        Y        Y      N*      Y           Y (own)
Executive WRITE:      Y        Y        Y      N       N           Y (own)
Employee READ:        Y        Y*       Y*     N       Y (own role) Y (own)
Employee WRITE:       N        Y*       Y*     N       Y (own role) Y (own)
Contractor READ:      N        N        N      Y (own) Y* (opt-in)  N
Contractor WRITE:     N        N        N      Y (own) Y* (opt-in)  N

* = scoped to assigned projects/features
N* = Executives read job reports, not individual job memories
```

This matrix is enforced via Supabase Row-Level Security policies on the `memories` table, not application-level checks.

---

## 7. Implementation Plan

### Phase 1: Foundation (MVP) -- 2-3 weeks

**Goal:** Working memory storage and retrieval. Post-job extraction, manual writes via MCP, orchestrator-assembled reads. FTS-only search (no embeddings). No decay, no graph, no sharing.

**Deliverables:**

| # | Deliverable | Type | Detail |
|---|---|---|---|
| 1 | `memories` table migration | SQL | Full schema from Section 4.1, `embedding` column nullable (populated in Phase 2) |
| 2 | `memory_associations` table migration | SQL | Graph edges table, empty in Phase 1 but schema deployed |
| 3 | Deprecate `memory_chunks` | SQL | Migrate any existing data to `memories` table, drop `memory_chunks` |
| 4 | `extract-memories` Edge Function | Deno | Extraction prompt (see Appendix A), classifies into 10 types, scores confidence |
| 5 | Post-job extraction hook | TypeScript | Orchestrator calls `extract-memories` on job completion (non-blocking) |
| 6 | `memory_save` MCP tool | TypeScript | For persistent agents; validates scope, writes to `memories` |
| 7 | `memory_search` MCP tool | TypeScript | FTS-only search (`to_tsvector` / `plainto_tsquery`), scoped by tier permissions |
| 8 | ContextPack assembler | TypeScript | At dispatch: query memories by scope + type, format as markdown, inject in workspace |
| 9 | Bulletin assembler (basic) | TypeScript | For persistent agents: query top memories by type priority, format as XML, inject at Position 9 |
| 10 | Memory type validation | TypeScript | Enforce 10-type taxonomy at write time |
| 11 | Cost instrumentation (basic) | TypeScript | Log token counts for extraction prompt calls, memory injection sizes |
| 12 | `consolidate-memories` Edge Function | Deno | Sleep cycle consolidation prompt (see Section 4.6), generates `observation` + `discovery` memories from unconsolidated sources, creates association edges |
| 13 | Consolidation pg_cron job | SQL | Runs every 6 hours, triggers `consolidate-memories` per active project with >= 3 unconsolidated memories |
| 14 | LLM rerank step | TypeScript | Haiku-based rerank of top 25 FTS candidates to top 10 by semantic relevance (see Section 4.3.1), with 2s timeout fallback to raw FTS |
| 15 | Job reflection capture | TypeScript | Add `reflection` (went_well, even_better_if, confidence, context_used, context_irrelevant) to job completion payload. Prompt section in worker skill/CLAUDE.md. Passed to `extract-memories` as enriched input (Section 4.7) |
| 16 | Confidence calibration (basic) | TypeScript | Nightly: compare reflection.confidence against verification pass/fail per role. Generate calibration Observations when gap > 0.15 (Section 4.7) |
| 17 | Retrieval feedback processing | TypeScript | On job completion: boost `access_count`/`last_accessed_at` for `context_used` memories; log `retrieval_miss` events for `context_irrelevant` memories. Feeds Discovery refinement in consolidation (Section 4.7) |
| 18 | Discovery shortcut in retrieval | TypeScript | Step 0 in bulletin/ContextPack assembly: check for Discovery memories scoped to current project/feature. If found, use source pointers to scope subsequent queries (Section 4.3) |

**What Phase 1 gives you:** Every completed job leaves behind structured memories, enriched by the worker's own reflection on what went well and what could be improved. The CPO can save memories manually during conversations. Contractors receive relevant project memories in their workspace. The data is accumulating and searchable via FTS with LLM reranking for semantic relevance. The sleep cycle consolidation runs every 6 hours, generating cross-cutting insights and source maps (Discovery entries) from accumulated memories. Confidence calibration tracks whether agents are over- or under-confident. Retrieval feedback closes the loop -- memories that workers actually use get boosted, noise gets flagged, and Discovery entries get refined over time.

**What Phase 1 does NOT give you:** No embedding-based semantic search, no graph traversal, no decay, no multi-scope sharing, no deduplication beyond exact text match, no bulletin synthesis (the "bulletin" is a sorted list, not an LLM-synthesised brief).

### Phase 2: Intelligence -- 3-4 weeks

**Goal:** Semantic search via embeddings, memory graph, decay and pruning, bulletin synthesis, confidence-based conflict resolution, cost instrumentation.

**Deliverables:**

| # | Deliverable | Type | Detail |
|---|---|---|---|
| 1 | Embedding pipeline | Edge Function | On memory write: call OpenAI `text-embedding-3-small`, store in `embedding` column |
| 2 | Backfill embeddings | Migration script | Generate embeddings for all existing Phase 1 memories |
| 3 | Hybrid search (vector + FTS + RRF) | Edge Function | Three-strategy search fused via Reciprocal Rank Fusion (see Appendix B for RRF query) |
| 4 | Deduplication | Edge Function | pgvector cosine similarity >= 0.92 = duplicate; merge or reject |
| 5 | Conflict resolution | Edge Function | Confidence-based automated resolution + human escalation for ties |
| 6 | Tombstone pattern | Edge Function | `superseded_by` pointer on contradicted memories; never hard-delete recent memories |
| 7 | Association creation | Edge Function | Extraction prompt identifies `updates` / `contradicts` / `related_to` relationships |
| 8 | Bulletin synthesis | Edge Function | LLM-synthesised coherent brief from top memories, cached, refreshed per configurable interval |
| 9 | Decay maintenance job | pg_cron | Nightly: per-type decay, pruning, stats logging |
| 10 | Memory-Doctrine dedup | TypeScript | At retrieval: suppress memories restating active doctrines (semantic similarity check) |
| 11 | Memory-Doctrine conflict check | TypeScript | At retrieval: suppress memories contradicting doctrines, flag for review |
| 12 | Compaction flush | TypeScript | PreCompaction hook for persistent agents; extract before context loss |
| 13 | `memory_delete` MCP tool | TypeScript | For Executives: soft-delete with tombstone |
| 14 | Token cost instrumentation | Edge Function | Track cost per extraction, retrieval, synthesis; log to `events` table |
| 15 | Latency instrumentation | Edge Function | Instrument all memory pipeline steps for SLO monitoring |

### Phase 3: Multi-Scope, Reasoning, and Scale -- 4-6 weeks

**Goal:** Scoped sharing (the full visibility matrix enforced via RLS), progressive disclosure, contractor shared memory, memory promotion pipeline, reasoning memory features.

**Deliverables:**

| # | Deliverable | Type | Detail |
|---|---|---|---|
| 1 | RLS policies | SQL | Enforce full visibility matrix from Section 6 via Supabase Row-Level Security |
| 2 | Role-type shared memory | TypeScript | Contractor types opt-in to reading/writing shared patterns |
| 3 | Progressive disclosure | TypeScript + MCP | Compact memory index at session start; MCP tools for on-demand fetch |
| 4 | Memory promotion pipeline | Edge Function | Observation -> Gotcha (3+ consistent signals); Gotcha -> doctrine candidate (5+ accesses, multi-project) |
| 5 | Belief revision | Edge Function | When contradictions detected, trigger Reflection Conflict workflow |
| 6 | Procedural synthesis | Edge Function | Convert episodic sequences into reusable procedures |
| 7 | Active curiosity / Gap Questions | Edge Function | Generate follow-up questions from unresolved observations |
| 8 | Feature-level memory consolidation | Edge Function | When feature completes, merge job-scoped memories into project scope |
| 9 | Cross-project memory search | MCP tool | Executives can search across all projects they manage |
| 10 | Memory admin dashboard | Web | Memory graph visualisation, search, edit, approve/reject promotions |
| 11 | PreToolUse memory refresh | TypeScript | Mid-task semantic recall for persistent agents (hook into thinking blocks) |
| 12 | Heartbeat reflection loops | Edge Function | During idle time, agents consolidate session logs into permanent memories |

---

## 8. Open Questions

### 8.1 Embedding model selection

The synthesis recommends OpenAI `text-embedding-3-small` (1536 dimensions). This adds an external API dependency for a system that otherwise runs entirely on Supabase. Alternatives:

- **Supabase pgvector + local embedding via Edge Function:** Supabase can run lightweight embedding models in Deno Edge Functions. Lower quality, zero external dependency.
- **OpenAI `text-embedding-3-small`:** Best quality for the dimension count, $0.02/1M tokens.

**Current lean:** OpenAI for Phase 2. The cost is negligible (memory writes are infrequent -- maybe 10-50 per day). Revisit if embedding costs become material.

### 8.2 Bulletin refresh frequency

How often should the synthesised bulletin be regenerated for persistent agents?

- Too frequent: wastes LLM tokens re-synthesising an unchanged bulletin
- Too infrequent: agent operates on stale memory context

**Current lean:** Refresh on a configurable interval (default 30 minutes), plus trigger a refresh when a high-importance memory (Decision, Gotcha) is written to a scope the agent cares about.

### 8.3 Extraction prompt model

Which model should the `extract-memories` Edge Function use?

- **Opus:** Highest quality extraction, highest cost ($15/1M input tokens)
- **Sonnet:** Good quality, moderate cost ($3/1M input tokens)
- **Haiku:** Adequate for classification, lowest cost ($0.25/1M input tokens)

**Current lean:** Sonnet for extraction. The extraction prompt is structured (classify into 10 types, score confidence) and does not require Opus-level reasoning. Haiku may miss nuanced observations. Sonnet is the right cost/quality tradeoff. Make this configurable per company.

### 8.4 Phase 1 scope for embeddings

The founder's brief says: "Embeddings/vector search can be Phase 1 if it is not too complex, otherwise Phase 2." The synthesis recommends Phase 2.

**Recommendation: Phase 2.** Rationale: Phase 1 with FTS-only search still delivers working memory extraction + injection. Adding embeddings in Phase 1 means also adding the OpenAI API dependency, the embedding pipeline, the backfill logic, and the vector index tuning. These are individually simple but collectively add 4-5 days. Better to ship Phase 1 fast, accumulate data, and add intelligence in Phase 2.

### 8.5 Existing `memory_chunks` data

The existing `memory_chunks` table (migration 003) may contain data from v1 operations. Before dropping it:

- Audit contents
- Migrate any valuable memories to the new `memories` table format
- If empty or stale, drop directly

**Needs human input:** Are there any valuable memories in the existing `memory_chunks` table?

### 8.6 Contractor shared memory scope across companies

When the contractor marketplace launches (future), shared memory needs a privacy boundary:

- **Phase 1-2:** Per-company shared memory only (safe, simple)
- **Phase 3+:** Anonymised cross-company patterns (marketplace differentiator, needs privacy design)

**Needs founder input:** Is cross-company contractor memory on the roadmap for 2026, or is it a 2027+ concern?

---

## 9. Appendices

### Appendix A: Memory Extraction Prompt

The extraction prompt runs after every job completion. It receives the job report and produces structured memory output.

```
You are a memory extraction system for Zazig, an AI workforce orchestrator.

Your job is to extract structured memories from a completed job report.
Each memory must be classified into exactly one of 10 types and scored for confidence.

## Memory Types

1. IDENTITY — biographical history: what the agent has done, who they worked with, track record, experience profile. NOT personality or archetype (those are Layer 1).
2. DECISION — choices made with reasoning. "We chose X because Y."
3. GOTCHA — hard-won lessons, corrections, bugs discovered. "X needs Y, not Z."
4. FACT — verifiable project data, schemas, paths, configs.
5. PREFERENCE — user or team working style preferences.
6. OBSERVATION — patterns noticed but not confirmed. "X tends to cause Y."
7. MOMENT — high-signal events worth remembering. "X happened on date Y."
8. RELATIONSHIP — inter-agent or inter-person dynamics.
9. PROCEDURE — reusable step-by-step sequences for accomplishing specific tasks. "To do X: step 1, step 2, step 3." Distinct from gotchas (what to avoid) and facts (what is true).
10. DISCOVERY — a source map of where information about a topic lives. Points to files, tables, memories, and external sources. "Topic X context: [source 1], [source 2], [source 3]." Not the knowledge itself, but where to find it. Primarily generated by consolidation, but agents may also create these when they discover where key information is located.

## Confidence Sources

- user_stated (0.90-1.0): The human explicitly said this
- user_confirmed (0.85-0.95): The human confirmed an agent suggestion
- context_implied (0.60-0.85): Strongly implied by the conversation/code
- pattern_inferred (0.30-0.60): Agent noticed a pattern, not confirmed
- agent_generated (0.20-0.50): Agent's own conclusion, no external validation

## Output Format

Return a JSON array of memory objects:

```json
[
    {
        "content": "The test suite requires --no-cache flag to avoid stale fixture data.",
        "memory_type": "gotcha",
        "confidence_score": 0.85,
        "confidence_source": "context_implied",
        "suggested_scope": "project",
        "tags": ["testing", "fixtures", "cache"]
    }
]
```

## Rules

- Extract 3-10 memories per job report. Quality over quantity.
- Do NOT extract memories that merely restate the job spec or acceptance criteria.
- Do NOT extract trivial observations ("the code compiled successfully").
- DO extract decisions with reasoning, bugs with root causes, patterns with evidence, and reusable procedures with concrete steps.
- Each memory should be self-contained — understandable without the full report.
- Score confidence conservatively. When in doubt, use pattern_inferred.

## Job Report

{job_report}

## Job Context

Role: {role}
Project: {project_name}
Feature: {feature_name}
Job Type: {job_type}
```

### Appendix B: RRF Hybrid Search Query (Phase 2)

```sql
-- Reciprocal Rank Fusion: vector + FTS + graph
-- k = 60 (standard RRF constant)

WITH query_embedding AS (
    SELECT $1::vector(1536) AS emb
),
vector_results AS (
    SELECT id, ROW_NUMBER() OVER (
        ORDER BY embedding <=> (SELECT emb FROM query_embedding)
    ) AS rank
    FROM memories
    WHERE company_id = $2
      AND NOT forgotten
      AND superseded_by IS NULL
      AND (scope = 'company' OR scope_id = ANY($3::uuid[]))  -- scope filter
    ORDER BY embedding <=> (SELECT emb FROM query_embedding)
    LIMIT 20
),
fts_results AS (
    SELECT id, ROW_NUMBER() OVER (
        ORDER BY ts_rank(to_tsvector('english', content), plainto_tsquery('english', $4)) DESC
    ) AS rank
    FROM memories
    WHERE company_id = $2
      AND NOT forgotten
      AND superseded_by IS NULL
      AND to_tsvector('english', content) @@ plainto_tsquery('english', $4)
    LIMIT 20
),
rrf AS (
    SELECT id, SUM(1.0 / (60.0 + rank)) AS rrf_score
    FROM (
        SELECT id, rank FROM vector_results
        UNION ALL
        SELECT id, rank FROM fts_results
    ) combined
    GROUP BY id
    ORDER BY rrf_score DESC
    LIMIT $5  -- top-K
)
SELECT m.*, rrf.rrf_score
FROM memories m
JOIN rrf ON m.id = rrf.id
ORDER BY rrf.rrf_score DESC;
```

Graph traversal results are added as a third source in the UNION ALL when the `memory_associations` table has sufficient data (Phase 3).

### Appendix C: MCP Tool Schemas

**memory_save (Phase 1)**

```json
{
    "name": "memory_save",
    "description": "Save a memory for future reference. Use this when you learn something important that should persist across sessions — a decision rationale, a codebase gotcha, a user preference, or a significant observation.",
    "input_schema": {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "The memory content. Should be self-contained and understandable without additional context."
            },
            "memory_type": {
                "type": "string",
                "enum": ["identity", "decision", "gotcha", "fact", "preference", "observation", "moment", "relationship", "procedure"],
                "description": "The type of memory. decision = choices with reasoning. gotcha = hard-won lessons. fact = verifiable data. preference = working style. observation = unconfirmed pattern. moment = significant event. relationship = inter-agent dynamics. procedure = reusable step-by-step how-to sequences."
            },
            "importance": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
                "description": "How important is this memory? 0.0 = trivial, 1.0 = critical. Use the type's default if unsure."
            },
            "scope": {
                "type": "string",
                "enum": ["company", "project", "feature", "individual"],
                "description": "Who should be able to see this memory? company = all agents. project = agents on this project. feature = agents on this feature. individual = only you."
            },
            "scope_id": {
                "type": "string",
                "description": "UUID of the project or feature, if scope is project or feature."
            },
            "tags": {
                "type": "array",
                "items": { "type": "string" },
                "description": "Freeform tags for retrieval filtering."
            }
        },
        "required": ["content", "memory_type"]
    }
}
```

**memory_search (Phase 1)**

```json
{
    "name": "memory_search",
    "description": "Search your memories for relevant context. Use this when you need to recall past decisions, known gotchas, project facts, or team preferences.",
    "input_schema": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language search query describing what you are looking for."
            },
            "memory_type": {
                "type": "string",
                "enum": ["identity", "decision", "gotcha", "fact", "preference", "observation", "moment", "relationship", "procedure"],
                "description": "Optional filter by memory type."
            },
            "scope": {
                "type": "string",
                "enum": ["company", "project", "feature", "individual"],
                "description": "Optional filter by scope."
            },
            "limit": {
                "type": "number",
                "minimum": 1,
                "maximum": 25,
                "description": "Maximum results to return. Default 10."
            }
        },
        "required": ["query"]
    }
}
```

**memory_delete (Phase 2)**

```json
{
    "name": "memory_delete",
    "description": "Mark a memory as forgotten. Use this when a memory is outdated, incorrect, or no longer relevant. The memory is soft-deleted and will be permanently removed after 90 days.",
    "input_schema": {
        "type": "object",
        "properties": {
            "memory_id": {
                "type": "string",
                "description": "UUID of the memory to forget."
            },
            "reason": {
                "type": "string",
                "description": "Why this memory is being removed. Logged for audit."
            }
        },
        "required": ["memory_id"]
    }
}
```

### Appendix D: Priority Hierarchy at Inference Time

When memory conflicts with other layers in the prompt stack, the priority order is:

```
Role Prompt (Layer 2)     — highest priority, always wins
    > Doctrines (Layer 4) — normative beliefs win over empirical memory
    > Skills (Layer 3)    — procedures win over recalled patterns
    > Canons (Layer 5)    — reference knowledge wins over agent recall
    > Memory (Layer 6)    — lowest priority among knowledge layers
```

This hierarchy means:
- A doctrine saying "always use Gherkin AC" overrides a memory saying "we used plain text AC on Project X"
- A skill procedure overrides a recalled workaround
- A canon reference overrides a fact memory

Memory is injected at Position 9 (end of context) precisely because it has the lowest priority. The recency bias of LLM attention means Position 9 content is well-attended, but when it conflicts with earlier positions (1-8), the agent has already processed the higher-priority content first.

### Appendix E: Mapping to ORG MODEL

| ORG MODEL Concept | Memory System Implementation |
|---|---|
| Layer 6 (Memory) | This entire document |
| Position 9 (Memory Context) | Bulletin (persistent) or ContextPack (ephemeral), Section 4.4 |
| Executive tier | Full episodic, bulletin pattern, company + project + individual scopes |
| Employee tier | Focused episodic, bulletin pattern, project + role-shared + individual scopes |
| Contractor tier | Job-scoped, ContextPack pattern, optional role-shared, tombstone commit |
| Orchestrator prompt compiler Step 6 | Calls memory retrieval pipeline, Section 5.1 |
| Heartbeat cycles | Memory reflection loops during idle time (Phase 3) |
| Doctrine vs Memory boundary | Doctrines win conflicts; promotion pipeline surfaces candidates; contracts in Section 5.4 |
| MCP tools (role-scoped) | `memory_save` + `memory_search` (persistent agents), `memory_delete` (executives only) |
| Contractor marketplace | Per-company shared memory (Phase 1-2); anonymised cross-company (Phase 3+) |
| `memory_chunks` table (migration 003) | Deprecated and replaced by `memories` table |

---

*Workers that remember are workers that improve. Memory is what separates an organisation that executes from one that learns. The orchestrator compiles it, the agent receives it, and the institution accumulates it. This is Layer 6 made concrete.*
