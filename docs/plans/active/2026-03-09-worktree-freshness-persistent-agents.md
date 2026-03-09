# Worktree Freshness for Persistent Agents

**Date:** 2026-03-09
**Status:** Implemented (2026-03-09) — merged to master, pending staging validation
**Authors:** Tom Weaver, Claude
**Implemented by:** Codex (gpt-5.3-codex)
**Source:** Chris Evans staging report — CPO worktree behind current master

---

## Problem

Persistent agents (CPO, CTO) access company repos via symlinks:

```
~/.zazigv2/{companyId}-cpo-workspace/repos/zazigv2
  → ~/.zazigv2/repos/zazigv2-worktree/     ← stale
```

The shared worktree is created by `RepoManager.ensureWorktree()` during daemon startup (`handlePersistentJob` at executor.ts:1157). This method does a `git fetch origin` + `checkout + reset --hard master` — but **only once**, at startup time.

After that moment, the worktree is frozen. As master advances (human pushes code, agents merge PRs, CI ships), the CPO's view of the codebase drifts behind. On staging where Chris is actively iterating, this drift can be minutes old. On production with multiple agents shipping, it could be hours.

### Why it matters

- CPO reads design docs, CLAUDE.md, skill files, and codebase to make decisions. Stale docs → stale decisions.
- CTO reviewing architecture sees outdated code. Suggests changes that are already done.
- Any agent commissioned by an exec inherits the exec's stale view (via skill symlinks pointing to the same worktree).
- The cache-TTL reset mechanism (from the exec heartbeat design) regenerates the workspace but calls `ensureWorktree()` again — which DOES refresh, but only at reset time. Between resets (up to 4 hours with hard-TTL), the worktree is stale.

### Root cause trace

```
executor.ts:1157  →  repoManager.ensureWorktree(project.name)
                           ↓
branches.ts:234   →  git fetch origin          ← runs ONCE at startup
branches.ts:254   →  git checkout master
branches.ts:255   →  git reset --hard master   ← snaps to fetched master
                           ↓
                     NO FURTHER UPDATES
```

The `ensureWorktree` method is idempotent but not periodic. It's a "make sure this exists" function, not a "keep this fresh" function.

---

## Prior Art

- **Cache-TTL resets** (exec heartbeat design): Session reset calls `handlePersistentJob` again, which calls `ensureWorktree()` — so worktree refreshes on reset. But the default idle-TTL is 30 minutes and hard-TTL is 4 hours. That's a long window of staleness.
- **check-prompt-freshness.sh**: SessionStart hook that detects role prompt changes. Runs on every Claude session start (not continuously). Only checks prompt hash, not repo freshness.
- **skill-sync.sh**: Periodic skill symlink sync script exists but doesn't pull repos.
- **Git worktree job execution** (shipped design): Job worktrees are always fresh because they're created per-job with a fetch. Persistent worktrees don't get this treatment.

## Codebase Impact

| Area | Files Affected |
|------|---------------|
| RepoManager | `packages/local-agent/src/branches.ts` — add periodic refresh method |
| Executor | `packages/local-agent/src/executor.ts` — call refresh on interval or hook |
| Daemon bootstrap | `packages/local-agent/src/index.ts` — possibly add refresh timer |
| Shell hooks | `packages/local-agent/scripts/` — could add repo-freshness hook |

Blast radius: **narrow** — changes are confined to the local-agent package, no DB migrations, no edge functions.

---

## Design

### Option A: Periodic Background Pull (Recommended)

Add a timer in the daemon that refreshes persistent agent worktrees on an interval.

```typescript
// In daemon bootstrap (index.ts), after persistent agents are spawned:
// CRITICAL: Use the executor's repoManager, NOT a separate instance.
// Each RepoManager has its own lock map — separate instances = no lock coordination.
// (Gap review finding #10)
const REPO_REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let refreshRunning = false; // Reentrancy guard (Codex finding #4)

setInterval(async () => {
  if (refreshRunning) return; // Skip if previous cycle still running
  refreshRunning = true;
  try {
    // Use executor.repoManager (exposed via getter) — same locks as job operations
    const projects = executor.getCompanyProjects(); // Re-read each cycle (Codex finding #5)
    for (const project of projects) {
      if (!project.repo_url) continue;
      try {
        await executor.repoManager.refreshWorktree(project.name);
      } catch (err) {
        console.warn(`[daemon] repo refresh failed for ${project.name}:`, err);
      }
    }
  } finally {
    refreshRunning = false;
  }
}, REPO_REFRESH_INTERVAL_MS);
```

