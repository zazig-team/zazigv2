# Recon: arscontexta
*Analyzed: 2026-02-20 | Commit: 2acfd5c | Compared against: zazig, zazigv2*
*Revised: 2026-02-20 — updated after cross-referencing with zazigv2's exec personality system design*

## TL;DR
- arscontexta is a Claude Code plugin with **249 interconnected research claims** forming a navigable knowledge graph ("skill graph"). Core innovation: **derivation over templating** — reasons from cognitive science principles to generate knowledge systems.
- zazigv2's **exec personality system already supersedes** arscontexta's identity/self-space pattern. The three-layer stack (root identity → archetype → evolved state) with deterministic compilation and watchdog is more sophisticated than arscontexta's mutable prose files.
- The **real steal is the knowledge layer** — arscontexta's atomic claims pattern (prose-sentence titles, description-as-retrieval-filter, topic clustering) applied to **exec domain expertise**. This is the missing piece: personality defines *who the agent is*, knowledge defines *what the agent knows*.
- The knowledge system is a **separate project** (Phase 2, after personality ships). Design sketch: `zazigv2/docs/plans/2026-02-20-exec-knowledge-system-sketch.md`
- Secondary steals: **friction logging** (broader than personality signals) and **session context injection** at dispatch time.

## What's Already Solved (by zazigv2)

Before listing what to steal, it's critical to note what zazigv2 has already built better than arscontexta:

| arscontexta Pattern | zazigv2 Equivalent | Verdict |
|---|---|---|
| `self/identity.md` — mutable prose file agent reads directly | Three-layer personality stack (root → archetype → evolved state) with deterministic compilation. Agent never sees config. | **zazigv2 is better.** Bounded numeric dimensions + watchdog > mutable prose. |
| Three-space separation (self/notes/ops) | Personality in Supabase tables, ops state in orchestrator + Trello, knowledge TBD | **Already solved differently.** The ontology maps but the implementation is database-backed, not filesystem. |
| Self-evolution via operational learning loop | Bounded auto-evolution with structured signals (clarification_requested, too_much_detail, etc.), deterministic algorithm, watchdog enforcement | **zazigv2 is better.** Signal-driven evolution with hard bounds > LLM-mediated observation capture. |
| Composable CLAUDE.md from feature blocks | `scripts/generate-context.py` generates context.md from YAML config; personality compiled from feature blocks at dispatch | **Partially solved.** zazigv2's dispatch-time compilation is the right pattern. Role manuals in zazig could still benefit from modularization. |
| Session rhythm (orient/work/persist) | Launch scripts handle orientation; personality injected at dispatch; session state managed by orchestrator | **Partially solved.** The orchestrator handles orient/dispatch. Persist (capturing session learnings) is still informal. |

## Steal List (Revised)

### 1. Exec Knowledge System — HIGH, Separate Project
**What it is:** A structured knowledge layer where each exec role has a domain of atomic claims organized by topics. The orchestrator matches card context to relevant claims and injects them alongside the personality prompt at dispatch time.

**Why it matters:** The personality system answers "how does the agent behave?" but not "what does the agent know?" A CEO with the "Fundraiser" personality still gives generic LLM advice on pitch decks unless it has internalized YC's playbook, SAFE note mechanics, and investor psychology as structured domain knowledge.

**Key patterns borrowed from arscontexta:**
- **Atomic claims with prose-sentence titles** — each claim makes one assertion, scannable without reading the body
- **Description as retrieval filter** — ~150 chars that add info beyond the title, enabling topic matching without loading full content
- **Topic clustering** — claims grouped by domain area (fundraising, pricing, architecture), matched to card annotations at dispatch
- **Source attribution** — every claim traces to its origin ("YC Startup School, Lecture 4")
- **Progressive disclosure** — orchestrator scans titles/descriptions first, loads full bodies only for matched claims

**Critical adaptation for zazigv2:**
- **Orchestrator-side injection, not agent-side traversal** — the agent receives compiled `knowledgeContext` in `StartJob`, never navigates the graph
- **Supabase storage, not filesystem** — `knowledge_claims` + `knowledge_topics` tables, indexed for dispatch-time matching
- **Founder-gated ingestion** — no autonomous knowledge publishing. Sources ingested via CLI, claims extracted by LLM, founder approves before activation
- **Token budget enforcement** — hard cap on `knowledgeContext` (default 4000 tokens), drop speculative claims and truncate bodies to stay within budget

**Full design sketch:** `zazigv2/docs/plans/2026-02-20-exec-knowledge-system-sketch.md`

**Phases:**
1. Schema + basic topic matching + starter claims (after personality ships)
2. Source ingestion pipeline + founder approval workflow
3. Semantic matching + cross-role knowledge + gap detection

