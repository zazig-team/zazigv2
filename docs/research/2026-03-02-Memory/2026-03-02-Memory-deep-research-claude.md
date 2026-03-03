# Agentic memory: state of the art for persistent AI agents

**The field is converging on a clear answer: agent memory requires a hybrid architecture combining vector search for semantic retrieval with knowledge graphs for temporal and relational reasoning, layered into a tiered system (working → core → long-term) where agents actively manage their own memory through tool calls.** This matters because the alternative — stuffing full conversation history into context windows — breaks at scale (costs 10x more, degrades model performance, and produces "context rot" where stale facts corrupt reasoning). For zazig specifically, memory should be a fourth layer alongside doctrines, canons, and skills, with a strict priority hierarchy that prevents experiential memory from overriding established beliefs. The strongest production evidence comes from Zep (survived 30x traffic scaling to millions of hourly requests), Mem0 (90% token cost savings, 41K GitHub stars), and Letta/MemGPT (pioneered self-editing memory, now in cloud production) — while ChatGPT's memory rollout to 700M+ users has revealed the failure modes every builder must plan for: context rot, domain bleeding, and catastrophic data loss.

---

## 1. Four types of memory, one emerging taxonomy

The **Cognitive Architectures for Language Agents (CoALA) framework** from Sumers, Yao, Narasimhan, and Griffiths has become the canonical academic taxonomy. It maps cognitive science onto agent systems with four memory types that nearly every framework now references, even when they use different labels:

**Working memory** holds the agent's current context — recent messages, active goals, partial reasoning. It persists across LLM calls within a decision cycle but is ephemeral across sessions. Critically, CoALA argues working memory is *not* just the context window — it's a data structure from which the LLM input is assembled on each call. **Episodic memory** records specific past experiences and interaction trajectories. **Semantic memory** stores factual knowledge detached from specific episodes — entity relationships, preferences, learned facts. **Procedural memory** encodes operational knowledge — the LLM's weights, explicit code, learned skills.

Frameworks implement these categories very differently. Letta/MemGPT uses OS-inspired terminology: core memory (always in context, like RAM), archival memory (vector-searchable, like disk), and recall memory (conversation history search). Zep builds a temporal knowledge graph with episode nodes, semantic entity nodes, and community clusters. CrewAI offers the most cognitive-science-aligned naming with explicit short-term, long-term, entity, and contextual memory types — though its latest API unifies these into a single `Memory` class with scoped paths. LangGraph avoids cognitive terminology entirely, using infrastructure concepts: checkpointers for within-thread state and stores for cross-thread persistence. OpenAI's Agents SDK takes the most minimal approach, framing everything as "context engineering" with sessions and structured state objects.

| Framework | Working Memory | Episodic Memory | Semantic Memory | Procedural Memory |
|-----------|---------------|----------------|----------------|-------------------|
| **Letta** | Core memory blocks + system prompt | Recall memory (conversation search) | Archival memory (vector DB) | Agent code + custom tools |
| **Zep** | Thread context | Episode subgraph | Entity nodes + fact edges | Procedure entity type |
| **LangGraph** | Graph state + checkpoints | Checkpoint history | Cross-thread Store | Graph definition + node functions |
| **CrewAI** | Short-term + contextual memory | Session interactions | Long-term + entity memory | Task execution patterns |
| **Mem0** | Session memory | Episodic memory type | Semantic + graph memory | Procedural memory type |
| **AutoGen** | model_context (buffered chat) | Memory stores (pluggable) | ChromaDB/Redis/Mem0 integration | Protocol-based extensibility |

**Where frameworks agree**: every system separates within-session context from cross-session persistence. Vector search for retrieval is near-universal. Memory consolidation (compress/summarize/merge over time) is now recognized as essential. **Where they disagree**: who manages memory (the agent via tool calls in Letta vs. the system automatically in Mem0 vs. the developer explicitly in LangGraph), what granularity to store (atomic facts in Mem0 vs. free-form text blocks in Letta vs. entity-relationship triples in Zep), and whether forgetting should be explicit (Letta's strategic forgetting, Zep's temporal invalidation) or implicit (most frameworks have no built-in forgetting).