**Implementation note:** `JobExecutor` currently declares `private readonly repoManager`. Change to `public readonly repoManager` (or add a getter). Also add `getCompanyProjects()` to expose the stored project list.

New method on RepoManager:

```typescript
async refreshWorktree(projectName: string): Promise<void> {
  const bareDir = join(REPOS_BASE, projectName);
  const worktreeDir = join(REPOS_BASE, `${projectName}-worktree`);

  if (!existsSync(worktreeDir)) return; // No worktree to refresh

  return this.withLock(bareDir, async () => {
    // Fetch latest from origin
    try {
      await this.git(bareDir, "fetch", "origin");
    } catch (e) {
      console.warn(`[RepoManager] refresh fetch warning: ${getErrorMessage(e)}`);
    }

    // IMPORTANT: bare repos use refspec refs/heads/*:refs/heads/* (set by ensureRepo
    // at branches.ts:187). There are NO refs/remotes/origin/* refs. After fetch,
    // branches land directly at refs/heads/{branch}.
    const targetBranch = await this.resolveSharedWorktreeBranch(bareDir);

    // Check if worktree is behind
    const local = await this.git(worktreeDir, "rev-parse", "HEAD");

    let remote: string;
    try {
      remote = await this.git(bareDir, "rev-parse", `refs/heads/${targetBranch}`);
    } catch {
      return; // Can't resolve target branch — skip this cycle
    }

    if (local.trim() === remote.trim()) return; // Already up to date

    // Verify this is a fast-forward (Gemini recommendation: don't blindly reset)
    try {
      const mergeBase = await this.git(worktreeDir, "merge-base", local.trim(), remote.trim());
      if (mergeBase.trim() !== local.trim()) {
        console.error(`[RepoManager] CRITICAL: ${projectName} worktree has diverged from origin — skipping reset. Local: ${local.trim().slice(0,8)}, remote: ${remote.trim().slice(0,8)}`);
        return; // Don't destroy diverged state — needs manual intervention
      }
    } catch {
      console.warn(`[RepoManager] merge-base check failed for ${projectName} — skipping reset`);
      return;
    }

    // Fast-forward the worktree (safe — verified non-diverged above)
    await this.git(worktreeDir, "reset", "--hard", `refs/heads/${targetBranch}`);
    console.log(`[RepoManager] refreshed ${projectName} worktree: ${local.trim().slice(0,8)} → ${remote.trim().slice(0,8)}`);
  });
}
```

**Pros:**
- Simple, predictable
- No agent interaction needed — happens silently
- 5-minute interval keeps CPO within ~5 minutes of master (acceptable for strategic work)
- Lock mechanism prevents conflict with concurrent job worktree operations

**Cons:**
- `git reset --hard` could disrupt an agent mid-read if timing is unfortunate (mitigated: agents read files, not run git commands — filesystem reads are atomic at file level)
- 5-minute interval means up to 5 minutes of staleness
- Doesn't help if agent is mid-session referencing old content (they've already loaded it into context)

### Option B: Refresh on Session Start (Hook-Based)

Add repo refresh to the SessionStart hook alongside prompt freshness checking.

```bash
# In check-prompt-freshness.sh or a new check-repo-freshness.sh
cd ~/.zazigv2/repos/${PROJECT_NAME}-worktree
git fetch origin 2>/dev/null
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/master)
if [ "$LOCAL" != "$REMOTE" ]; then
  git reset --hard origin/master
  echo "⚠️ Repository updated to $(git log --oneline -1)"
fi
```

**Pros:**
- Only refreshes when a session actually starts (not wasting resources)
- Agent sees the refresh message in their session

