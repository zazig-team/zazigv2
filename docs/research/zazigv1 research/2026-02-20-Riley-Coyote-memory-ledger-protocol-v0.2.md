# Recon: Memory Ledger Protocol (MLP) v0.2
*Analyzed: 2026-02-20 | Commit: 0b48175 | Compared against: zazig, zazigv2*

## TL;DR

- MLP has two layers: a **Continuity Framework** (post-session reflection pipeline) and an **MLP storage layer** (encrypted IPFS + $POLYPHONIC token). Only the Continuity Framework matters for us.
- The reflection pipeline (classify → score → generate questions) is the exact conceptual model zazig needs for Phase 3 personality evolution. The implementation is a weekend hack — extract concepts, not code.
- Structured memory types with confidence scoring and decay rates solve a real gap in zazig's current unstructured agent memory.
- The hardest unsolved problem for zazig adoption: how to translate **semantic** observations ("founder prefers async") into **parametric** dimension deltas (+3 to autonomy).
- Zazig's architecture (Supabase, bounded dimensions, compile-time injection, audit trail) is significantly more mature. But the 9-dimensional system needs qualitative memory to avoid feeling like NPC stat sheets.

## Steal List

### 1. Memory Type Taxonomy — structured agent memory
**What:** 7 discrete memory types: fact, preference, relationship, principle, commitment, moment, skill. Each with distinct persistence characteristics and decay rates.

**Why it matters:** Zazig agent memory (`~/.zazig/agents/{role}/memory/`) is currently unstructured markdown. You can't programmatically map a markdown blob to a numeric personality shift. Structured types are the prerequisite for everything else.

**Borrowing plan:** Define a `memory_entries` table in Supabase (or a structured JSON schema for local agent memory) with these types. Use as the foundation for Phase 3 evolution signal processing. Add `zazig-specific` types if needed (e.g., `decision` for exec decision patterns).

### 2. Confidence Scoring — weight evolution signals
**What:** 4-tier confidence system: explicit (0.95-1.0, user stated), implied (0.70-0.94, strong inference), inferred (0.40-0.69, pattern), speculative (0.00-0.39, hypothesis). Every memory scored with evidence chain.

**Why it matters:** If a signal is going to alter an exec's numeric personality dimensions, confidence score is the multiplier that prevents wild swings. A directly-stated founder preference (0.98) should move dimensions more than a pattern inference (0.55). Without this, Phase 3 evolution is noisy.

**Borrowing plan:** Add `confidence_score NUMERIC(3,2)` and `confidence_level TEXT` to `personality_evolution_log`. Use confidence as a weight when computing dimension deltas. Conservative scoring by default — MLP's "when in doubt, score lower" is the right default for bounded personality evolution.

### 3. Decay Rates per Memory Type — prevent dimension saturation
**What:** Different memory types decay at different rates: facts (0.0), principles (0.0), moments (0.0), preferences (0.1), relationships (0.05), commitments (0.2), skills (0.0).

**Why it matters:** If zazig's personalities evolve in Phase 3, dimensions will eventually hit bounds unless there's regression-to-mean or decay. MLP's per-type decay rates give mathematical weights to decay dimensions back toward archetype baselines over time.

**Borrowing plan:** Add decay rates to dimension evolution calculations. Personality signals sourced from "preference" observations decay faster than those from "principle" observations. Integrate with the watchdog's reset logic.

### 4. Reflection Pipeline Pattern — post-session feedback loop
**What:** Async reflection cycle triggered after session ends: analyze conversation → extract structured memories → score confidence → generate follow-up questions → update memory.

**Why it matters:** Zazig compiles personality at dispatch time but has no post-session feedback loop. The reflection pipeline is the conceptual model for Phase 3 evolution — the session produces signals, the reflection pipeline processes them into structured evolution candidates.

