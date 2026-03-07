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
      // Fetch to ensure remote branches are available (ensureRepo no longer fetches)
      // Fetch may exit non-zero if some branches are rejected (non-fast-forward).
      // That's expected — diverged branches are intentionally protected. The other
      // branches are still updated, so we log and continue.
      try { await this.git(repoDir, "fetch", "origin"); } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }

      // Check if branch already exists (covers both local and fetched-from-remote)
      try {
        await this.git(repoDir, "rev-parse", "--verify", `refs/heads/${featureBranch}`);
        return; // Already exists
      } catch {
        // Not found — create off default branch
      }
      const defaultBranch = await this.resolveDefaultBranch(repoDir);
      await this.git(repoDir, "branch", featureBranch, defaultBranch);
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
   * For single dep: branches from depBranches[0].
   * For fan-in (multiple deps): branches from depBranches[0], merges remaining.
   * Falls back to featureBranch if no dep branches are valid after verification.
   */
  async createDependentJobWorktree(
    repoDir: string,
    featureBranch: string,
    jobId: string,
    depBranches: string[],
  ): Promise<{ worktreePath: string; jobBranch: string }> {
    return this.withLock(repoDir, async () => {
      // Fetch to ensure remote dep branches are available in the bare repo
      console.log(`[RepoManager] createDependentJobWorktree: jobId=${jobId}, depBranches=${JSON.stringify(depBranches)}`);
      // Fetch may exit non-zero if some branches are rejected (non-fast-forward).
      // That's expected — diverged branches are intentionally protected. The other
      // branches are still updated, so we log and continue.
      try { await this.git(repoDir, "fetch", "origin"); } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }

      // List all branches after fetch for debugging
      const { stdout: branchList } = await execFileAsync("git", ["-C", repoDir, "branch", "--list", "job/*"], { encoding: "utf8" });
      console.log(`[RepoManager] Branches after fetch: ${branchList.trim().split("\n").map(b => b.trim()).join(", ")}`);

      // Verify each dep branch exists; skip missing ones with a warning
      const validBranches: string[] = [];
      for (const branch of depBranches) {
        try {
          const { stdout: sha } = await execFileAsync("git", ["-C", repoDir, "rev-parse", "--verify", `refs/heads/${branch}`], { encoding: "utf8" });
          const { stdout: logLine } = await execFileAsync("git", ["-C", repoDir, "log", "--oneline", "-1", branch], { encoding: "utf8" });
          // Check if this branch shares history with the repo root
          let ancestry = "UNKNOWN";
          try {
            await execFileAsync("git", ["-C", repoDir, "merge-base", "--is-ancestor", "HEAD~100", branch], { encoding: "utf8" });
            ancestry = "shares-history";
          } catch {
            // Try checking against a known good branch
            try {
              const { stdout: roots } = await execFileAsync("git", ["-C", repoDir, "rev-list", "--max-parents=0", branch], { encoding: "utf8" });
              const { stdout: mainRoots } = await execFileAsync("git", ["-C", repoDir, "rev-list", "--max-parents=0", "master"], { encoding: "utf8" });
              ancestry = roots.trim() === mainRoots.trim() ? "same-root" : `DIFFERENT-ROOT(branch=${roots.trim().slice(0,8)},master=${mainRoots.trim().slice(0,8)})`;
            } catch {
              ancestry = "root-check-failed";
            }
          }
          console.log(`[RepoManager] Dep branch "${branch}": sha=${sha.trim().slice(0,8)}, log="${logLine.trim()}", ancestry=${ancestry}`);
          validBranches.push(branch);
        } catch {
          console.warn(`[RepoManager] createDependentJobWorktree: dep branch "${branch}" not found in ${repoDir} — skipping`);
        }
      }

      const jobBranch = `job/${jobId}`;
      const worktreePath = join(WORKTREE_BASE, `job-${jobId}`);
      await mkdir(WORKTREE_BASE, { recursive: true });

      // Determine base branch: first valid dep branch, or fall back to feature branch
      const baseBranch = validBranches.length > 0 ? validBranches[0] : featureBranch;
      console.log(`[RepoManager] Creating jobBranch="${jobBranch}" from baseBranch="${baseBranch}", validBranches=${JSON.stringify(validBranches)}`);

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

      await this.git(repoDir, "branch", jobBranch, baseBranch);
      await this.git(repoDir, "worktree", "add", worktreePath, jobBranch);

      // Fan-in: merge additional dep branches into the worktree
      for (const branch of validBranches.slice(1)) {
        console.log(`[RepoManager] Fan-in merging "${branch}" into worktree at ${worktreePath}`);
        try {
          await execFileAsync("git", ["-C", worktreePath, "merge", "--no-ff", branch], { encoding: "utf8" });
          console.log(`[RepoManager] Fan-in merge of "${branch}" succeeded`);
        } catch (mergeErr) {
          // Abort the merge, clean up worktree and branch, then re-throw
          try {
            await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" });
          } catch {
            // ignore abort failure
          }
          await this.git(repoDir, "worktree", "remove", "--force", worktreePath);
          try { await this.git(repoDir, "branch", "-D", jobBranch); } catch { /* ignore */ }
          throw new Error(`Fan-in merge of "${branch}" into job/${jobId} failed: ${String(mergeErr)}`);
        }
      }

      return { worktreePath, jobBranch };
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
