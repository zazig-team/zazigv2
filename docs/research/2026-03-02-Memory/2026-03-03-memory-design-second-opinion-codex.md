# Memory System Design: Second Opinion from Codex (gpt-5.3-codex)

**Date:** 2026-03-03
**Reviewer:** OpenAI Codex (gpt-5.3-codex, reasoning: xhigh)
**Document Reviewed:** `docs/plans/active/2026-03-03-memory-system-design.md` (v2, founder-reviewed)
**Review Method:** Independent systems architect review via codex-delegate investigate mode
**Token Cost:** 12,534 tokens

---

## Overall Assessment

> Bottom line: this is a strong design with clear thinking. I would not replace it wholesale. I would tighten taxonomy, retrieval economics, and reliability controls before production scale.

---

## 1. Taxonomy (8-Type Memory Model)

**Verdict: Close, but slightly misallocated.**

- **Keep `Decision` and `Gotcha` separate.** They serve different retrieval intents: "what we chose" vs "what to avoid."
- **Merge `Observation` + `Moment` into one `Episode` type** with metadata (`inferred=true/false`, `confidence`, `timestamp`). Right now that boundary is classification-noisy.
- **Add `Procedure` as a first-class type.** This is the biggest missing category for an AI workforce. Reusable "how-to" sequences are high ROI and should decay slower than moments.
- **Do not add `Goal` as memory type** if goal state already exists in pipeline/job state. Keep it operational state, not semantic memory.
- **`Relationship` is useful for executives/employees**, probably low value for contractors.

---

## 2. Build vs Buy (Roll-Own on Supabase/pgvector)

**Verdict: Roll-your-own is the right default here** because scope-aware retrieval + doctrine boundary + workforce tiers are highly custom.

**Hidden costs likely underestimated:**

- Retrieval quality tuning is ongoing ML/product work, not one-time engineering.
- Contradiction/supersession logic becomes policy-heavy quickly.
- Re-embedding/backfills when schema/model changes are operationally expensive.
- RLS and cross-scope visibility bugs are subtle and dangerous.
- Explainability/debuggability ("why this memory was injected") needs dedicated tooling.
- Memory poisoning and low-quality writes will accumulate unless aggressively filtered.

**Recommendation:** Keep storage custom, but treat retrieval/evaluation as a product with explicit metrics and owner.

---

## 3. Token Budgets

**Verdict: Realistic as internal control budget, but compression policy needs work.**

- ~5,000 total prompt budget is realistic (even if model window is larger).
- 800 memory tokens is enough if curated (roughly 12-25 high-signal items).
- 1,500 can be too much for contractor tasks; it can crowd task-specific context.
- **The compression policy is the main issue.** Compressing memory first is often wrong for persistent agents.

**Better policy proposed:**

| Tier | Memory Target |
|------|---------------|
| Executives | 1,000-1,500 tokens |
| Employees | 700-1,200 tokens |
| Contractors | 300-800 tokens |

- Compress static `Skills` before high-signal memory when continuity matters.
- Reserve mandatory "slots" (e.g., 2 gotchas, 2 decisions, 1 open risk) before free-form truncation.

---

## 4. Extraction Architecture

**Verdict: Post-job async extraction is correct. Non-blocking is correct.**

- Edge Function is fine for Phase 1, but **queue-backed workers** (with retries/DLQ/idempotency) are safer once volume rises.
- **Extraction from only a job report will miss critical memory.** The best data is in artifacts: tool outputs, failures, diffs, verification results.
- **Best approach is hybrid:**
  - Agent produces structured candidate memories + evidence snippets before termination.
  - Orchestrator-side model validates/classifies/dedups and enforces scope/policy.
- One Sonnet pass on narrative reports will be **high-recall but mediocre precision**. You need confidence gates, evidence requirements, and periodic eval sets.

---

## 5. Context Handoff Protocol

**Verdict: Good design, but add hard guards.**

- **Crash-before-handoff:** Periodic incremental checkpoints (every N tool calls or time interval), not only at 80% threshold.
- **Low-quality handoff:** Schema validation + quality score; if low, run fallback summarizer from transcript/artifacts.
- **Resume loops:** Max handoff depth per root job, plus loop reason tracking.
- **Duplicate resumes on retry:** Idempotency key on `(root_job_id, handoff_seq)`.
- **Side-effect safety:** Include external action ledger (what was already done) to avoid duplicate writes/commands on resume.

---

## 6. Top Risks/Gaps (Production)

1. **Memory pollution:** Low-precision extraction creates long-term bad context that compounds.
2. **Retrieval mismatch:** Type-priority truncation can exclude task-critical but lower-priority memories.
3. **Doctrine over-dominance:** Suppressing contradictory memory can hide real-world drift and block learning.
4. **Access-control leakage:** Role-shared + cross-scope reads are easy to misconfigure before full RLS maturity.
5. **Operational fragility:** Extraction/embedding queues, retries, and cost spikes under bursty workloads.

---

## 7. What Codex Would Do Differently (Same Constraints)

- Keep Supabase-first architecture, but start with a **stricter memory lifecycle:**
  - `candidate -> validated -> active -> archived -> forgotten`
- **Add `Procedure` memory in Phase 1**, not Phase 3.
- **Separate storage concerns:**
  - `Claims` store (facts/decisions/gotchas/procedures, higher trust)
  - `Episodes` store (moments/observations, lower trust, higher decay)
- Build retrieval as **two-stage from day one:**
  - Deterministic scoped fetch for mandatory slots.
  - Hybrid semantic rerank for remaining budget.
- **Add evaluation harness early:**
  - Precision@k of injected memories
  - "Useful memory hit rate" in agent outcomes
  - Contradiction/supersession error rate
  - Cost per successful memory write/read
- **Move extraction execution from Edge Function to queue worker** before broad rollout.

---

## Top 3 Changes (If You Apply Only Three)

1. **Add `Procedure` as a first-class memory type** -- reusable "how-to" sequences are the highest-ROI memory for an AI workforce.
2. **Add checkpoint/idempotency safeguards in the Context Handoff Protocol** -- crash-before-handoff and resume loops are real failure modes.
3. **Implement evidence-backed extraction with quality gates** -- agent produces candidate memories with evidence snippets; orchestrator validates. One Sonnet pass on narrative reports alone will be high-recall but mediocre precision.
