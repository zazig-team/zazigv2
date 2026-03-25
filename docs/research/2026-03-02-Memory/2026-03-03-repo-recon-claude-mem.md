# Recon: claude-mem
*Analyzed: 2026-03-03 | Commit: ecb09df | Compared against: zazigv2*

## TL;DR

- **Observer Agent pattern**: A dedicated AI agent (Claude subprocess) watches tool usage from another session, extracts structured observations in XML, and stores them -- the agent doing the work never knows it's being observed.
- **Progressive disclosure is the killer feature**: Inject a compact index (~800 tokens) at session start, let the agent decide what to fetch via MCP search tools. 3-layer workflow: search (index) -> timeline (context) -> get_observations (details). Claims 10x token savings over naive RAG.
- **Dual storage with hybrid search**: SQLite (FTS5 full-text search) as primary store + ChromaDB (vector embeddings via MCP) for semantic search. Hybrid strategy intersects metadata filter results with semantic ranking.
- **Structured observation schema with typed categories**: 6 observation types (bugfix, feature, refactor, change, discovery, decision) x 7 concept tags (how-it-works, why-it-exists, what-changed, problem-solution, gotcha, pattern, trade-off) create a 42-cell taxonomy. Each observation includes title, subtitle, facts array, narrative, concepts, and files touched.
- **Token economics tracking**: Every observation tracks `discovery_tokens` (cost to create it via the observer agent) vs read tokens (cost to inject it). This ROI metric shows whether memory is saving or wasting tokens.

## Steal List

### 1. Progressive Disclosure Pattern (Impact: Very High)

The most novel and reusable idea. Instead of dumping all memory into context at session start, inject a lightweight index showing titles, timestamps, types, and token costs. The agent then uses MCP tools to fetch full details for only the observations it deems relevant.

**Borrowing plan for Zazig**: Our CPO and contractors could benefit from a similar pattern. At job dispatch, instead of assembling the entire `assembled_context` upfront, provide a compact index of available memory chunks. The worker uses MCP tools to fetch what it needs. This would reduce the bloated context problem as our memory grows.

Key implementation details from claude-mem:
- Index format: markdown table with ID, time, type icon, title, ~token count
- Grouped by date and file path for spatial/temporal locality
- MCP tools: `search` (index), `timeline` (context), `get_observations` (details)
- Configurable: `totalObservationCount`, `fullObservationCount`, `sessionCount` in settings

### 2. Observer Agent Architecture (Impact: High)

A dedicated Claude subprocess runs alongside the main session, watching tool usage events via lifecycle hooks. It receives tool name, input, and output, then extracts structured observations in XML format. The observer is explicitly forbidden from using any tools itself -- it is read-only.

**Borrowing plan for Zazig**: This pattern could power a "session scribe" for our exec agents. When CPO or a contractor runs a session, an observer could generate structured memory chunks in real-time. The key insight is that the observer is a separate AI instance, not the worker itself. This means the worker's context window stays clean.

Implementation highlights:
- Observer uses disallowed tools list to prevent action: `['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'AskUserQuestion', 'TodoWrite']`
- Messages flow via async generator: `createMessageGenerator` yields hook events as they arrive
- Session management handles resume, crash recovery, and multi-terminal collision
- Content hash deduplication (SHA256 of session_id + title + narrative) with 30-second window prevents duplicate observations

### 3. Observation Type/Concept Taxonomy (Impact: High)

The dual-axis categorization (6 types x 7 concepts) is simple but effective. Types describe *what happened* (bugfix, feature, refactor, change, discovery, decision). Concepts describe *what kind of knowledge* (how-it-works, why-it-exists, what-changed, problem-solution, gotcha, pattern, trade-off).

**Borrowing plan for Zazig**: Our `memory_chunks` table could adopt a similar taxonomy. Currently our chunks are untyped text. Adding type and concept tags would enable filtered retrieval -- e.g., "show me all 'gotcha' observations from the orchestrator work" or "all 'decision' observations about pipeline design."

