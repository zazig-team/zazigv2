# Workspace Repo Linking

**Date:** 2026-03-07
**Status:** Draft
**Authors:** Chris Evans, Claude
**Part of:** Org Model — Local Agent, Workspace Provisioning

## Problem

Persistent agents (CPO, CTO) can't see project code. Their workspaces contain CLAUDE.md, skills, and reports — but no repo access. When the CPO needs to reference code (e.g. investigating a failed merge, understanding a module before speccing), it has to search the filesystem first, guessing where repos live.

Code jobs already get worktrees. Persistent agents get nothing.

## Solution

Create a shared read-only worktree per project repo, symlinked into every persistent agent workspace. Agents browse code at `./repos/{project}/` and investigate branches via git commands against the bare clone.

## Filesystem Layout

Multi-company, multi-project example:

```
~/.zazigv2/
  repos/
    # Bare clones (already exist)
    A1/                              ← bare clone
    A2/                              ← bare clone
    B1/                              ← bare clone

    # Shared read-only worktrees (NEW)
    A1-worktree/                     ← checked out to master
    A2-worktree/                     ← checked out to master
    B1-worktree/                     ← checked out to master

  # Company A — sees only A's repos
  {companyA}-cpo-workspace/
    repos/
      A1 → ~/.zazigv2/repos/A1-worktree
      A2 → ~/.zazigv2/repos/A2-worktree
    CLAUDE.md

  {companyA}-cto-workspace/
    repos/
      A1 → ~/.zazigv2/repos/A1-worktree
      A2 → ~/.zazigv2/repos/A2-worktree
    CLAUDE.md

  # Company B — sees only B's repos
  {companyB}-cpo-workspace/
    repos/
      B1 → ~/.zazigv2/repos/B1-worktree
    CLAUDE.md
```

- **Bare clones** — already exist, shared git database used by code job worktrees
- **Shared worktrees** — one per repo (not per company or role), checked out to master
- **Symlinks** — scoped per workspace, linking only repos belonging to that company's projects
- **Company isolation** — Company A agents can't see Company B repos

## Agent Code Access

Two modes of access, documented in CLAUDE.md:

**Browsing (everyday use):**
Agents read files at `./repos/{project}/` — standard file browsing, always on master.

**Branch investigation (debugging, merge failures):**
Agents run git commands against the bare clone:
```bash
git -C ~/.zazigv2/repos/{project} log master..{branch}
git -C ~/.zazigv2/repos/{project} diff master..{branch}
git -C ~/.zazigv2/repos/{project} show {branch}:path/to/file
```

No checkout needed — the bare clone has all branch data.

## Implementation

### 1. `RepoManager.ensureWorktree()` — `branches.ts`

New method on `RepoManager`:

```
ensureWorktree(projectName: string): string
  bareDir = ~/.zazigv2/repos/{projectName}
  worktreeDir = ~/.zazigv2/repos/{projectName}-worktree

  if worktree doesn't exist:
    git worktree add {worktreeDir} master
  else:
    git -C {bareDir} fetch origin
    git -C {worktreeDir} reset --hard origin/master

  return worktreeDir
```

Called after `ensureRepo()` — bare clone must exist first.

### 2. Workspace setup — `executor.ts` → `handlePersistentJob()`

After creating workspace dir and writing CLAUDE.md:

1. Look up company's projects (already available in job context)
2. For each project: `ensureRepo()` then `ensureWorktree()`
3. Create `{workspace}/repos/` directory
4. Symlink `{workspace}/repos/{projectName}` → `~/.zazigv2/repos/{projectName}-worktree`

Follows the same pattern as skill symlinks in `setupJobWorkspace()`.

### 3. CLAUDE.md template — `company-persistent-jobs/index.ts`

Add a `Local Repos` section to the company context block:

```markdown
### Local Repos

Browse code: `./repos/{projectName}/` (master)

Branch investigation:
  git -C ~/.zazigv2/repos/{projectName} log master..{branch}
  git -C ~/.zazigv2/repos/{projectName} show {branch}:path/to/file
```

Generated per-company — lists only that company's projects.

### 4. Worktree refresh — daemon heartbeat in `start.ts`

The daemon already runs a heartbeat loop (~60s) polling the orchestrator.

- **On daemon startup** (before first heartbeat): `ensureRepo()` + `ensureWorktree()` for all company projects. Guarantees fresh state before any persistent agent starts.
- **On each heartbeat**: for each company project, `git fetch origin` on bare clone + `git reset --hard origin/master` on worktree. Worktree is never more than ~60s stale.
- **Cost**: one fetch per project per heartbeat — negligible for typical project counts.

This works across machines. If Tom's machine merges a job to master, Chris's daemon picks it up on the next heartbeat via fetch from origin.

## Edge Cases

- **Corrupted worktree** — `ensureWorktree()` validates the dir is a proper worktree. If not, removes and recreates.
- **Bare clone missing** — `ensureRepo()` handles this (clones from remote). `ensureWorktree()` runs after.
- **New project added** — Next heartbeat calls `ensureRepo()` + `ensureWorktree()` for all projects, picks up new ones automatically.
- **Project removed** — Orphaned worktrees and symlinks persist until cleanup. Non-urgent, can add a prune step later.
- **Agent writes to worktree** — Read-only by convention, not enforced. Next heartbeat's `reset --hard` wipes accidental writes. Self-healing.

## Scope

**In scope:**
- Shared worktree creation and refresh
- Symlinks in persistent agent workspaces
- CLAUDE.md template update
- Heartbeat-driven refresh

**Out of scope:**
- Enforcing read-only (filesystem permissions) — convention is sufficient
- Worktree pruning for removed projects — can add later
- Configurable branch per project — always master for now