The sharpest philosophical divide is between **memory-first systems** (Letta, Zep, Mem0 — where memory is the core product) and **memory-as-infrastructure systems** (LangGraph, AutoGen, OpenAI SDK — where memory is a pluggable component). For building a platform where agents persist across months, the memory-first approach is more appropriate — these teams have solved problems that infrastructure-first frameworks defer to developers.

---

## 2. Storage architectures: why pure vector search isn't enough

**Vector stores** remain the default starting point for agent memory. They convert text into high-dimensional embeddings (typically 768–1536 dimensions) and enable sub-linear approximate nearest neighbor search. At moderate scale (under 10M vectors), most databases perform similarly. **pgvector** achieves **471 QPS at 99% recall on 50M vectors** — competitive with purpose-built databases. Beyond 50–100M vectors, dedicated systems like Qdrant, Pinecone, and Milvus pull ahead. For a multi-tenant agent platform, pgvector is likely sufficient for years if you're already on PostgreSQL, with a migration path to dedicated vector databases when needed.

The fundamental problem with pure vector similarity is that **similarity ≠ relevance**. A query about "What does the user prefer?" might retrieve semantically similar but contradictory memories from different time periods. Vector stores encode no relationships between memories, have no concept of temporal validity, and struggle with multi-hop reasoning. This is why the field is moving to hybrid approaches.

**Knowledge graphs** solve these specific weaknesses. Zep's Graphiti engine stores entities as nodes and facts as edges with temporal validity periods (`valid_from`, `valid_to`). When a user moves from San Francisco to New York, the old fact is marked invalid — not deleted — preserving full history while maintaining current truth. This **bi-temporal model** tracks both when an event occurred and when it was recorded. Mem0's graph variant uses a directed labeled graph alongside its vector store, where graph edges enrich vector results with relational context rather than replacing them.

**The emerging production pattern** is a tiered storage architecture:

| Tier | Store | Latency | Purpose |
|------|-------|---------|---------|
| Working memory | Redis/in-memory | <1ms | Session state, current context |
| Core memory | In-context blocks | 0ms (always loaded) | Agent identity, key user facts |
| Episodic memory | PostgreSQL | <10ms | Timestamped interaction logs |
| Semantic memory | Vector DB (pgvector/Qdrant) | <50ms | Embedded facts, semantic search |
| Relational memory | Graph DB (Neo4j) | <200ms | Entity relationships, temporal reasoning |

**Context window management** is the critical engineering challenge. Letta/MemGPT pioneered the OS-inspired approach: core memory blocks (analogous to RAM, always in context, agent-editable) sit above archival memory (analogous to disk, searched on demand via tool calls). When the context window fills, conversation history undergoes **recursive summarization** — old messages are compressed into a running summary while remaining searchable via `conversation_search`. The research on "Lost in the Middle" shows that models ignore approximately 70% of information positioned in the middle of long prompts, making careful placement of memories (beginning or end) as important as selection.

For scaling over months and years, the critical strategies are: pre-filter by user/session metadata before vector search (dramatically reduces search space), implement memory consolidation from day one (periodically merge related memories), use importance-based retention with decay (prune low-importance old memories), and partition storage by time with hot/cold tiers. Mem0 reports **90% token cost savings** versus full-context approaches, with median search latency of 0.20 seconds.

---

## 3. Deciding what to remember and what to forget

The Stanford "Generative Agents" paper established the foundational retrieval scoring formula that most systems now implement in some variation: **score = α × recency + β × importance + γ × relevance**. Recency uses exponential decay (the original paper used a factor of 0.995 per hour, giving a half-life of roughly 5.8 days). Importance is scored 1–10 by the LLM at memory creation time, distinguishing mundane events ("buying groceries" ≈ 1) from significant ones ("getting promoted" ≈ 8). Relevance is cosine similarity between the query and memory embeddings. CrewAI's unified Memory API makes these weights explicitly configurable: `recency_weight`, `semantic_weight`, `importance_weight`, and `recency_half_life_days`.

