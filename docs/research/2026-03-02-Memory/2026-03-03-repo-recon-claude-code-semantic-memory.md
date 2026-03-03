# Recon: claude-code-semantic-memory
*Analyzed: 2026-03-03 | Commit: 9cdbd5d | Compared against: zazigv2*

**Repo:** https://github.com/zacdcook/claude-code-semantic-memory
**Author:** Zac Cook (@PerceptualPeak) -- same author as the viral PreToolUse hook tweet already captured in our research (`2026-03-03-semantic-memory-pretooluse-hooks.md`)

## TL;DR

1. **Complete, working semantic memory system for Claude Code** -- hooks fire on every prompt + every tool use, query a local Python/Flask daemon backed by SQLite + Ollama embeddings (nomic-embed-text), and inject relevant memories as XML into Claude's context. The full pipeline from transcript extraction to runtime recall is ~400 lines of code total.
2. **PreToolUse thinking-block injection is the headline innovation** -- queries the agent's *own thinking blocks* (not just user prompts) for additional memories mid-task, creating a self-correcting feedback loop that prevents workflow drift. This is the core idea from Zac's viral tweet.
3. **Six typed learning categories with confidence scoring** -- WORKING_SOLUTION, GOTCHA, PATTERN, DECISION, FAILURE, PREFERENCE -- each with a 0.0-1.0 confidence score. No decay, no weighting, no access-count tracking.
4. **Auto-extraction on compaction via sub-agent dispatch** -- when Claude Code compacts context, the PreCompact hook exports the transcript, converts to markdown, and outputs instructions for Claude to dispatch a Task sub-agent that extracts learnings and stores them via the daemon API. Fully self-contained, no external API keys.
5. **Surprisingly thin** -- the entire system is ~10 files, no tests, no CI, no multi-tenant support, no access control. It is a single-user personal memory system for one machine. Architecture decisions favor simplicity over everything else.

## Steal List

### 1. PreToolUse Thinking-Block Injection (High Impact)

**What it is:** The `pre-tool-use.sh` hook fires before every read-only tool (Read, Grep, Glob, Task, WebSearch, WebFetch). It extracts the last 8000 characters of Claude's most recent thinking block, embeds it, queries the memory daemon, and injects any new relevant memories as XML context. It only fires for read-only tools (not writes) to avoid slowing down edits.

**Why it matters:** The user's initial prompt becomes less relevant the longer the workflow runs. The agent's thinking block is the most current signal about what it is *actually doing right now*. Querying memory against the thinking block catches "I'm about to make the same mistake as last time" moments mid-task.

**Key implementation detail:** Hash-based deduplication -- it md5-hashes the thinking content and skips re-querying if the thinking hasn't changed since the last tool invocation. State is stored in `~/.claude/memory-injection-state.json` keyed by session ID.

**Borrowing plan for Zazig:** This maps directly to our CPO Knowledge Architecture's "proactively injected beliefs" layer. Right now our doctrines are static. If we had a semantic recall daemon, we could inject relevant past-session learnings (gotchas, decisions, failures) into the CPO or any persistent agent mid-reasoning. For ephemeral workers, the orchestrator could assemble relevant memories into the workspace context at dispatch time instead of using hooks.

### 2. Auto-Extract Learnings on Compaction (High Impact)

**What it is:** The `pre-compact.sh` hook fires when Claude Code is about to compact the context window. It:
1. Copies the raw JSONL transcript to `~/.claude/transcripts/{sessionId}/`
2. Runs an inline Python script to convert JSONL to readable markdown
3. Writes metadata (session_id, project_path, daemon_url, status: "pending_extraction")
4. Outputs XML instructions telling Claude to dispatch a Task sub-agent with a specific extraction prompt

The sub-agent then reads the transcript, extracts learnings typed as WORKING_SOLUTION/GOTCHA/PATTERN/DECISION/FAILURE/PREFERENCE, and POSTs each one to the daemon's `/store` endpoint via curl.

