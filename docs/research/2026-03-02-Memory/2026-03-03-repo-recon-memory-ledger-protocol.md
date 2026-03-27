# Recon: Memory Ledger Protocol v0.2
*Analyzed: 2026-03-03 (revisit, memory-focused) | Commit: 0b48175 | Compared against: zazigv2*

## TL;DR

- **Two-layer architecture worth stealing**: Continuity Framework (reflection/extraction) is cleanly separated from MLP Storage (encrypted persistence). Each works standalone. Zazig should steal this separation.
- **7-type memory taxonomy with 4-tier confidence scoring** is the most practical memory classification system found across all repos surveyed. It is immediately applicable to agent memory in zazigv2.
- **Decay rates per memory type** is a novel, simple idea: facts and principles don't decay (0.0), commitments decay fast (0.2), preferences drift slowly (0.1). Better than a single global decay.
- **ContextPack compilation with token budgeting** solves the "what do I load into context?" problem with a relevance-scored, token-budget-aware selection pipeline. This is the part zazigv2 needs most.
- **Three-agent reflection pipeline** (Classifier -> Scorer -> Generator) is over-engineered for our use case but the prompts themselves are high-quality templates for memory extraction.

---

## Steal List

### 1. Memory Type Taxonomy (HIGH IMPACT)

**What**: 7 discrete memory types -- `fact`, `preference`, `relationship`, `principle`, `commitment`, `moment`, `skill` -- each with defined persistence characteristics and decay rates.

**Why it matters**: Zazig agents currently dump everything into MEMORY.md as flat text. This taxonomy lets us differentiate between memories that should persist forever (facts, principles, moments) and ones that should expire or degrade (commitments resolve, preferences shift).

**Borrowing plan**: Define these 7 types as an enum in `packages/shared/src/types.ts`. Add `memory_type` column to `memory_chunks` table. Memory extraction prompts use the classification decision tree from the classifier agent's SOUL.md.

**Key decay rates to adopt**:
| Type | Decay | Rationale |
|------|-------|-----------|
| `fact` | 0.0 | Facts don't decay, they get superseded |
| `preference` | 0.1 | Preferences shift gradually |
| `relationship` | 0.05 | Relationships evolve slowly |
| `principle` | 0.0 | Core values are stable |
| `commitment` | 0.2 | Commitments resolve or expire |
| `moment` | 0.0 | Significant moments are permanent |
| `skill` | 0.0 | Skills accumulate |

### 2. Confidence Scoring System (HIGH IMPACT)

**What**: 4-tier confidence with 6 source types:
- **Explicit** (0.95-1.0): user directly stated
- **Implied** (0.70-0.94): strong inference
- **Inferred** (0.40-0.69): pattern recognition
- **Speculative** (0.00-0.39): hypothesis, needs confirmation

Source types: `user_stated`, `user_confirmed`, `context_implied`, `pattern_inferred`, `behavioral_signal`, `hypothesis`.

**Why it matters**: Current MEMORY.md treats all memories equally. An agent that knows "Tom uses Doppler" (confidence 0.98, explicit) vs "Tom might prefer dark mode" (confidence 0.25, speculative) can make dramatically better decisions about what to act on vs. what to confirm first.

**Borrowing plan**: Add `confidence_score` (float), `confidence_level` (enum), `confidence_source` (enum) to `memory_chunks`. Agent prompts include scoring rubric. Memories below 0.4 get a "needs confirmation" flag.

### 3. ContextPack Compilation with Token Budget (HIGH IMPACT)

**What**: At session start, compile a "ContextPack" by:
1. Fetch candidate memories (filtered by scope, kind, recency)
2. Score each by relevance (weighted: recency 25%, kind match 20%, tag match 25%, value alignment 15%, risk appropriateness 15%)
3. Fill a token budget (default 4000 tokens) greedily from highest-scored
4. Log a compilation trace (considered vs. included vs. denied)

**Why it matters**: As agent memory grows, you can't load everything into context. The CPO currently reads all of MEMORY.md -- this works at 50 memories, fails at 500. A scored, budgeted selection pipeline is essential for scaling.

**Borrowing plan**: Implement `compileContextPack()` as a function in the executor/workspace-assembly path. When assembling a job workspace, query `memory_chunks` for that agent's role, score by relevance to the job spec, budget to ~4000 tokens, inject as `## Relevant Memory` section.

**Relevance scoring formula** (from `relevance.js`):
```
score = 0.25 * recency + 0.20 * kindMatch + 0.25 * tagMatch + 0.15 * valueAlignment + 0.15 * riskScore
```

### 4. Questions-from-Reflection Pattern (MEDIUM IMPACT)

**What**: After processing memories, generate "curiosity questions" -- categorized as gap/implication/clarification/exploration/connection -- with timing (next_session/when_relevant/low_priority) and sensitivity levels.

**Why it matters**: This turns passive memory into active learning. Instead of just remembering "Tom mentioned a migration project", the agent generates "How is the migration project progressing?" and surfaces it next session. For CPO, this is gold -- it can proactively check in on stalled features or follow up on decisions.