**Memory compression** is where approaches diverge most sharply. Letta uses **self-editing memory**: the agent itself decides what to store, update, or discard via tool calls (`core_memory_append`, `core_memory_replace`, `archival_memory_insert`). This gives the agent agency but depends entirely on the LLM's judgment — it can miss important details or over-remember trivial ones. Mem0 takes an automated extraction approach: an LLM processes message pairs to extract candidate atomic facts, then classifies each as ADD (genuinely new), UPDATE (augment existing), DELETE (contradicted), or NOOP (already exists). This is more consistent but operates as a black box. Zep's graph approach is non-lossy by default — raw episodes are preserved while entity and fact nodes are extracted into the semantic layer, with old facts invalidated rather than deleted.

A key insight from Mem0's research: **memory formation (selective fact extraction) outperforms summarization**. Summarizing entire conversations compresses everything equally, losing important details. Extracting specific facts, preferences, and patterns achieves **80–90% token reduction** while maintaining or improving response quality. The ProMem paper (2025) goes further, identifying that one-off summarization suffers from the "ahead-of-time" problem — you can't know what will matter later. It proposes a recurrent feedback loop where agents self-question, verify, and supplement memory entries over time.

**Conflict resolution** remains the hardest unsolved problem. When a user says "my budget is $500" in January and "my budget increased to $750" in March, the system must invalidate the old fact without destroying it. Mem0 handles this through its LLM-based UPDATE/DELETE classification. Zep marks conflicting graph edges as invalid with timestamps. Amazon's AgentCore Memory uses recency-wins with inactive marking. The OpenAI Agents SDK cookbook recommends explicit rules: "If two notes conflict, keep the one with the most recent last_update_date." The critical warning from O'Reilly's analysis: **"Silent last-write-wins is almost never correct" in multi-agent systems** — it corrupts shared truth without evidence of corruption.

Letta's **sleep-time agents** represent the most sophisticated approach to ongoing memory quality: asynchronous processes that run between sessions to extract beliefs, resolve conflicts, reorganize memory blocks, and flag items for human review. This decouples memory maintenance from conversation latency — the agent gets more compute budget for consolidation when not under response-time pressure.

---

## 4. Making agents coherent across sessions weeks apart

The cold-start problem — a new session begins, the agent has thousands of memories, and the context window holds maybe 32K–128K tokens — is solved by every production system through a **hybrid of proactive injection and on-demand retrieval**. Core identity information (role prompt, persona, key user facts) is always injected at session start. Everything else is retrieved semantically when the agent encounters a relevant query.

Letta's approach is the most elegant: every agent maintains a **single perpetual thread** with no concept of session boundaries from the agent's perspective. Core memory blocks (persona + human knowledge) are always in context. Old messages are available via `conversation_search`. The agent's experience of "waking up" in a new session is seamless — its core memory tells it who it is and who it's talking to, while archival memory provides depth on demand.

LangGraph takes a checkpoint-based approach: complete state snapshots at every graph execution step, scoped to threads. Within-thread memory (conversation history) is automatic. Cross-thread memory (persistent knowledge) uses the Store interface with namespaces like `(user_id, "memories")`. This gives developers full control but requires explicit implementation of memory injection logic.

A practical pattern from the OpenAI Agents SDK cookbook structures session context as layered injection:

1. **Structured profile** (user identity, preferences) as YAML in the system prompt — always present
2. **Global memory notes** (curated persistent memories) as a Markdown list — always present
3. **Session-scoped notes** from the current interaction — highest precedence, override globals
4. If context is trimmed, session notes are re-injected to prevent loss of short-term context

**Identity coherence** across sessions requires architectural separation between immutable identity (system prompt, role definition, communication style) and evolving knowledge (learned preferences, interaction history, accumulated context). The Engram framework maintains a `SOUL.md` identity document as the foundational reference, with a dissociation detection system using drift/anchor patterns. A subtle but important finding: as context grows, **system prompt tokens at the beginning lose attention weight** — 1,000 prompt tokens out of 80,000 total receive roughly 1% attention versus 50% when the context is only 2,000 tokens. The SCAN technique addresses this with periodic "checkpoint prompts" where the agent actively regenerates key rules from its system prompt, restoring attention at a cost of only ~300 tokens.

