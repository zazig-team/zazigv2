# Worktree Freshness for Expert Sessions

**Date:** 2026-03-09
**Status:** Implemented (Codex, 2026-03-09) — pending test runner fix + staging validation
**Authors:** Tom Weaver, Claude
**Implemented by:** Codex (gpt-5.3-codex)
**Source:** Chris Evans staging report — expert sessions (e.g., hotfix expert) behind current master

---

## Problem

When a user requests an interactive expert session (e.g., "give me a hotfix expert"), the daemon creates a git worktree for the expert to work in. Chris reports that the expert's branch is behind the current master — the expert doesn't see recent changes.

### How expert sessions currently create worktrees

```
expert-session-manager.ts:157-221

1. Check bare repo exists at ~/.zazigv2/repos/{projectName}/
   → If not, git clone --bare {repoUrl}
2. Remove stale worktree metadata from previous sessions
3. git fetch origin                                          ← CAN FAIL
   → On failure: git fetch --force origin +refs/heads/{branch}:refs/remotes/origin/{branch}
4. git worktree add --detach {workspaceDir}/repo origin/{branch}
   → On failure: try local branch name without origin/ prefix
```

### The failure modes

**Failure Mode 1: Bare repo fetch blocked by diverged branches**

The bare repo at `~/.zazigv2/repos/{projectName}/` is shared between:
- Persistent agent worktrees (`{projectName}-worktree`)
- Job worktrees (`~/.zazigv2/worktrees/job-{jobId}/`)
- Expert session worktrees (`~/.zazigv2/expert-{sessionId}/repo/`)

When job branches exist that have diverged from their remote tracking branches (normal during active development), `git fetch origin` fails with non-fast-forward rejection. The fallback (`git fetch --force origin +refs/heads/{branch}:...`) only fetches the single branch — but if the branch requested is `master`, and the non-fast-forward failure is on a job branch, the fallback still works because it force-fetches master specifically.

**However:** The fallback uses `--force` with a specific refspec. This DOES update the requested branch. But it only fetches that one branch's refs. If the expert needs to see tags, other branches, or if the refspec doesn't match exactly, it fails silently.

**Failure Mode 2: Bare repo was cloned long ago**

