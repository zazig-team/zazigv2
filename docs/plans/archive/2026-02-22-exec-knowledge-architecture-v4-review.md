# Review: Exec Knowledge Architecture v4

**Reviewed:** 2026-02-22
**Source:** `docs/plans/2026-02-22-exec-knowledge-architecture-v4.md`
**Reviewer:** Claude (Opus), review-plan skill

---

## Verdict

Ready to execute with targeted fixes. The architecture is thorough, well-reviewed (6 rounds across 3 models), and defensible. No structural rethinking needed. However, 11 specific issues surfaced — 2 are bugs (will produce incorrect behavior if implemented as-written), 3 are schema/text inconsistencies, and 6 are gaps that should be acknowledged or resolved before cardifying. None are blockers for starting Phase 1, but the bugs and inconsistencies should be fixed in the document before it becomes the implementation reference.

---

## One-Way Doors

| Decision | Section | Severity | Notes |
|----------|---------|----------|-------|
| `vector(1536)` hard-coded in all schemas | Storage | HARD TO REVERSE | Switching embedding models requires re-embedding all content + rebuilding indexes. Right choice for now, but acknowledge the lock-in. |
| Immutable chunk guarantee | Canon Re-Ingestion | ONE-WAY DOOR | Once bridge table + provenance depend on chunk immutability, changing to mutable breaks the data model. This is intentional and correct — just flag it. |
| Token budget hard cap (3500) | Principle 12 | HARD TO REVERSE | Role prompts and claim authoring will be tuned against this budget. Changing it later affects all content. Mitigated by per-role configurability. |
| RRF keyword weighting (×2) | Hybrid Search | Moderate | Affects all retrieval quality. Easy to tune the constant, but the baseline data and eval targets are calibrated against it. |

---

## Dependency Map

| This plan needs... | Which comes from... | Status |
|-------------------|---------------------|--------|
| Personality system (prompt stack position 1) | `2026-02-20-exec-personality-system-design.md` | In progress (cards 1.2-1.7) |
| Orchestrator dispatch + StartJob payload | `2026-02-18-orchestration-server-design.md` | Base exists, needs `knowledgeContext` extension |
| Embedding computation strategy | Open Question #6 in this document | **UNRESOLVED — Phase 1 prerequisite** |
| Role prompts with canon sandboxing instruction | `2026-02-20-role-prompts-and-skills-design.md` | Designed, not implemented |
| Canon upload mechanism (Phase 3) | Not designed yet | **GAP** |
| Enough real/synthetic tasks for A/B experiment (50 pairs) | Operational readiness | **Not specified** |

---

## Key Trade-offs

- **Chose proactive injection over pure reactive:** Gains immediate knowledge influence on every job without agent cooperation. Loses token budget to always-on injection. Mitigated by hard cap + overflow priority.
- **Chose hand-curated seed data over LLM extraction:** Gains deep understanding of schema + token limits + what makes a useful claim. Loses speed — 50-100 hand-written claims takes significant human effort. Correct trade-off for Phase 1.
- **Chose Supabase hybrid search over QMD:** Gains operational simplicity (transactional indexes, one data store). Loses GGUF reranking quality. Correctly deferred QMD as optional Phase 3+ reranking layer.
- **Chose immutable chunks over in-place updates:** Gains stable provenance + simple re-ingestion. Loses storage efficiency (old chunks accumulate). Mitigated by pg_cron compaction with 90-day retention.

---

## Bugs (fix before implementation)

### B1. RRF SQL computes rank in wrong CTE
**Location:** Lines 550-574 (Hybrid Search Pattern)
**Impact:** Produces incorrect fusion scores — results exclusive to one list get penalized instead of scored correctly.
**Fix:** Compute `ROW_NUMBER()` within each individual CTE (`keyword_results`, `vector_results`), then fuse by pre-computed rank in the `fused` CTE.

### B2. Injection flow references old delimiter name
**Location:** Line 656 (Step 5: Compile knowledgeContext)
**Impact:** Template text says `<canon-passage>` but actual sandboxing uses `<zazig:canon nonce="...">`. If implemented as-written, the role prompt instruction and the actual delimiters won't match.
**Fix:** Change `<canon-passage>` to `<zazig:canon>` in the Step 5 template.

---

## Inconsistencies (fix in document)

### I1. Principle count mismatch
**Location:** Line 96
**Text says:** "Twelve principles"
**Actual:** 14 principles listed (1-14)
**Fix:** Change "Twelve" to "Fourteen"

### I2. Phase 2 metric missing from eval schema
**Location:** Lines 1026-1047 vs 1219-1222
**Phase 2 describes:** `hallucinated_application` rate tracked in `knowledge_eval_log`
**Schema has:** No column for this metric
**Fix:** Add `hallucinated_claim_ids uuid[] default '{}'` and `hallucinated_application_rate numeric` to the `knowledge_eval_log` CREATE TABLE