**Borrowing plan**: Add a `pending_questions` table or a questions section to CPO's memory. After each significant interaction, CPO generates 2-3 follow-up questions. Surface these when the human returns. Start simple -- just the question + timing, skip the curiosity_type taxonomy initially.

### 5. Tombstone Pattern for Memory Revocation (MEDIUM IMPACT)

**What**: Instead of deleting memories, create a tombstone record with `kind: 'tombstone'` that supersedes the original. The original stays in history but conforming implementations treat it as invalid.

**Why it matters**: Audit trail. If an agent learns something wrong and gets corrected, the tombstone pattern means we know *what* was corrected and *when*, not just the current state. Useful for debugging agent behavior.

**Borrowing plan**: Add `superseded_by` column to `memory_chunks`. When a memory is corrected, create a new chunk and set `superseded_by` on the old one. Never hard-delete.

### 6. Lineage Tracking (LOWER IMPACT, FUTURE)

**What**: Every memory envelope has a `lineage` object: `parents[]` (what it derives from), `supersedes[]` (what it replaces), `branches[]` (alternative interpretations).

**Why it matters**: When agents disagree about something (CTO says "use Postgres", CPO says "explore DynamoDB"), lineage tracking lets us trace the evolution of that decision. Not critical now, but valuable as the system matures.

**Borrowing plan**: Add `parent_ids` UUID array to `memory_chunks` later. Not needed for v1.

---

## We Do Better

### 1. Role-scoped memory is simpler and more practical
Zazig's `memory_chunks` table has a `role` column linking memories to specific agent roles (CPO, CTO, etc.). MLP's scope model (`user`, `agent`, `shared`, `system`) is more generic but less useful for a multi-agent system where different agents need different subsets of organizational memory.

### 2. Supabase > local markdown for multi-agent persistence
MLP stores memories as local markdown files (`~/clawd/memory/MEMORY.md`) for the Continuity Framework. This works for a single user-agent pair but breaks down for multiple agents across multiple machines. Zazig's Supabase-backed `memory_chunks` table is the right choice for multi-machine, multi-agent memory.

### 3. Our orchestrator is more battle-tested
MLP's orchestrator is a simple 3-phase pipeline (classify -> score -> generate). Zazig's orchestrator handles DAG-based job dispatch, slot routing, heartbeats, failover -- real production concerns. The reflection pipeline is a small addition to a much more capable system.

### 4. No crypto overhead needed
MLP's encryption layer (TweetNaCl, AES-256-GCM, IPFS storage) is essential for the "sovereign memory" vision but adds significant complexity. For Zazig, where all agents are under our control and memory lives in our Supabase instance, encryption is unnecessary overhead. The access control is handled at the DB/RLS level.

### 5. Flat file memory actually works for our scale
MEMORY.md and napkin.md are simple, human-readable, git-friendly, and fast. MLP's JSON-in-markdown-comments approach is clever but harder to read. For now, our approach works. The structured DB approach is needed for multi-agent, not for CPO alone.

---

## Architecture Observations

### Two Clean Layers

The repo has two genuinely independent systems:

1. **Continuity Framework** (`continuity/`): Reflection, memory extraction, question generation. Stores as local markdown. No encryption, no blockchain, no tokens. Works standalone.

2. **MLP Storage** (`mlp-storage/`): Encrypted persistence, identity kernels, access policies, content-addressed storage. The "sovereign memory" layer that adds portability and security.

This separation is the single smartest design decision in the repo. It means you can use the reflection patterns without buying into the crypto/decentralization vision.

### Agent-as-Pipeline

The Continuity Framework treats reflection as a 3-stage pipeline of specialized sub-agents:
- **Classifier**: conversation -> typed memories
- **Scorer**: memories -> confidence-scored memories
- **Generator**: scored memories -> curiosity questions

Each agent has a SOUL.md (identity/role definition) and a task prompt (specific instructions). This maps cleanly to Zazig's contractor pattern: a skill (reasoning/decomposition brain) wrapping role-scoped tools.

### IdentityKernel as Portable Self

The IdentityKernel concept -- a minimal, signed JSON object containing `invariants` (values, boundaries), `evolution_rules`, `memory_defaults`, and `epoch_state` -- is philosophically interesting but practically over-specified. For Zazig, our `roles` table + personality coordinates already serve this purpose more concisely. The "epoch" concept (major life/identity transitions) is worth noting though -- if CPO develops significantly different behavior over time, epoch tracking would help debug why.

### Cartouche as Symbolic Compression

The Cartouche (symbolic glyph seal for identity) is creative but purely aesthetic for our purposes. It maps identity properties to Unicode glyphs for visual representation. Novel concept, zero practical value for Zazig.

### Token Economics is Bolted On

The $POLYPHONIC token and decentralization narrative is the project's business model, not a technical necessity. The actual memory patterns work perfectly without any blockchain or token involvement. This confirms the steal-the-patterns-ignore-the-infra approach.

---

