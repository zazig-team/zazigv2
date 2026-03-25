# Merge Reliability — Fetch Strategy Refactor + Prompt Improvements

**Date:** 2026-03-13
**Status:** Approved design
**Author:** CPO + Human

## Problem

Merge and combine jobs fail or waste time due to stale git refs in the local bare repo. Root cause: the configured fetch refspec (`refs/heads/*:refs/heads/*`) is non-force, so refs that have been rewound or force-pushed (e.g. master after reverts) don't update locally. This causes:

1. **Merge agent rebases onto wrong base** — local `origin/master` diverges from GitHub's actual master. Agent spends 7+ minutes debugging before discovering the mismatch.
2. **Combine agent can't run** — `createDependentJobWorktree` merges dep branches at the infrastructure level and throws on conflict, killing the job before the combiner agent gets a chance to resolve conflicts.
3. **Merge agent rebases unnecessarily** — always rebases even when the PR is already mergeable, introducing risk for no benefit.
4. **No guardrails on build artifacts** — agents can edit `.mjs` release bundles because nothing tells them not to.

## Design

### Change 1: Multi-refspec fetch strategy

**File:** `packages/local-agent/src/branches.ts` — `ensureRepo()` (line 187)

Replace the single refspec:
```
refs/heads/*:refs/heads/*
```

With category-specific refspecs:
```
+refs/heads/master:refs/heads/master          # force — must match remote
+refs/heads/feature/*:refs/heads/feature/*    # force — get rebased/force-pushed
+refs/heads/expert/*:refs/heads/expert/*      # force — already force-fetched today
refs/heads/job/*:refs/heads/job/*             # non-force — protect active jobs
```

Implementation: replace the single `git config remote.origin.fetch` call with multiple `git config --add` calls (first call without `--add` to replace, subsequent with `--add` to append).

Every existing `git fetch origin` call site (`createJobWorktree`, `createDependentJobWorktree`, `ensureFeatureBranch`) automatically inherits the new behaviour. No call-site changes needed.

### Change 2: Remove infrastructure merging from createDependentJobWorktree

**File:** `packages/local-agent/src/branches.ts` — `createDependentJobWorktree()` (lines ~580-603)

Remove the merge loop that runs `git merge --no-ff` for each additional dep branch after the first. The function should:
1. Validate dep branches exist (keep existing logic)
2. Create worktree off `depBranches[0]` (keep existing logic)
3. Return — no merging

The combiner agent receives all `jobBranches` in its context and its prompt already instructs it to merge each one. It has conflict resolution capabilities that the infrastructure layer does not.

### Change 3: Merge agent prompt — check before act

**Delivery:** New SQL migration updating the `job-merger` prompt in the `roles` table.

New flow:
1. `gh pr view --json mergeable,mergeStateStatus` — check if PR is already clean
2. If mergeable: `gh pr merge --squash --delete-branch` — done
3. If conflicting:
   a. `git fetch origin +refs/heads/master:refs/remotes/origin/master` (belt-and-suspenders force-fetch)
   b. `git log --oneline origin/master..HEAD` — verify only this feature's commits are present
   c. If unrelated commits detected: report failure, do not attempt to fix
   d. `git rebase origin/master`, resolve conflicts if any
   e. `git push --force-with-lease`
   f. Wait for GitHub to recalculate, then `gh pr merge --squash --delete-branch`
4. Write `.claude/job-merger-report.md`

Key improvements: skip unnecessary rebases, catch contaminated branches early, no sleep+retry polling loops.

### Change 4: Role prompt hygiene

**Delivery:** Same migration as Change 3.

Add to all git-writing role prompts (`junior-engineer`, `senior-engineer`, `job-merger`, `job-combiner`):
- "Never edit `.mjs` files in `packages/*/releases/`. These are build artifacts."
- "Never edit files outside the scope of your job."

Add to `job-combiner`:
- "If a dep branch doesn't exist locally, fetch it explicitly with `git fetch origin +refs/heads/{branch}:refs/heads/{branch}` before attempting merge."
- "After merging all branches, verify the result builds before reporting success."

## What we are NOT changing

- 5-minute repo refresh cycle — stays focused on persistent agent worktrees
- `fetchBranchForExpert` — already works correctly
- Job branch protection — maintained via non-force refspec for `job/*`
- PR creation flow — untouched
- Orchestrator dispatch logic — untouched

## Delivery

| # | Change | Location | Risk |
|---|--------|----------|------|
| 1 | Multi-refspec fetch | `branches.ts` `ensureRepo` | Low |
| 2 | Remove merge loop from `createDependentJobWorktree` | `branches.ts` | Medium |
| 3 | Merge agent prompt update | New migration | Low |
| 4 | Role prompt hygiene | Same migration | Low |

Can be delivered as one feature or split into 2: infrastructure (1+2) and prompts (3+4).