The taxonomy is configurable via "modes" (JSON files in `plugin/modes/`). The `code.json` mode defines the default types/concepts, but custom modes can define entirely different taxonomies for non-code work.

### 4. Structured Observation Schema (Impact: High)

Each observation has a rich, consistent structure:
- `type`: One of the 6 categories
- `title`: Short, searchable (max ~10 words)
- `subtitle`: One sentence (max 24 words)
- `facts`: Array of concise, self-contained statements (no pronouns, each standalone)
- `narrative`: Full context paragraph
- `concepts`: Array of 2-5 knowledge-type tags
- `files_read` / `files_modified`: Array of file paths
- `prompt_number`: Which prompt in the session generated this
- `discovery_tokens`: Token cost to generate this observation

The XML format is the contract between the observer agent and the parser:
```xml
<observation>
  <type>bugfix</type>
  <title>Short title</title>
  <subtitle>One sentence explanation</subtitle>
  <facts>
    <fact>Concise statement 1</fact>
    <fact>Concise statement 2</fact>
  </facts>
  <narrative>Full context paragraph</narrative>
  <concepts>
    <concept>problem-solution</concept>
    <concept>gotcha</concept>
  </concepts>
  <files_read><file>path/to/file</file></files_read>
  <files_modified><file>path/to/file</file></files_modified>
</observation>
```

**Borrowing plan for Zazig**: This schema is directly applicable to our memory chunks. The facts-as-array pattern is particularly useful -- it produces self-contained, grep-able knowledge atoms that can be individually retrieved without loading the full observation.

### 5. Session Summary Structure (Impact: Medium)

End-of-session summaries use a structured format:
- `request`: What the user asked for
- `investigated`: What was explored
- `learned`: Key takeaways
- `completed`: What shipped
- `next_steps`: Current trajectory
- `notes`: Additional insights

**Borrowing plan for Zazig**: Our job reports already capture some of this. The `next_steps` field is worth adopting -- it bridges sessions by telling the next agent what to pick up. Currently our napkin.md serves a similar purpose manually.

### 6. Hybrid Search Strategy (Impact: Medium)

The search architecture uses a 4-step pattern:
1. SQLite metadata filter (get all IDs matching type/concept/file/date criteria)
2. ChromaDB semantic ranking (rank by vector similarity to query)
3. Intersection (keep only IDs from step 1, in rank order from step 2)
4. Hydrate from SQLite in semantic rank order

This avoids the problem of pure vector search returning irrelevant results and pure keyword search missing semantically similar content.

**Borrowing plan for Zazig**: If we build a search layer for agent memory, this pattern avoids the "vector search returns garbage" problem. SQLite FTS5 is available in Supabase as `pg_trgm` or full-text search. Chroma could be replaced by pgvector for embeddings.

### 7. Token Economics / ROI Tracking (Impact: Medium)

