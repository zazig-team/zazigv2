# Online Reinforcement Learning for zazig Pipeline

**Date:** 2026-03-09
**Source:** CPO analysis + Gemini second opinion
**Status:** Research / pre-proposal

---

## Context

We analyzed MetaClaw (RL layer for OpenClaw) and found a pattern that could 10X zazig's pipeline: every agent conversation is logged, scored async, and when failure rates cross thresholds, an LLM analyzes failures and generates new SKILL.md files. Skills are retrieved via embedding matching and injected into prompts automatically. The entire loop runs continuously without fine-tuning.

zazig already has most of the raw materials: skills as SKILL.md files, failure_history on features, a continuous-learning skill, personality dimensions, and planned Memory/Doctrines/Canons systems.

The question: how do we close the loop?

---

## 1. Ubiquitous Learning Signals

**Current state:** We only learn from explicit failures (failure_history).

**Target state:** Every agent interaction generates a learning signal.

### Signal Taxonomy

| Signal Type | Collection Point | Scoring |
|---|---|---|
| **ToolSuccess** | Tool call returns success | `+0.1`, penalized by execution time and token output |
| **ToolFailure** | Tool call fails | `-0.5` |
| **UserCorrection** | Human edits agent output | `-0.1 to -0.9` based on diff magnitude |
| **StateTransition** | Pipeline state changes (test pass, PR merge, feature ship) | `+0.7` (positive) / `-0.7` (negative) |
| **ResourceConsumption** | Periodic | `-cost_usd` (directly negative) |

### Data Schema

```sql
CREATE TABLE interactions (
    id UUID PRIMARY KEY,
    pipeline_run_id UUID, -- links to feature
    agent_id TEXT,
    role TEXT,
    timestamp TIMESTAMPTZ,
    action_type TEXT,
    action_params JSONB
);

CREATE TABLE signals (
    id UUID PRIMARY KEY,
    interaction_id UUID REFERENCES interactions(id),
    signal_type TEXT, -- enum: tool_success, tool_failure, user_correction, state_transition, resource_consumption
    metadata JSONB,
    inferred_reward FLOAT, -- immediate estimate
    final_reward FLOAT -- backpropagated from pipeline outcome
);
```

---

## 2. Temporal Credit Assignment

**Problem:** Pipeline outcomes are delayed. A feature ships 2 days after the breakdown decision. How do you credit the breakdown agent?

**Algorithm: Eligibility Traces (TD-Lambda)**

1. Every interaction gets an eligibility trace `E`, initialized to 0
2. When new interaction `i` occurs, decay all previous traces: `E_j = gamma * lambda * E_j`
3. Current interaction gets `E_i = 1`
4. When terminal reward arrives (feature shipped = +1.0, feature failed = -1.0), propagate: `Interaction_j.final_reward += alpha * delta * E_j`

Parameters: `gamma=0.99` (discount), `lambda=0.9` (trace decay), `alpha=0.01` (learning rate).

**Key insight:** An early breakdown decision that consistently appears in failed pipeline runs accumulates negative final_reward over time, even if it never "failed" in isolation.

---

## 3. Per-Role Skill Evolution

**Namespace model:** `{role}/{skill_name}`

```
common/run_linter
engineer/resolve_merge_conflict
cpo/breakdown_feature_into_user_stories
architect/design_database_schema
```

**Inheritance:** Agents inherit skills from their role, then from parent roles, then from `common/`.

**Cross-role learning:** If an engineer benefits from a CPO skill, the system can propose copying and adapting it into the engineer namespace with a modified version.

**Schema addition to skills:**

```sql
ALTER TABLE skills ADD COLUMN utility_score FLOAT DEFAULT 0;
ALTER TABLE skills ADD COLUMN usage_count INT DEFAULT 0;
ALTER TABLE skills ADD COLUMN lineage_id UUID; -- shared by all versions
```

---

## 4. Causal Attribution via Multi-Armed Bandits

**Problem:** Which skill actually caused the improvement?

**Algorithm: UCB1 (Upper Confidence Bound)**

For each candidate skill `s`:
```
score(s) = avg_reward(s) + C * sqrt(log(total_interactions) / usage_count(s))
```