**Temporal awareness** between sessions requires explicit handling. At session resumption, inject the time elapsed since last interaction and auto-retrieve relevant updates. Zep's bi-temporal model enables point-in-time queries ("What did the user prefer last March?"). All modern memory systems store timestamps with memories, but few proactively detect and flag stale information — this is a gap most production systems must build custom logic for.

---

## 5. When CPO, CTO, and CMO share a brain

The consensus architecture for multi-agent shared memory is **two-tier: private agent memory plus shared company memory**, with scoped namespacing to prevent pollution. The Collaborative Memory paper (Rezazadeh et al., 2025) formalizes this with immutable provenance attributes on every memory fragment — tracking which agent contributed it, what resources were accessed, and when.

Manus AI articulates the sharpest design principle: **"Share memory by communicating, don't communicate by sharing memory"** — borrowed from Go's concurrency model. Agents should pass structured summaries of decisions and outcomes rather than sharing raw context windows. This prevents one agent's specialized reasoning from contaminating another's context.

For zazig's CPO/CTO/CMO agents, the recommended scoping model:

| Scope | Content | Access |
|-------|---------|--------|
| `/company/{id}/` | Company facts, strategy, customer data | All agents read + write |
| `/company/{id}/decisions/` | Cross-agent decisions with provenance | All agents read; write via structured format |
| `/company/{id}/agent/cpo/` | Product insights, user research, roadmap reasoning | CPO only |
| `/company/{id}/agent/cto/` | Technical debt analysis, architecture decisions | CTO only |
| `/company/{id}/agent/cmo/` | Campaign performance, market intelligence | CMO only |
| `/company/{id}/project/{name}/` | Project-scoped shared context | Relevant agents |

CrewAI's implementation is the most production-ready for this pattern. Its unified Memory API supports hierarchical scoping with `MemoryScope` subtree views and `MemorySlice` for multi-scope read access. An agent can search both its private scope and shared company scope simultaneously while being prevented from writing to areas it shouldn't modify via `read_only=True`. Mem0 offers four orthogonal scoping dimensions (user, agent, application, session) with a key architectural decision: writes with both `user_id` and `agent_id` are persisted as **separate records per entity**, enforcing privacy boundaries at the storage layer.

**Memory pollution** is a real and documented problem. Research analyzing 200+ multi-agent execution traces found failure rates of **40–80%**, with **36.9% of failures from inter-agent misalignment**. Four failure modes are contagious in multi-agent systems: overload (too much information), distraction (irrelevant info weighted equally), contamination (incorrect info mixed in), and drift (gradual degradation). Prevention requires domain-specific memory isolation, relevance filtering with composite scoring, write access controls, and provenance tracking on every shared memory. The MemoryGraft attack research demonstrates that memory poisoning is a real threat — malicious entries that appear legitimate can contaminate shared memory pools.

For inter-agent communication, store **decisions and outcomes** (who decided, what, why, when) in the shared scope — not raw agent-to-agent conversation. Compress detailed discussions into structured summaries. The LEGOMem paper (AAMAS 2026) provides an important insight for role-based agents: orchestrator-level agents need planning memory while task-level agents need execution memory, and jointly allocating both yields the strongest results.

---

## 6. Where memory fits in doctrines, canons, and skills

The strong consensus from both cognitive science and production systems: **memory should be a separate fourth layer that can inform updates to existing layers through controlled promotion, but should never be collapsed into them.** The AutoGen Memory Proposal draws the clearest distinction: "Knowledge is information available to agents divorced from runtime considerations — data stored somewhere persistent. Memory is information about events generated during program execution and persisted so it can be recalled later."

Classical cognitive architectures (ACT-R, Soar) and the Standard Model of the Mind all maintain architecturally separate but interconnected memory modules with well-defined interfaces between them. The A-MEM paper (2025) reinforces this for AI systems: knowledge bases are read-only reference material, while memory systems can create, update, and delete entries based on experience. Collapsing them produces exactly the failure documented in the empirical study "How Memory Management Impacts LLM Agents" — agents display an **"experience-following property"** where high similarity between an input and a retrieved memory causes the agent to follow the memory even when it contradicts established rules.

