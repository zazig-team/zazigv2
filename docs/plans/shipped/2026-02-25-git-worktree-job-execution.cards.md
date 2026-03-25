# Card Catalog: Git Worktree Support for Job Execution
**Source:** docs/plans/2026-02-25-git-worktree-job-execution (conversation plan)
**Board:** zazigv2 (6995a7a3f836598005909f31)
**Generated:** 2026-02-25T12:00:00Z
**Numbering:** sequential

## Dependency Graph
```
1 --+
2 --+-- (parallel, no deps)
    |
3 ---- depends on 1, 2
    |
4 ---- depends on 3
    |
5 --+-- depends on 1 (parallel with 3/4)
6 --+
```

---

### 1 -- Add git fields to StartJob message (shared)
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | Chris |
| Trello | https://trello.com/c/699ee445544d3a549c1a5140 |

**What:** Add three required fields to the `StartJob` interface (`projectId`, `repoUrl`, `featureBranch`) and validate them in `isStartJob`. These fields carry the repo URL and branch name so the executor can clone the repo and create worktrees for each job.

**Why:** The executor currently runs jobs in ephemeral scratch directories with no git context. Jobs need `repoUrl` to clone, `projectId` to cache the clone, and `featureBranch` to create job branches off the right base. Without these, the combine step has no branches to merge.

**Files:**
- `packages/shared/src/messages.ts` — add 3 required fields to `StartJob` interface (after line 149)
- `packages/shared/src/validators.ts` — add validation in `isStartJob` (after line 104)

**Gotchas:**
- Fields are REQUIRED, not optional — no backward compat with scratch-dir path needed (all DB data is test data)
- `repoUrl` must be a valid non-empty string (GitHub HTTPS URL)
- `projectId` must be a non-empty string (UUID)
- `featureBranch` must be a non-empty string (branch name like `feature/add-search-api-a1b2c3d4`)
- Both messages.ts and validators.ts must be updated in lockstep — the type and validator must agree

**Implementation Prompt:**
> Add three required fields to the `StartJob` interface in `packages/shared/src/messages.ts` (currently lines 85-149):
>
> ```typescript
> /** Project UUID — executor uses to cache repo clone by project. */
> projectId: string;
> /** GitHub HTTPS URL from projects.repo_url — executor clones from this. */
> repoUrl: string;
> /** Feature branch name from features.branch — job branches are created off this. */
> featureBranch: string;
> ```
>
> Add them after the `model` field (line 100) and before `context`.
>
> Then update `isStartJob` in `packages/shared/src/validators.ts` (currently lines 86-110). Add validation after line 94 (model check):
>
> ```typescript
> if (!isString(v.projectId) || v.projectId.length === 0) return false;
> if (!isString(v.repoUrl) || v.repoUrl.length === 0) return false;
> if (!isString(v.featureBranch) || v.featureBranch.length === 0) return false;
> ```
>
> Run `npm run build` in the zazigv2 root to verify shared package compiles.
>
> Acceptance criteria:
> - `StartJob.projectId`, `StartJob.repoUrl`, `StartJob.featureBranch` are required string fields
> - `isStartJob` rejects messages missing any of these three fields
> - `npm run build` passes for shared package

---

### 2 -- Add RepoManager class to branches.ts
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | -- |
| Assigned | Chris |
| Trello | https://trello.com/c/699ee4eecbae9f8990729f2c |

**What:** Add a `RepoManager` class to `packages/local-agent/src/branches.ts` that manages bare repo clones, feature branches, job worktrees, pushing, and cleanup. Includes a per-repo promise lock to prevent concurrent git operation races.

**Why:** The existing functions in branches.ts operate on a checked-out repo — they can't handle bare clones, remote fetching, or worktree creation from a bare repo. The executor needs a high-level API that handles the full lifecycle: clone-or-fetch → ensure feature branch → create job worktree → push → cleanup.

**Files:**
- `packages/local-agent/src/branches.ts` — add `RepoManager` class (new export, keep existing functions)

