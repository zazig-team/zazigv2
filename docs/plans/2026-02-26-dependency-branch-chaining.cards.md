# Card Catalog: Dependency Branch Chaining
**Source:** docs/plans/2026-02-26-dependency-branch-chaining.md (conversation plan)
**Board:** zazigv2 (6995a7a3f836598005909f31)
**Generated:** 2026-02-26T12:00:00Z
**Numbering:** sequential

## Dependency Graph
```
1 ──┐
    ├── 3 ── 4
2 ──┘
        5 (independent of 3/4, depends on 1+2 for types)
```
1 + 2 are shared types (must build first).
3 + 4 are local-agent changes (depend on 1+2).
5 is orchestrator changes (depends on 1+2 for types at build time, independent of 3+4 at code level).

---

### 1 -- Add `dependencyBranches` to StartJob message
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699f9db4b471c35bacb316d7 |

**What:** Add an optional `dependencyBranches?: string[]` field to the `StartJob` interface in the shared message protocol. This allows the orchestrator to tell the executor which predecessor job branches a dependent job should inherit code from.

**Why:** Dependent jobs currently branch from the feature branch with zero knowledge of predecessor code. This field is the data contract that enables branch chaining — without it, the executor has no way to know which branches to base dependent jobs on.

**Files:**
- `packages/shared/src/messages.ts` — add field to `StartJob` interface (after `roleSkills` around line 154)

**Gotchas:**
- Non-breaking addition — no protocol version bump needed
- Field is optional so existing messages without it remain valid

**Implementation Prompt:**
> Open `packages/shared/src/messages.ts`. In the `StartJob` interface (line ~85-155), add a new optional field after `roleSkills`:
>
> ```typescript
> /**
>  * Branch names of completed dependency jobs. When present, the executor
>  * branches from depBranches[0] and merges additional branches (fan-in).
>  * Omitted for independent jobs or when all deps have null branches.
>  */
> dependencyBranches?: string[];
> ```
>
> This is a purely additive, non-breaking change. No other types or unions need updating.
>
> **Acceptance criteria:**
> - `StartJob` interface has `dependencyBranches?: string[]`
> - `npm run build` in `packages/shared` succeeds
> - No existing tests break

---

### 2 -- Validate `dependencyBranches` in `isStartJob`
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | 1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699f9dbdb66c15ed0c1d6c90 |

**What:** Update the `isStartJob` runtime validator to validate the new `dependencyBranches` field: if present, it must be an array where every element is a non-empty string.

**Why:** All messages over the wire are untrusted. Without validation, a malformed `dependencyBranches` payload could crash the executor.

**Files:**
- `packages/shared/src/validators.ts` — add validation in `isStartJob` (around line 112, before `return true`)

**Gotchas:**
- Field is optional — `undefined` must pass
- Empty array should fail (if present, must be non-empty with non-empty strings)
- Must validate each element, not just the array itself

**Implementation Prompt:**
> Open `packages/shared/src/validators.ts`. In the `isStartJob` function (line ~86-113), add validation before the final `return true` on line 112:
>
> ```typescript
> // dependencyBranches is optional; if present must be a non-empty array of non-empty strings
> if (v.dependencyBranches !== undefined) {
>   if (!Array.isArray(v.dependencyBranches) || v.dependencyBranches.length === 0) return false;
>   if (!v.dependencyBranches.every((b: unknown) => isString(b) && (b as string).length > 0)) return false;
> }
> ```
>
> **Acceptance criteria:**
> - `isStartJob` returns true when `dependencyBranches` is undefined
> - `isStartJob` returns false when `dependencyBranches` is `[]` (empty array)
> - `isStartJob` returns false when `dependencyBranches` contains `""` (empty string)
> - `isStartJob` returns true when `dependencyBranches` is `["job/abc", "job/def"]`
> - `npm run build` in `packages/shared` succeeds

---

### 3 -- Add `createDependentJobWorktree` to RepoManager
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699f9de06f97afcce845d937 |

**What:** Add a new method `createDependentJobWorktree` to the `RepoManager` class that creates a job worktree branched from a dependency branch (instead of the feature branch), with fan-in merge support for multiple dependencies.

**Why:** This is the core git mechanism that makes branch chaining work. Without it, dependent jobs would continue branching from the feature branch and miss all predecessor code.

**Files:**
- `packages/local-agent/src/branches.ts` — add new method to `RepoManager` class (after `createJobWorktree` around line 275)