The recommended mapping for zazig:

| zazig Layer | Cognitive Analog | Nature | Update Mechanism |
|-------------|-----------------|--------|------------------|
| **Role Prompt** | Identity | Immutable | Never changes at runtime |
| **Doctrines** (beliefs) | Core beliefs / values | Slowly changing | Deliberate human review only |
| **Skills** (procedures) | Procedural memory | Evolving | Can update via controlled promotion from memory |
| **Canons** (reference) | Declarative/semantic memory | Static reference | Updated via knowledge management, not memory |
| **Memory** (new) | Episodic + working memory | Dynamic, experiential | Automatic from interactions |

The priority hierarchy at inference time must be explicit and enforced: **Role Prompt > Doctrines > Skills > Canons > Memory**. When a recalled memory conflicts with a doctrine, the doctrine wins and the memory gets flagged for review. Implement a conflict detection layer that compares retrieved memories against active doctrines using semantic similarity and contradiction detection before injecting them into context.

For procedural learning (memory improving skills), the MACLA paper demonstrates the pattern: compress 2,851 experience trajectories into **187 reusable procedures** (15:1 compression) by tracking reliability via Bayesian posteriors and refining procedures by contrasting successes versus failures. For zazig, this translates to a **promotion pipeline**: episodic memories → pattern detection (same skill fails or succeeds repeatedly) → proposed skill update → human review → skill modification. Never auto-update skills from single memories; require multiple consistent signals. Memory should never auto-update doctrines — beliefs require deliberate revision.