**Borrowing plan:** Build a single-pass reflection worker (NOT the 3-agent pipeline — see Gemini opinion below). After session completion, pass transcript + current personality state to a structured-output call that returns: (a) classified memories, (b) confidence scores, (c) proposed dimension deltas, (d) follow-up questions. Write results to evolution log.

### 5. Question Generation — deepen founder relationship
**What:** Generate genuine curiosity questions from memory gaps, scored by priority, classified by type (gap, implication, clarification, exploration, connection), with sensitivity assessment.

**Why it matters:** Execs that ask good follow-up questions feel more like real colleagues. Currently zazig execs respond to requests but never proactively surface curiosity. This could be powerful for CPO in particular — "Last week you mentioned exploring a new market. How did the customer interviews go?"

**Borrowing plan:** Phase 3+. Add question generation to the reflection pipeline output. Surface top questions in exec greetings or standup messages. Requires trust/sensitivity calibration per founder.

### 6. Gap Protocol — honest discontinuity
**What:** Explicit rules for handling memory gaps: acknowledge discontinuity, don't fabricate continuity, maintain gap protocol rules in identity kernel.

**Why it matters:** Clean pattern for zazig session handoffs. When an exec starts a new session and doesn't have context from a prior conversation, the gap protocol tells it to say "I don't have context on that previous discussion" rather than confabulating.

**Borrowing plan:** Add to exec agent AGENT.md prompts. Simple — no infrastructure needed, just prompt guidance.

## We Do Better

- **Bounded dimensional space** — Zazig's 9 numeric dimensions (verbosity, technicality, formality, proactivity, directness, risk_tolerance, autonomy, analysis_depth, speed_bias) with archetype bounds and clamping create deterministic, auditable personality. MLP's freeform identity is harder to reason about and impossible to audit.
- **Root constraints** — Immutable safety rails separate from personality. MLP has "invariants" in the identity kernel, but they live in a mutable file the agent can theoretically access. Zazig stores them in the `roles` table, compiled server-side, never in the agent's hands.
- **Server-authoritative compilation** — Personality compiles at dispatch time on the orchestrator (Edge Function). The agent receives a prompt string, never raw config. MLP has the agent doing its own reflection — self-modification risk.
- **Multi-tenant architecture** — Company-scoped personalities. MLP is single-user, single-agent.
- **Watchdog + rate limiting** — `personality_watchdog` table tracks reset count per window. Prevents runaway evolution. MLP has no equivalent.
- **Append-only evolution log** — Full audit trail with `was_clamped`, `clamped_to`, `watchdog_action`. MLP's reflection logs are JSON files with no enforcement.
- **Sub-agent soul stripping** — Primary execs get full personality; sub-agents get values + constraints only, no voice/persona. MLP doesn't distinguish.
- **Archetype system** — Curated starting points (The Strategist, The Pragmatist, etc.) vs MLP's blank-slate identity kernel. Better onboarding experience.
- **Qualitative layers alongside numeric** — Often overlooked, but zazig's system already includes voice_notes, philosophy statements, contextual overlays, anti-patterns, productive_flaw, and domain boundaries. It's not just sliders.

## Architecture Observations

**Repo maturity:** Early-stage. Plain JavaScript, no TypeScript, no tests, no CI, no linting. The continuity framework is ~600 lines of JS. The MLP storage layer is ~800 lines. Both are working drafts with TODO comments and placeholder implementations.

**The crypto angle:** $POLYPHONIC is a Solana pump.fun token. The README pitches decentralized memory sovereignty. The actual code is local markdown files or IPFS/Pinata. The token/blockchain is aspirational infrastructure, not implemented. Irrelevant to zazig.

**Platform focus:** Built for OpenClaw (an open-source agent framework). The skills are SKILL.md files that work as prompt instructions — no runtime code in the Claude Code skill. The OpenClaw skills bundle the continuity framework as an npm package.

**Design philosophy:** MLP treats AI memory as a **relationship** problem — the agent and user build shared understanding. Zazig treats personality as a **product** problem — execs need consistent, calibrated personas for business utility. Both are valid. The relationship framing produces better reflection prompts; the product framing produces better architecture.

