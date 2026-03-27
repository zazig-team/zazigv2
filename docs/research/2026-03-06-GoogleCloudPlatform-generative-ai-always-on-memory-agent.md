# Recon: Google Always-On Memory Agent
*Analyzed: 2026-03-06 | Commit: cfd52c4 | Subpath: gemini/agents/always-on-memory-agent | Compared against: zazigv2 (memory system design)*

## TL;DR

- **~680 lines of Python** that actually runs, vs our 999-line design doc that doesn't yet. A humbling reminder that working code beats architecture documents.
- **Active consolidation ("sleep cycles")** is the single best idea here and a genuine gap in our design. We have nightly decay (reactive) but no proactive synthesis of cross-cutting insights between memories.
- **Does NOT replace or improve on our design** for multi-agent, multi-tenant use. No scoping, no tiers, no doctrine boundaries, no tombstones, no decay lifecycle. It's a single-user personal memory tool.
- **"No embeddings, just LLM reads everything"** is a bold bet on cheap long-context models. Won't scale past ~50 memories, but the underlying insight (cheap LLM filtering > complex retrieval) is worth considering for our Phase 1.
- **Net verdict: steal the consolidation pattern, respect the simplicity ethos, don't adopt the architecture.**

## Steal List

### 1. Active Consolidation Loop (HIGH IMPACT)
**What it is:** A `ConsolidateAgent` runs every 30 minutes. It reads unconsolidated memories, finds connections between them, generates cross-cutting insights, and stores the synthesis as a separate `consolidation` record. Source memories are flagged `consolidated = true`.

**Why it matters:** Our design has decay (forgetting) and compaction flush (emergency save). Both are reactive. Consolidation is *proactive* — it creates new knowledge that didn't exist in any individual memory. "Memory #1 says agent reliability is hard + Memory #3 says current memory approaches have gaps = Insight: better memory architecture is the bottleneck for reliable agents."