Every observation tracks how many tokens it cost to discover (the observer agent's token usage) vs how many tokens it costs to read (the compressed observation). This creates a concrete ROI metric: "This observation cost 5,000 tokens to generate but is only 155 tokens to read, saving 4,845 tokens."

**Borrowing plan for Zazig**: Track the token cost of generating each memory chunk (from the observer/summarizer agent) and compare against the tokens saved by not re-reading source material. This gives a data-driven answer to "is our memory system worth the overhead?"

### 8. Privacy Tags (Impact: Low but Smart)

Users can wrap content in `<private>...</private>` tags to exclude it from memory storage. Tag stripping happens at the hook layer (edge processing) before data reaches the worker or database.

**Borrowing plan for Zazig**: Simple to implement. If we ever store customer-sensitive context, this pattern lets the human control what persists.

## We Do Better

### 1. Multi-Agent Architecture

Zazig's orchestrator, role-scoped MCP tools, and contractor pattern are far more sophisticated than claude-mem's single-agent-with-observer model. claude-mem is designed for a single developer using Claude Code. Our system handles multiple agents, DAG-based job dispatch, slot management, and cross-agent communication.

### 2. State Centralization

Our Supabase-based state (Postgres + Realtime) is architecturally cleaner than claude-mem's local SQLite + separate Chroma instance. We get cross-machine state, real-time sync, and proper transactions. claude-mem is inherently single-machine.

### 3. Knowledge Architecture

Our CPO's 3-layer knowledge architecture (routing prompt + stage skills + doctrines) is more deliberate than claude-mem's "dump everything into context" approach. claude-mem's progressive disclosure is impressive at the search layer, but at the *generation* layer it still relies on a single monolithic observer prompt.

### 4. Role Scoping

Our role-scoped MCP tools ensure agents only see what they need. claude-mem has no concept of roles or permissions -- the observer sees everything.

### 5. Job/Feature Pipeline

Our structured pipeline (created -> ready_for_breakdown -> breakdown -> building -> combining -> verifying -> deploying_to_test -> ready_to_test -> deploying_to_prod -> complete) is far more mature than anything in claude-mem. claude-mem has no concept of task decomposition or pipeline management.

## Architecture Observations

### Data Flow

```
Claude Code Session (User)
    |
    v
Lifecycle Hooks (5 types)
    |
    +--> SessionStart: inject context index
    +--> UserPromptSubmit: initialize SDK session
    +--> PostToolUse: send tool event to observer
    +--> Stop: trigger session summary
    +--> SessionEnd: cleanup
    |
    v
Worker Service (Express on port 37777)
    |
    +--> SDK Agent (observer Claude subprocess)
    |       |
    |       +--> Parse XML observations
    |       +--> Store in SQLite (atomic transaction)
    |       +--> Sync to ChromaDB (fire-and-forget)
    |       +--> Broadcast via SSE
    |
    +--> MCP Server (search tools)
    |       |
    |       +--> search -> SQLite FTS5 / ChromaDB
    |       +--> timeline -> SQLite
    |       +--> get_observations -> SQLite
    |
    +--> Web Viewer (React on :37777)
```

### Key Design Decisions

1. **Observer is a separate Claude subprocess**: This is the most important architectural decision. The observer has its own context window, its own token budget, and its own session. This means memory extraction doesn't compete with the user's actual work.

2. **Bun as runtime**: Uses Bun for the worker service (not Node.js). This gives native SQLite support via `bun:sqlite`, faster startup, and process management. The SDK agent still uses the Claude CLI via `@anthropic-ai/claude-agent-sdk`.

3. **Content-based deduplication**: SHA256 hash of (session_id, title, narrative) with a 30-second window prevents duplicate observations. This is important because hooks can fire multiple times for the same event.

4. **Claim-confirm message processing**: Messages are claimed (marked as "processing" in DB) before being sent to the observer, then confirmed after successful storage. This prevents message loss on crash without requiring idempotent processing.

5. **Fire-and-forget Chroma sync**: SQLite is the source of truth. ChromaDB sync happens asynchronously after the SQLite transaction commits. If Chroma fails, search degrades gracefully to SQLite FTS5 only.

6. **Configurable observation counts**: Users can tune `CLAUDE_MEM_CONTEXT_OBSERVATIONS` (total to show), `CLAUDE_MEM_CONTEXT_FULL_COUNT` (show full details for N most recent), and `CLAUDE_MEM_CONTEXT_SESSION_COUNT` (number of session summaries to show). This is fine-grained control over context injection.

### Interesting Patterns

- **Mode system**: Observation types and concepts are defined per-mode in JSON files. The `code.json` mode has 6 types and 7 concepts for software development. Custom modes (e.g., `email-investigation.json`) can define entirely different taxonomies. This is similar to our exec archetype system but applied to memory categorization.

- **Granular Chroma documents**: Each observation field (narrative, text, individual facts) becomes a separate vector document in ChromaDB. This means a single observation might produce 5-6 vector documents. The rationale is that semantic search on facts individually is more precise than on the concatenated whole.

- **Process registry for zombie cleanup**: The SDK spawns Claude subprocesses. A ProcessRegistry tracks PIDs and ensures cleanup on exit. This prevents zombie observer processes accumulating over time.

- **Multi-terminal collision handling**: If two terminal sessions point at the same project, the system handles memory session ID collisions via `ensureMemorySessionIdRegistered()` -- idempotent session registration that prevents FK constraint violations.

## Codex Second Opinion

*Skipped: Codex is not available in this environment. The analysis above represents a single-pass deep review of the codebase.*

## Raw Notes

### Things to Dig Into Later

1. **Endless Mode (beta)**: Referenced in docs but implementation not fully explored. Described as "biomimetic memory architecture for extended sessions." Could be relevant for CPO's persistent memory.

2. **Cursor integration**: claude-mem supports Cursor IDE via hooks. The `CursorHooksInstaller` and `updateCursorContextForProject` functions maintain context files for Cursor projects. If Zazig ever supports non-Claude-Code agents, this integration pattern is worth studying.

3. **Smart File Read**: The MCP server includes `smart_search`, `smart_unfold`, and `smart_outline` tools that use tree-sitter AST parsing for structural code search. This is orthogonal to memory but interesting as a general-purpose code intelligence pattern.

4. **Translation system**: The README is auto-translated to 30+ languages using a custom translation pipeline. Not relevant to memory but impressive for open-source adoption.

5. **AGPL-3.0 license**: Any derivative work must also be AGPL-3.0. The `ragtime/` directory uses PolyForm Noncommercial separately. If borrowing code directly (not just patterns), licensing matters.

6. **Token usage for code mode defaults**: `totalObservationCount=50`, `fullObservationCount=5`, `sessionCount=3`. These defaults suggest that showing 50 observation titles + 5 full observations + 3 session summaries is the sweet spot for context injection.

### Schema Summary

Core tables (migration 004):
- `sdk_sessions`: Tracks SDK observer sessions (content_session_id, memory_session_id, project, status)
- `observations`: Structured observations (type, title, subtitle, facts, narrative, concepts, files_read, files_modified, prompt_number, discovery_tokens, content_hash)
- `session_summaries`: End-of-session summaries (request, investigated, learned, completed, next_steps, notes)
- `user_prompts`: Raw user prompts (for search and context)

Legacy tables (migration 001-002):
- `sessions`, `memories`, `overviews`, `diagnostics`, `transcript_events`

Search tables (migration 006):
- `observations_fts` (FTS5 virtual table on title, subtitle, narrative, text, facts, concepts)
- `session_summaries_fts` (FTS5 virtual table on request, investigated, learned, completed, next_steps, notes)
- Triggers keep FTS tables in sync with source tables

### Hooks Architecture (hooks.json)

| Hook | Trigger | Action |
|------|---------|--------|
| Setup | * | Run setup script |
| SessionStart | startup/clear/compact | Smart install + start worker + inject context |
| UserPromptSubmit | * | Initialize SDK session |
| PostToolUse | * | Send tool observation to worker |
| Stop | * | Trigger summary + session complete |

### Configuration Surface

All settings in `~/.claude-mem/settings.json`:
- `CLAUDE_MEM_MODEL`: Model for observer (default: claude-sonnet-4-20250514)
- `CLAUDE_MEM_MODE`: Active mode (default: code)
- `CLAUDE_MEM_MAX_CONCURRENT_AGENTS`: Max parallel observers (default: 2)
- `CLAUDE_MEM_CONTEXT_OBSERVATIONS`: Total observations in index (default: 50)
- `CLAUDE_MEM_CONTEXT_FULL_COUNT`: Full-detail observations (default: 5)
- `CLAUDE_MEM_CONTEXT_SESSION_COUNT`: Session summaries to show (default: 3)
- `CLAUDE_MEM_CONTEXT_OBSERVATION_TYPES`: Comma-separated types to include
- `CLAUDE_MEM_CONTEXT_OBSERVATION_CONCEPTS`: Comma-separated concepts to include
- `CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED`: Auto-generate folder CLAUDE.md files
