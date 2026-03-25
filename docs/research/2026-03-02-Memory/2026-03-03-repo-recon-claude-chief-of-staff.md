# Recon: claude-chief-of-staff
*Analyzed: 2026-03-03 | Commit: 2a10609 | Compared against: zazigv2*

## TL;DR

- **Not a memory system in the traditional sense** -- there is no database, no embeddings, no decay, no scoring. Memory here is entirely file-based: YAML configs + markdown contact files read fresh each session.
- **The "memory" is the CLAUDE.md itself** -- a 500-line hand-curated operating manual that serves as permanent identity memory, loaded into every context window. This is the simplest possible memory architecture: the user IS the memory manager.
- **Contact files are the closest thing to entity memory** -- one markdown file per person in `~/.claude/contacts/`, updated by the `/enrich` skill via MCP channel scans. Interaction history is a timestamped table. Staleness is computed by tier cadence thresholds (14/30/60 days).
- **Goals and tasks are "priority memory"** -- `goals.yaml` and `my-tasks.yaml` are read at session start and referenced during triage/scheduling decisions. This is goal-aligned retrieval without any retrieval infrastructure -- just file reads.
- **The correction loop is the learning mechanism** -- no automated memory writes. When Claude gets something wrong, the user manually edits CLAUDE.md. This is the anti-pattern to automated memory but arguably the most reliable one at this stage of AI.

---

## Steal List

Ranked by impact for Zazig's memory system design.

### 1. Contact Files as Structured Entity Memory
**What it is:** Each contact is a standalone markdown file with a fixed schema: Quick Reference table, Relationship Context, Communication Style, Personal Notes, Interaction History (date/type/summary table), Talking Points, and Last Interaction with follow-up flags.

**Why it matters:** This is entity memory done simply. The schema is small enough to fit in context, structured enough to query, and human-readable enough to audit. The `/enrich` skill scans MCP channels and appends to the interaction history -- this is effectively a write-pipeline for entity memory, just without a database.

**Borrowing plan for Zazig:** Our `memory_chunks` table already exists. We could adopt the contact-file schema as a template for entity-type memory chunks -- especially the "Talking Points for Next Interaction" pattern (forward-looking memory, not just backward-looking). The tiered staleness model (14/30/60 days based on importance tier) is a simple decay proxy worth borrowing.

### 2. Goal-Aligned Retrieval Without Infrastructure
**What it is:** `goals.yaml` defines 3-5 quarterly objectives with key results and progress scores (0.0-1.0). Every triage decision, scheduling proposal, and task prioritization is filtered through this file. Claude actively pushes back when calendar drift happens.

**Why it matters:** This is what "memory with purpose" looks like. Most memory systems store everything and retrieve by similarity. This one has a tiny, hand-curated priority file that acts as a permanent filter on all decisions. It is the opposite of "store everything, retrieve what's relevant" -- it is "store only what matters, apply it to everything."

**Borrowing plan for Zazig:** Our CPO already has doctrines (proactively injected beliefs). We could formalize a `goals.yaml` equivalent as a first-class object in the CPO's context -- a small, curated priority set that gates all feature/job decisions. Not a memory query, but a permanent steering vector.

### 3. Tiered Staleness / Decay-by-Importance
**What it is:** Contacts are assigned tiers (1/2/3). Each tier has a cadence threshold. `/enrich stale` computes which contacts have exceeded their threshold and surfaces them with suggested touchpoints.

**Why it matters:** This is a manual decay function. Instead of a half-life formula applied uniformly, decay is modulated by relationship importance. Tier 1 contacts decay fast (14 days), Tier 3 decay slow (60 days). This is conceptually similar to the weighted-category decay from the @Unisone research (corrections at 1.5x, decisions at 1.3x), but applied to entities rather than memory types.

**Borrowing plan for Zazig:** Apply tiered decay to memory chunks. Not all memories should decay at the same rate. Corrections should persist longer than context. Doctrines should never decay. Task context should decay fast after job completion. The tier model gives us a simple way to express this without complex math.

### 4. The Correction Loop as Memory Write Pipeline
**What it is:** When Claude drafts something that does not sound right, the user corrects it. Then the user asks Claude "How should I update CLAUDE.md to prevent this?" Claude proposes a specific edit. The user applies it. Over 2-3 weeks, the system converges on the user's voice and preferences.

**Why it matters:** This is the only memory write mechanism in the entire system, and it is 100% human-supervised. No automated memory writes. No embedding pipeline. No dedup. The insight is that at this stage, human curation produces higher-quality memory than any automated system. The cost is human time; the benefit is zero garbage accumulation.

**Borrowing plan for Zazig:** Our napkin.md pattern already does this for codebase corrections. The chief-of-staff approach validates the pattern and suggests we should be more aggressive about it -- every correction should flow into a structured corrections table, not just freeform notes. The "ask the agent to propose the edit" step is worth formalizing as a skill.