**Borrowing plan:**
- Add a `consolidated` boolean to our `memories` table
- Add a `consolidations` table or use memory type `observation` with `source_job_id` pointing to a consolidation edge function
- Run as a Supabase pg_cron job (every 4-6 hours, not 30min — we have fewer but higher-quality memories)
- Scope consolidation per-project: consolidate memories within the same `scope_id`, not across the whole company
- Use Haiku/Flash-Lite for the consolidation LLM call (cheap, background, doesn't need deep reasoning)
- Generated insights become `observation` type memories, linked to source memories via `memory_associations` with `relation_type = 'result_of'`
- Source memories get accelerated decay (they produced their insight, the insight is now the higher-value artifact)

### 2. LLM-as-Filter Before Injection (MEDIUM IMPACT)
**What it is:** Google skips embeddings entirely. The QueryAgent reads all 50 most recent memories and lets the LLM decide what's relevant.

**Why it matters for us:** Our Phase 1 uses FTS-only search. FTS is keyword-matching — it misses semantic relevance. Instead of waiting for Phase 2 embeddings, we could add a cheap LLM filtering step: FTS retrieves top 25 candidates, then Haiku/Flash picks the top 10 most relevant to the job context. This gives us 80% of semantic search quality at 10% of the implementation cost.

**Borrowing plan:**
- After FTS retrieval in the ContextPack/Bulletin assembler, add an optional `llm_rerank` step
- Input: job context + 25 candidate memories. Output: ranked top 10 with relevance scores
- Use Haiku ($0.25/1M tokens) — this adds ~$0.001 per dispatch
- Make it a Phase 1.5 enhancement, not a Phase 1 blocker

### 3. Async Inbox / Drop-Folder Pattern (LOW-MEDIUM IMPACT)
**What it is:** A file watcher polls `./inbox/` every 5 seconds. Drop any file in, it gets processed automatically.

**Why it matters:** Our local agent daemon could use this for ad-hoc memory ingestion. Drop a file into `~/.zazigv2/memory-inbox/`, the daemon picks it up and sends it to the extraction Edge Function. Useful for human-initiated memory writes ("save this meeting transcript as memory") without building a full CLI command.

**Borrowing plan:** Low priority. The MCP `memory_save` tool and post-job extraction cover the primary write paths. File watcher is a nice-to-have for Phase 2+.

## We Do Better

### Scoping and Multi-Tenancy
Google: single SQLite file, single user, no scoping. Every memory is visible to everything.
Us: company → project → feature → job hierarchy, tier-based visibility matrix (exec/employee/contractor), RLS-enforced in Postgres. This is non-negotiable for a multi-agent workforce.

### Memory Lifecycle
Google: memories are either `consolidated = 0` or `consolidated = 1`. No decay, no tombstones, no supersession. Old memories sit forever until manually deleted.
Us: per-type decay rates, tombstone-not-overwrite (`superseded_by` pointer), importance floor at 50%, nightly pruning, soft-delete → hard-delete lifecycle. Our memories age gracefully.

### Doctrine Boundary
Google: no concept of "normative beliefs" vs "empirical experience." A memory could contradict a core architectural decision and there's no mechanism to detect or resolve it.
Us: Memory never writes to doctrines. Contradictions are suppressed at retrieval time and flagged for human review. This prevents the "experience-following" failure mode.

### Type System
Google: flat — every memory has the same structure (summary, entities, topics, importance). No distinction between a hard-won gotcha and a fleeting observation.
Us: 9 types with operationally distinct behavior. Gotchas never decay. Moments decay aggressively. Decisions are superseded, not decayed. The type system drives retrieval priority (mandatory slots for gotchas + decisions).

### Retrieval Quality
Google: `SELECT * FROM memories ORDER BY created_at DESC LIMIT 50` + let the LLM figure it out. This is O(n) in token cost and breaks at scale.
Us: scoped SQL queries with type priority ordering, mandatory slot reservation, token budget caps, Memory-Doctrine dedup. The orchestrator assembles a precisely targeted context window.

### Audit Trail
Google: hard deletes. `DELETE FROM memories WHERE id = ?`. No record it ever existed.
Us: tombstones, `superseded_by` pointers, `source_job_id` provenance, `confidence_source` attribution. Full audit trail.

## Architecture Observations

### Philosophy: "Brain During Sleep" vs "Institutional Memory"
Google frames memory as a personal brain — ingest everything, consolidate during "sleep cycles," answer questions about "what do I know?" It's a second brain for one person.

Zazig frames memory as institutional knowledge — scoped, governed, with explicit boundaries between empirical experience and normative belief. It's organizational memory for an AI workforce.

These are fundamentally different problems. Google's is simpler because personal memory doesn't need access control, conflict resolution, or multi-tenant scoping.

### The "No Embeddings" Bet
Google's explicit position: "No vector database. No embeddings. Just an LLM that reads, thinks, and writes structured memory." This is a bet on cheap, long-context models making retrieval infrastructure obsolete.

For their use case (personal memory, <100 items), this works. For ours (hundreds of memories across dozens of agents and projects), it doesn't. But the directional insight is valid: as context windows grow and inference costs drop, heavy retrieval infrastructure becomes less necessary. Our Phase 2 pgvector investment should be validated against "just stuff more memories in the prompt" before committing.

### Schema Simplicity
Google's schema is 3 tables and ~15 columns total. Ours is 2 tables and ~25 columns with constraints, indexes, and RLS. Google uses JSON strings for structured data (entities, topics, connections). We use typed columns and a separate associations table.

Gemini's second opinion argues we should use JSONB more aggressively in Phase 1 and defer the rigid relational structure. There's merit here — a `metadata JSONB` column is faster to iterate on than 5 typed columns with CHECK constraints.

### ADK Agent Pattern
The IngestAgent/ConsolidateAgent/QueryAgent split with an orchestrator routing between them is clean. Each agent has exactly the tools it needs. The ingest agent can only write, the query agent can only read, the consolidation agent does both but only on unconsolidated memories.

We already have this separation conceptually (extraction Edge Function, retrieval pipeline, maintenance job), but the explicit agent-per-concern pattern is worth noting as a clean implementation model.

## Gemini Second Opinion

**Model consulted:** gemini-3.1-pro-preview

**Key agreements:**
- Consolidation loop is "gold" and a "glaring omission" in our design
- Google's simplicity trades away everything needed for multi-agent enterprise
- File-watcher inbox is a good decoupled ingestion pattern

**Key pushback:**
1. **Token budgets feel 2023-era:** Gemini argues our 300-1500 token memory budgets are designed for 8k context models, not 1M+ token models. Counter: our budgets are deliberate — they force retrieval quality over quantity, and we're injecting memory alongside 5 other prompt layers that also need space. The budget is about *attention quality*, not *context capacity*.

2. **Orchestrator bottleneck risk:** Assembling memories at dispatch (scoped queries + decay checks + slot reservation + doctrine dedup) adds latency. Counter: this is a SQL query + token counting, not LLM inference. Latency should be <100ms. Monitor, but don't pre-optimize.

3. **System A's flat schema as contractor tier:** Interesting idea — let contractors operate with a fast, loose "read-all" memory space (like Google's), then extract consolidated insights into the stricter exec/employee scope on completion. Counter: this adds a second memory architecture to maintain. Our ContextPack pattern already gives contractors a curated view without a separate system.

4. **"Pause the spec, start building":** Gemini recommends using our infrastructure (Supabase + Deno) with Google's flat schema and deferring rigid structure. Partially agree — Phase 1 should be simpler than the spec. But the 9 types, scoping, and tombstones are core to how the orchestrator works. Stripping them makes the upgrade path harder.

5. **Multimodal ingestion not irrelevant:** Gemini points out agents may need to ingest UI screenshots, charts, PDFs. Fair point for future-proofing, but not for Phase 1.

**Where I (Claude) land:**
Gemini is right that we should bias toward shipping. The consolidation pattern is worth stealing immediately. The LLM-rerank idea is worth a Phase 1.5 experiment. But Gemini underestimates the cost of building on a flat schema and then migrating to typed/scoped — that migration is harder than building the typed schema from day one. Our design is not over-engineered; it's correctly scoped for multi-agent orchestration. A personal memory tool and an institutional memory system are different products.

## Raw Notes

- Google uses `google.adk` (Agent Development Kit) for agent orchestration — worth watching as a framework
- Gemini 3.1 Flash-Lite used for all operations (ingest, consolidate, query) — cost optimization for always-on background processing
- `consolidated` boolean flag is simpler than our association graph for tracking which memories have been synthesized
- `processed_files` table prevents re-ingestion of the same file — simple idempotency pattern
- Dashboard uses Streamlit — no relevance to our Vercel/React WebUI
- No tests in the repo. Zero.
- No error handling on the consolidation agent — if the LLM returns malformed JSON for connections, it silently fails
- `read_all_memories` has a hard LIMIT 50 — undocumented scaling ceiling
- The connection graph is stored as JSON arrays inside each memory row, not in a separate table. Querying "find all memories connected to memory #5" requires scanning all rows and parsing JSON. This won't work past ~100 memories.
- No authentication on the HTTP API — anyone on the network can read/write/delete all memories