### 2. Friction Logging (Beyond Personality Signals) — MEDIUM, Low Effort
**What it is:** arscontexta's observation/tension capture pattern, but scoped to operational frictions that aren't personality evolution signals.

**Why it matters:** The personality system captures `clarification_requested`, `too_much_detail`, `recommendation_overridden` — signals about agent *behavior*. But agents also discover *system* frictions: "Codex fails on complex TypeScript generics", "trello-lite times out on boards with >200 cards", "this card type always needs 3 revision rounds." These are valuable but have nowhere to go.

**Concrete borrowing plan:**
- Add `system_observations` Supabase table (or extend the existing personality evolution log)
- Schema: `role_id`, `observation`, `category` (tooling | process | quality | surprise), `card_id`, `created_at`
- Agents instructed to log frictions after significant actions (no hook needed — instruction in personality prompt)
- CPO surfaces accumulated observations in standup reports
- Founders review periodically, promote to methodology updates or Trello cards

### 3. Session Context Injection — MEDIUM, Integrates with Dispatch
**What it is:** Beyond personality and knowledge, inject a third context layer at dispatch: what the agent learned last time it worked on this project/card-type, relevant observations, and any pending maintenance signals.

**Why it matters:** Currently each card dispatch is stateless — the agent gets personality + card instructions but zero memory of previous related work. If the CTO reviewed this codebase last week and noted "the auth module has no tests", that observation is lost.

**Concrete borrowing plan:**
- Optional `sessionContext` field in `StartJob` (alongside `personalityPrompt` and future `knowledgeContext`)
- Orchestrator queries recent `system_observations` for this role + project/card-type
- Injects 3-5 most relevant observations as brief context
- Lightweight — 200-500 tokens, not a full knowledge injection

### 4. Composable Role Manuals (zazig repo) — MEDIUM, Low Risk
**What it is:** Break monolithic `manuals/{ROLE}-CLAUDE.md` files into shared blocks and role-specific blocks.

**Why it matters for zazig (not zazigv2):** The zazig repo still uses monolithic manuals for tmux-mode agents. When a shared process changes (new tool, updated Trello columns), every manual needs editing. Composable blocks fix this.

**Note:** This is less relevant for zazigv2 where personality + knowledge are compiled at dispatch time. But it improves the zazig tmux-agent experience until full zazigv2 migration.

**Concrete borrowing plan:**
- Shared blocks: `manuals/blocks/trello-rules.md`, `manuals/blocks/token-budget.md`, `manuals/blocks/tool-usage.md`
- Role-specific blocks: `manuals/blocks/cpo-methodology.md`, `manuals/blocks/cto-architecture.md`
- `scripts/generate-context.py` composes final manual from blocks based on role + instance config
- Shared blocks update once, propagate to all roles

## We Do Better

### Personality System
zazigv2's exec personality system is categorically more sophisticated than arscontexta's `self/identity.md` approach. Numeric dimensions with archetype bounds, deterministic compilation, evolution watchdog, server-side injection where the agent never sees the config, HMAC-signed prompt manifests. arscontexta lets the agent read and potentially modify its own identity file — a security vulnerability that zazigv2 solved by design.

### Multi-Agent Coordination
arscontexta is designed for a single agent operating a single knowledge system. zazig orchestrates multiple agents with different roles, shared state, and inter-agent communication via `claude-send`. arscontexta's `methodology/` directory has zero content about multi-agent patterns — no conflict resolution, no shared state management, no agent-to-agent knowledge transfer.

### Card-Driven Execution
zazig's Trello-card-to-action pipeline is operationally richer. arscontexta processes knowledge; zazig executes work. The card annotation system (complexity, card-type, token-budget) provides dispatch intelligence that arscontexta doesn't need because it only has one agent.

### Real-Time Orchestration
zazigv2's websocket-based, Supabase-backed orchestration is an entirely different tier of infrastructure. arscontexta is file-based, single-session, no real-time coordination.

### Tool Ecosystem
trello-lite, codex-delegate, gemini-delegate, deep-research, pre-merge-check — zazig has a richer operational toolchain for getting work done. arscontexta's toolchain is ripgrep + qmd (optional semantic search).

### Evolution Safety
arscontexta's self-evolution is LLM-mediated (the agent decides what to update about itself). zazigv2's evolution is signal-driven with deterministic bounds — no LLM in the evolution loop, no prompt injection vector, watchdog with freeze thresholds. This is the right architecture for production.

## Architecture Observations

