# Expert Session Concurrency

**Date:** 2026-03-24
**Author:** CPO (with Codex second opinion)
**Status:** Approved

## Problem

Expert sessions cannot run concurrently. Every expert session runs:

```bash
git fetch --force origin +refs/heads/master:refs/heads/master
git worktree add -b expert/{role}-{shortId} {targetDir} refs/heads/master
```

The fetch fails when any other worktree has master checked out:

```
fatal: refusing to fetch into branch 'refs/heads/master'
checked out at '/Users/.../expert-{otherId}/repo'
```

This means only one expert session can run at a time per repo. Additionally, tool-only experts (triage-analyst, spec-reviewer) pay the full cost of git clone + worktree setup despite never touching files.

### Impact

- Triage takes 3.5+ minutes instead of ~30 seconds
- Headless experts (triage, spec-writing) queue behind each other and behind interactive experts
- A stale worktree (March 13 incident) blocked ALL expert sessions for 11 days

## Design

### Phase 1: Repo-Free Expert Path

**Goal:** Tool-only experts skip the worktree entirely.

Add `needs_repo BOOLEAN DEFAULT true` to the `expert_roles` table. When `needs_repo = false`, the expert session manager skips the entire git/worktree flow and spawns Claude with only the brief + MCP tools.

**Roles affected:**
- `triage-analyst`: `needs_repo = false` — only calls MCP tools (query_ideas, update_idea, etc.)
- `spec-reviewer`: `needs_repo = false` — only calls MCP tools

**Roles unchanged (need repo):**
- `hotfix-engineer`: edits files, pushes commits
- `spec-writer`: writes spec files to `docs/specs/`, commits them
- `test-deployment-expert`: reads code/config

**Changes:**
1. Migration: `ALTER TABLE expert_roles ADD COLUMN needs_repo BOOLEAN DEFAULT true;`
2. Migration: `UPDATE expert_roles SET needs_repo = false WHERE name IN ('triage-analyst', 'spec-reviewer');`
3. `start-expert-session` edge function: include `needs_repo` in the broadcast/poll payload
4. `expert-session-manager.ts`: skip worktree setup when `msg.needs_repo === false`
5. Skip the worktree creation, branch setup, and post-session push/merge for repo-free experts

**Expected result:** Triage drops from 3+ minutes to under 60 seconds.

### Phase 2: Per-Session Temp Refs

**Goal:** Repo-needing experts can run concurrently without blocking each other.

Replace the current `fetchBranchForExpert` approach with per-session temporary refs. This pattern already exists in two places in `branches.ts` (lines 277 and 421) for the shared worktree and feature branch flows.

**Current (broken for concurrency):**
```bash
git fetch --force origin +refs/heads/master:refs/heads/master
git worktree add -b expert/{role}-{shortId} {targetDir} refs/heads/master
```

**New (per-session temp ref):**
```bash
git fetch --refmap= --no-write-fetch-head origin \
  +refs/heads/{defaultBranch}:refs/zazig-expert-base/{sessionId}
git worktree add -b expert/{role}-{shortId} {targetDir} \
  refs/zazig-expert-base/{sessionId}
# After worktree created, delete temp ref:
git update-ref -d refs/zazig-expert-base/{sessionId}
```

**Key details:**
- `--refmap=` suppresses configured refspecs, so git doesn't also try to update `refs/heads/master`
- `--no-write-fetch-head` avoids writing to the shared `FETCH_HEAD` file (unsafe for concurrent fetches — logical clobbering)
- Each session gets its own temp ref namespace, eliminating ref conflicts entirely
- Temp ref is cleaned up after worktree creation

**Default branch resolution:**
- Resolve `master` vs `main` dynamically via `git remote show origin` or `git symbolic-ref refs/remotes/origin/HEAD`
- Store the resolved default branch name in `ExpertSessionState` for use during the merge-back flow
- Remove hardcoded `"master"` from expert-session-manager.ts

**Post-session merge-back (unchanged in structure):**
```bash
git push origin HEAD:refs/heads/{expertBranch}
git checkout {defaultBranch}
git merge {expertBranch}
git push origin {defaultBranch}
git push origin --delete {expertBranch}
```

**Per-repo lock:** Keep as-is for now. The lock serializes git operations per repo, which is still valuable for safety. The temp-ref approach eliminates the ref conflict that caused hard failures. Lock relaxation (e.g., concurrent reads, serialized writes) can be evaluated later if contention becomes measurable.

**Remove `pruneBlockingWorktrees()`:** The function added by the first hotfix engineer (2026-03-24) is a band-aid for the `refs/heads/master` conflict. Once Phase 2 lands, it's unnecessary and should be removed — it risks deleting live worktrees.

**Changes:**
1. `branches.ts`: new method `fetchForExpertSession(projectName, sessionId)` using temp refs
2. `expert-session-manager.ts`: call new method instead of `fetchBranchForExpert`
3. `expert-session-manager.ts`: resolve default branch dynamically, store in session state
4. `expert-session-manager.ts`: use stored default branch in `pushUnpushedCommits`
5. Remove `pruneBlockingWorktrees()` from expert-session-manager.ts
6. Tests: add cases for concurrent expert starts with distinct temp refs, and "another worktree has master checked out" no longer fails

## Out of Scope

- Expert session slot/capacity limits (no evidence of resource exhaustion yet)
- Per-repo lock relaxation (measure contention first)
- Spec-writer repo access refactor (writes to docs/specs/ — needs repo for now)

## Risks

- **Phase 1 role classification:** If a `needs_repo = false` role later needs file access, it must be reclassified. Mitigated by keeping the default as `true`.
- **Phase 2 temp ref cleanup:** If cleanup fails (crash between worktree create and ref delete), orphaned refs accumulate. Mitigated by using a namespaced prefix (`refs/zazig-expert-base/`) that can be bulk-pruned.
- **Default branch detection:** Some repos may not have `refs/remotes/origin/HEAD` set. Fallback to `master`, then `main`.

## Sequencing

Phase 1 first — immediate impact on triage speed. Phase 2 follows — enables concurrent hotfix/spec-writer/deployment sessions.