The deduplication problem (memory restating what's already in canons) is addressed by retrieval-time filtering: when recalling memories, check against canons and suppress memories that merely restate canon content. Mem0's approach of extracting only novel, non-redundant atomic facts at write time also helps. LangMem's memory enrichment process explicitly reconciles new information with existing knowledge, deleting or consolidating duplicates.

---

## 7. What's actually shipping and what broke

**Letta/MemGPT** (Berkeley spinout, $10M seed from Felicis) pioneered self-editing memory and has evolved from a research paper to a production cloud service. The V1 architecture (October 2025) deprecated the original `send_message`/`request_heartbeat` patterns in favor of native reasoning, reflecting how frontier models have changed since 2023. Letta Cloud offers REST APIs for stateful agents with database-persisted state. The "Agent File" (.af) format enables serialized stateful agent portability. Key limitation: self-editing memory quality depends entirely on the underlying LLM's judgment, and no public scale numbers have been disclosed.

**Zep** has the strongest production scaling evidence. Their enterprise customers caused a **30x traffic surge in summer 2025** — from thousands to millions of hourly requests — and "it broke hard." After a six-week recovery, they achieved graph search at **150ms P95** (down from 600ms), episode processing improved 92%, and LLM token usage was cut 50%. They restored 99.95%+ uptime under 30x load. Graphiti has **20,000+ GitHub stars** and 25,000 weekly PyPI downloads. Benchmark results: 94.8% on Deep Memory Retrieval versus MemGPT's 93.4%. SOC 2 Type 2 certified. Key limitations: Neo4j dependency adds infrastructure complexity, and LLM calls during graph construction add write-time latency.

**Mem0** ($24M raised from Y Combinator, Kindred, Peak XV) has the broadest integration footprint. **41,000+ GitHub stars, 14M+ downloads.** AWS published an official architecture using Mem0 + ElastiCache + Neptune Analytics. Performance claims: **26% higher accuracy than OpenAI's memory** on the LOCOMO benchmark, 91% lower P95 latency than full-context approaches. Key caveat: Zep publicly contested Mem0's benchmark numbers, claiming Zep outperforms by 10% on the same benchmark — benchmark politics are real in this space.

**ChatGPT's memory** is the largest-scale production system, serving **700M+ weekly active users**. It uses a simpler approach than most frameworks — curated fact extraction injected into system prompts rather than vector RAG. Memory has become a competitive moat (users report they "can't switch because ChatGPT knows them"). But the failures are instructive for every builder:

- **February 2025 "Memory Wipe Crisis"**: A backend update caused catastrophic memory loss for users who had accumulated years of data. MIT study cited 83% memory failure rates during the incident.
- **Context rot**: Stale preferences and errors build up silently, degrading response quality over time. One user's Kanye West quote in custom instructions caused ChatGPT to make *everything* "dope" — including Python debugging sessions.
- **Domain bleeding**: Personal context leaks into work contexts. Responses become "mushy" and "blended."
- **Hallucination amplification**: Multiple users reported that enabling "Reference Chat History" directly increased hallucinations; turning it off fixed the problem.
- **Memory full**: Heavy users hit storage limits (~1,200 tokens/week), forcing the system to either stop saving or overwrite — both problematic.

**Anthropic's Claude** launched memory in August 2025 (Team/Enterprise) with a privacy-first approach: opt-in, project-scoped, with daily synthesis cycles. Memories are encrypted, not used for training, and exportable. This design avoids ChatGPT's context rot problems but offers less seamless personalization. Google Gemini is rolling out automatic personalization but with fewer public details.

**The three design philosophies that dominate** today: vector store approach (memory as retrieval — fast but shallow), summarization approach (memory as compression — loses detail), and graph approach (memory as knowledge — sophisticated but complex). The market is converging toward hybrid vector + graph, with Zep, Mem0, and AWS all shipping this pattern. Pure vector approaches are recognized as insufficient for production agents that run over months.

The clearest lesson from production: **most stored memories are never retrieved.** Zep retrieves top-20 facts per query; Mem0 defaults to top-3. The retrieval bottleneck matters more than storage capacity. Build for retrieval quality first, storage scale second.

---

## Conclusion: architectural recommendations for zazig

The research converges on five concrete architectural decisions for a persistent multi-agent platform:

**First, implement memory as a separate fourth layer** with the priority hierarchy Role Prompt > Doctrines > Skills > Canons > Memory. This prevents the documented "experience-following" failure where recalled memories override established beliefs. Memory should inform skill updates through a controlled promotion pipeline requiring multiple consistent signals, but should never auto-modify doctrines.

**Second, adopt a hybrid storage architecture** starting with PostgreSQL + pgvector (sufficient to 50M+ vectors, no new infrastructure) for semantic memory, with Redis for working memory/session state. Add a graph layer (Neo4j via Graphiti, or Mem0's graph mode) when temporal reasoning and entity relationships become important. This avoids over-engineering while maintaining a clear upgrade path.

**Third, build memory consolidation from day one.** The systems that fail in production are those that accumulate memories unboundedly. Implement importance scoring at write time (LLM-rated 1–10), exponential recency decay (half-life of ~14 days is a reasonable default), and periodic consolidation via sleep-time processing between sessions. Use Mem0-style atomic fact extraction rather than conversation summarization — it achieves better compression with less information loss.

**Fourth, scope memory rigorously** with company-shared and agent-private namespaces. The CPO's product insights should not pollute the CTO's technical context. Store inter-agent decisions as structured outcomes (who, what, why, when) in shared scope, not raw conversation. Enforce write controls so agents can read broadly but write only to their own scope.

**Fifth, plan for the failure modes ChatGPT revealed at scale**: implement conflict detection before memory injection, build user-visible memory management (view, edit, delete), separate immutable identity from evolving memory to prevent personality drift, and design for graceful degradation when memory systems fail. The field is young enough that every production system has experienced major memory-related outages — resilience planning is not optional.

The key open-source projects to study in depth are Letta (self-editing memory pattern), Graphiti/Zep (temporal knowledge graphs), and Mem0 (hybrid vector + graph with managed cloud). The key papers are the Stanford Generative Agents paper (foundational architecture), the CoALA framework (canonical taxonomy), the Mem0 paper on arXiv:2504.19413 (production memory pipeline), and the Graphiti paper on arXiv:2501.13956 (temporal knowledge graphs). The field is moving fast — the patterns that work today are hybrid storage, agent-managed memory, importance-weighted retrieval, and sleep-time consolidation.