**Cons:**
- SessionStart only fires on new Claude sessions — persistent agents that never restart don't trigger it
- Combined with cache-TTL this works, but between resets the worktree is stale

### Option C: Git Pull Inside Worktree (Agent-Driven)

Add a HEARTBEAT.md task telling the exec to `git pull` in their repos/ directory periodically.

**Pros:**
- Agent-aware — can decide when to pull based on what they're doing
- No daemon code changes

**Cons:**
- Relies on agent following instructions (fragile)
- Agent might pull mid-task and confuse themselves
- Doesn't work if the agent is idle (cache-TTL hasn't fired yet)

### Recommendation: Option A + B Combined

- **Option A** (periodic daemon refresh every 5 min) keeps the worktree fresh in the background regardless of agent state
- **Option B** (SessionStart hook) gives the agent a notification when their view just updated, so they know to re-read any files they were working with
- Together they ensure: max 5 min staleness, and on every session start (including cache-TTL resets) the agent starts fresh

---

## Implementation Phases

| Phase | Work | Effort |
|-------|------|--------|
| 1 | Add `refreshWorktree()` to RepoManager | S |
| 2 | Add periodic refresh timer to daemon bootstrap | S |
| 3 | Add repo-freshness check to SessionStart hook | S |
| 4 | Test on staging with Chris's CPO setup | S |

**Total effort: S** — this is a surgical fix, ~50 lines of new code.

### Implementation Notes (2026-03-09, Codex)

