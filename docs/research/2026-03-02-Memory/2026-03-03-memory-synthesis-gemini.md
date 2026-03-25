# **TECHNICAL SYNTHESIS: ZAZIG AGENTIC MEMORY SYSTEMS**
**To:** Zazig Technical Founder
**From:** Gemini CLI
**Date:** 2026-03-03
**Subject:** 10X Memory Architecture for Multi-Agent Workforce Orchestration

---

## 1. LANDSCAPE SUMMARY
The industry has pivoted from **"RAG-as-Memory"** (naive vector search) to **"Memory-as-OS-Kernel"** [Source 1, 2, 3].
*   **The Baseline:** Vector DB + Chat History. (OpenClaw, Spacebot).
*   **The State of the Art:** Tiered cognitive architectures that treat LLMs as CPUs and memory as the file system/RAM hierarchy [Source 1, 3].
*   **The Production Meta:** Hybrid Postgres + pgvector + Redis. Graph-based relational memory is emerging for multi-hop reasoning (Zep, Spacebot) [Source 2, 19].

## 2. TOP 5 KEY INNOVATIONS (RANKED)
1.  **PreToolUse Semantic Injection [Source 9]:** Injected *during* the reasoning loop, not just at prompt start. Prevents "workflow drift" by refreshing relevance mid-task.
2.  **Observer Agent Pattern [Source 20]:** A secondary "shadow" process extracts memories so the worker agent stays focused on the task. High ROI on retrieval quality.
3.  **Tiered Confidence Scoring (0.0 - 1.0) [Source 17]:** Explicit (user said it) vs. Inferred (AI guessed it). Crucial for preventing hallucination amplification.
4.  **Heartbeat Reflection Loops [Source 3, 10]:** Agents process their own "experiences" during idle time, consolidating logs into facts and procedures.
5.  **Reciprocal Rank Fusion (RRF) [Source 19]:** Merging Keyword (FTS), Vector, and Graph rankings into a single sorted list. This is how you beat 90% of naive RAG setups.

## 3. RECOMMENDED MEMORY TAXONOMY
*Synthesized from Sources 17, 18, and 19.*

| Category | Description | Decay Rate | Priority |
| :--- | :--- | :--- | :--- |
| **Identity** | Core self-model, name, pronouns, evolution. | 0.0 (Perm) | 1.0 |
| **Facts** | Verifiable project data, schemas, hard truths. | 0.0 (Perm) | 0.8 |
| **Decisions** | "Why we did X instead of Y." Prevents re-arguing. | 0.05 (Slow) | 0.9 |
| **Preferences**| User/Org style, tone, tooling choices. | 0.1 (Med) | 0.7 |
| **Gotchas** | Lessons learned from failure/bugs. | 0.0 (Perm) | 0.9 |
| **Relationships**| Trust scores for other agents and users. | 0.2 (Fast) | 0.6 |
| **Moments** | High-signal episodic snapshots of key events. | 0.5 (Aggressive) | 0.4 |

## 4. THE THREE PATHS: ARCHITECTURAL CHOICE
| Path | Pros | Cons | Verdict |
| :--- | :--- | :--- | :--- |
| **A: Full Roll-Own** (Supabase) | Zero latency overhead, full control of 6-layer stack, perfect RBAC. | Heavy dev lift for decay/graph logic. | **WINNER (Hybrid-Native)** |
| **B: Full Tool** (Zep/Mem0) | Fast MVP, specialized features (graph, temporal). | Vendor lock, another infra piece, pricing. | **NO** |
| **C: Hybrid** | Use tool libs inside Supabase Edge Functions. | Complexity in managing two schemas. | **MAYBE** |

**The Zazig Move:** Build the logic natively on **Supabase**. You already have `pgvector`. Use `pg_cron` for decay/maintenance and Realtime for inter-agent memory sync.

## 5. MEMORY LIFECYCLE (THE PIPELINE)
1.  **Extraction:** During the "Phase 2 Reflection" or "Observer" cycle, extract XML-tagged observations [Source 20].
2.  **Validation:** Assign Confidence Score + Source Type (User Stated, Pattern Inferred) [Source 17].
3.  **Storage:** UPSERT into `memory_chunks` with `last_accessed_at` and `importance` weights [Source 19].
4.  **Retrieval:** Use RRF to combine Vector similarity (semantic) + BM25 (keyword) + Recency [Source 19].
5.  **Pruning:** Nightly job runs the Ebbinghaus forgetting curve: `new_importance = importance * (1 - decay_rate * days_old)` [Source 19].

## 6. ORG VS. INDIVIDUAL MEMORY
*   **Executive Tier:** Full episodic access + "Executive Suite" shared memory (CPO knows what CTO decided) [Source 1, 5].
*   **Employee Tier:** Individual expertise memory + Role-type shared memory (all "PR Reviewers" share a "Gotchas" bank) [Source 19].
*   **Contractor Tier:** Job-scoped memory (RAM-only) with a "Tombstone" commit to Org memory at job completion [Source 17].
*   **Organisational Memory:** The "Cortex Bulletin"--a synthesized summary of the entire org's state, injected into all agents [Source 19, 21].

## 7. HOW TO 10X THE COMPETITION
OpenClaw/Spacebot focus on *storage*. Zazig must focus on **Reasoning Memory**.
1.  **Belief Revision:** When a new fact contradicts an old memory, don't just store both. Trigger a "Reflection Conflict" and ask the user or an Executive to resolve it [Source 2, 3].
2.  **Procedural Synthesis:** Convert "I did X then Y then Z" into "When project is type A, use Workflow B" [Source 2].
3.  **Active Curiosity:** Agents generate "Gap Questions" (things they *don't* know but need to) to drive proactive research [Source 10, 17].

## 8. RECOMMENDED ARCHITECTURE (INTEGRATED)
**Storage:**
*   `memories` table: `id, worker_id, org_id, type, content, vector, embedding_model, importance, confidence, last_accessed_at, metadata(jsonb)`.
*   `memory_links` table: Graph edges (e.g., `Memory A -> Contradicts -> Memory B`).

**Injection Stack (Position 9):**
```xml
<memory-context tier="executive">
  <recalled-learnings count="5" budget="1500_tokens">
    <memory type="GOTCHA" confidence="0.98" source="user_confirmed">
      We don't use Tailwind; prefer Vanilla CSS for this project.
    </memory>
  </recalled-learnings>
</memory-context>
```

## 9. IMPLEMENTATION PHASES
### Phase 1: MVP (Episodic Logging)
*   Implement `Observer` agent that writes session summaries to Postgres.
*   Basic Vector RAG for "Executives" only.
*   *Deliverable:* Memory that survives a page refresh.

### Phase 2: Expertise & Confidence
*   Add **Confidence Scoring** and **Memory Types**.
*   Implement **PreToolUse hooks** for mid-task semantic recall.
*   *Deliverable:* Agents that "learn" from their mistakes (Gotchas).

### Phase 3: Cognitive Maintenance
*   **Reflection Loops** (Heartbeats) to consolidate logs into facts.
*   **Decay Functions** and **Conflict Resolution**.
*   **Shared Role Memory** for Employee-tier workers.
*   *Deliverable:* A self-optimizing "Alive" workforce that gets smarter every day.
