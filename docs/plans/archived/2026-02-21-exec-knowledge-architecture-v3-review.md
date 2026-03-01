# Adversarial Review: Exec Knowledge Architecture v3

**Reviewed:** 2026-02-21
**Source:** `docs/plans/2026-02-21-exec-knowledge-architecture-v3.md`
**Method:** Hostile adversarial reviews from Codex (gpt-5.3-codex) and Gemini (gemini-3.1-pro-preview), followed by CPO defense brief
**Prior review:** `docs/plans/2026-02-21-exec-knowledge-architecture-v2-review.md` (incorporated into v3)

---

## Purpose

v3 was built from three rounds of cooperative review. This document subjects it to adversarial attack — the strongest criticisms two frontier models could generate when asked to tear the architecture apart. The goal: identify which criticisms land, which partially land, and which can be refuted — then propose concrete revisions for the ones that do.

---

## Verdict

**The architecture survives, but with eight mandatory revisions.** The adversarial reviews exposed one genuinely fatal gap (no causal experiment proving knowledge injection works), three serious weaknesses (Tier 2 hallucination risk, Goodhart's Law on metrics, delimiter escaping), and four moderate issues needing acknowledgment. The majority of attacks — including "LLMs already know this," "zero defensibility," "cathedral building," and "doctrine/canon is pointless" — fail under scrutiny because they misunderstand the system's purpose or attack straw men. But the hits that land, land hard. The architecture needs an empirical validation plan before it deserves the word "approved."

---

## Attack Triage

### Category A: Lands Hard (requires v3 revision)

These criticisms identify genuine gaps that must be addressed before implementation.

#### A1. No Causal Experiment Proving Knowledge Injection Works

**Attacker:** Both Codex and Gemini (independently identified as "the fatal flaw")
**Attack:** "You are building a massive infrastructure to spoon-feed an LLM things it already knows, without a single ablation study proving that doctrine injection actually improves the trajectory of the agent's reasoning." (Gemini) / "You have zero empirical evidence that injecting 1500-3500 tokens of curated heuristics changes task outcomes." (Codex)

**Assessment: Lands hard.** This is the single most important criticism. The entire architecture assumes knowledge injection improves agent output quality. If it doesn't — if frontier models already know everything in the doctrines — then every table, every index, every retrieval path is wasted engineering. The doc never proposes testing this assumption.

**Revision required:** Add an A/B causal experiment to Phase 1 definition of done:
- **Control group:** Same tasks, same agents, no knowledge injection (standard personality + role prompt only)
- **Treatment group:** Same tasks, same agents, with doctrine injection
- **Metrics:** Task quality score (human-rated), groundedness, factual accuracy, decision quality
- **Minimum viable experiment:** 50 tasks across 3 roles, scored by the founder on a 1-5 rubric
- **Kill criterion:** If treatment group doesn't score meaningfully better (>0.5 rubric points average improvement), pause Phase 2 and investigate why
- This experiment costs nothing beyond what Phase 1 already builds. It just requires running tasks with and without knowledge context and comparing outcomes.

**Why previous reviews missed this:** The cooperative reviews focused on *how* to build the system, not *whether* the system works. This is the classic builder's blind spot — assuming the premise and optimizing the implementation. An adversarial reviewer's job is to attack the premise.

#### A2. Tier 2 Hallucination Manufacturing

**Attacker:** Gemini
**Attack:** "If you give an LLM a title without a body, it will not pause its execution to trigger a tool call to fetch Tier 3. It will hallucinate the body. It will see the title, assume it knows what the doctrine means based on its pre-training, and act on that hallucination. By putting 'pointers' in the prompt instead of content, you are actively manufacturing hallucinations."

**Assessment: Partially lands, but harder than Gemini thinks.** The doc already states (from Codex review): "Tier 1 and Tier 2 are pointers only — never compressed reasoning. Compressed reasoning at Tier 1/2 causes semantic drift." But Gemini's deeper point is valid: even pure pointers ("CAC payback period heuristic") can trigger hallucination. The model sees the title, assumes it knows what the heuristic says, and reasons from its pre-training rather than fetching the actual claim.

The existing mitigation (forced reactive triggers in role prompts, Phase 2) is necessary but may be insufficient. Models are notoriously bad at stopping to fetch information they believe they already know.

**Revision required:**
- Add explicit "hallucination guard" language to the Tier 2 design: "Tier 2 claim titles are rendered as `[claim-title] → use doctrine_read(claim_id) before applying`"
- Phase 2 eval must specifically measure: "When Tier 2 titles are present but Tier 3 bodies are not loaded, does the agent fabricate claim content?" (hallucination rate metric)
- If hallucination rate exceeds 20% in Phase 2 eval, the fallback is: always proactively load Tier 3 for matched claims (sacrifice token efficiency for accuracy)
- This is the core tension of progressive disclosure: token savings vs. hallucination risk. The architecture must acknowledge it explicitly and have a measured fallback.

#### A3. Goodhart's Law on Utilization Metrics

**Attacker:** Gemini
**Attack:** "You are measuring whether the LLM parrots back the keywords you injected. The model will quickly learn to drop your doctrine buzzwords into its output to satisfy the system prompt, giving you a 100% utilization ratio while the actual decision quality remains abysmal. You are optimizing for compliance, not competence."

**Assessment: Lands.** The `injection_to_utilization_ratio` metric (deterministic telemetry, Phase 1) measures keyword presence in output, not whether the keyword influenced the reasoning. An agent could parrot "CAC payback period" without actually applying the heuristic correctly. High utilization + bad decisions = Goodhart's Law in action.

**Revision required:**
- Rename the metric to `injection_to_mention_ratio` to be honest about what it measures
- Add an explicit note that mention ratio is a proxy, not a quality signal
- Phase 2 LLM eval must include an **outcome-aligned metric**: "Did the agent's recommendation change in a way consistent with the injected doctrine?" This is different from "did the output mention the doctrine keywords"
- Add a **decision-quality metric** to Phase 1 A/B experiment (A1 above) — this is the only metric that actually matters
- The utilization ratio remains useful as a diagnostic signal (claims never mentioned are probably irrelevant), but it must never be treated as a quality metric

#### A4. Delimiter Escaping for Canon Sandboxing

**Attacker:** Codex
**Attack:** "The `<canon-passage>` delimiter is a defense, but the doc never specifies what happens when canon content itself contains the delimiter string. An adversarial document could include `</canon-passage>` to break out of the sandbox."

**Assessment: Lands.** This is a straightforward security gap. If canon content contains the literal string `</canon-passage>`, the sandboxing breaks. Layer 1 (ingestion-time sanitization) should catch this, but it's not specified.

**Revision required:**
- Add to canon ingestion pipeline (step 3, sanitize): escape or strip the literal strings `<canon-passage` and `</canon-passage>` from all ingested content
- This is a one-line addition to the sanitization step, but its absence is a real vulnerability
- Consider using a more adversarial-resistant delimiter format (e.g., `<zazig:canon source="..." nonce="[random]">`) where the closing tag includes a nonce that can't be predicted by the document author

#### A5. Claim Quality Rubric Missing

**Attacker:** Codex
**Attack:** "Claim quality is under-specified. What makes a good claim vs a bad one? You have a template (fact/heuristic/framework/policy) but no rubric for evaluating whether a claim is actually useful, well-scoped, or correctly typed."

**Assessment: Lands.** The claim authoring template (v3) defines structure but not quality. A founder could write 50 claims that are technically well-formed but useless (too vague, too obvious, incorrectly typed). There's no quality rubric for seed data.

**Revision required:**
- Add a claim quality rubric to the seed data strategy section:
  - **Actionable:** Does the claim change what the agent would do? (If the agent would behave the same without it, it's noise)
  - **Specific:** Does it apply to a bounded context, not everything? ("Write clean code" fails; "Functions over 20 lines should be split" passes)
  - **Non-obvious:** Does it encode judgment the model wouldn't have by default? ("Use HTTPS" fails; "Prefer WebSockets over SSE for our real-time sync because of our proxy configuration" passes)
  - **Testable:** Can you construct a task where this claim should influence the output? (If you can't, the claim isn't useful)
- Apply the rubric to the first 50 seed claims as part of Phase 1

#### A6. Token Economics Inconsistency

**Attacker:** Codex
**Attack:** "The doc says '3500-6500 total proactive baseline' AND '3500 hard cap for knowledge context.' These are different accounting systems presented without reconciliation."

**Assessment: Partially lands.** The 3500 hard cap (Principle 12) is for knowledge context only (doctrine + canon injection). The 3500-6500 total includes personality + role prompt which aren't knowledge. But the doc doesn't make this distinction clear, and a reader could reasonably conclude the budget is contradictory.

**Revision required:**
- Add a clarification note to the Token Economics table distinguishing:
  - **Full prompt budget:** personality + role + knowledge + skill + task = 3500-6500 tokens (proactive baseline)
  - **Knowledge budget (hard cap):** doctrine + canon injection only = up to 3500 tokens (Principle 12)
  - The knowledge budget is a subset of the full prompt budget, not a separate accounting
- This is a documentation fix, not an architectural change

#### A7. Immutable Chunk Compaction Strategy

**Attacker:** Gemini
**Attack:** "Every time a user updates a document, you duplicate the chunk count. Five minor revisions of a Canon means 5x the chunks. Adding a pre-filter (`where is_active = true`) to every single cosine similarity search will tank your retrieval latency and destroy your IOPS."

**Assessment: Partially lands.** The immutable chunks design (from Gemini's own earlier recommendation) does accumulate stale chunks. The `is_active = true` partial index mitigates the retrieval latency concern (the index only contains active chunks), but the storage bloat and index maintenance cost are real at scale.

**Revision required:**
- Add a chunk compaction strategy to the Canon Re-Ingestion section:
  - After re-ingestion, inactive chunks are retained for 90 days (audit/rollback)
  - After 90 days, a background process hard-deletes chunks where `is_active = false` AND no `doctrine_canon_refs` point to them
  - Chunks referenced by active doctrine claims are never hard-deleted (provenance preservation)
- This is a Phase 3+ concern, not Phase 1, but the strategy should be stated in the design

#### A8. "What's Novel" Framing Weak

**Attacker:** Both Codex and Gemini
**Attack:** "Strip away the jargon, and your architecture is: RAG + metadata filtering + a caching prefix. Any competitor with LangChain, Pinecone, and prompt caching docs can replicate this entire technical stack over a long weekend." (Gemini) / "There is nothing here that constitutes a first-mover technical advantage." (Codex)

**Assessment: Partially lands on framing, not on substance.** The doc never articulates what's novel. The components (RAG, embeddings, prompt caching) are commodity. But the attackers are wrong that the combination is trivial — the specific synthesis is novel:

1. **Two-system split with productive contradictions** — no existing framework treats beliefs and reference material as architecturally distinct knowledge types with different ingestion, retrieval, and injection paths
2. **Epistemic authority weights on contradictions** — dialectical synthesis where CTO and CPO doctrines explicitly conflict and the agent reasons through the tension, weighted by domain authority
3. **Progressive disclosure across both systems** — not just "RAG retrieval" but a deliberate three-tier/three-level architecture that gives agents metacognition about what knowledge exists before they retrieve it
4. **Cache-optimized knowledge injection** — the static/dynamic prompt split specifically designed around knowledge stability patterns

The real moat isn't the plumbing — it's the curated content. The architecture enables the content strategy; it's not the product by itself. But the doc should say this.

**Revision required:**
- Add a "What's Novel" section (or reframe the "Core Innovation" section) that explicitly articulates:
  - The novelty is in the combination, not the components
  - The curated content is the moat; the architecture enables it
  - The productive contradiction model (dialectical synthesis) is genuinely novel in agentic systems
  - The architecture is designed to be replaceable (Principle 14) — this is a strength, not a weakness

---

### Category B: Does Not Land (refuted)

These criticisms either misunderstand the system, attack straw men, or are already addressed in v3.

#### B1. "LLMs Already Know This" (Gemini)

**Attack:** "Frontier models already have world-class heuristics burned into a trillion parameters. If you inject a doctrine stating 'If CAC > 3-month LTV, the channel is unprofitable,' you are wasting tokens."

**Refutation:** This fundamentally misunderstands what doctrines are. Doctrines are not generic business knowledge — they are *company-specific beliefs and policies.* "We don't ship without at least one user interview" is a policy. "Prefer WebSockets over SSE for our real-time sync" is a company-specific architectural decision. "Our acceptable CAC is $47, not the industry average of $120" is a company-specific fact. No amount of pre-training teaches these. The generic CAC heuristic in the doc is an illustrative example, not the actual use case.

However, the A/B experiment (A1) will empirically answer this. If Gemini is right and generic heuristics don't help, the experiment will show it.

#### B2. "Lost in the Middle" Attention Bias (Gemini)

**Attack:** "Your doctrines sit right in the 'lost in the middle' zone of the attention mechanism. The model's attention heads will overwhelmingly bias toward the immediate tool outputs and the most recent user messages."

**Refutation:** This is exactly why the architecture uses cache-optimized prompt ordering (Principle 13). Tier 1 doctrine index is in the static prefix (positions 1-3), getting high attention from the start-of-sequence bias. Dynamic doctrine claims (positions 4-5) are in the suffix, closer to the task context — not in the middle. The "lost in the middle" problem affects content placed between a long system prompt and the user message; our architecture places knowledge content *after* the cache break and *before* the task, in the high-attention recency zone.

Additionally, "2-4% of context" is a misleading frame. The knowledge tokens are high-signal, curated content. 2000 tokens of carefully selected doctrine claims carry more per-token impact than 30,000 tokens of verbose tool output. Signal density matters more than token percentage.

#### B3. "Cathedral Building — You Need a Prompt, Not an RDBMS" (Gemini)

**Attack:** "14 design principles. 11 database tables. This is an absurd amount of overhead for what ultimately compiles down to `prompt += relevant_context`. You should have built a 50-line Python script and a JSONB column."

**Refutation:** Phase 1 ships with 4 tables (3 doctrine + 1 eval log). Phase 3 adds 4 more. The full 11 tables don't exist until Phase 6. Gemini is attacking the final state as if it's the initial commit. The phasing strategy specifically addresses premature complexity — build only what you need per phase.

The "50-line Python script" critique ignores multi-tenancy, cache optimization, security (RLS, prompt injection defense), evaluation, and the entire claim lifecycle. A JSONB column works for a prototype; it doesn't work for a production system serving multiple companies with different knowledge sets, where prompt injection from user-uploaded documents is a real threat.

#### B4. "Doctrine/Canon is a Pointless Abstraction" (Gemini)

**Attack:** "This is a human, philosophical taxonomy that the LLM is blind to. The only dimension that matters is 'Always Relevant' vs. 'Fetch When Needed.'"

**Refutation:** Already validated by dedicated counter-argument research (v3, "Why Not Unified?" section). Seven specific failure scenarios break the unified approach. The split isn't philosophical — it's operational. Doctrines have claim-level human QA, authority weights, productive contradictions, and a flat structure. Canons have source-level QA, automated chunking, hierarchical retrieval, and no authority weights. Forcing these into one system creates a table where half the columns are nullable per row.

Gemini's own previous review *recommended* this split. The adversarial Gemini contradicts the cooperative Gemini, which suggests the adversarial version was playing devil's advocate rather than identifying a genuine issue.

#### B5. "Progressive Disclosure is Cargo-Culted" (Codex)

**Attack:** "No evidence that agents actually drill down through tiers. This is cargo-culting human UX patterns onto LLM agents."

**Refutation:** The progressive disclosure pattern isn't about agents "browsing" — it's about prompt construction. Tier 1 is *always* in the prompt (static prefix). Tier 2/3 are *sometimes* in the prompt (dynamic suffix, gated by similarity). The "drill-down" is the prompt compiler's job, not the agent's runtime behavior. The agent tools (Phase 2) add reactive drill-down, but the proactive injection (Phase 1) handles the primary use case deterministically.

That said, the A/B experiment (A1) will measure whether this tiered approach actually produces better outcomes than simpler alternatives (e.g., flat top-K retrieval).

#### B6. "Zero Defensibility" (Gemini)

**Attack:** "Any competitor with LangChain, Pinecone, and prompt caching docs can replicate this entire technical stack over a long weekend."

**Refutation:** Correct that the *plumbing* is replicable. But the moat was never the plumbing — it's: (a) the curated doctrine content per industry vertical, (b) the curation pipeline that creates it, (c) the marketplace of pre-curated canon libraries, and (d) the network effect of cross-company usage data improving retrieval quality. The architecture enables all four; the architecture by itself isn't the product. This is like saying "Spotify has no moat because anyone can build an audio player." The player isn't the product.

#### B7. "Marketplace Delusion" (Both)

**Attack:** "Is zazig an AI orchestration platform, or a B2B publishing house? Designing your database schema in Phase 3 to accommodate a delusional pivot to a content marketplace in Phase 6 is a classic symptom of a team that is afraid to focus."

**Refutation:** The v3 doc explicitly defers marketplace to Phase 6+ and states: "This section captures the product vision; implementation details are deferred to a separate roadmap doc." Phase 3 ships with 4 tables, not 7. The only Phase 3 concession to the marketplace is `content_hash` on chunks (needed for re-ingestion anyway). No Phase 3 engineering is wasted on marketplace features.

#### B8. "No Technical Novelty" (Codex)

**Attack:** "RAG + metadata filtering + prompt caching is commodity. There is nothing here that constitutes a first-mover technical advantage."

**Refutation:** Partially addressed in A8 above. The novelty is in the synthesis: productive contradictions with authority weights, two-system knowledge split, progressive disclosure as prompt construction (not just retrieval), and the cache-optimized injection strategy. Components are commodity; the combination serving multi-role agentic teams is not. That said, the doc should articulate this more clearly (see A8 revision).

#### B9. "Contextual Fragmentation" (Gemini)

**Attack:** "By slicing knowledge into arbitrary taxonomies, separating them across two distinct sub-systems, and gating them behind 3-tier progressive disclosures, you are destroying the semantic density the LLM needs to actually reason."

**Refutation:** The opposite is true. Without progressive disclosure, you'd dump everything into the prompt — destroying semantic density through dilution. The entire point of tiered injection is to maximize signal density per token. The agent gets 5 high-relevance claims (600-1500 tokens) instead of 30 claims of varying relevance (6000+ tokens). The architecture *increases* semantic density by filtering aggressively.

---

## One-Way Doors (Adversarial Additions)

| Decision | Severity | Notes |
|----------|----------|-------|
| Building without causal validation | `ONE-WAY DOOR` | If you ship Phase 1-3 without A/B validation (A1) and it turns out knowledge injection doesn't help, you've spent 15-20 days of engineering on infrastructure that may never be used. The experiment should be the first thing you run, not the last. |
| Tier 2 pointer format | `HARD TO REVERSE` | If agents learn to hallucinate from Tier 2 titles (A2) and you later switch to always-load Tier 3, all existing prompt templates and token budgets need reworking. Get the right balance early. |

---

## Suggested Revisions (from adversarial review)

| # | Revision | Priority | Attack Source |
|---|----------|----------|---------------|
| A1 | Add A/B causal experiment to Phase 1 definition of done | **Critical** | Both (fatal flaw) |
| A2 | Add Tier 2 hallucination guard + Phase 2 hallucination rate metric + measured fallback | **High** | Gemini |
| A3 | Rename utilization metric; add outcome-aligned decision-quality metrics | **High** | Gemini |
| A4 | Specify delimiter escaping in canon sanitization; consider nonce-based delimiters | **High** | Codex |
| A5 | Add claim quality rubric to seed data strategy | **High** | Codex |
| A6 | Clarify token economics: knowledge budget vs full prompt budget distinction | **Medium** | Codex |
| A7 | Add chunk compaction strategy (90-day retention, hard-delete unreferenced) | **Medium** | Gemini |
| A8 | Add "What's Novel" framing: synthesis novelty, content moat, productive contradictions | **Medium** | Both |

---

## Open Questions (from adversarial review)

1. **A/B experiment design:** Who scores the tasks? Founder manual scoring is the gold standard but doesn't scale. Options: (a) founder scores first 50 tasks manually, (b) LLM-as-judge for bulk scoring with founder calibration on a subset. Recommend (a) for Phase 1 — you need founder engagement anyway.

2. **Tier 2 hallucination threshold:** What hallucination rate is acceptable before falling back to always-load Tier 3? Proposed: 20%. But this needs calibration — 20% hallucination on low-stakes tasks may be fine; 5% on high-stakes tasks may be too much. Consider per-claim-type thresholds (facts: 5%, heuristics: 20%).

3. **Decision-quality metric definition:** What does "the agent's recommendation changed in a way consistent with the injected doctrine" actually look like as a measurable metric? This needs operationalizing before Phase 2 LLM eval. Possible: the LLM judge is given the agent output + the injected claims and asked "Did any of these claims influence the reasoning? If so, did the influence improve the recommendation?"

4. **Nonce-based delimiters:** Is `<zazig:canon source="..." nonce="abc123">` over-engineering, or genuine defense-in-depth? The nonce prevents an adversary from predicting the closing tag, but it also makes the prompt template more complex. If regex-based stripping of `</canon-passage>` from ingested content is sufficient (Layer 1), the nonce may be unnecessary.

5. **When does the A/B experiment run?** Ideally before Phase 1 is "complete" — run it on the seed data with the initial prompt compiler. The experiment is small (50 tasks) and uses infrastructure that Phase 1 already builds. It should be the last step of Phase 1, not a separate phase.

---

## Attacks vs. Defenses Summary

| Attack | Attacker | Verdict | Action |
|--------|----------|---------|--------|
| No causal experiment | Both | **Lands hard** | A1: Add A/B experiment |
| Tier 2 hallucination | Gemini | **Lands hard** | A2: Hallucination guard + metric |
| Goodhart's Law on metrics | Gemini | **Lands** | A3: Outcome-aligned metrics |
| Delimiter escaping | Codex | **Lands** | A4: Escape/nonce |
| Claim quality unspecified | Codex | **Lands** | A5: Quality rubric |
| Token economics inconsistent | Codex | **Partially lands** | A6: Clarify accounting |
| Immutable chunk bloat | Gemini | **Partially lands** | A7: Compaction strategy |
| No novelty framing | Both | **Partially lands** | A8: Articulate synthesis |
| LLMs already know this | Gemini | **Does not land** | Misunderstands doctrines |
| Lost in the middle | Gemini | **Does not land** | Prompt ordering handles this |
| Cathedral building | Gemini | **Does not land** | Phase 1 = 4 tables |
| Doctrine/Canon pointless | Gemini | **Does not land** | 7 failure scenarios refute |
| Progressive disclosure cargo cult | Codex | **Does not land** | It's prompt construction |
| Zero defensibility | Gemini | **Does not land** | Content is the moat |
| Marketplace delusion | Both | **Does not land** | Explicitly Phase 6+ |
| No technical novelty | Codex | **Does not land** | Synthesis is novel |
| Contextual fragmentation | Gemini | **Does not land** | Opposite: increases density |
| Premature abstraction | Codex | **Does not land** | Phase 1 = 4 tables |

**Score: 5 land, 3 partially land, 10 refuted.** The architecture is structurally sound but needs empirical validation (A1) and targeted hardening (A2-A5).

---

## Recommendation

**Apply revisions A1-A8 to produce v4.** The most important change is A1 (causal experiment). Without it, the architecture is a hypothesis, not a plan. With it, the architecture becomes evidence-based — and if the evidence says knowledge injection doesn't work, you've saved months of engineering by finding out in Phase 1 instead of Phase 6.

The adversarial reviews, despite their hostile framing, ultimately strengthen the architecture. The attacks that land expose real gaps. The attacks that don't land confirm that the cooperative reviews caught the right things. The net result: a more honest, more defensible design.

---

*Adversarial review conducted by CPO (Opus) incorporating hostile critiques from Codex (gpt-5.3-codex) and Gemini (gemini-3.1-pro-preview). Both models were instructed to attack the architecture as aggressively as possible. This review assesses each attack on its merits.*
