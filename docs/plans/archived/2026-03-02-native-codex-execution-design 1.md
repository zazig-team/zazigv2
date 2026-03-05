# Native Codex Execution for Pipeline Jobs

**Date:** 2026-03-02
**Status:** Approved
**Feature:** Codex Delegation Audit (20ea243a)

## Summary

Replace Claude-supervised Codex delegation with native `codex exec` for simple and medium complexity jobs. Adds a lightweight Haiku review step as quality gate. Unlocks 4 idle codex slots per machine and reduces per-job cost.

## Problem

Today, all pipeline code jobs run through `claude -p`. Jobs routed to codex slots get a prompt injection (`CODEX_ROUTING_INSTRUCTIONS`) that tells Claude to delegate to the `codex-delegate` skill, which calls `codex exec` internally. This means:

- Every codex job still consumes a Claude session as supervisor
- Claude adds latency and cost without proportional value on simple/medium tasks
- The 4 codex slots per machine are technically used but via Claude indirection
- No model tiering — all jobs use the same Claude model regardless of complexity

## Approach: Native Codex with Post-Review

Chosen over two alternatives:
- **Enhanced Claude Supervision** (conservative) — skill-level fixes only, doesn't unlock capacity
- **Hybrid Routing** (three paths) — over-engineered, three execution paths to maintain

Native Codex with post-review gives the biggest capacity and cost improvement for a bounded architecture change.

## Design

### 1. Execution Architecture

The executor gains a second execution path in `buildCommand()`.

**Current flow (all jobs):**
```
Executor → claude -p → Claude reads spec → Claude calls codex-delegate → codex exec → Claude reviews → commit
```

**New flow (codex slot jobs):**
```
Executor → codex exec (direct) → changes in worktree → git diff → Haiku review → PASS: commit / FAIL: revert
```

**Detailed steps for a native Codex job:**

1. Executor receives StartJob with `slotType: codex`
2. `buildCommand()` returns `codex exec` instead of `claude -p`
3. Executor writes spec + acceptance criteria to a temp prompt file
4. `codex exec` runs against the feature branch worktree with `--full-auto` sandbox
5. Codex modifies files in place (not a patch — direct filesystem writes)
6. Executor runs `git diff` to capture all changes
7. If diff is empty → job fails ("Codex produced no changes")
8. Executor spawns a short Claude Haiku session for review (see Section 3)
9. PASS → `git add . && git commit && git push`
10. FAIL → `git checkout .` (revert), job marked failed with reason

**Key detail:** `codex exec` works on the local filesystem directly. It runs in the same worktree the executor already checks out for Claude jobs. No new filesystem setup needed.

### 2. Routing Table Changes

**Current state (migration 007):**

| Complexity | Role | Slot Type | Model |
|---|---|---|---|
| simple | junior-engineer | codex | claude-sonnet-4-6 |
| medium | senior-engineer | claude_code | claude-sonnet-4-6 |
| complex | (cpo — legacy seed) | claude_code | claude-opus-4-6 |

**Proposed state:**

| Complexity | Role | Slot Type | Model | Reasoning Effort |
|---|---|---|---|---|
| simple | junior-engineer | codex | gpt-5.3-codex-spark | — |
| medium | senior-engineer | codex | gpt-5.3-codex | xhigh |
| complex | senior-engineer | claude_code | claude-sonnet-4-6 | — |

**CLI syntax produced by executor:**
- Simple: `codex exec -m gpt-5.3-codex-spark --full-auto ...`
- Medium: `codex exec -m gpt-5.3-codex -c model_reasoning_effort=xhigh --full-auto ...`

Reasoning effort is derived from complexity in `buildCommand()`, not stored in the routing table. simple = no effort flag, medium = xhigh.

**Fallback safety:** The orchestrator already has codex→claude_code fallback (executor.ts lines 644-651). If all codex slots are busy, jobs silently upgrade to claude_code and run the Claude-supervised path. Pipeline never blocks.