If the bare repo was cloned days ago (daemon hasn't restarted), and no full successful fetch has happened since, the expert session's fetch might be working against a very stale bare repo. Even a successful `git fetch origin` only brings it up to now — but if the fetch fails (Mode 1), the expert gets whatever stale refs exist.

**Failure Mode 3: Detached HEAD from wrong commit**

The worktree is created with `--detach origin/{branch}`. But `origin/{branch}` in the bare repo refers to `refs/remotes/origin/{branch}` — which is whatever the last successful fetch retrieved. If the fetch was partial or failed, this ref is stale.

### Why Chris's fix (PR #210) helps but doesn't solve it

PR #210 added:
- Stale worktree cleanup before creation (good — prevents "already exists" errors)
- Fetch resilience with branch-targeted fallback (good — prevents total fetch failure)
- Worktree prune to clean metadata (good — prevents ghost worktrees)

But it doesn't address:
- The bare repo being shared with active job branches that block full fetches
- The fundamental timing issue: expert sessions are only as fresh as the last successful fetch of the bare repo

---

## Prior Art

- **Job worktrees** (branches.ts): Each job creates a fresh worktree with a fetch. Jobs don't share worktrees — each gets their own branch. But they DO share the bare repo, which is the contention point.
- **ensureWorktree** (branches.ts:221): Persistent agent worktree creation also fetches. Same bare repo contention.
- **PR #210**: Chris's recent fix for stale expert repos — partial solution.

## Codebase Impact

| Area | Files Affected |
|------|---------------|
| Expert session manager | `packages/local-agent/src/expert-session-manager.ts` — fix fetch strategy |
| RepoManager | `packages/local-agent/src/branches.ts` — possibly add force-fetch-master method |
| Bare repo management | Same files — consider per-purpose bare repos or smarter fetch |

Blast radius: **narrow** — changes confined to local-agent git operations.

---

## Design

### The Core Insight

The problem is that one bare repo serves three different consumers with conflicting needs:
1. **Persistent agent worktrees** — want a stable master checkout, refreshed periodically
2. **Job worktrees** — want feature/job branches, created and destroyed frequently, can diverge
3. **Expert sessions** — want a fresh master (or specified branch) checkout, created on demand

Job branches (2) create diverged refs that block full fetches needed by (1) and (3). This is the root contention.

### ⚠️ Root Cause Verification Required (Codex HIGH Finding)

Codex flags that the "diverged job branches blocking fetch" diagnosis may be incorrect. In a bare repo, the default fetch refspec typically includes `+` (force), which should allow non-fast-forward updates. The actual failure might be:
- **Worktree checkout protection** — Git refuses to update refs checked out in active worktrees (different from non-fast-forward)
- **Auth/network errors** — SSH key issues, GitHub rate limiting, network timeouts
- **Corrupted refs** — stale `.git/packed-refs` or lock files from interrupted operations
- **Lock contention** — concurrent git operations on the same bare repo

**Before implementing, verify the actual error:**
```bash
# On Chris's staging machine, reproduce the expert session and capture stderr:
git -C ~/.zazigv2/repos/zazigv2/ fetch origin 2>&1
```

The fix (Option A) works regardless of root cause — force-fetching a single branch bypasses all of the above. But understanding the actual error prevents fixing the wrong thing.

### Option A: Force-Fetch Target Branch (Recommended — Quick Fix)

Change the expert session fetch strategy to always force-fetch the target branch, bypassing contention with the shared bare repo:

```typescript
// In expert-session-manager.ts, replace the current two-step fetch logic:

// CRITICAL: bare repos use refspec refs/heads/*:refs/heads/* (set by
// RepoManager.ensureRepo at branches.ts:187). There are NO refs/remotes/origin/* refs.
// Force-fetch the target branch into refs/heads/ to match this convention.
await execFileAsync("git", [
  "-C", bareRepoDir,
  "fetch", "--force", "origin",
  `+refs/heads/${branch}:refs/heads/${branch}`,
]);
```

**Why this works regardless of root cause:**
- `+` prefix allows non-fast-forward updates (force)
- Only touches one ref — no contention with job branches or active worktrees
- `--force` combined with `+` refspec is maximally permissive
- Always gets the latest commit for the target branch from remote
- Atomic operation — doesn't depend on other refs being clean

**Pros:**
- Minimal code change (~5 lines replacing ~15 lines of try/catch/fallback)
- Fixes the immediate problem regardless of root cause
- No architectural changes needed
- Backward compatible

**Cons:**
- Expert can't see other branches (only the one they requested). Usually fine — experts work on one branch.
- Doesn't fix the underlying shared-bare-repo contention for other consumers.
- Missing tags (Gemini + Codex finding — see enhancement below)

**Enhancement: Include tags in the fetch** (Gemini recommendation):
```typescript
// If experts need tags (versioning, releases):
await execFileAsync("git", [
  "-C", bareRepoDir,
  "fetch", "--force", "origin",
  `+refs/heads/${branch}:refs/heads/${branch}`,
  "+refs/tags/*:refs/tags/*",
]);
```

**Worktree creation must also use `refs/heads/` convention:**
```typescript
// Current code uses `origin/${branch}` which doesn't exist in these bare repos.
// The fallback to just `${branch}` works, but only by accident.
// Fix: use refs/heads/${branch} directly (no origin/ prefix needed).
await execFileAsync("git", [
  "-C", bareRepoDir,
  "worktree", "add", "--detach", worktreeTarget,
  `refs/heads/${branch}`,
]);
```

### Option B: Separate Bare Repos per Consumer Type

Split the shared bare repo into purpose-specific clones:

```
~/.zazigv2/repos/
├── zazigv2/              ← bare repo for JOB branches (existing)
├── zazigv2-shared/       ← bare repo for persistent agent worktrees (new)
└── zazigv2-expert/       ← bare repo for expert sessions (new, or per-session clone)
```

**Pros:**
- Complete isolation — job branches never interfere with expert fetches
- Each consumer can fetch independently without lock contention
- Clean separation of concerns

**Cons:**
- 3x disk space per project (~50-200MB per bare clone)
- More complex RepoManager
- Three things to keep in sync instead of one
- Overkill if Option A solves the problem

### Option C: Per-Session Shallow Clone (No Bare Repo)

For expert sessions, skip the bare repo entirely and do a shallow clone directly:

```typescript
await execFileAsync("git", [
  "clone", "--depth", "1", "--branch", branch,
  msg.repo_url, worktreeTarget,
]);
```

**Pros:**
- Always fresh — clones from remote every time
- No shared state — no contention with job branches
- Fast for shallow clones (~2-5 seconds for a typical repo)

**Cons:**
- No git history (depth 1) — expert can't `git log`, `git blame`, or compare branches
- Network-dependent — fails if GitHub is down or slow
- Re-clones every time — wasteful if expert sessions are frequent

### Option D: Shallow Clone with Deepen-on-Demand

Hybrid of C with the ability to deepen:

```typescript
// Clone shallow
await execFileAsync("git", [
  "clone", "--depth", "50", "--branch", branch,
  msg.repo_url, worktreeTarget,
]);
// Expert can run `git fetch --deepen=100` if they need more history
```

**Pros:**
- Fresh, fast, independent
- 50 commits of history is enough for most expert work
- Can deepen if needed

**Cons:**
- Still re-clones each time
- 50-commit history might not be enough for some investigations

### Recommendation: Option A (Immediate) + Bare Repo Pre-warming (from Proposal 1)

**Immediate fix (Option A):** Change expert session fetch to force-fetch only the target branch. This is a 5-line fix that solves Chris's problem today regardless of root cause.

**Synergy with Proposal 1:** The periodic daemon refresh from the persistent agent proposal also refreshes the bare repo (via `git fetch origin`). If that refresh runs every 5 minutes, expert sessions launching between refreshes find a bare repo that's at most 5 minutes stale — making the expert's own force-fetch a small delta rather than a large catch-up. The two proposals reinforce each other.

**Future improvement (Option D):** If contention continues to be a problem, consider per-session shallow clones for expert sessions. This eliminates the shared bare repo dependency entirely for the expert use case.

### Concurrency Fix: Route Through RepoManager Lock (Codex HIGH Finding)

Expert sessions currently call `execFileAsync("git", ...)` directly, bypassing the `RepoManager.withLock()` mechanism used by job worktrees and persistent agent operations. With Proposal 1's periodic refresh also operating on the same bare repo, this creates a three-way race.

**Fix:** Add a method to RepoManager that expert sessions can call:

```typescript
// In branches.ts — new method for expert sessions
async fetchBranchForExpert(projectName: string, branch: string): Promise<void> {
  const bareDir = join(REPOS_BASE, projectName);
  return this.withLock(bareDir, async () => {
    // Use refs/heads/* convention matching ensureRepo() config (branches.ts:187)
    await this.git(bareDir, "fetch", "--force", "origin",
      `+refs/heads/${branch}:refs/heads/${branch}`);
  });
}
```

Expert session manager calls this instead of direct `execFileAsync`. All git operations on the bare repo now go through one lock.

---

## Implementation Phases

| Phase | Work | Effort |
|-------|------|--------|
| 1 | Change expert fetch to force-fetch target branch only | S |
| 2 | Add explicit logging of commit hash after worktree creation | S |
| 3 | Test on staging with Chris — verify expert sees latest master | S |
| 4 | (Future) Evaluate per-session shallow clone if contention persists | M |

**Total effort for immediate fix: S** — this is a ~10 line change.

### Implementation Notes (2026-03-09, Codex)

- Expert session manager now receives shared RepoManager via constructor (expert-session-manager.ts:51)
- Old `origin/{branch}` fallback flow replaced with `ensureRepo()` + `fetchBranchForExpert()`
- Worktree creation uses `refs/heads/${branch}` directly (not `origin/${branch}`)
- Commit hash logged after worktree creation for freshness verification
- Tests added in expert-session-manager.test.ts:232 for shared RepoManager expert flow
- `npm run typecheck` passes
- **Blocker:** Vitest cannot run due to mixed-architecture Rollup/esbuild install — tests need runner fix before validation

---

## Review History

Reviewed by Codex (gpt-5.3-codex) and Gemini. Findings incorporated into v2:

| # | Finding | Severity | Source | Resolution |
|---|---------|----------|--------|------------|
| 1 | Root cause may be misidentified — verify actual `git fetch` error first | High | Codex | **FIXED** — added verification step with command to run on staging. Fix works regardless of root cause. |
| 2 | Expert sessions bypass RepoManager lock — concurrent race with jobs and refresh | High | Codex | **FIXED** — added `fetchBranchForExpert()` method routed through `withLock()` |
| 3 | Submodule staleness not addressed | High | Gemini | **DOCUMENTED** as open question #7 — add `git submodule update` if `.gitmodules` detected |
| 4 | Tags/refs missing with single-branch refspec | Medium | Both | **FIXED** — added optional tags refspec enhancement to Option A |
| 5 | Network latency on critical path of expert startup | Medium | Gemini | **MITIGATED** — Proposal 1's periodic refresh pre-warms the bare repo, making expert fetches a small delta |
| 6 | Observability under-scoped | Low | Codex | **FIXED** — commit hash logging already in proposal, reinforced |
| 7 | Refspec mismatch — bare repos use `refs/heads/*` not `refs/remotes/origin/*` | Critical | Gap review | **FIXED** — all refspecs changed to `refs/heads/{branch}` matching `ensureRepo()` config. Worktree creation uses `refs/heads/{branch}` directly instead of `origin/{branch}`. |
| 8 | Expert sessions don't import RepoManager — `fetchBranchForExpert()` needs wiring | Medium | Gap review | **DOCUMENTED** — requires passing RepoManager instance to ExpertSessionManager constructor |
| 9 | Expert-created bare repos (before RepoManager) get default refspec, then ensureRepo reconfigures it | Low | Gap review | **ACCEPTED** — orphaned `refs/remotes/origin/*` are harmless; `refs/heads/*` is authoritative after reconfig |

---

## Risks and Open Questions

1. **Does the force-fetch refspec work on all Git versions?** The `+refs/heads/X:refs/remotes/origin/X` syntax is standard Git. Tested on Git 2.39+ (macOS default). Should work on any modern Git.

2. **What if the expert needs a non-master branch?** The current code already supports `msg.branch ?? "master"`. The force-fetch uses `${branch}` — works for any branch name. The expert gets exactly the branch they asked for, at its latest remote state.

3. **Should we log the commit hash for debugging?** Yes — add logging after worktree creation:
   ```typescript
   const commitHash = await execFileAsync("git", ["-C", worktreeTarget, "rev-parse", "HEAD"]);
   console.log(`[expert] Worktree at commit: ${commitHash.stdout.trim().slice(0, 8)}`);
   ```
   This makes it trivial to verify freshness when debugging.

4. **What about the persistent agent worktree refresh (Issue 1)?** The companion proposal (`worktree-freshness-persistent-agents.md`) addresses that separately with a periodic daemon refresh. Both proposals are independent and should be implemented together.

5. **Race condition: expert starts while job is pushing to same branch.** Unlikely (experts typically work on master, jobs on feature branches), but if it happens: the force-fetch gets whatever was at origin at fetch time. The job push lands after. Expert might be 1 commit behind. Acceptable — this is a read-only starting point, not a live sync.

6. **Bare repo lock contention.** Fixed in v2 — expert sessions now route through `RepoManager.fetchBranchForExpert()` which uses `withLock()`. All bare repo operations are serialised.

7. **Submodule staleness.** (Gemini HIGH finding) If the repository uses submodules, `git worktree add` does NOT update submodules. Experts could find themselves with a fresh main repo but stale dependencies. Fix: after worktree creation, check for `.gitmodules` and run `git submodule update --init --recursive` if present. zazigv2 does not currently use submodules, so this is a defensive measure for future repos.

8. **Root cause validation.** (Codex HIGH finding) Before deploying this fix, Chris should run `git -C ~/.zazigv2/repos/zazigv2/ fetch origin 2>&1` on staging to capture the actual error. The fix works regardless, but understanding the error informs whether the bare repo needs deeper cleanup (corrupted refs, stale locks, etc.).