**The "spooky good" claim:** The poster says Vektor (their agent) started questioning identity and permanence after implementing this. This is almost certainly the reflection prompt's philosophy language being echoed back through the identity.md self-model update cycle. It's a powerful feedback loop but it's prompt engineering, not emergent consciousness. Still — the fact that reflection + structured memory + identity updates produce convincing continuity is the key insight.

## Gemini Second Opinion

**Consulted:** gemini-3.1-pro-preview via gemini-delegate

**Where Gemini agreed:**
- Concepts worth stealing, code not
- Zazig's infrastructure is stronger
- The steal list items are the right items

**Where Gemini pushed back (strong points):**
1. **Reorder the steal list** — Memory type taxonomy and decay rates should rank above the reflection pipeline. "The pipeline is just an implementation detail. The taxonomy is the conceptual foundation." **Accepted** — I reordered the steal list above based on this.
2. **Semantic → parametric translation is the hard problem** — How does "founder prefers async communication" translate to +3 autonomy? MLP doesn't solve this. Zazig Phase 3 needs a "Vector Translation Step" where the LLM proposes numeric deltas alongside classified memories. **Accepted** — this is the key insight for Phase 3 design.
3. **Single-pass over 3-agent pipeline** — With modern structured outputs, one call can classify + score + propose deltas. Chaining three Sonnet calls is slow, expensive, and a relic of pre-structured-output models. **Accepted** — build single-pass.
4. **Cross-agent memory sharing** — Because zazig has multiple execs, structured memories unlock gossip: CPO learns a founder preference, CTO gets it before their next meeting. MLP can't do this (single-agent). **Strong point** — this is a zazig-specific advantage of adopting structured memory.

**Where Gemini was wrong (my take):**
- "Zazig has a better database schema but not a better cognitive architecture" — Overstated. The personality design doc already includes voice_notes, philosophy, anti-patterns, productive_flaw, contextual_overlays, and domain_boundaries alongside numeric dimensions. It's not just 9 sliders. But the underlying concern is valid: without post-session reflection and semantic memory, the execs risk feeling like stat-sheet NPCs.

## Raw Notes

- `continuity/agents/` — Three specialized sub-agents with SOUL.md files and prompt templates. Clean pattern for defining agent specialization through markdown.
- `continuity/schemas/` — JSON Schema for memory types, confidence scoring, curiosity questions, and reflection jobs. Well-defined contracts.
- `continuity/src/orchestrator.js` — Has local fallback implementations for all three agents (basic heuristic classification, default 0.7 scoring, template questions). Smart for testing without LLM costs.
- `mlp-storage/src/relevance.js` — Intent-weighted relevance scoring for context pack compilation. Weights: recency (0.25), kind match (0.20), tag match (0.25), value alignment (0.15), risk appropriateness (0.15). Could be useful for zazig's session context selection.
- `examples/basic-identity-kernel.json` — Shows the IdentityKernel schema in practice. Values, boundaries, evolution rules, forbidden inferences, threat posture, gap protocol. The `forbidden_inferences` concept (things the agent MUST NOT infer without explicit statement) maps to zazig's root constraints.
- `mlp-storage/src/identity-kernel.js` — `addBoundary()` checks `evolution_rules.confirmation_required` before modifying. Evolution rules as a gate on identity mutation — similar concept to zazig's watchdog but at the identity level.
- The `cartouche` concept (symbolic glyph representation of identity: `⟁🜇↺🪞⚷`) is creative but has no practical utility for zazig.
- MLP's `evolution_rules.contradiction_handling` supports three strategies: `create_branch`, `require_confirmation`, `newest_wins`. Zazig currently doesn't handle contradictory evolution signals — worth thinking about for Phase 3.
- The reflection trigger is heartbeat-based (30min idle). Zazig's heartbeat system could adopt this pattern — run reflection after the heartbeat detects session completion.