**Why it matters:** This is the *write* side of the memory loop. Without it, the system is read-only (only recalls memories that were manually imported). The compaction hook makes memory accumulation automatic -- every session contributes learnings without the user doing anything.

**Borrowing plan for Zazig:** Our agents already write reports (`~/.zazigv2/job-<id>/` workspace, `.claude/cpo-report.md`). We could add a post-job extraction step: when a job completes, extract learnings from the report/transcript and store them in the `memory_chunks` table in Supabase. The orchestrator already knows the job context (role, feature, project), so it could tag memories with richer metadata than this system does.

### 3. Typed Learning Categories (Medium Impact)

**What it is:** Six categories: WORKING_SOLUTION, GOTCHA, PATTERN, DECISION, FAILURE, PREFERENCE. Each learning is a structured record with type, content, context (freeform text about what situation triggered the learning), confidence (0.0-1.0), and session_source.

**Why it matters:** The types create natural retrieval filters. A GOTCHA surfaced mid-task is much more useful than a PREFERENCE. The confidence score enables threshold-based filtering (the extraction prompt instructs: 0.95+ for confirmed, 0.85+ for strong evidence, below 0.70 don't include).

**What's missing:** No weighting multipliers per type (the `@Unisone` tweet we already have suggests corrections at 1.5x, decisions at 1.3x). No decay. No access counting. No staleness tracking. This is a "store everything, retrieve by similarity" system with no memory lifecycle management.

**Borrowing plan for Zazig:** Our napkin.md already has informal categories (Corrections, User Preferences, Codebase Gotchas, Patterns That Work, Patterns That Don't Work, Domain Notes). These map roughly to: Corrections -> GOTCHA/FAILURE, User Preferences -> PREFERENCE, Codebase Gotchas -> GOTCHA, Patterns That Work -> WORKING_SOLUTION/PATTERN, Domain Notes -> DECISION. If we formalize these into a schema for Supabase's `memory_chunks` table, we get structured memory that multiple agents can query with type filters.

### 4. Duplicate Detection via Embedding Similarity (Medium Impact)

**What it is:** When storing a new learning, the daemon computes its embedding, then iterates through ALL existing embeddings computing cosine similarity. If any existing learning has >= 0.92 similarity, the new one is rejected as a duplicate.

**Why it matters:** Without deduplication, the same learning extracted from multiple sessions would accumulate, bloating the database and potentially dominating recall results.

**What's problematic:** The implementation is O(n) -- it loads every embedding from the database and computes similarity one by one in Python. This works fine for hundreds of learnings but would break at thousands. A production system needs either pgvector (Postgres extension for vector similarity search) or an approximate nearest neighbor index.

**Borrowing plan for Zazig:** Supabase supports pgvector natively. We could store embeddings in the `memory_chunks` table with a vector column, and deduplication + recall become single SQL queries with `<=>` cosine distance operator. Much more scalable than this Python loop.

### 5. XML Injection Format (Low-Medium Impact)

**What it is:** Memories are injected as:
```xml
<recalled-learnings>
<memory type="GOTCHA" similarity="0.87">content here</memory>
</recalled-learnings>
```

With a `source="thinking-injection"` attribute on the PreToolUse variant to distinguish prompt-triggered from thinking-triggered recalls.

**Why it matters:** XML tags are the most reliable way to inject structured context that Claude will parse correctly. The type and similarity attributes give Claude metadata to weigh the memory's relevance.

**Borrowing plan for Zazig:** Adopt this format directly for any memory injection into agent workspaces. It is clean, parseable, and Claude handles XML well.

## We Do Better

### 1. Multi-Agent Memory Architecture
This repo is single-user, single-machine. Zazig already has a multi-agent architecture with Supabase as the shared state layer. Our `memory_chunks` table (already in the schema) is inherently multi-tenant and multi-agent. Any agent can write memories, any agent can read them, scoped by company/project/role. This repo has no concept of shared memory between agents.

### 2. Richer Context Metadata
Their learning record has: type, content, context (freeform string), confidence, session_source. Our orchestrator knows: company_id, project_id, feature_id, job_id, role, machine_id, agent personality coordinates. We can tag memories with all of this, enabling queries like "what gotchas has the CTO encountered on project X?" or "what patterns did the verification specialist learn about this codebase?"

### 3. Structured Knowledge vs Flat Learnings
Our napkin.md + MEMORY.md + CLAUDE.md three-layer system already separates: session-volatile notes (napkin), cross-session persistent facts (MEMORY.md), and project-level instructions (CLAUDE.md). This repo collapses everything into a flat "learnings" table with no hierarchy or scoping.

### 4. Orchestrator-Assembled Context
Their hooks fire on every prompt/tool-use, adding latency to every interaction. Our orchestrator assembles context at dispatch time -- the workspace is pre-built with relevant context before the agent even starts. This is fundamentally more efficient for ephemeral agents that only live for one job.

### 5. No Dependency on Local Embedding Infrastructure
This system requires Ollama running locally with nomic-embed-text pulled. That's another daemon to manage, another failure mode, and it doesn't work on machines without Ollama. Our approach of using Supabase (which supports pgvector) means the embedding infrastructure is centralized and always available.

## Architecture Observations

### Design Philosophy: Mechanical Determinism Over Intelligence

The author explicitly chose hooks over CLAUDE.md instructions because "hooks fire deterministically; CLAUDE.md instructions are suggestions Claude may skip under cognitive load." This is a strong insight. The entire system is designed to be mechanical -- bash scripts that fire at defined lifecycle points, make HTTP calls, and inject context. No intelligence in the plumbing; all intelligence in the agent.

This aligns with our own architecture decision: "Two-plane architecture: style plane (prompted) + policy plane (orchestrator-enforced)." The hooks are the policy plane equivalent for a single-user system.

### The Compaction Problem is Underappreciated

The PreCompact hook is perhaps the most important piece. Most Claude Code users lose everything when context compacts. This system preserves the full transcript and automatically extracts learnings before compaction happens. The design is clever: the hook itself doesn't extract (it can't -- it's a bash script). Instead, it outputs XML instructions that tell Claude to dispatch a sub-agent via the Task tool. The sub-agent does the extraction within Claude Code itself, needing no external LLM calls.

This is relevant to our CPO: as a persistent agent, the CPO will hit context compaction regularly. If we don't have a mechanism to extract and preserve learnings before compaction, the CPO will lose institutional knowledge with every compaction event.

### Embedding Model Choice: nomic-embed-text

The author chose nomic-embed-text (768 dimensions, 8K token context) over all-MiniLM-L6-v2 (384 dimensions, 256 token context). The reasoning: "MiniLM truncates 75% of longer conversation turns." This is a pragmatic choice -- most learnings are multi-sentence, and truncation destroys their semantic meaning. For our Supabase/pgvector approach, we would likely use OpenAI's `text-embedding-3-small` (1536 dimensions) or similar API-based embedder since we are already in the cloud.

### What's NOT Here

- No tests of any kind
- No CI/CD
- No versioning or migration for the SQLite schema
- No access control or multi-user support
- No memory decay, staleness tracking, or garbage collection
- No way to edit or correct memories (only store and recall)
- No memory promotion (a GOTCHA that's hit 10 times should be promoted to a PATTERN or CANON)
- No cross-session deduplication beyond embedding similarity
- No categories for project-specific vs universal knowledge
- No concept of memory scope (project, team, global)
- No rate limiting on the daemon API

These are all things Zazig would need for a production memory system with multiple agents.

### The 0.45 Similarity Threshold

The author sets a relatively low cosine similarity threshold (0.45) for recall. Their reasoning: "Permissive enough to catch semantically related content, not so low it floods with noise." Combined with max 3 results, this means the system casts a wide net but limits injection volume. This is worth testing -- too high a threshold misses useful analogies; too low injects noise.

## Raw Notes

### Hook Lifecycle Mapping

| Claude Code Hook | What This Repo Does | Zazig Equivalent |
|---|---|---|
| SessionStart | Health check daemon, warn orphaned transcripts | Orchestrator health check at machine heartbeat |
| UserPromptSubmit | Embed user prompt, query daemon, inject top 3 | Workspace context assembly at job dispatch |
| PreToolUse | Embed thinking block, query daemon, inject if drift detected | Could be added as agent-level hook for persistent agents |
| PreCompact | Export transcript, convert to markdown, dispatch sub-agent for extraction | Post-job report extraction via orchestrator |

### Interesting Code Patterns

1. **Inline Python in bash hooks** -- The hooks use `python3 -c "..."` extensively for JSON parsing instead of pure jq. This is because jq can't easily handle the nested message content structures from Claude Code's transcript format.

2. **Sub-agent dispatch via output** -- The PreCompact hook doesn't call the Task tool itself (it can't -- it's a bash hook). Instead, it outputs XML instructions that appear in Claude's context after compaction. Claude then reads these instructions and dispatches the sub-agent. This is a creative workaround for hook limitations.

3. **Graceful degradation everywhere** -- Every hook exits cleanly if the daemon is unreachable. Memory is optional, never blocking. This is important: a memory system that blocks the agent when the daemon is down would be worse than no memory at all.

4. **JSONL-to-markdown converter** -- The `scripts/jsonl-to-markdown.js` script is a useful utility. It strips tool_use and tool_result blocks, keeping only user messages, assistant messages (with thinking blocks), and system prompts. This creates much cleaner transcripts for learning extraction.

### Numbers

- Total files: 10 (excluding LICENSE, .gitignore)
- Total lines of Python (server.py): 205
- Total lines of bash (all hooks): ~320
- Total lines of JS (converter): 220
- Dependencies: flask, numpy, requests (Python); ollama (system)
- Database: single SQLite file at `daemon/semantic-memory.db`
- Embedding dimensions: 768 (nomic-embed-text)
- Default max results per query: 3
- Default similarity threshold: 0.45
- Default duplicate threshold: 0.92

### Multi-Machine Setup

The README describes running Ollama on a GPU desktop and querying it from a laptop via Tailscale. This is set via `CLAUDE_DAEMON_HOST` environment variable. Relevant for Zazig because our agents run across Tom's and Chris's machines -- but our cloud-based approach (Supabase + pgvector) would eliminate this concern entirely.

### Connection to Existing Research

This repo is the canonical implementation behind:
- The `@PerceptualPeak` viral PreToolUse tweet (already in our research folder)
- The general "semantic memory for Claude Code" approach discussed across multiple tweets we've captured

The `@Unisone` weighted-categories-with-decay approach (`2026-03-03-weighted-memory-categories-decay.md`) adds the lifecycle layer this repo lacks: 8 weighted categories, 14-day half-life decay, nightly garbage collection. A production Zazig memory system would combine this repo's mechanical injection approach with Unisone's lifecycle management.

### What a Zazig Memory System Would Look Different

1. **Storage:** Supabase `memory_chunks` table with pgvector, not local SQLite
2. **Embedding:** API-based (OpenAI or Voyage), not local Ollama
3. **Injection:** Orchestrator-assembled at dispatch time for ephemeral agents; hook-based for persistent agents (CPO)
4. **Extraction:** Post-job pipeline step in orchestrator, not bash hook
5. **Scope:** Company > Project > Feature > Job hierarchy, not flat
6. **Lifecycle:** Weighted categories, decay, access counting, promotion
7. **Multi-agent:** Any agent writes, any agent reads, scoped by role/project
8. **Deduplication:** pgvector nearest-neighbor query, not O(n) Python loop