**Gotchas:**
- Must `git fetch --prune origin` first to ensure dep branches are available locally
- Each dep branch must be verified via `rev-parse --verify` — skip missing ones with a warning
- If no valid dep branches remain after verification, fall back to `featureBranch` as base
- Fan-in (multiple deps): branch from first dep, then `git merge --no-ff` each additional dep inside the worktree
- Merge operations inside the worktree need `execFileAsync("git", ["-C", worktreePath, ...])` since the `git()` helper uses `-C repoDir` (bare repo)
- If any merge fails: abort the merge, remove the worktree, throw with a descriptive error
- Must acquire the repo lock (`withLock`) like existing methods

**Implementation Prompt:**
> Open `packages/local-agent/src/branches.ts`. Add a new method to the `RepoManager` class after `createJobWorktree` (line ~275):
>
> ```typescript
> /**
>  * Create a job worktree that inherits code from dependency branches.
>  * For single deps: branches from depBranches[0].
>  * For fan-in (multiple deps): branches from depBranches[0], merges remaining.
>  * Falls back to featureBranch if no dep branches are valid.
>  */
> async createDependentJobWorktree(
>   repoDir: string,
>   featureBranch: string,
>   jobId: string,
>   depBranches: string[],
> ): Promise<{ worktreePath: string; jobBranch: string }>
> ```
>
> Steps inside `withLock(repoDir, ...)`:
> 1. `git fetch --prune origin` — ensure remote branches are in the bare repo
> 2. For each branch in `depBranches`, verify with `git rev-parse --verify refs/heads/{branch}`. Collect valid ones, warn on missing.
> 3. If no valid branches, fall back: `return this.createJobWorktree(repoDir, featureBranch, jobId)` (call without lock since we're already inside withLock — extract the inner logic or release/reacquire). Actually, simpler: just set `baseBranch = featureBranch` and proceed with the normal create-branch-and-worktree flow.
> 4. `const baseBranch = validBranches[0]`
> 5. `git branch job/{jobId} {baseBranch}`
> 6. `git worktree add {worktreePath} job/{jobId}`
> 7. For each additional branch in `validBranches.slice(1)`:
>    - `execFileAsync("git", ["-C", worktreePath, "merge", "--no-ff", branch])` — note: in a worktree checked out from a bare repo, the branch refs are available directly
>    - On failure: `execFileAsync("git", ["-C", worktreePath, "merge", "--abort"])`, then `git worktree remove --force {worktreePath}`, then `git branch -D job/{jobId}`, then throw
> 8. Return `{ worktreePath, jobBranch: "job/{jobId}" }`
>
> Use `const worktreePath = join(WORKTREE_BASE, "job-" + jobId)` and `await mkdir(WORKTREE_BASE, { recursive: true })` consistent with `createJobWorktree`.
>
> **Acceptance criteria:**
> - Single dep: worktree contains dep branch's code, not just feature branch code
> - Fan-in: worktree contains merged code from all dep branches
> - Missing dep branch: warns and falls back gracefully
> - Merge conflict: throws descriptive error, cleans up worktree and branch
> - `npm run build` in `packages/local-agent` succeeds

---

### 4 -- Route dependent jobs through `createDependentJobWorktree` in executor
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | 1, 3 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699f9df0d8852dfc70da27b6 |

**What:** Update `handleStartJob` in the executor to check for `msg.dependencyBranches` and route dependent jobs through the new `createDependentJobWorktree` method instead of the default `createJobWorktree`.

**Why:** Connects the orchestrator's dependency branch data to the new RepoManager method. Without this routing, the new method would never be called.

**Files:**
- `packages/local-agent/src/executor.ts` — modify `handleStartJob` around lines 298-313

**Gotchas:**
- Only route when `msg.dependencyBranches` is present AND non-empty
- Merge conflict errors from fan-in are caught by the existing error handler (lines 308-313) which sends JobFailed — no new error handling needed
- The return type is identical (`{ worktreePath, jobBranch }`) so no downstream changes needed

**Implementation Prompt:**
> Open `packages/local-agent/src/executor.ts`. In `handleStartJob` (line ~238), find the worktree creation block at lines 298-313:
>
> ```typescript
> // Current code (line ~302):
> const worktreeResult = await this.repoManager.createJobWorktree(repoDir, msg.featureBranch, jobId);
> ```
>
> Replace with:
>
> ```typescript
> const worktreeResult = (msg.dependencyBranches && msg.dependencyBranches.length > 0)
>   ? await this.repoManager.createDependentJobWorktree(repoDir, msg.featureBranch, jobId, msg.dependencyBranches)
>   : await this.repoManager.createJobWorktree(repoDir, msg.featureBranch, jobId);
> ```
>
> No other changes needed — the return type matches and the existing try/catch sends JobFailed on error.
>
> **Acceptance criteria:**
> - Jobs without `dependencyBranches` still use `createJobWorktree` (unchanged behavior)
> - Jobs with `dependencyBranches` use `createDependentJobWorktree`
> - Merge conflict errors surface as JobFailed messages
> - `npm run build` in `packages/local-agent` succeeds

---

### 5 -- Orchestrator: populate dep branches + leaf-only combining
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1, 2 |
| Assigned | _unassigned_ |
| Trello | https://trello.com/c/699f9df981429af13c5e580c |

**What:** Two changes in the orchestrator Edge Function:
1. In `dispatchQueuedJobs`: when dispatching a job whose dependencies are all complete, fetch their branch names and include as `dependencyBranches` in the StartJob message.
2. In `triggerCombining`: compute "leaf" branches (jobs not superseded by a dependent) and only pass those to the combiner, instead of all completed job branches.

**Why:** Change (1) provides the executor with the data it needs to chain branches. Change (2) prevents the combiner from merging redundant intermediate branches (e.g., if A->B->C, only C needs merging since it already contains A+B).

**Files:**
- `supabase/functions/orchestrator/index.ts` — two locations:
  - `dispatchQueuedJobs` (line ~457-475): expand dep query to include `branch`, pass to StartJob
  - `triggerCombining` (line ~1450-1534): expand query to include `id, depends_on`, filter to leaf branches

**Gotchas:**
- Dep jobs may have null branches (non-code jobs like breakdown) — filter those out
- If all dep branches are null, omit `dependencyBranches` from StartJob (executor falls back to feature branch)
- Leaf computation: a job is a "leaf" if no other completed job lists it in `depends_on`
- Must handle the `depends_on` column being nullable (some jobs have no deps)

**Implementation Prompt:**
> Open `supabase/functions/orchestrator/index.ts`.
>
> **Change 1 — `dispatchQueuedJobs` (line ~457-475):**
>
> Find the dependency check query (line ~458-461):
> ```typescript
> .select("id, status")
> ```
> Change to:
> ```typescript
> .select("id, status, branch")
> ```
>
> After the `allComplete` check passes (line ~474), before the function continues to model/slot resolution, add:
> ```typescript
> // Extract non-null branches from completed dependencies for branch chaining
> const depBranches = (depJobs ?? [])
>   .map((d: { branch?: string | null }) => d.branch)
>   .filter((b): b is string => typeof b === "string" && b.length > 0);
> ```
>
> Then later, where the `StartJob` message payload is constructed (search for `type: "start_job"` in the dispatch section), add the field conditionally:
> ```typescript
> ...(depBranches.length > 0 ? { dependencyBranches: depBranches } : {}),
> ```
>
> Note: `depBranches` is defined inside the `if (job.depends_on && job.depends_on.length > 0)` block. For jobs without dependencies, this field is simply omitted (unchanged behavior).
>
> **Change 2 — `triggerCombining` (line ~1450-1534):**
>
> Find the job branches query (line ~1452-1459):
> ```typescript
> .select("branch")
> ```
> Change to:
> ```typescript
> .select("id, branch, depends_on")
> ```
>
> Replace the `jobBranches` computation (line ~1496):
> ```typescript
> // Old:
> const jobBranches = (jobs ?? []).map((j: { branch: string | null }) => j.branch).filter(Boolean);
>
> // New — only merge leaf branches (jobs not superseded by a dependent):
> const allJobs = (jobs ?? []) as Array<{ id: string; branch: string | null; depends_on: string[] | null }>;
> const supersededIds = new Set<string>();
> for (const j of allJobs) {
>   for (const depId of (j.depends_on ?? [])) {
>     supersededIds.add(depId);
>   }
> }
> const jobBranches = allJobs
>   .filter(j => !supersededIds.has(j.id))
>   .map(j => j.branch)
>   .filter((b): b is string => b !== null && b.length > 0);
> ```
>
> The rest of the function remains unchanged — `jobBranches` feeds into `combineContext` which is already used correctly.
>
> **Acceptance criteria:**
> - Dependent jobs receive `dependencyBranches` in their StartJob message
> - Independent jobs (no `depends_on`) do not have `dependencyBranches` (unchanged)
> - Jobs with deps that have null branches: `dependencyBranches` is omitted
> - Combine step only receives leaf branches
> - Chain A->B->C: combiner gets only C's branch
> - Fan-out A->[B,C]: combiner gets both B and C (both are leaves)
> - `npx supabase functions deploy orchestrator` succeeds