## Patterns Worth Extracting for Zazig Memory v1

Based on this analysis, here is a concrete proposal for what to borrow and how:

### Phase 1: Memory Schema (DB changes)
- Add columns to `memory_chunks`: `memory_type` (enum: 7 types), `confidence_score` (float 0-1), `confidence_level` (enum: 4 tiers), `confidence_source` (enum: 6 sources), `decay_rate` (float), `tags` (text[]), `superseded_by` (uuid, nullable)
- Add `pending_questions` table: `id`, `role`, `question`, `context`, `timing`, `sensitivity`, `status`, `created_at`, `resolved_at`

### Phase 2: Memory Extraction Prompts
- Port the classifier agent's decision tree and type definitions into a memory extraction skill
- Port the scorer agent's confidence rubric into the extraction prompt (single-pass, not 3 separate agents)
- Add memory extraction as a post-job step: when a job completes, extract memories from the job report

### Phase 3: ContextPack for Job Assembly
- When assembling a job workspace, query relevant memories from `memory_chunks`
- Score by relevance to the job spec (simplified version of `relevance.js`)
- Budget to token limit
- Inject as structured section in the workspace CLAUDE.md

### Phase 4: Questions and Active Learning
- CPO generates follow-up questions after significant interactions
- Surface 1-3 questions when human returns
- Track which questions get answered vs. skipped

---

## Codex Second Opinion

*Skipped for this revisit. The repo has not changed since the initial analysis on 2026-02-20 (same commit 0b48175). This analysis is a focused deep-dive on memory patterns, not a structural re-evaluation. The patterns identified are concrete and implementation-ready -- a second opinion would not change the steal list materially.*

---

## Raw Notes

### File-by-File Implementation Quality

- `continuity/src/types.js`: Clean type definitions with JSDoc. The `DEFAULT_DECAY_RATES` and `CONFIDENCE_RANGES` constants are directly reusable. The `validateMemory()` function is a good pattern.
- `continuity/src/memory-store.js`: Markdown I/O with HTML comment metadata (`<!-- {"id":"mem_abc","confidence":{"score":0.98}} -->`). Clever approach for human-readable + machine-parseable. Not needed for DB-backed memory.
- `continuity/src/orchestrator.js`: 3-phase pipeline with local fallbacks. The local classification (`_localClassify`) uses simple regex heuristics as a fast path. The `_parseJSON` method handles JSON-in-markdown extraction -- useful pattern for parsing agent responses.
- `mlp-storage/src/relevance.js`: The scoring weights (recency 25%, kind 20%, tag 25%, value alignment 15%, risk 15%) are tunable and well-reasoned. The `estimateTokens()` function uses a ~4 chars/token approximation.
- `mlp-storage/src/envelope.js`: The `getSignableData()` / `getIndexData()` split is a good pattern for separating signing concerns from indexing concerns.
- `mlp-storage/src/identity-kernel.js`: The `addBoundary()` method that returns `{ requires_confirmation: true, pending: boundary }` when evolution rules demand confirmation is a nice UX pattern for identity changes that need human approval.
- `mlp-storage/src/context-pack.js`: The `compileContextPack()` function is the most directly useful code. It demonstrates token-budget-aware memory selection with a compilation trace for auditability.

### Curiosity Type Distribution

The 5 curiosity types map well to agent operational needs:
- **gap**: "We don't know X about this feature" -> ask human
- **implication**: "Feature A depends on Feature B's outcome" -> flag dependency
- **clarification**: "Spec says 'fast' but no SLA defined" -> ask for specifics
- **exploration**: "User mentioned wanting analytics" -> deepen understanding
- **connection**: "This pattern appeared in 3 different features" -> synthesize

### Memory Types vs. Zazig Operational Memory

Mapping MLP memory types to Zazig agent operations:
| MLP Type | Zazig Equivalent | Example |
|----------|-----------------|---------|
| `fact` | Codebase knowledge | "Service X uses port 3000" |
| `preference` | User preferences | "Tom prefers Gherkin AC" |
| `relationship` | Agent relationships | "CTO reviews CPO's feature specs" |
| `principle` | Doctrines/beliefs | "Always use typed MCP tools" |
| `commitment` | Active jobs/tasks | "Deploying migration by Friday" |
| `moment` | Key decisions | "Decided to use Supabase over custom infra" |
| `skill` | Learned patterns | "Job reports go in .claude/cpo-report.md" |

### Things Not Worth Borrowing

- **Encryption layer**: We control all agents and storage. RLS is sufficient.
- **IPFS/Arweave storage**: Decentralized storage adds latency and complexity for zero benefit.
- **Cartouche/glyph system**: Aesthetic, not functional.
- **Token economics**: Business model, not memory pattern.
- **Witness signatures**: Third-party attestation is for adversarial environments. We trust our own agents.
- **Dialect negotiation**: Protocol versioning for symbolic formats. Irrelevant.
- **3-agent reflection pipeline**: Over-engineered. A single prompt with the classifier's decision tree + scorer's rubric will extract and score in one pass.
