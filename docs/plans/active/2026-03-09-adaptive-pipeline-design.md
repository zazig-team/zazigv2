# Adaptive Pipeline — Self-Improving Agent System

**Date:** 2026-03-09
**Status:** Design approved
**Authors:** Tom Weaver, Claude (CPO), with second opinions from Codex and Gemini
**Inspired by:** MetaClaw (aiming-lab/MetaClaw) — online RL layer for OpenClaw
**Part of:** Capabilities roadmap — new capability between Memory P1 and Doctrines

---

## Problem

The pipeline makes the same mistakes repeatedly. A breakdown specialist
that writes bad specs keeps writing bad specs. An engineer that misreads
a codebase pattern keeps misreading it. A verifier that misses edge cases
keeps missing them.

Every job runs with the same skills, same prompts, same strategy — regardless
of whether previous jobs with that configuration succeeded or failed. The
system has no feedback loop. Day 30 agents are identical to Day 1 agents.

We log failures (`failure_history`, `retry_count`) but never use them to
prevent recurrence. We have a continuous-learning skill but it's manually
triggered. We have personality evolution tables but nothing writes to them
automatically.

The pieces exist. They're not connected.

---

## Solution: The Adaptive Pipeline

A feedback loop that turns every pipeline outcome into a learning signal,
automatically extracts skills from failure patterns, and optimizes skill
selection based on what actually works.

```
dispatch (with skills) → execute → outcome (+1/-1)
    ↑                                    ↓
    ← skill selection ← skill bank ← skill extraction
```

The pipeline stops being static infrastructure and becomes a system that
gets better at software development with every feature it ships or fails.

---

## Architecture

### The Learning Signal

Every job dispatch already produces a natural reward signal:

| Outcome | Signal | Source |
|---------|--------|--------|
| Feature shipped first attempt | +1.0 | `features.status = 'complete'` |
| Feature shipped after retry | +0.5 | `features.status = 'complete' AND retry_count > 0` |
| Job completed, feature continues | +0.25 | `jobs.status = 'complete'` |
| Job failed, feature retried | -0.5 | `jobs.status = 'failed'` |
| Feature failed permanently | -1.0 | `features.status = 'failed'` |
| PR approved without changes | +0.5 | merge without review comments |
| Verification passed first time | +0.5 | verify job passes |
| Verification failed | -0.5 | verify job fails |

These are richer than MetaClaw's {-1, 0, +1} because they're multi-stage.
A feature that ships after 2 retries is a partial success, not a binary.

### The Four Phases

#### Phase 1: Instrument

Log what goes into every job and what comes out.

**New table: `job_signals`**

```sql
CREATE TABLE job_signals (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id),
  job_id        uuid NOT NULL REFERENCES jobs(id),
  feature_id    uuid REFERENCES features(id),
  role          text NOT NULL,
  skills_injected text[] NOT NULL DEFAULT '{}',
  personality_version int,
  model         text,
  complexity    text,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  outcome       float,          -- null until resolved
  outcome_type  text,           -- 'shipped', 'failed', 'retry', etc.
  resolved_at   timestamptz,
  cost_tokens   int,
  duration_ms   int
);

CREATE INDEX idx_job_signals_role ON job_signals(company_id, role);
CREATE INDEX idx_job_signals_outcome ON job_signals(company_id, outcome)
  WHERE outcome IS NOT NULL;
```

**Changes to orchestrator dispatch:**
- On every job dispatch, insert a `job_signals` row with skills_injected,
  role, model, complexity, personality_version
- On every job completion/failure, update the row with outcome, outcome_type,
  resolved_at, cost_tokens, duration_ms

**Changes to executor:**
- Report token usage and duration in job result (extend JobResult type)

This phase is pure data capture. Zero behavioral changes. Independently
valuable as pipeline observability — you can query "which role has the
highest failure rate?" or "which skills correlate with success?" immediately.

**Converges with Memory P1:** The `job_signals` table IS the episodic memory
store. Every job is a memory. The schema supports the retrieval queries
Memory P1 needs.

---

#### Phase 2: Extract

When failure patterns emerge, automatically generate skills to prevent them.