### I3. Novelty claim uses absolute existence assertion
**Location:** Line 69
**Text says:** "We are not aware of existing agentic frameworks that treat..."
**Risk:** One counterexample invalidates the claim
**Fix:** Soften to "We have not found existing agentic frameworks that treat..." (minor but worth catching)

---

## Gaps (acknowledge or resolve)

### G1. Phase 1 effort estimate doesn't include A/B experiment
**Location:** Line 1210
**Issue:** "5-6 days" estimate predates the A/B experiment addition (A1 revision). The experiment requires engineering (paired task runner, blinding, scoring), calendar time (founder scoring 50 pairs × 5 dimensions), and analysis. Could add 1-2 weeks of calendar time.
**Recommendation:** Split into "5-6 days engineering" + "1-2 weeks A/B experiment (calendar-bound by founder availability)"

### G2. Open Question #6 is a Phase 1 blocker but buried
**Location:** Line 1312
**Issue:** "Where are embeddings computed?" is explicitly called out as needing a decision before Phase 1, but it's in an easy-to-skip section.
**Recommendation:** Resolve now (Edge Function calling OpenAI API is the obvious choice) or elevate to Phase 1 prerequisites list.

### G3. Retrieval recall@5 metric name misleading in Phase 1
**Location:** Line 1199
**Issue:** Phase 1 has no reactive retrieval (no agent tools). "Recall@5" implies user-initiated search. Phase 1 actually measures proactive injection relevance.
**Recommendation:** Add clarifying note: "In Phase 1, recall@5 measures proactive claim selection quality. Phase 2 extends to tool-driven search recall."

### G4. Canon upload mechanism undesigned
**Location:** Phase 3 scope
**Issue:** "Founder approves source" has no design for how documents are actually provided.
**Recommendation:** Add Open Question #11 about upload mechanism (CLI, dashboard, Supabase Storage).

### G5. FORCE_TIER3_INJECTION automation unspecified
**Location:** Lines 1219-1221
**Issue:** Feature flag described but no specification of what checks the rate and flips the flag.
**Recommendation:** Add: "Hallucination rate computed weekly per-role from `knowledge_eval_log`. If a role exceeds 20%, orchestrator sets `FORCE_TIER3_INJECTION=true` for that role. Founders can override."

### G6. Embedding dimension lock-in unacknowledged
**Location:** All vector columns + Open Question #1
**Issue:** `vector(1536)` hard-codes OpenAI text-embedding-3-small. Principle 14 promises "retrieval replaceability" but switching models requires re-embedding everything.
**Recommendation:** Add note to Open Question #1 acknowledging the lock-in.

---

## Suggested Revisions

| # | Type | Priority | Action |
|---|------|----------|--------|
| B1 | Bug | High | Rewrite RRF SQL to compute rank per-CTE, not in fused CTE |
| B2 | Bug | High | Change `<canon-passage>` → `<zazig:canon>` in injection flow Step 5 |
| I1 | Inconsistency | Medium | "Twelve" → "Fourteen" on line 96 |
| I2 | Inconsistency | Medium | Add hallucination tracking columns to `knowledge_eval_log` schema |
| I3 | Inconsistency | Low | Soften novelty existence claim |
| G1 | Gap | Medium | Update Phase 1 effort estimate to account for A/B experiment |
| G2 | Gap | Medium | Resolve or elevate Open Question #6 as Phase 1 prerequisite |
| G3 | Gap | Low | Clarify recall@5 metric name for Phase 1 context |
| G4 | Gap | Low | Add Open Question #11 for canon upload mechanism |
| G5 | Gap | Low | Specify FORCE_TIER3_INJECTION automation |
| G6 | Gap | Low | Acknowledge embedding dimension lock-in |

---

## What's Strong

This document has been through 6 rounds of review across 3 independent models. The architecture survives adversarial attack. Specific strengths:

- **Two-system split justification** is airtight (7 failure scenarios + Gemini's behavioral/factual distinction)
- **Progressive disclosure** is well-designed with clear tier/level boundaries and the right constraints (pointers only at T1/T2, hallucination guard for T2)
- **Cache-optimized prompt stack** is the single most impactful performance decision — could save 10× on inference costs
- **Immutable chunks + pg_cron compaction** is clean operational design
- **Token economics worked examples** make the budget constraints tangible and verifiable
- **A/B experiment as Phase 1 gate** is the right kill switch — proves value before investing in Phase 2+
- **Claim quality rubric** (4+1 criteria, binary pass/fail) is actionable and enforceable
- **Review history with attribution** makes the document's evolution legible

The document is ready for cardify after the High-priority fixes (B1, B2).