- First term = exploitation (use what works)
- Second term = exploration bonus (try under-explored skills)
- `C` balances the tradeoff

**Mechanism:** When facing a task, retrieve `k=3` candidate skills by embedding similarity. Select by UCB1 score. Attribute the pipeline outcome reward to the selected skill(s). Over time, useful skills rise; useless skills get explored less.

This turns skill selection from deterministic retrieval into a continuous self-optimizing experiment.

---

## 5. Adaptive Personality Dimensions

**Current state:** Static personality vectors (risk_tolerance, autonomy_preference, etc.)

**Mechanism: Population-Based Training (PBT)**

1. Maintain a population of N agent configurations per role (e.g., N=20 engineer configs)
2. Each has a random personality vector
3. Run in parallel, track average final_reward over last 10 tasks
4. Periodically: bottom 25% replaced by mutated copies of top 25%

**Mode collapse prevention:** Population diversity is maintained by mutation. If the environment changes (new project type, different codebase), different personality regions become optimal and the population evolves.

**zazig-specific concern:** We don't have enough parallel throughput for full PBT yet. Start with a simpler approach: track personality-outcome correlations and surface recommendations to humans. "Engineers with risk_tolerance > 0.7 ship 40% faster but fail verification 20% more often."

---

## 6. Hierarchy: Canons > Doctrines > Skills > Memory

| Layer | Nature | Mutability | RL Relationship |
|---|---|---|---|
| **Canons** | Hard rules, never violated | Immutable (human-set) | Outer boundary — RL can never learn actions that violate canons because they never execute |
| **Doctrines** | Organizational beliefs | Slow-changing (human-approved) | Shape the search space — SkillGenerator is prompted with doctrines, biasing skill creation |
| **Skills** | Learned procedures | Dynamic (RL-generated) | The RL output — what gets optimized |
| **Memory** | Raw experience | Append-only | The RL input — raw material for pattern detection |

**Composition flow:**
```
Agent Action → CanonEnforcer (filter) → Execution → SignalCollector → Memory (store) → CreditAssigner (propagate reward) → SkillGenerator (create/update skills, guided by Doctrines)
```

---

## 7. Incremental vs 10X Vision

### Incremental (what we'd ship in 3 months)
- Log all interactions and signals
- Back-propagate pipeline outcomes to earlier decisions
- Surface skill effectiveness scores on dashboard
- Human-reviewed skill generation from failure patterns

**Result:** Pipeline gets faster and more reliable. Failure_history shrinks. Agents fix bugs with fewer attempts. Still fundamentally a tool.

### 10X (what becomes possible in 6-12 months)

The system stops being a pipeline and becomes a **self-improving digital organism.**

1. **Autonomous architectural refactoring** — Human states a doctrine ("migrate to microservices"). System formulates multi-month plan from its understanding of the entire codebase, runs concurrent experiments to validate approach, executes autonomously.

2. **Proactive predictive maintenance** — System detects subtle patterns in error logs and performance data. Hypothesizes root cause, writes patch, canaries it, validates. Before any human knows there's a problem.

3. **Generative feature exploration** — CPO provides business goals ("increase engagement 15%"). System analyzes user behavior, brainstorms features, mock-ups UIs, presents options for approval.

**The human role shifts from mechanic to strategist.** We stop building software piece-by-piece and start growing it.

---

## 8. Architectural Primitives

### New Tables

```sql
-- Core logging
CREATE TABLE pipeline_runs (
    id UUID PRIMARY KEY,
    feature_id UUID REFERENCES features(id),
    status TEXT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    terminal_reward FLOAT
);

CREATE TABLE interactions (
    id UUID PRIMARY KEY,
    run_id UUID REFERENCES pipeline_runs(id),
    agent_id TEXT,
    role TEXT,
    timestamp TIMESTAMPTZ,
    action_type TEXT,
    action_params JSONB,
    skills_used TEXT[], -- which skills were in the prompt
    eligibility_trace FLOAT DEFAULT 0
);

CREATE TABLE signals (
    id UUID PRIMARY KEY,
    interaction_id UUID REFERENCES interactions(id),
    signal_type TEXT,
    metadata JSONB,
    inferred_reward FLOAT,
    final_reward FLOAT
);

-- Skill evolution
ALTER TABLE skills ADD COLUMN utility_score FLOAT DEFAULT 0;
ALTER TABLE skills ADD COLUMN usage_count INT DEFAULT 0;
ALTER TABLE skills ADD COLUMN lineage_id UUID;
ALTER TABLE skills ADD COLUMN role TEXT;
ALTER TABLE skills ADD COLUMN is_active BOOLEAN DEFAULT true;
```