### The Derivation Philosophy
arscontexta's deepest insight isn't any specific pattern — it's the philosophy of **derivation over templating**. Instead of giving every agent the same template, derive what each agent needs from first principles. This maps perfectly to zazig's multi-role architecture: CPO, CTO, CMO, VP-Eng each need fundamentally different knowledge structures derived from their role's cognitive requirements. zazigv2's archetype system already embodies this for personality. The knowledge system should follow the same principle — derive knowledge packs from role requirements, not ship the same generic pack to everyone.

### Progressive Disclosure for Token Efficiency
The YAML `description` field + topic hierarchy enables scanning without loading full content. This is critical for the orchestrator's topic matching at dispatch time — match against titles and descriptions (cheap), only load full claim bodies for confirmed matches (expensive). In a multi-agent system, every unnecessary token is multiplied across concurrent agents.

### Hooks > Instructions
arscontexta's strongest operational claim: deterministic hook enforcement beats instruction compliance because "instruction compliance degrades as context fills." zazig already uses hooks (vpe-keepalive, pre-pr-gate). The friction logging pattern could be hook-enforced, but instruction-based is fine for v1 since friction capture isn't safety-critical.

### The Impedance Mismatch
arscontexta is designed for slow, deep knowledge work (a single agent tending a knowledge garden). zazig is designed for fast, card-driven execution (multiple agents processing a Trello backlog). Every pattern borrowed from arscontexta must be adapted for this difference: orchestrator-side injection not agent-side traversal, database storage not filesystem, founder-gated changes not autonomous evolution, token-budgeted injection not unbounded graph loading.

## Gemini Second Opinion

**Model consulted:** gemini-3.1-pro-preview

**Key points of agreement:**
- Three-Space Architecture should be prioritised over Skill Graph (I originally had Skill Graph #1)
- Composable CLAUDE.md generation is high-impact, low-risk
- The patterns are highly valuable but need adaptation for multi-agent context

**Key points of disagreement / additions:**
- **The Traversal Tax:** Gemini correctly identified that manual graph traversal in a multi-agent execution context creates massive latency and token burn. Agents should receive assembled knowledge, not navigate graphs. I agree — this changes the implementation significantly.
- **Concurrency and Lock Contention:** Shared file-based `ops/` and `notes/` spaces will get race conditions with concurrent agents. Shared state must be database-backed (Supabase). I agree — this is critical for zazigv2.
- **Subagent Sprawl Risk:** arscontexta's "fresh context per phase" pattern (subagent per pipeline step) would compound with zazig's existing multi-agent orchestration. Rate limits and API costs could spiral. Valid concern — the fresh-context pattern should be used selectively, not universally.
- **Guard-Railed Self-Evolution:** Gemini recommends friction logging to a central store with human review, not autonomous prompt editing. I agree — this is the safer path for a multi-agent system where prompt drift could cascade.

**Post-revision note:** After cross-referencing with the personality system design, Three-Space Architecture dropped from #1 because zazigv2 already solves the state separation problem differently (Supabase tables, not filesystem spaces). The real gap is the knowledge layer — which arscontexta's atomic claims pattern directly addresses.

## Raw Notes

### arscontexta Repo Statistics
- 249 research claims in `methodology/` (~3MB of interconnected markdown)
- 10 plugin-level skills (setup, help, tutorial, ask, health, recommend, architect, reseed, upgrade, add-domain)
- 16 generated command templates in `skill-sources/`
- 17 composable feature blocks in `generators/features/`
- 4 hooks (session-orient, write-validate, auto-commit, vaultguard)
- 3 presets (research, personal, experimental)
- 15 kernel primitives in `reference/kernel.yaml`

### Notable Research Claims (titles that are directly relevant to zazig)
- "fresh context per task preserves quality better than chaining phases"
- "hook enforcement guarantees quality while instruction enforcement merely suggests it"
- "stigmergy coordinates agents through environmental traces without direct communication"
- "context files function as agent operating systems through self-referential self-extension"
- "LLM attention degrades as context fills"
- "operational memory and knowledge memory serve different functions in agent architecture"
- "federated wiki pattern enables multi-agent divergence as feature not bug"
- "agent self-memory should be architecturally separate from user knowledge systems"

### Things to Dig Into Later
- The `federated wiki pattern` claim — directly relevant to multi-agent knowledge sharing
- The `stigmergy` claim — coordination through environmental traces (file system artifacts) rather than direct messaging — this is how zazig agents already coordinate via Trello cards
- The `ralph` skill — queue-based orchestration with fresh context per phase — closest to zazig's card-driven dispatch
- qmd (semantic search tool) — potential integration with zazigv2's knowledge layer for Phase 3 semantic matching
- The setup skill's derivation engine (76KB SKILL.md) — the most sophisticated skill file in the repo, worth studying for how to build complex skills
- arscontexta's source ingestion pipeline (`/reduce` skill) — directly informs the knowledge ingestion design in the exec knowledge system sketch
