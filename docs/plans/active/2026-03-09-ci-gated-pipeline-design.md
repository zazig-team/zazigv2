# CI-Gated Pipeline Design

**Date:** 2026-03-09
**Status:** Draft — idea stage, not yet a feature
**Author:** CPO

## Problem

The pipeline has no CI gate. Features get marked `complete` even when tests fail on master. We saw this with 4 consecutive features in a single session — each stamped complete, each broke CI, each needed a manual follow-up fix feature.

Additionally:
- The verify step (reviewer agent) passes everything — it re-runs tests the engineer already passed, and its LLM-based acceptance criteria check is a rubber stamp
- Test writing is honour-system — the jobify template includes TDD instructions but nothing enforces them, and junior engineer prompts don't mention tests at all
- Features can land with zero test coverage and nobody catches it

## Design

### Three-Layer CI Architecture

**Layer 1 — Local Agent Tests (pre-complete)**
- Code jobs run the project's test command before reporting `job_complete`
- Test command stored in the `projects` table (new column: `test_command`, e.g. `npm test`)
- If tests fail, agent reports `job_failed` — feature stays at current stage
- Only applies to code jobs (not combine, merge, etc.)

**Layer 2 — PR with CI Gate (pre-merge)**
- Combine job assembles feature branch into a PR against master (instead of direct merge)
- Feature status: `combining_and_pr` → `pr_ready`
- GitHub Actions CI runs on the PR (tests, lint, typecheck)
- CI passes → auto-merge PR → feature moves to `complete`
- CI fails → feature stays at `pr_ready`, CPO notified with failure details

**Layer 3 — Master CI Safety Net (post-merge)**
- CI runs on master after every merge (already exists)
- If master CI fails → pipeline identifies last-merged feature → auto-creates a fix job
- Fix job inherits the feature context and CI failure logs

### Remove the Verify Step

The reviewer agent step is removed entirely. It's redundant with CI:
- Running `npm test` / lint / typecheck is now handled by Layer 1 (local) and Layer 2 (PR CI)
- LLM code review of acceptance criteria never catches anything
- Saves one full agent session per feature (cost + time)

Pipeline goes straight from **building → combining_and_pr → pr_ready → complete**.

### Mandatory Test Job in Breakdown

The breakdown specialist must always create a dedicated test job for every feature:

1. **Code job(s)** — implementation only, no TDD instructions
2. **Test job** (mandatory) — depends on all code jobs, writes integration/unit tests for the feature's acceptance criteria

This guarantees every feature has test coverage before CI runs. Code jobs focus purely on implementation; test jobs own all testing.

### Updated Jobify Rules

- Remove TDD Instructions block from code job spec template
- Add mandatory test job requirement: "Every feature MUST include at least one test job that depends on all code jobs"
- Test job spec should reference the feature's acceptance criteria and write tests that verify each one

## Pipeline Flow

```
Feature spec → Breakdown specialist creates:
  ├── Code job(s): implementation only
  └── Test job: depends on all code jobs, writes tests

Code jobs complete → Test job runs → all jobs done

Combine into feature branch → Create PR against master

PR CI passes? → auto-merge → feature complete
PR CI fails?  → stays at pr_ready, CPO notified

Master CI fails? → auto-create fix job for last merged feature
```

## Schema Changes

- `projects` table: add `test_command` column (text, nullable)
- `features` table: ensure `pr_ready` status exists
- `features` table: add `pr_url` column (text, nullable) to track the GitHub PR

## Files Affected

- `packages/local-agent/src/executor.ts` — run test command before reporting job_complete for code jobs
- `supabase/functions/orchestrator/index.ts` — replace direct merge with PR creation, add PR status polling, remove verify step triggers, add master CI failure detection
- `projects/skills/jobify.md` — remove TDD block, add mandatory test job rule
- DB migrations — add `test_command` to projects, `pr_url` to features, `pr_ready` status

## What This Replaces

| Old | New |
|-----|-----|
| Reviewer agent runs npm test | Local agent + PR CI |
| LLM reviews acceptance criteria | Dedicated test job writes actual tests |
| Direct merge to master | PR with CI gate |
| Features marked complete blindly | CI must pass before complete |
| TDD instructions in code jobs (ignored) | Separate test job owns all testing |
| No master CI response | Auto-create fix job on failure |