**Gotchas:**
- Must use **bare clones** (`git clone --bare`) at `~/.zazigv2/repos/{name}/` — worktrees are created from bare repos, not checked-out repos
- Per-repo promise lock is critical — multiple jobs for the same feature can start simultaneously, and concurrent `git fetch` + `git worktree add` will corrupt the repo
- `ensureFeatureBranch` must handle the case where the branch already exists on the remote (fetch first, then check)
- `createJobWorktree` creates a `job/{jobId}` branch off the feature branch, then `git worktree add` to `~/Documents/GitHub/.worktrees/job-{jobId}/`
- `pushJobBranch` should push from within the worktree, not the bare repo
- `removeWorktree` must use `git worktree remove --force` (the worktree may have uncommitted changes from a failed agent)
- The existing `WORKTREE_BASE`, `createWorktree`, `removeWorktree` functions are used by `fix-agent.ts` — do NOT modify or remove them

**Implementation Prompt:**
> Add a `RepoManager` class to `packages/local-agent/src/branches.ts`. Keep all existing exports unchanged (they're used by fix-agent.ts).
>
> The class should manage bare repo clones at `~/.zazigv2/repos/{name}/` and worktrees at `~/Documents/GitHub/.worktrees/job-{jobId}/`.
>
> ```typescript
> export class RepoManager {
>   // Per-repo promise lock to prevent concurrent git operations on the same repo
>   private readonly locks = new Map<string, Promise<void>>();
>
>   /** Bare-clone repo if not exists, else git fetch --prune. Returns bare repo dir path. */
>   async ensureRepo(repoUrl: string, projectName: string): Promise<string>;
>
>   /** Create feature branch off default branch if not exists. Idempotent. */
>   async ensureFeatureBranch(repoDir: string, featureBranch: string): Promise<void>;
>
>   /** Create job/{jobId} branch off feature branch, then git worktree add. Returns { worktreePath, jobBranch }. */
>   async createJobWorktree(repoDir: string, featureBranch: string, jobId: string): Promise<{ worktreePath: string; jobBranch: string }>;
>
>   /** Push job branch to origin from worktree. */
>   async pushJobBranch(worktreePath: string, jobBranch: string): Promise<void>;
>
>   /** Remove worktree (branch persists on remote). */
>   async removeJobWorktree(repoDir: string, worktreePath: string): Promise<void>;
> }
> ```
>
> Implementation notes for bare repo operations:
> - Use `git clone --bare {repoUrl} {repoDir}` for initial clone
> - Use `git -C {repoDir} fetch --prune origin` for subsequent fetches
> - For `ensureFeatureBranch`: check if branch exists with `git -C {repoDir} rev-parse --verify refs/heads/{featureBranch}`, if not check remote `refs/remotes/origin/{featureBranch}`, if neither then create off `HEAD` (default branch)
> - For `createJobWorktree`: create branch `git -C {repoDir} branch job/{jobId} {featureBranch}`, then `git worktree add {worktreePath} job/{jobId}`
> - For `pushJobBranch`: run `git -C {worktreePath} push origin {jobBranch}` (worktree has a working checkout)
> - The per-repo lock should use a keyed promise chain pattern — each repo gets its own lock keyed by repoDir
>
> Use the existing `WORKTREE_BASE` constant for worktree paths.
>
> Run `npm run build` in zazigv2 root to verify compilation.
>
> Acceptance criteria:
> - `RepoManager` class exported from branches.ts
> - All 5 methods implemented with bare-repo-compatible git commands
> - Per-repo locking prevents concurrent git operations on the same repo
> - Existing exports (`createWorktree`, `removeWorktree`, etc.) unchanged
> - `npm run build` passes

---

### 3 -- Integrate worktree lifecycle into executor handleStartJob
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | High |
| Model | Opus 4.6 |
| Labels | claude-ok |
| Depends on | 1, 2 |
| Assigned | Chris |
| Trello | https://trello.com/c/699ee4f60fb847824ee95b75 |

**What:** Modify `handleStartJob` in the executor to use `RepoManager` for cloning the repo, creating a feature branch, creating a job worktree, and running the agent inside the worktree. Extend `ActiveJob` with worktree fields. Remove the scratch-dir fallback.

**Why:** This is the core integration — connects the new RepoManager and StartJob fields so agents actually run inside real git repos with full history. Without this, agents still work in scratch dirs with no git context, and the combine step has nothing to merge.

**Files:**
- `packages/local-agent/src/executor.ts` — modify `handleStartJob` (lines 186-342), extend `ActiveJob` (lines 82-98)

**Gotchas:**
- `RepoManager` should be instantiated once in the `JobExecutor` constructor, not per-job
- Extract project name from repoUrl: `repoUrl.split('/').pop()?.replace('.git', '')` — handle edge cases
- The worktree path becomes the CWD for the tmux session AND the workspace dir for CLAUDE.md/.mcp.json
- `ActiveJob` needs: `worktreePath?: string`, `repoDir?: string`, `jobBranch?: string`
- Workspace setup (`setupJobWorkspace`) writes CLAUDE.md, .mcp.json, .claude/ into the worktree — these are untracked files that must not be committed (handled by card 4)
- The prompt file should also be written to the worktree dir
- The existing `cleanupJobWorkspace` function (rmSync of `~/.zazigv2/job-{jobId}`) should NOT be called for worktree jobs — the worktree cleanup is different (git worktree remove)
- All jobs now have `repoUrl` — there is no scratch-dir path. Remove the conditional branching.

**Implementation Prompt:**
> Modify `packages/local-agent/src/executor.ts` to integrate the worktree lifecycle.
>
> **1. Add RepoManager as a class field:**
> Import `RepoManager` from `./branches.js` and instantiate it in the constructor. Store as `private readonly repoManager: RepoManager`.
>
> **2. Extend ActiveJob interface** (line 82):
> Add three optional fields:
> ```typescript
> worktreePath?: string;
> repoDir?: string;
> jobBranch?: string;
> ```
>
> **3. Modify handleStartJob** (line 186 onwards):
> After context assembly (line 226) and before workspace setup (line 240), add the git worktree lifecycle:
>
> ```typescript
> // --- Git worktree setup ---
> const projectName = msg.repoUrl.split('/').pop()?.replace(/\.git$/, '') ?? msg.projectId;
> const repoDir = await this.repoManager.ensureRepo(msg.repoUrl, projectName);
> await this.repoManager.ensureFeatureBranch(repoDir, msg.featureBranch);
> const { worktreePath, jobBranch } = await this.repoManager.createJobWorktree(repoDir, msg.featureBranch, jobId);
> ```
>
> Then use `worktreePath` as the workspace dir:
> - Set `ephemeralWorkspaceDir = worktreePath` (the worktree IS the workspace)
> - `setupJobWorkspace({ workspaceDir: worktreePath, ... })` — overlay CLAUDE.md, .mcp.json, .claude/ into the worktree
> - Write the prompt file to `worktreePath/.zazig-prompt.txt`
> - Pass `worktreePath` as the CWD to `spawnTmuxSession`
>
> Store `worktreePath`, `repoDir`, and `jobBranch` on the `ActiveJob`.
>
> **4. Remove scratch-dir conditional:**
> Since all jobs now have `repoUrl`, remove the `if (msg.role)` guard around workspace setup. All jobs get a workspace in their worktree.
>
> **5. Error handling:**
> If any git operation fails (clone, branch, worktree), send `JobFailed` with reason `"agent_crash"` and release the slot. Do NOT fall back to scratch dirs.
>
> Run `npm run build` in zazigv2 root to verify.
>
> Acceptance criteria:
> - Every job clones/fetches repo, creates feature branch, creates worktree
> - Agent runs with CWD = worktree (real git repo with history)
> - ActiveJob tracks worktreePath, repoDir, jobBranch
> - No scratch-dir fallback path remains
> - `npm run build` passes

---

### 4 -- Worktree-aware cleanup in executor (onJobEnded, onJobTimeout, handleStopJob)
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 3 |
| Assigned | Chris |
| Trello | https://trello.com/c/699ee4ffc4a314fc29aee0dc |

**What:** Modify the three job-ending paths in executor.ts to: (1) push the job branch before sending JobComplete, (2) write the branch name to `jobs.branch` in DB, (3) clean up the worktree instead of the scratch dir. Also update `stopAll()`.

**Why:** Without pushing and recording the branch, the combine step finds no branches to merge. Without worktree cleanup, disk fills up with stale worktrees. The three ending paths (natural completion, timeout, forced stop) all need the same treatment.

**Files:**
- `packages/local-agent/src/executor.ts` — modify `onJobEnded` (line 733), `onJobTimeout` (line 695), `handleStopJob` (line 597), `stopAll` (line 442)

**Gotchas:**
- `onJobEnded` (success path): push the job branch BEFORE sending JobComplete, then update `jobs.branch` in DB, then clean up worktree
- `onJobTimeout` and `handleStopJob`: still push if possible (best-effort), still clean up worktree, but don't block on push failure
- Use `repoManager.pushJobBranch(worktreePath, jobBranch)` — NOT direct git commands
- Use `repoManager.removeJobWorktree(repoDir, worktreePath)` instead of `cleanupJobWorkspace(jobId)`
- The report file is now at `{worktreePath}/.claude/cpo-report.md` — update report lookup paths
- `stopAll()` must iterate activeJobs and clean up worktrees for any that have `worktreePath`
- Push failure should NOT fail the job — the branch is still local and can be recovered

**Implementation Prompt:**
> Modify the three job-ending code paths in `packages/local-agent/src/executor.ts`:
>
> **1. `onJobEnded` (line 733)** — the success path:
> After reading the report and before `sendJobComplete`:
> ```typescript
> // Push job branch and record in DB
> if (job.worktreePath && job.jobBranch && job.repoDir) {
>   try {
>     await this.repoManager.pushJobBranch(job.worktreePath, job.jobBranch);
>     console.log(`[executor] Pushed branch ${job.jobBranch} for jobId=${jobId}`);
>   } catch (err) {
>     console.warn(`[executor] Failed to push branch for jobId=${jobId}: ${String(err)}`);
>   }
>   // Write branch name to DB
>   this.supabase.from("jobs").update({ branch: job.jobBranch }).eq("id", jobId)
>     .then(({ error }) => { if (error) console.warn(`[executor] Failed to write branch for jobId=${jobId}: ${error.message}`); });
> }
> ```
>
> Replace `cleanupJobWorkspace(jobId)` with worktree-aware cleanup:
> ```typescript
> if (job.worktreePath && job.repoDir) {
>   await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
> }
> ```
>
> **2. `onJobTimeout` (line 695)** — same pattern but best-effort push:
> Before `sendJobFailed`, attempt push (catch and log errors). Then worktree cleanup instead of `cleanupJobWorkspace`.
>
> **3. `handleStopJob` (line 597)** — same as timeout: best-effort push, worktree cleanup.
>
> **4. `stopAll` (line 442)** — iterate activeJobs and call `repoManager.removeJobWorktree` for any with worktreePath.
>
> **5. Update report lookup** in `onJobEnded`:
> The report file candidate path should be `{job.worktreePath}/.claude/cpo-report.md` when worktreePath is set.
>
> **6. Update COMPLETION_INSTRUCTIONS** (line 73):
> Change to: `Commit all work to the current branch. Do NOT commit .mcp.json, .claude/, or CLAUDE.md. Write your results to .claude/cpo-report.md including what was done and any issues. Then exit.`
>
> Run `npm run build` to verify.
>
> Acceptance criteria:
> - On success: job branch pushed, `jobs.branch` written to DB, worktree removed
> - On timeout: best-effort push, worktree removed
> - On stop: best-effort push, worktree removed
> - `stopAll` cleans up worktrees
> - Report lookup works from worktree path
> - `npm run build` passes

---

### 5 -- Orchestrator: populate StartJob git fields
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Medium |
| Model | Sonnet 4.6 |
| Labels | claude-ok |
| Depends on | 1 |
| Assigned | Chris |
| Trello | https://trello.com/c/699ee50738984626bfbb6544 |

**What:** Modify the orchestrator's `dispatchQueuedJobs` to look up `projects.repo_url` and `features.branch`, include them as required fields in the StartJob message, and auto-generate `features.branch` when transitioning to `building`.

**Why:** The StartJob message now requires `projectId`, `repoUrl`, and `featureBranch`. The orchestrator must populate these from the DB. Features also need branch names auto-generated when they enter the `building` phase so the executor has a target branch.

**Files:**
- `supabase/functions/orchestrator/index.ts` — modify `dispatchQueuedJobs` (line 403) and `processFeatureLifecycle` (line 2107)

**Gotchas:**
- Look up `projects.repo_url` using `job.project_id` — project_id could be null for some jobs, must handle gracefully
- Look up `features.branch` using `job.feature_id` — all implementation jobs should have a feature_id at this point (auto-created wrapper features handle the standalone case)
- If `repo_url` or `branch` is missing, the job cannot be dispatched — log a warning and skip
- Feature branch auto-generation format: `feature/{title-slug}-{id-first-8-chars}` (e.g. `feature/add-search-api-a1b2c3d4`)
- Slug the title: lowercase, replace non-alphanumeric with hyphens, collapse consecutive hyphens, trim, max 40 chars
- Set `features.branch` in the `breakdown → building` transition in `processFeatureLifecycle` (line 2132)
- Also set it for the wrapper feature auto-creation (line 434) — standalone jobs need branches too

**Implementation Prompt:**
> Modify `supabase/functions/orchestrator/index.ts` in two places:
>
> **1. In `dispatchQueuedJobs` (line 403):**
>
> Before building the StartJob message (around line 668), look up the project and feature:
>
> ```typescript
> // Look up repo URL from project
> let repoUrl: string | undefined;
> if (job.project_id) {
>   const { data: project } = await supabase
>     .from("projects")
>     .select("repo_url")
>     .eq("id", job.project_id)
>     .single();
>   repoUrl = project?.repo_url ?? undefined;
> }
>
> // Look up feature branch
> let featureBranch: string | undefined;
> if (job.feature_id) {
>   const { data: feature } = await supabase
>     .from("features")
>     .select("branch")
>     .eq("id", job.feature_id)
>     .single();
>   featureBranch = feature?.branch ?? undefined;
> }
>
> // Skip dispatch if git context is incomplete
> if (!repoUrl || !featureBranch || !job.project_id) {
>   console.warn(`[orchestrator] Job ${job.id} missing git context (repoUrl=${!!repoUrl}, featureBranch=${!!featureBranch}, projectId=${!!job.project_id}) — skipping`);
>   continue;
> }
> ```
>
> Then include in the StartJob message (line 669):
> ```typescript
> projectId: job.project_id,
> repoUrl,
> featureBranch,
> ```
>
> **2. In `processFeatureLifecycle` (line 2107):**
>
> When transitioning `breakdown → building` (around line 2132), after the status update, generate and store the branch name if null:
>
> ```typescript
> // Auto-generate feature branch name if not set
> const { data: feat } = await supabase
>   .from("features")
>   .select("id, title, branch")
>   .eq("id", feature.id)
>   .single();
> if (feat && !feat.branch) {
>   const slug = feat.title
>     .toLowerCase()
>     .replace(/[^a-z0-9]+/g, '-')
>     .replace(/^-|-$/g, '')
>     .slice(0, 40);
>   const branch = `feature/${slug}-${feat.id.slice(0, 8)}`;
>   await supabase.from("features").update({ branch }).eq("id", feat.id);
>   console.log(`[orchestrator] Auto-set feature branch: ${branch}`);
> }
> ```
>
> **3. Also in auto-wrapper feature creation** (line 434):
> When creating wrapper features for standalone jobs, generate a branch name:
> ```typescript
> const slug = `standalone-${job.id.slice(0, 8)}`;
> const branch = `feature/${slug}`;
> await supabase.from("features").update({ branch }).eq("id", wrapperFeature.id);
> ```
>
> Acceptance criteria:
> - StartJob messages include `projectId`, `repoUrl`, `featureBranch`
> - Jobs without git context are skipped with a warning
> - Features get auto-generated branch names when entering `building`
> - Standalone wrapper features also get branch names
> - Orchestrator deploys and runs without errors

---

### 6 -- Workspace .gitignore for worktree safety
| Field | Value |
|-------|-------|
| Type | Feature |
| Complexity | Low |
| Model | Codex |
| Labels | codex-first |
| Depends on | -- |
| Assigned | Chris |
| Trello | https://trello.com/c/699ee50f166811633ae40a83 |

**What:** Update `setupJobWorkspace` in workspace.ts to append zazig workspace files to `.git/info/exclude` (or create a `.gitignore`) in the worktree, preventing agents from accidentally committing overlay files (CLAUDE.md, .mcp.json, .claude/).

**Why:** When `setupJobWorkspace` writes CLAUDE.md, .mcp.json, and .claude/ into a real git worktree, these appear as untracked files. If the agent runs `git add .`, they'd be committed and pushed — polluting the real repo with workspace files.

**Files:**
- `packages/local-agent/src/workspace.ts` — modify `setupJobWorkspace` (line 116)

**Gotchas:**
- Worktrees share `.git/info/exclude` with the main repo if using a standard worktree. But bare-repo worktrees have their own `.git` file pointing to the bare repo's worktree directory — the exclude file is at `{bareRepo}/worktrees/{name}/info/exclude`
- Safest approach: append to a `.gitignore` at the worktree root. If one exists, append; if not, create. The `.gitignore` itself should also be in the ignore list.
- Files to exclude: `CLAUDE.md`, `.mcp.json`, `.claude/`, `.zazig-prompt.txt`, `.gitignore` (the one we create)
- Only do this when the workspace dir looks like a git worktree (check for `.git` file or directory)

**Implementation Prompt:**
> Modify `setupJobWorkspace` in `packages/local-agent/src/workspace.ts` (line 116).
>
> After writing all workspace files (after the skill copy at line 164), add gitignore generation:
>
> ```typescript
> // 7. Write .gitignore to prevent workspace files from being committed
> // Only if this looks like a git worktree (has .git file or directory)
> const gitPath = join(config.workspaceDir, '.git');
> if (existsSync(gitPath)) {
>   const ignoreEntries = [
>     'CLAUDE.md',
>     '.mcp.json',
>     '.claude/',
>     '.zazig-prompt.txt',
>     'subagent-personality.md',
>   ];
>   const ignorePath = join(config.workspaceDir, '.gitignore');
>   // Append to existing .gitignore or create new one
>   const existing = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
>   const marker = '# zazig workspace files (auto-generated)';
>   if (!existing.includes(marker)) {
>     const block = `\n${marker}\n${ignoreEntries.join('\n')}\n`;
>     appendFileSync(ignorePath, block);
>   }
> }
> ```
>
> Add `readFileSync` and `appendFileSync` to the imports from `node:fs` at the top of the file.
>
> Run `npm run build` to verify.
>
> Acceptance criteria:
> - `.gitignore` in worktree root excludes CLAUDE.md, .mcp.json, .claude/, .zazig-prompt.txt
> - Existing `.gitignore` files are appended to, not overwritten
> - Idempotent — won't duplicate the block on re-runs
> - Non-worktree workspaces (no `.git`) are unaffected
> - `npm run build` passes