### 5. Session-Start Memory Injection Pattern
**What it is:** At the start of every substantive session, Claude silently reads `my-tasks.yaml` and surfaces anything critical (overdue, due today, at risk). The morning briefing (`/gm`) reads goals, tasks, calendar, and inbox in sequence.

**Why it matters:** This is a retrieval pattern -- what to pull into context at session start. It is ordered by urgency, not recency or similarity. The briefing skill defines a fixed retrieval sequence (calendar -> tasks -> goals -> inbox -> synthesis), which is a manual retrieval pipeline.

**Borrowing plan for Zazig:** CPO already loads routing prompt + stage skills. We could formalize "session start injection" as a first-class concept: what memories get loaded before any agent starts work? For CPO: active features, blocked jobs, recent corrections. For contractors: job spec + relevant memory chunks. The chief-of-staff shows that a fixed, ordered injection sequence beats open-ended retrieval for reliability.

---

## We Do Better

### 1. Multi-Agent Memory Sharing
The chief-of-staff is single-user, single-agent. All memory is local files read by one Claude instance. Zazig has `memory_chunks` in Supabase, scoped by company/project, accessible by any agent. We already have the infrastructure for cross-agent memory that this system completely lacks.

### 2. Structured State Management
The chief-of-staff uses flat YAML files with no schema enforcement, no migrations, no versioning beyond git. Zazig has typed Postgres tables with migrations, constraints, and role-scoped access. Our state management is orders of magnitude more robust.

### 3. Automated Write Pipelines
The chief-of-staff requires the user to manually edit every memory artifact. Zazig agents already write to the database autonomously (job progress, events, heartbeats). We can build automated memory writes with quality controls (dedup, conflict resolution) that this system cannot.

### 4. Role-Scoped Memory
The chief-of-staff has one monolithic CLAUDE.md. Zazig's architecture already separates memory by role -- CPO doctrines vs. contractor job specs vs. machine state. We do not conflate identity memory with task memory with entity memory.

### 5. Temporal State Tracking
The chief-of-staff tracks progress as a single float (0.0-1.0) on goals. Zazig has a full pipeline state machine (created -> breakdown -> building -> verifying -> complete) with event logs. Our temporal tracking is far more granular.

---

## Architecture Observations

### Memory Model: "The User is the Database"
This is fundamentally a human-in-the-loop memory system. The user curates CLAUDE.md (identity memory), creates contact files (entity memory), updates goals.yaml (priority memory), and maintains my-tasks.yaml (task memory). Claude reads these files but never writes to them autonomously.

The philosophical position is clear: at this stage of AI, human curation produces better memory than automated pipelines. The tradeoff is human time for memory quality. For a CEO with one AI assistant, this tradeoff works. For a multi-agent system like Zazig with ephemeral contractors, it does not.

### Memory Categories (Implicit)
The system implicitly defines five memory categories, though it never names them:

| Category | Storage | Write Pipeline | Read Pipeline | Decay |
|----------|---------|---------------|---------------|-------|
| **Identity** | CLAUDE.md | User edits | Session start (always loaded) | Never (manually pruned) |
| **Entity** | contacts/*.md | `/enrich` skill via MCP scans | On-demand (meeting prep, triage) | Tiered staleness alerts |
| **Priority** | goals.yaml | User edits quarterly | Session start + triage filter | Quarterly manual review |
| **Task** | my-tasks.yaml | `/my-tasks add` | Session start (overdue check) | Completion / manual delete |
| **Style** | CLAUDE.md Part 4 | Correction loop | Every draft operation | Never (accumulated) |

This is a clean taxonomy. It maps surprisingly well to the @jumperz Phase 1 memory stack (write pipeline, read pipeline, decay, session flush, behavior loop), just implemented with files instead of databases.

### The Enrichment Pattern
The `/enrich` skill is the most interesting memory mechanism. It scans all connected MCP channels (email, Slack, WhatsApp, calendar), matches interactions to existing contact files, updates interaction history with timestamps, and suggests creating new contact files when unknown important contacts appear.

This is a multi-source ingestion pipeline for entity memory. The sources are external services (via MCP), the processing is Claude's judgment (tier assignment, importance assessment), and the storage is append-only markdown tables. The "detect new important contacts" feature is effectively entity discovery -- a pattern worth borrowing.

### What is Missing
- **No embedding or similarity search** -- retrieval is by filename, not by semantic content
- **No cross-session continuity** -- each session starts fresh from files, with no memory of what happened in previous sessions beyond what the user manually recorded
- **No conflict resolution** -- if two sessions update a contact file concurrently, last write wins
- **No memory budget** -- CLAUDE.md can grow unbounded, eventually exceeding context limits
- **No automated quality control** -- no dedup, no contradiction detection, no garbage collection

---

## Second Opinion

*Note: The `/second-opinion` skill was not available in this session. The following is a self-critical review of the analysis above.*

**Where the analysis is strongest:** The implicit memory taxonomy (identity/entity/priority/task/style) is the most useful extraction. It maps cleanly to what Zazig needs and what the broader memory research supports.

**Where the analysis might overstate value:** The "steal list" ranks the correction loop highly, but Zazig already has napkin.md doing exactly this. The chief-of-staff version is not meaningfully different -- just a different name for the same pattern.

**What might be missed:** The `schedules.yaml` automation pattern (cron-triggered Claude sessions with specific skills) is a lightweight version of our orchestrator's job dispatch. The idea that memory maintenance should be a scheduled background job (enrichment every 15 minutes, staleness checks weekly) is worth noting -- our orchestrator could schedule memory maintenance as a recurring contractor job.

**Counter-argument on "user as database":** The analysis frames human curation as a strength. But the chief-of-staff's author is a CEO with one AI assistant. The bottleneck (human editing time) is acceptable because there is only one agent and one user. For Zazig's multi-agent system, this pattern would collapse -- you cannot ask a human to manually curate memory for 5+ concurrent agents. Automated memory writes are not optional for us; they are structural.

**What the community research says differently:** The @jumperz Phase 1-2-3 memory stack, the @Unisone weighted decay categories, and the semantic memory systems (claude-code-semantic-memory, claude-mem) all invest heavily in automated write pipelines and retrieval infrastructure. The chief-of-staff deliberately avoids all of this. The question for Zazig is: do we start simple (chief-of-staff style) and add complexity, or build the infrastructure from Phase 1? Given our multi-agent architecture, the answer is infrastructure from Phase 1.

---

## Raw Notes

### File Sizes (indicator of complexity)
- CLAUDE.md: 17KB (528 lines) -- the entire "brain"
- commands/enrich.md: 5KB -- contact enrichment skill
- commands/triage.md: 4.1KB -- inbox triage skill
- commands/gm.md: 2.8KB -- morning briefing skill
- commands/my-tasks.md: 4.1KB -- task management skill
- goals.yaml: 1.8KB -- quarterly objectives template
- my-tasks.yaml: 1.0KB -- task tracking template
- contacts/example-contact.md: 1.9KB -- contact file template

### No Code
This repo contains zero executable code. No TypeScript, no Python, no package.json. It is entirely markdown and YAML templates. The "system" is Claude Code itself -- the repo is just configuration.

### Install Script
The `install.sh` copies files to `~/.claude/` and does sed replacements on placeholders. It creates `contacts/`, `commands/`, `objectives/`, and `task-outputs/` directories. This is the entire "infrastructure."

### MCP as Memory Source
The system depends heavily on MCP servers (Gmail, Google Calendar, Slack, WhatsApp, iMessage, Granola, PostHog) as external memory sources. Claude does not store email content -- it queries MCP at triage time. This is "memory by reference" rather than "memory by copy." The advantage is zero storage, always fresh data. The disadvantage is every session pays the MCP query cost.

### Operating Modes as Context Switches
The 6 operating modes (Prioritize, Decide, Draft, Coach, Synthesize, Explore) are interesting as a memory retrieval strategy. Different modes would benefit from different memory subsets. "Draft" mode needs style memory. "Decide" mode needs priority memory. "Coach" mode needs entity memory. The system does not formalize this, but the implicit mapping is there.

### "Context Discipline" Section
Part 7G of CLAUDE.md includes explicit instructions to minimize context bloat: "Don't speculatively query services", "One targeted query > multiple exploratory queries", "Summarize results -- don't dump raw output". This is manual context budget management. For Zazig, this should be automated -- agents should have token budgets and the orchestrator should enforce them.

### The "System Improvement Protocol"
Part 9 defines how the system evolves: Claude proposes changes (10 lines or fewer), the user approves and applies. Small, frequent improvements over large rewrites. This is the evolutionary memory model -- memory quality improves incrementally through use, not through bulk import or training.

### Relationship to Other Recon'd Systems
| System | Memory Model | Storage | Automation |
|--------|-------------|---------|------------|
| chief-of-staff | Human-curated files | Markdown + YAML | None (manual only) |
| claude-mem | Automated DB writes | SQLite + embeddings | Full (hooks + search) |
| claude-code-semantic-memory | Automated chunked writes | Vector DB | Full (pre-tool-use hooks) |
| memory-ledger-protocol | Structured ledger entries | JSON files | Semi (agent writes, human reviews) |
| Zazig (current) | DB + napkin.md | Supabase + markdown | Partial (DB writes, manual napkin) |

The chief-of-staff sits at the simplest end of this spectrum. Its value is in demonstrating that the memory taxonomy (identity/entity/priority/task/style) is sound even without infrastructure, and that human curation remains a valid quality control mechanism.