**Trigger:** After every job failure, check: has this role's failure rate
in the last N jobs exceeded a threshold (default: 40%)? If yes, fire the
skill extraction pipeline.

**Skill extraction pipeline (SkillEvolver pattern from MetaClaw):**

1. Gather the last 6 failed `job_signals` rows for this role
2. For each, read the job's spec, result, and failure reason
3. Read the role's current skills bank
4. Prompt an LLM (Haiku for cost, Sonnet for quality):

```
Here are 6 recent failures for the {role} role:

[failure 1: spec excerpt, result, reason]
[failure 2: ...]
...

Here are the skills this role currently has:
[skill list with descriptions]

Generate 1-3 new skills that would have prevented these failures.
Each skill should be:
- A concrete, actionable instruction (not vague advice)
- Different from existing skills
- Formatted as a SKILL.md file (YAML frontmatter + Markdown body)

Output JSON array of {name, description, content, category}.
```

5. Parse response, validate skill format, dedup against existing skills
6. Write new SKILL.md files to the skills directory
7. Add to the role's `skills` array in the DB
8. Log to `skill_evolution_log` table (what triggered it, what was generated)

**Per-role skill namespacing:**
- Skills are namespaced: `{role}/{skill-name}`
- Engineers learn different things than CPO
- Cross-role promotion: if a skill proves valuable for one role, propose
  copying it to related roles

**Converges with Doctrines:** Extracted skills ARE doctrines — "rules the
system learned from experience." The difference is governance: skills are
auto-generated and auto-injected. Doctrines require human review before
becoming permanent. The promotion path is: auto-generated skill → proven
effective → proposed as doctrine → human approves → doctrine.

---

#### Phase 3: Select

Not all skills help equally. Optimize which skills get injected per job.

**UCB1 Bandit for skill selection:**

Instead of injecting all skills for a role, score each candidate skill:

```
score(skill) = avg_reward(skill) + C * sqrt(log(total_dispatches) / usage_count(skill))
```

- `avg_reward(skill)` — mean outcome of jobs where this skill was injected
- `usage_count(skill)` — how many times this skill has been injected
- `C` — exploration constant (default: 1.41)

Select the top K skills by UCB1 score. This naturally balances:
- **Exploitation** — use skills that have proven effective
- **Exploration** — try under-used skills to gather data on them

**Exploration traffic (5-10%):**

On a random subset of dispatches, deliberately vary one skill from the
UCB1 selection. Replace one selected skill with a random unselected one.
This creates controlled experiments that produce **causal** evidence of
skill effectiveness, not just correlation.

Log which skills were candidates vs selected vs injected in `job_signals`.
This is the data that powers attribution.

**Skill lifecycle:**
- New skills start with high exploration bonus (low usage_count)
- As data accumulates, proven skills dominate selection
- Skills with consistently negative attribution get deprecated
- Skills with consistently positive attribution get promoted across roles

**This is the 10X unlock.** Phase 1 gives you data. Phase 2 gives you
automatic improvement. Phase 3 gives you **optimized** improvement —
the system doesn't just learn, it learns what learning works.

---

#### Phase 4: Compound

The system's learning compounds across layers.

**Skill → Doctrine promotion:**
- Skills that maintain positive attribution for 30+ days across 50+ jobs
  are proposed as Doctrines (human-approved permanent beliefs)
- Doctrines shape how future skills are generated (the extraction prompt
  references doctrines as constraints)
- This is the "beliefs" layer — not just "do X" but "we believe Y"

**Doctrine → Canon graduation:**
- Doctrines that are never violated for 90+ days become Canon candidates
- Canons are hard-enforced (violation blocks the action, not just warns)
- Example: "Never spec against a file without verifying it exists" starts
  as a generated skill, becomes a doctrine after proving effective, becomes
  a canon after sustained compliance

**Personality adaptation (careful):**
- Behavioral dimensions (risk_tolerance, autonomy) can be tuned based on
  pipeline outcomes
- Communication style stays human-controlled (never auto-tuned)
- Root constraints (safety, scope) are immutable canons
- Use existing `personality_evolution_log` table for tracking

**Cross-role learning:**
- Skills proven in one role are proposed for related roles
- Engineers learn from each other (junior-engineer skill → senior-engineer)
- Pipeline roles learn from each other (breakdown → verification)
- Never auto-promote across role boundaries — always propose for review