**Rollback:** One SQL update to the routing table reverts any tier. No code deploy needed.

### 3. Post-Execution Review Step

After `codex exec` completes, the executor spawns a lightweight Claude Haiku session:

**Review prompt:**
```
You are reviewing a code diff produced by an automated coding agent.

## Original Spec
{job spec}

## Acceptance Criteria
{job acceptance_tests}

## Diff
{git diff output}

Review this diff against the spec and acceptance criteria.
PASS if: the changes address the spec, don't introduce obvious bugs,
and don't contain placeholder/todo code.
FAIL if: changes are incomplete, contain obvious errors, modify
unrelated files, or miss critical acceptance criteria.

Respond with exactly one line: PASS or FAIL: <reason>
```

**Why Haiku:** Read-and-judge task, not creative. Fast (~2-3s), cheap (fractions of a cent per review), sufficient for spotting obvious problems.

**What the review does NOT do:**
- Run tests (test-deployer handles this later)
- Iterate or fix issues (fail → retry from scratch)
- Deep architectural review (code-reviewer role, separate stage)

**Failure handling:** FAIL enters normal pipeline retry path. Orchestrator sees failed job, may re-dispatch. Repeated failures → feature fails → surfaces in standup.

### 4. Rollout Strategy

**Two features with a dependency — no timelines attached.**

**Feature 1: Native Codex execution — simple jobs**
- Executor `buildCommand()` gains codex path
- Post-review step (Haiku reviewer)
- Routing table migration: simple → gpt-5.3-codex-spark, codex slot
- ~2-3 jobs

**Feature 2: Native Codex execution — medium jobs**
- Depends on Feature 1 succeeding in production
- Routing table migration: medium → gpt-5.3-codex xhigh, codex slot
- Review prompt tuning based on learnings from simple jobs
- ~1 job

**Success criteria:**
- Feature 1: >80% first-attempt pass rate over 20+ simple jobs
- Feature 2: >70% first-attempt pass rate over 20+ medium jobs

**Explicitly deferred:**
- Iterative retry within a single Codex run
- Codex for non-code job types (combine, verify, deploy)
- Multi-model review (Codex reviewing Codex output)

## Change Surface

| File | Change |
|---|---|
| `packages/local-agent/src/executor.ts` | `buildCommand()` codex path, post-review step (~200-300 lines) |
| `supabase/migrations/XXX_native_codex_simple.sql` | Routing table: simple → codex-spark |
| `supabase/migrations/XXX_native_codex_medium.sql` | Routing table: medium → codex xhigh (Feature 2) |

## Risks

| Risk | Mitigation |
|---|---|
| Codex produces low-quality output on simple tasks | Haiku review catches obvious issues; pipeline retry handles rest |
| Codex doesn't respect worktree boundaries | `--full-auto` sandbox mode constrains filesystem access |
| Review prompt too strict (high false-fail rate) | Tune prompt based on first 20 jobs; easy to adjust without code deploy |
| Review prompt too lenient (bad code reaches branch) | Test-deployer + code-reviewer stages catch downstream; not single point of failure |
| codex exec CLI changes or breaks | Pin CLI version; fallback to claude_code slot via existing orchestrator logic |

## Decision Log

| Decision | Alternatives Considered | Rationale |
|---|---|---|
| Native Codex over enhanced Claude supervision | Keep Claude-supervised path with skill improvements | Doesn't unlock codex slots, higher cost per job |
| Native Codex over hybrid routing | Simple=native, medium=Claude, complex=Claude | Over-engineered, three paths to maintain |
| Haiku for review over Sonnet | Sonnet review, no review, automated-only | Haiku is fast/cheap enough; Sonnet overkill for pass/fail |
| Two features over one | Single feature with all tiers | Feature 1 proves architecture; Feature 2 is gated on success |
| Reasoning effort derived in code | Store in routing table as new column | 1:1 mapping with complexity, no schema change needed |