- `RepoManager.refreshWorktree()` added at branches.ts:269 — locked fetch, refs/heads comparison, merge-base divergence check, hard-reset only on fast-forward
- `RepoManager.fetchBranchForExpert()` added at branches.ts — force-fetches single branch into refs/heads under shared lock
- `executor.ts:341` — `repoManager` changed from `private` to `public`, `getCompanyProjects()` getter added
- `index.ts:54` — 5-minute periodic refresh timer using executor's shared RepoManager instance (not a separate instance)
- Persistent agent startup now initialises repos/worktrees through the executor's RepoManager
- Tests added in branches.test.ts:237 (refreshWorktree cases + fetchBranchForExpert locking) and expert-session-manager.test.ts:232 (shared RepoManager expert flow)
- `npm run typecheck` passes
- **Vitest blocker resolved** — all 20 branches tests pass (including 4 refreshWorktree cases)
- **Critical bug found and fixed post-Codex (Claude, PR #220):** Git refuses to update `refs/heads/{branch}` via fetch when that branch is checked out in a linked worktree — even with `+` force prefix. The configured refspec `refs/heads/*:refs/heads/*` (set by `ensureRepo` at branches.ts:187) also runs alongside any explicit CLI refspec, causing the same protection to trigger. Fix: `--refmap=""` suppresses the configured refspec, temp ref namespace `refs/zazig-refresh/{branch}` avoids checkout protection, and reset uses the resolved commit hash (not the ref name).

---

## Review History

Reviewed by Codex (gpt-5.3-codex) and Gemini. Findings incorporated into v2:

| # | Finding | Severity | Source | Resolution |
|---|---------|----------|--------|------------|
| 1 | `reset --hard` can destroy agent edits if persistent agents write to worktree | High | Codex | **FIXED** — added merge-base check before reset; skip if diverged, log CRITICAL |
| 2 | `setInterval` without reentrancy guard can overlap runs | Medium | Codex | **FIXED** — added `refreshRunning` boolean guard |
| 3 | Atomic view inconsistency during multi-file reads | Medium | Gemini | **ACCEPTED** — inherent tradeoff; 5-min interval makes mid-operation refreshes rare. Agents read files into context (point-in-time snapshot). |
| 4 | Lock starvation — refresh could delay high-priority job dispatch | Medium | Gemini | **MITIGATED** — refresh is fast (~1-2s per project); lock contention window is small. Monitor and add skip-if-jobs-active if needed. |
| 5 | Branch-name assumptions hardcode `master` in hook scripts | Medium | Codex | **FIXED** — hook script should use `resolveSharedWorktreeBranch()` logic; code already uses it, hook script updated below |
| 6 | Bootstrap-captured project list goes stale if projects added after startup | Medium | Codex | **DOCUMENTED** as open question #6 — re-read project list from DB on each refresh cycle |
| 7 | Task-level consistency not addressed (stale content in context) | Medium | Codex | **DOCUMENTED** as open question #7 — commit-pinning per task is a future consideration |
| 8 | Observability under-scoped | Low | Codex | **FIXED** — added structured logging to refreshWorktree (fetch outcome, previous/new commit) |
| 9 | Refspec mismatch — bare repos use `refs/heads/*` not `refs/remotes/origin/*` | Critical | Gap review | **FIXED** — changed all refs in refreshWorktree to `refs/heads/{branch}` matching `ensureRepo()` config at branches.ts:187 |
| 10 | Dual RepoManager instances — daemon bootstrap and executor create separate instances with separate lock maps | High | Gap review | **FIXED** — refresh timer must use executor's repoManager (expose via getter or pass to timer). See implementation note below. |
| 11 | `ensureWorktree` resets to local branch ref, not force-fetched ref — may not advance on cache-TTL reset if non-force fetch skipped the update | Medium | Gap review | **DOCUMENTED** as open question #8 — ensureWorktree should use force-fetch for master specifically |

---

## Risks and Open Questions

1. **Race condition with active job worktrees.** The periodic refresh uses the same lock as job worktree creation. If a job is being created while a refresh runs, the lock serialises them — safe but could add latency. Monitor refresh duration; if >5s, consider skipping refresh when jobs are active.

2. **Agent mid-read disruption.** If CPO is reading `docs/plans/active/foo.md` and the refresh changes that file, CPO sees the old version (already in context). This is fine — they'll see the new version next time they read. Only a problem if CPO is doing a multi-step operation that assumes file consistency across reads. Mitigation: refresh interval (5 min) is long enough that mid-operation refreshes are rare.

3. **Diverged branches blocking fetch.** The bare repo refspec is `refs/heads/*:refs/heads/*` WITHOUT `+` (intentionally — protects active job branches). Active job branches that have diverged cause `git fetch origin` to exit non-zero. The `try/catch` in `refreshWorktree` handles this (logs warning, continues — master still updates if it's a fast-forward). For guaranteed master refresh, use targeted force-fetch: `git fetch origin +refs/heads/master:refs/heads/master` — the `+` only applies to the master ref, not all branches.

4. **Multiple company projects.** If a company has 3 projects, refresh cycles through all 3. Each takes ~1-2 seconds (network fetch). Total: 3-6 seconds every 5 minutes. Negligible.

5. **Refresh interval tuning.** 5 minutes is a starting point. Could be configurable per role (`roles.repo_refresh_interval_minutes`) or hardcoded. For staging (where Chris iterates fast), 2 minutes might be better. For production, 10 minutes might suffice.

6. **Project list staleness.** The refresh loop iterates `companyProjects` captured at daemon startup. If projects are added/removed after startup, the loop misses them. Fix: re-query projects table on each refresh cycle (adds one DB read every 5 min — negligible). Defer if single-project setups are the norm for now.

7. **Task-level consistency.** Even with 5-minute refresh, agents keep stale content in their conversation context. For correctness-sensitive workflows (e.g., CTO reviewing architecture), consider: log the commit hash the agent is working against, and emit "repo advanced from X to Y — re-read if working with modified files" as a session message on refresh. Defer to Phase 2.

8. **ensureWorktree may not refresh on cache-TTL reset.** The existing `ensureWorktree()` at branches.ts:254 does `git reset --hard ${targetBranch}` using the local branch ref. But the refspec `refs/heads/*:refs/heads/*` WITHOUT `+` means the fetch may skip the master branch update if it's non-fast-forward (shouldn't happen for master, but could after a force-push). The `refreshWorktree()` method is safer because it explicitly resolves `refs/heads/${targetBranch}` after fetch. Consider: also fix `ensureWorktree()` to use the same approach, or have cache-TTL resets call `refreshWorktree()` instead.