### Core Services

| Service | Role |
|---|---|
| **SignalCollector** | Attached to executor. Generates signals for every tool call and state transition. |
| **CreditAssigner** | Background worker. Runs when pipeline_run concludes. Implements eligibility traces. |
| **SkillManager** | UCB1 bandit for selection. Utility aggregation. Garbage collection of dead skills. |
| **SkillGenerator** | Specialized agent. Triggered by high-failure patterns. Proposes new SKILL.md files. |
| **PromptAssembler** | Resolves role hierarchy, selects skills via bandit, applies Memory context, enforces token budget. |

---

## 9. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Mode collapse** | Population diversity (PBT), exploration bonus (UCB1), periodic human-injected skills |
| **Reward hacking** | Rich signal taxonomy (hard to hack 6 signals simultaneously), delayed pipeline outcome as ultimate reward, Canon guardrails |
| **Skill explosion** | Garbage collection (archive skills below utility threshold after N uses), deduplication agent (merge semantically similar skills) |
| **Context bloat** | Hard token budget in PromptAssembler. Priority: Canons > Doctrines > selected Skill > high-relevance Memory. Use MMR for diverse retrieval. |
| **Cold start** | Bootstrap with manually-written skills (we already have these). System improves from there. |

---

## 10. Implementation Roadmap

### Phase 1: Instrumented Pipeline (Months 0-2)
**Critical path — everything depends on this.**

- Define schemas for interactions, signals, pipeline_runs
- Instrument executor to emit ToolSuccess/ToolFailure signals
- Instrument orchestrator to emit StateTransition signals
- Build dashboard view of interaction stream
- **Goal:** Full observability. Trace any outcome to its action sequence.

### Phase 2: Attribution Loop (Months 3-5)
**Depends on:** Phase 1 data.

- Build CreditAssigner worker (eligibility traces, nightly batch)
- Back-populate final_reward for historical interactions
- Update skills table with utility_score/usage_count from aggregated rewards
- Implement UCB1 bandit in SkillManager
- **Goal:** System knows which skills work and actively favors them.

### Phase 3: Learning Agent (Months 6-9)
**Depends on:** Phase 2 skill utility scores.

- Build SkillGenerator agent (input: failure pattern, output: proposed SKILL.md)
- Build triggering mechanism for high-failure patterns
- "Skill PR" workflow — generated skills require human approval before activation
- **Goal:** System proposes its own improvements. Human in the loop.

### Phase 4: Full Autonomy (Months 10-12+)
**Depends on:** Stable Phase 3.

- PBT for personality adaptation
- Skill Canarier — auto-approve high-confidence skills to subset of agents
- Roll out to full population if performance improves
- Begin 10X vision features
- **Goal:** Continuous self-improvement with human oversight role.

---

## CPO Assessment

**What's real here vs what's aspirational:**

- Phases 1-2 are engineering work. No research risk. We have all the primitives. Ship it.
- Phase 3 is where MetaClaw already proved the pattern works. Low risk, high payoff.
- Phase 4 is ambitious but optional. The system is already transformative at Phase 3.
- PBT for personality is cool but we need more throughput first. Park it.
- The UCB1 bandit for skill selection is the single highest-ROI idea here. It turns our static skill injection into a self-optimizing system with almost no infrastructure cost.

**Biggest risk:** Over-engineering. MetaClaw works with a simple -1/0/+1 reward and threshold-based skill generation. We don't need eligibility traces on day one. Ship the simple version (log everything, score on pipeline outcome, generate skills from failure clusters) and evolve from there.

**Recommendation:** Create a feature for Phase 1 (instrumented pipeline). It's the foundation everything else needs, and it's independently valuable as observability infrastructure.
