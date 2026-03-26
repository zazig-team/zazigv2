import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface MergeResult {
  success: boolean;
  error?: string;
}

async function git(repoDir: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoDir, ...args], {
    encoding: "utf8",
  });
  return stdout.trim();
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const stderr = "stderr" in error ? error.stderr : undefined;
    if (typeof stderr === "string" && stderr.trim().length > 0) {
      return stderr.trim();
    }

    const message = "message" in error ? error.message : undefined;
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }

  return String(error);
}

export const WORKTREE_BASE = join(process.env.HOME ?? "~", ".zazigv2/worktrees");

export async function createFeatureBranch(repoDir: string, featureName: string): Promise<string> {
  const branchName = `feature/${featureName}`;
  await git(repoDir, "checkout", "main");
  await git(repoDir, "checkout", "-b", branchName);
  return branchName;
}

export async function createJobBranch(
  repoDir: string,
  featureBranch: string,
  jobName: string
): Promise<string> {
  const branchName = `job/${jobName}`;
  await git(repoDir, "checkout", featureBranch);
  await git(repoDir, "checkout", "-b", branchName);
  return branchName;
}

export async function rebaseOnBranch(
  repoDir: string,
  sourceBranch: string,
  targetBranch: string
): Promise<MergeResult> {
  try {
    await git(repoDir, "checkout", sourceBranch);
    await git(repoDir, "rebase", targetBranch);
    return { success: true };
  } catch (error) {
    try {
      await git(repoDir, "rebase", "--abort");
    } catch {
      // No active rebase to abort, ignore.
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function mergeJobIntoFeature(
  repoDir: string,
  jobBranch: string,
  featureBranch: string
): Promise<MergeResult> {
  try {
    await git(repoDir, "checkout", featureBranch);
    await git(repoDir, "merge", "--no-ff", jobBranch);
    return { success: true };
  } catch (error) {
    try {
      await git(repoDir, "merge", "--abort");
    } catch {
      // No active merge to abort, ignore.
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function mergeFeatureIntoMain(
  repoDir: string,
  featureBranch: string
): Promise<MergeResult> {
  try {
    await git(repoDir, "checkout", "main");
    await git(repoDir, "merge", "--no-ff", featureBranch);
    return { success: true };
  } catch (error) {
    try {
      await git(repoDir, "merge", "--abort");
    } catch {
      // No active merge to abort, ignore.
    }
    return { success: false, error: getErrorMessage(error) };
  }
}

export async function cleanupBranches(repoDir: string, branches: string[]): Promise<void> {
  for (const branch of branches) {
    try {
      await git(repoDir, "branch", "-D", branch);
    } catch {
      // Branch may not exist or be in use; cleanup is best-effort.
    }
  }
}

export async function createWorktree(repoDir: string, branch: string): Promise<string> {
  const slug = branch.replace(/\//g, "-");
  const worktreePath = join(WORKTREE_BASE, slug);
  await mkdir(WORKTREE_BASE, { recursive: true });
  await git(repoDir, "worktree", "add", worktreePath, branch);
  return worktreePath;
}

export async function removeWorktree(repoDir: string, worktreePath: string): Promise<void> {
  try {
    await git(repoDir, "worktree", "remove", "--force", worktreePath);
  } catch {
    // Worktree may already be removed; ignore.
  }
}

const REPOS_BASE = join(process.env.HOME ?? "~", ".zazigv2/repos");

/**
 * Manages bare repo clones, feature branches, job worktrees, pushing, and cleanup.
 * Uses a per-repo promise lock to prevent concurrent git operation races.
 */
export class RepoManager {
  private locks = new Map<string, Promise<void>>();

  private async git(repoDir: string, ...args: string[]): Promise<string> {
    return git(repoDir, ...args);
  }

  /** Serialise all git operations for a given repo dir. */
  private async withLock<T>(repoDir: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(repoDir) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    this.locks.set(repoDir, next);
    await prev;
    try {
      return await fn();
    } finally {
      resolve();
      if (this.locks.get(repoDir) === next) {
        this.locks.delete(repoDir);
      }
    }
  }

  /**
   * Bare-clone repoUrl to ~/.zazigv2/repos/{name}/ if not exists, else fetch --prune.
   * Ensures the fetch refspec is set (bare clones of empty repos omit it).
   * If the repo is empty (no commits), seeds it with an initial empty commit so
   * branches can be created from it.
   * Returns the repo dir path.
   */
  async ensureRepo(repoUrl: string, projectName: string): Promise<string> {
    const repoDir = join(REPOS_BASE, projectName);
    return this.withLock(repoDir, async () => {
      await mkdir(REPOS_BASE, { recursive: true });
      if (!existsSync(repoDir)) {
        await execFileAsync("git", ["clone", "--bare", repoUrl, repoDir], { encoding: "utf8" });
      }
      // Ensure refspec does NOT force-update (no leading "+"). Without "+",
      // git fetch refuses to overwrite branches that have diverged from
      // the remote, which protects job branches with active worktrees from
      // being clobbered by a concurrent job's fetch.
      await this.git(repoDir, "config", "remote.origin.fetch", "refs/heads/*:refs/heads/*");
      // Check if repo is empty. NOTE: rev-parse HEAD without --verify returns
      // the literal string "HEAD" with exit 0 in an empty repo, so --verify
      // is required to actually detect emptiness.
      try {
        await this.git(repoDir, "rev-parse", "--verify", "HEAD");
      } catch {
        // Empty repo — clone from the remote URL, create an initial commit,
        // push it to GitHub, then fetch into our bare repo.
        const tmpDir = join(REPOS_BASE, `.tmp-init-${projectName}`);
        try {
          await execFileAsync("git", ["clone", repoUrl, tmpDir], { encoding: "utf8" });
          await execFileAsync("git", ["-C", tmpDir, "commit", "--allow-empty", "-m", "Initial commit"], { encoding: "utf8" });
          await execFileAsync("git", ["-C", tmpDir, "push", "origin", "HEAD"], { encoding: "utf8" });
        } finally {
          await execFileAsync("rm", ["-rf", tmpDir]).catch(() => {});
        }
        // Fetch the new commit into our bare repo (refspec is now set)
        // Fetch may exit non-zero if some branches are rejected (non-fast-forward).
      // That's expected — diverged branches are intentionally protected. The other
      // branches are still updated, so we log and continue.
      try { await this.git(repoDir, "fetch", "origin"); } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }
      }
      return repoDir;
    });
  }

  /**
   * Ensure a shared worktree for the project exists and is checked out on
   * a stable default branch (prefers master when available).
   * If an existing worktree is corrupted, remove and recreate it.
   */
  async ensureWorktree(projectName: string): Promise<string> {
    const bareDir = join(REPOS_BASE, projectName);
    const worktreeDir = join(REPOS_BASE, `${projectName}-worktree`);

    return this.withLock(bareDir, async () => {
      try {
        if (!existsSync(bareDir)) {
          throw new Error(`Bare repo missing: ${bareDir}`);
        }

        // Fetch may exit non-zero if some branches are rejected (non-fast-forward).
        // That's expected — diverged branches are intentionally protected. The other
        // branches are still updated, so we log and continue.
        try { await this.git(bareDir, "fetch", "origin"); } catch (e) {
          console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
        }

        const targetBranch = await this.resolveSharedWorktreeBranch(bareDir);
        console.log(`[RepoManager] ensureWorktree project=${projectName} branch=${targetBranch} path=${worktreeDir}`);

        if (existsSync(worktreeDir)) {
          const isValid = await this.isValidWorktree(worktreeDir);
          if (!isValid) {
            console.warn(`[RepoManager] ensureWorktree found invalid worktree at ${worktreeDir}; recreating`);
            rmSync(worktreeDir, { recursive: true, force: true });
            await this.git(bareDir, "worktree", "prune");
          }
        }

        if (!existsSync(worktreeDir)) {
          await this.git(bareDir, "worktree", "add", worktreeDir, targetBranch);
          console.log(`[RepoManager] ensureWorktree created ${worktreeDir} on ${targetBranch}`);
        } else {
          await this.git(worktreeDir, "checkout", targetBranch);
          await this.git(worktreeDir, "reset", "--hard", targetBranch);
          console.log(`[RepoManager] ensureWorktree refreshed ${worktreeDir} on ${targetBranch}`);
        }

        return worktreeDir;
      } catch (error) {
        const message = getErrorMessage(error);
        console.error(`[RepoManager] ensureWorktree failed for ${projectName}: ${message}`);
        throw new Error(`ensureWorktree(${projectName}) failed: ${message}`);
      }

    });
  }

  async refreshWorktree(projectName: string): Promise<void> {
    const bareDir = join(REPOS_BASE, projectName);
    const worktreeDir = join(REPOS_BASE, `${projectName}-worktree`);

    if (!existsSync(worktreeDir)) {
      return;
    }

    await this.withLock(bareDir, async () => {
      if (!existsSync(worktreeDir)) {
        return;
      }

      const targetBranch = await this.resolveSharedWorktreeBranch(bareDir);

      // Fetch into a temporary ref. Git refuses to update refs/heads/{branch}
      // when that branch is checked out in a linked worktree — even with `+`
      // and `--force`. Fetching into a separate ref sidesteps this protection
      // entirely, and we advance the worktree via rebase/reset instead.
      //
      // --refmap="" suppresses the configured refspec (refs/heads/*:refs/heads/*
      // set by ensureRepo). Without this, Git also tries to update refs/heads/main
      // via the configured refspec, which triggers the checked-out protection
      // and fails the entire fetch.
      const tempRef = `refs/zazig-refresh/${targetBranch}`;
      try {
        await this.git(bareDir, "fetch", "--refmap=", "origin",
          `+refs/heads/${targetBranch}:${tempRef}`);
      } catch (error) {
        console.warn(
          `[RepoManager] refreshWorktree: fetch FAILED for ${projectName}: ${getErrorMessage(error)}`,
        );
        return; // Can't refresh without a successful fetch
      }

      let remoteHead: string;
      try {
        remoteHead = await this.git(bareDir, "rev-parse", tempRef);
      } catch {
        console.warn(`[RepoManager] refreshWorktree: temp ref missing after fetch for ${projectName}`);
        return;
      }

      const worktreeHead = await this.git(worktreeDir, "rev-parse", "HEAD");
      if (worktreeHead === remoteHead) {
        return; // Already up to date
      }

      // Stash any dirty working-tree changes so they survive the refresh.
      const status = await this.git(worktreeDir, "status", "--porcelain");
      const isDirty = status.length > 0;
      if (isDirty) {
        await this.git(worktreeDir, "stash", "push", "-m", "zazig-auto-refresh");
        console.log(`[RepoManager] stashed dirty changes in ${projectName} before refresh`);
      }

      try {
        // Check if worktree HEAD is an ancestor of remote (simple fast-forward).
        let isFastForward = false;
        try {
          await this.git(worktreeDir, "merge-base", "--is-ancestor", worktreeHead, remoteHead);
          isFastForward = true;
        } catch {
          // Not a fast-forward — worktree has local commits or has diverged
        }

        if (isFastForward) {
          // Safe fast-forward — no local commits to preserve.
          await this.git(worktreeDir, "reset", "--hard", remoteHead);
          console.log(`[RepoManager] refreshed ${projectName}: ${worktreeHead.slice(0, 8)} → ${remoteHead.slice(0, 8)}`);
        } else {
          // Worktree has local commits (e.g. CPO doc commits). Rebase them
          // on top of the new remote head to preserve them while pulling in
          // upstream changes.
          try {
            await this.git(worktreeDir, "rebase", remoteHead);
            const newHead = await this.git(worktreeDir, "rev-parse", "HEAD");
            console.log(`[RepoManager] rebased ${projectName} onto ${remoteHead.slice(0, 8)} (now ${newHead.slice(0, 8)})`);
          } catch {
            await this.git(worktreeDir, "rebase", "--abort").catch(() => {});
            console.error(
              `[RepoManager] CRITICAL: rebase failed for ${projectName} (local ${worktreeHead.slice(0, 8)} vs remote ${remoteHead.slice(0, 8)}) — skipping refresh`,
            );
          }
        }
      } finally {
        if (isDirty) {
          try {
            await this.git(worktreeDir, "stash", "pop");
            console.log(`[RepoManager] restored stashed changes in ${projectName}`);
          } catch {
            console.warn(`[RepoManager] stash pop conflict in ${projectName} — changes saved in git stash`);
          }
        }
      }
    });
  }

  /**
   * Resolve the default branch in a bare repo.
   * Tries symbolic-ref HEAD first, then falls back to common names.
   */
  private async resolveDefaultBranch(repoDir: string): Promise<string> {
    // In a bare repo, HEAD is a symbolic ref like "refs/heads/main"
    try {
      const ref = await this.git(repoDir, "symbolic-ref", "HEAD");
      const branchName = ref.replace(/^refs\/heads\//, "");
      // Verify the branch actually has commits
      await this.git(repoDir, "rev-parse", "--verify", `refs/heads/${branchName}`);
      return branchName;
    } catch {
      // HEAD symbolic ref missing or points to nonexistent branch
    }
    // Fallback: try common default branch names
    for (const name of ["main", "master"]) {
      try {
        await this.git(repoDir, "rev-parse", "--verify", `refs/heads/${name}`);
        return name;
      } catch {
        continue;
      }
    }
    throw new Error(`Cannot resolve default branch in ${repoDir} — repo may be empty`);
  }

  /**
   * Shared worktrees historically use "master". If absent, fall back to
   * the repo's actual default branch.
   */
  private async resolveSharedWorktreeBranch(repoDir: string): Promise<string> {
    try {
      await this.git(repoDir, "rev-parse", "--verify", "refs/heads/master");
      return "master";
    } catch {
      return this.resolveDefaultBranch(repoDir);
    }
  }

  private async isValidWorktree(dir: string): Promise<boolean> {
    try {
      await this.git(dir, "rev-parse", "--git-dir");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create feature branch off default branch if not exists. Idempotent.
   * In a bare repo, branches fetched from origin live directly under refs/heads/,
   * so there are no origin/* tracking refs.
   */
  async ensureFeatureBranch(repoDir: string, featureBranch: string): Promise<void> {
    return this.withLock(repoDir, async () => {
      // Check if branch already exists locally
      try {
        await this.git(repoDir, "rev-parse", "--verify", `refs/heads/${featureBranch}`);
        return; // Already exists
      } catch {
        // Not found — create off default branch
      }

      const defaultBranch = await this.resolveDefaultBranch(repoDir);

      // Fetch the default branch into a temp ref. Git refuses to update
      // refs/heads/{branch} when that branch is checked out in a linked worktree,
      // even with --force. Fetching into a separate ref sidesteps this protection.
      // --refmap="" suppresses the configured refspec so Git doesn't also try
      // refs/heads/{branch}:refs/heads/{branch} (which would trigger the protection).
      const tempRef = `refs/zazig-tmp/${defaultBranch}`;
      try {
        await this.git(repoDir, "fetch", "--refmap=", "origin",
          `+refs/heads/${defaultBranch}:${tempRef}`);
      } catch (e) {
        console.warn(`[RepoManager] ensureFeatureBranch: fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }

      // Use the temp ref if available (fresh from origin); fall back to local ref.
      let baseRef: string;
      try {
        await this.git(repoDir, "rev-parse", "--verify", tempRef);
        baseRef = tempRef;
      } catch {
        baseRef = defaultBranch;
      }

      await this.git(repoDir, "branch", featureBranch, baseRef);
    });
  }

  async fetchBranchForExpert(projectName: string, branch: string): Promise<void> {
    const bareDir = join(REPOS_BASE, projectName);
    return this.withLock(bareDir, async () => {
      await this.git(
        bareDir,
        "fetch",
        "--force",
        "origin",
        `+refs/heads/${branch}:refs/heads/${branch}`,
      );
    });
  }

  /**
   * Fetch the default branch into a per-session temporary ref.
   *
   * Unlike fetchBranchForExpert, this never updates refs/heads/{branch}, so it
   * succeeds even when that branch is checked out in another worktree. Each
   * session gets a distinct ref (refs/zazig-expert-base/{sessionId}), eliminating
   * ref conflicts between concurrent sessions.
   *
   * The caller must delete the temp ref with:
   *   git update-ref -d refs/zazig-expert-base/{sessionId}
   * after the worktree is created.
   *
   * Returns the resolved default branch name and the temp ref path.
   */
  async fetchForExpertSession(
    projectName: string,
    sessionId: string,
  ): Promise<{ defaultBranch: string; tempRef: string }> {
    const bareDir = join(REPOS_BASE, projectName);
    return this.withLock(bareDir, async () => {
      const defaultBranch = await this.resolveDefaultBranch(bareDir);
      const tempRef = `refs/zazig-expert-base/${sessionId}`;
      await this.git(
        bareDir,
        "fetch",
        "--refmap=",
        "--no-write-fetch-head",
        "origin",
        `+refs/heads/${defaultBranch}:${tempRef}`,
      );
      return { defaultBranch, tempRef };
    });
  }

  /**
   * Create job/{jobId} branch off feature branch, then git worktree add.
   * Returns { worktreePath, jobBranch }.
   */
  async createJobWorktree(
    repoDir: string,
    featureBranch: string,
    jobId: string
  ): Promise<{ worktreePath: string; jobBranch: string }> {
    return this.withLock(repoDir, async () => {
      // Fetch inside the lock so concurrent jobs can't clobber each other's branches
      // Fetch may exit non-zero if some branches are rejected (non-fast-forward).
      // That's expected — diverged branches are intentionally protected. The other
      // branches are still updated, so we log and continue.
      try { await this.git(repoDir, "fetch", "origin"); } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }

      const jobBranch = `job/${jobId}`;
      const worktreePath = join(WORKTREE_BASE, `job-${jobId}`);
      await mkdir(WORKTREE_BASE, { recursive: true });
      // Find and remove any existing worktree for this job branch (may be at old/different path)
      try {
        const wtList = await this.git(repoDir, "worktree", "list", "--porcelain");
        const entries = wtList.split("\n\n");
        for (const entry of entries) {
          if (entry.includes(`branch refs/heads/${jobBranch}`)) {
            const wtPath = entry.match(/^worktree (.+)$/m)?.[1];
            if (wtPath) {
              try { await this.git(repoDir, "worktree", "remove", "--force", wtPath); } catch {}
              try { await rm(wtPath, { recursive: true, force: true }); } catch {}
            }
          }
        }
      } catch { /* worktree list failed — continue with best-effort cleanup below */ }
      // Also clean up the expected path in case it exists without git tracking it
      try { await rm(worktreePath, { recursive: true, force: true }); } catch {}
      try { await this.git(repoDir, "worktree", "prune"); } catch {}
      try { await this.git(repoDir, "branch", "-D", jobBranch); } catch {}
      // Create branch off feature branch
      await this.git(repoDir, "branch", jobBranch, featureBranch);
      // Add worktree for the job branch
      await this.git(repoDir, "worktree", "add", worktreePath, jobBranch);
      return { worktreePath, jobBranch };
    });
  }

  /**
   * Create a job worktree that inherits code from dependency branches.
   * Validates all dependency branches exist in the bare repo and then creates
   * job/{jobId} from depBranches[0]. No infrastructure-level merges are done here;
   * conflict handling is delegated to the combiner agent.
   */
  async createDependentJobWorktree(
    repoDir: string,
    featureBranch: string,
    jobId: string,
    depBranches: string[],
  ): Promise<{ worktreePath: string; jobBranch: string; conflictBranches: string[] }> {
    return this.withLock(repoDir, async () => {
      console.log(`[RepoManager] createDependentJobWorktree: jobId=${jobId}, depBranches=${JSON.stringify(depBranches)}`);
      // Fetch may exit non-zero if some branches are rejected (non-fast-forward).
      try { await this.git(repoDir, "fetch", "origin"); } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }

      if (depBranches.length === 0) {
        throw new Error("createDependentJobWorktree requires at least one dependency branch");
      }

      // Verify each dep branch exists before creating the worktree.
      const missingBranches: string[] = [];
      for (const branch of depBranches) {
        try {
          await execFileAsync("git", ["-C", repoDir, "rev-parse", "--verify", `refs/heads/${branch}`], { encoding: "utf8" });
        } catch {
          missingBranches.push(branch);
        }
      }

      if (missingBranches.length > 0) {
        throw new Error(
          `createDependentJobWorktree: dependency branch not found: ${missingBranches.join(", ")}`
        );
      }

      const jobBranch = `job/${jobId}`;
      const worktreePath = join(WORKTREE_BASE, `job-${jobId}`);
      await mkdir(WORKTREE_BASE, { recursive: true });

      const baseBranch = depBranches[0] ?? featureBranch;
      console.log(`[RepoManager] Creating jobBranch="${jobBranch}" from baseBranch="${baseBranch}", depBranches=${JSON.stringify(depBranches)}`);

      // Clean up any existing worktree for this job branch
      try {
        const wtList = await this.git(repoDir, "worktree", "list", "--porcelain");
        const entries = wtList.split("\n\n");
        for (const entry of entries) {
          if (entry.includes(`branch refs/heads/${jobBranch}`)) {
            const wtPath = entry.match(/^worktree (.+)$/m)?.[1];
            if (wtPath) {
              try { await this.git(repoDir, "worktree", "remove", "--force", wtPath); } catch {}
              try { await rm(wtPath, { recursive: true, force: true }); } catch {}
            }
          }
        }
      } catch { /* worktree list failed — continue with best-effort cleanup below */ }
      try { await rm(worktreePath, { recursive: true, force: true }); } catch {}
      try { await this.git(repoDir, "worktree", "prune"); } catch {}
      try { await this.git(repoDir, "branch", "-D", jobBranch); } catch {}

      await this.git(repoDir, "branch", jobBranch, baseBranch);
      await this.git(repoDir, "worktree", "add", worktreePath, jobBranch);

      // Single dep: no merge needed (branched directly from it)
      if (depBranches.length === 1) {
        return { worktreePath, jobBranch, conflictBranches: [] };
      }

      // Multi-dep: merge remaining branches into the worktree.
      // Ensure git user config exists for merge commits (CI may lack global config).
      try {
        await execFileAsync("git", ["-C", worktreePath, "config", "user.email"], { encoding: "utf8" });
      } catch {
        await execFileAsync("git", ["-C", worktreePath, "config", "user.email", "zazig-agent@zazig.com"], { encoding: "utf8" });
        await execFileAsync("git", ["-C", worktreePath, "config", "user.name", "zazig-agent"], { encoding: "utf8" });
      }
      // Use refs/heads/ prefix so the ref resolves unambiguously in bare-repo worktrees.
      const conflictBranches: string[] = [];
      for (const branch of depBranches.slice(1)) {
        const ref = `refs/heads/${branch}`;
        try {
          await execFileAsync("git", ["-C", worktreePath, "merge", "--no-edit", ref], { encoding: "utf8" });
          console.log(`[RepoManager] Merged dep branch "${branch}" cleanly into ${jobBranch}`);
        } catch (mergeErr) {
          // Merge failed — could be conflict or unrelated histories
          const errMsg = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
          console.warn(`[RepoManager] Merge failed for "${branch}" into ${jobBranch}: ${errMsg}`);
          try { await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" }); } catch {}
          conflictBranches.push(branch);
        }
      }

      return { worktreePath, jobBranch, conflictBranches };
    });
  }

  /**
   * Returns the current SHA of refs/heads/master on origin, without acquiring the lock.
   * Throws if the command fails or produces no output.
   */
  async getMasterSha(repoDir: string): Promise<string> {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoDir, "ls-remote", "origin", "refs/heads/master"],
      { encoding: "utf8" },
    );
    const firstLine = stdout.trim().split("\n").find((l) => l.trim().length > 0);
    if (!firstLine) {
      throw new Error(`getMasterSha: no output from ls-remote for ${repoDir}`);
    }
    const sha = firstLine.trim().split(/\s+/)[0];
    if (!sha) {
      throw new Error(`getMasterSha: could not parse SHA from ls-remote output: ${firstLine}`);
    }
    return sha;
  }

  /**
   * Fetches origin for the given bare repo, acquiring the repo lock.
   * Non-fast-forward rejections are non-fatal (logged and swallowed).
   * Throws on unexpected errors.
   */
  async fetchOrigin(repoDir: string): Promise<void> {
    return this.withLock(repoDir, async () => {
      try {
        await this.git(repoDir, "fetch", "origin");
      } catch (e) {
        const msg = getErrorMessage(e);
        // Non-fast-forward rejections are expected (diverged job branches) — swallow them.
        if (msg.includes("rejected") || msg.includes("non-fast-forward")) {
          console.warn(`[RepoManager] fetchOrigin: non-fast-forward rejection (non-fatal): ${msg}`);
          return;
        }
        throw e;
      }
    });
  }

  /**
   * Push job branch to origin from within the worktree.
   */
  async pushJobBranch(worktreePath: string, jobBranch: string): Promise<void> {
    await execFileAsync("git", ["-C", worktreePath, "push", "--force", "origin", jobBranch], {
      encoding: "utf8",
    });
  }

  /**
   * Remove worktree (branch persists on remote). Uses --force since the worktree
   * may have uncommitted changes from a failed agent.
   */
  async removeJobWorktree(repoDir: string, worktreePath: string): Promise<void> {
    try {
      await this.git(repoDir, "worktree", "remove", "--force", worktreePath);
    } catch {
      // Worktree may already be removed; ignore.
    }
  }
}