---

## What Exists Today

| Component | Status | Gap |
|-----------|--------|-----|
| `failure_history` on features | Shipped | Not structured as learning signals |
| `retry_count` on features | Shipped | Used for retry budget, not for learning |
| Skills as SKILL.md files | Shipped | Static, manually authored |
| Skills distribution to workspaces | Shipped | Injects all skills, no selection |
| `continuous-learning` skill | Shipped | Manual trigger, no pipeline integration |
| `personality_evolution_log` table | Shipped | Nothing writes to it |
| `exec_personalities` table | Shipped | Static after initial seed |
| Job result logging | Shipped | Text blob, not structured signals |
| Orchestrator dispatch | Shipped | Doesn't log skill injection |

**We're ~60% wired for this.** The tables, the skill format, the dispatch
pipeline, the personality infrastructure — all exist. The gap is the
feedback loop connecting outcomes back to inputs.

---

## Schema Summary

**New tables:**
- `job_signals` — per-dispatch instrumentation (Phase 1)
- `skill_evolution_log` — what triggered extraction, what was generated (Phase 2)
- `skill_attribution` — per-skill reward tracking for UCB1 (Phase 3)

**Modified tables:**
- `roles.skills` — already exists, used for per-role skill bank
- `jobs` — extend result to include structured token/duration metrics

**No changes to:**
- `features` — failure_history and retry_count already sufficient
- `exec_personalities` — Phase 4 writes to existing columns
- `personality_evolution_log` — Phase 4 writes to existing table

---

## Implementation Priority

| Phase | Deliverable | Depends on | Value alone |
|-------|------------|------------|-------------|
| **1. Instrument** | `job_signals` table + orchestrator logging | Nothing | Observability, Memory P1 foundation |
| **2. Extract** | SkillEvolver + per-role skill namespacing | Phase 1 | Automatic failure prevention |
| **3. Select** | UCB1 bandit + exploration traffic | Phase 2 | Optimized skill injection, causal attribution |
| **4. Compound** | Skill→Doctrine→Canon promotion + personality tuning | Phase 3 | Self-improving at every layer |

Each phase is independently valuable. Phase 1 ships as observability.
Phase 2 ships as failure prevention. Phase 3 is the exponential unlock.
Phase 4 is the full vision.

---

## Capability Placement

**New capability: "Adaptive Pipeline"**
- **Lane:** Agent Brain (alongside Memory, Doctrines, Canons)
- **Depends on:** Memory P1 (shared instrumentation layer)
- **Unlocks:** Doctrines (auto-generated from proven skills), Canons (graduated doctrines)
- **Status:** Draft
- **Progress:** 0% (instrumentation infrastructure doesn't exist yet, though prerequisite tables do)

This capability is the **mechanism** that makes Memory, Doctrines, and
Canons actually work as a system rather than isolated features. Without
it, Memory is just storage, Doctrines are just manual rules, and Canons
are just config. With it, the three form a learning hierarchy:
Memory (raw signals) → Skills (extracted patterns) → Doctrines (proven beliefs) → Canons (hard laws).

---

## Open Questions

1. **Haiku vs Sonnet for skill extraction** — Haiku is 10x cheaper but
   may produce lower quality skills. Start with Sonnet, benchmark against
   Haiku, switch if quality is comparable.

2. **Skill bank size limit** — How many skills per role before context
   window pressure becomes a problem? UCB1 selection helps (only inject
   top K), but the bank itself could grow unbounded. Deprecation policy
   needed.

3. **Exploration traffic in production** — 5-10% of jobs deliberately
   get non-optimal skill selection. Is this acceptable risk? Mitigation:
   never explore on high-priority features. Only explore on medium/low.

4. **Attribution lag** — Feature outcomes can take hours/days to resolve.
   Skill attribution scores will be noisy initially. How many data points
   before UCB1 scores are meaningful? Estimate: ~30 jobs per skill.

5. **Cross-company learning** — If multiple companies run zazig, do
   skills learned by one company benefit others? Privacy vs collective
   intelligence trade-off. Not MVP but worth reserving schema space.
