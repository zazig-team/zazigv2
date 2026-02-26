import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
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

export const WORKTREE_BASE = join(process.env.HOME ?? "~", "Documents/GitHub/.worktrees");

export async function createFeatureBranch(repoDir: string, featureName: string): Promise<string> {
  const branchName = `feature/${featureName}`;
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
      } else {
        await git(repoDir, "fetch", "--prune", "origin");
      }
      // Bare clones of empty repos don't set a fetch refspec — fix it so
      // future fetches actually populate refs/heads/*.
      try {
        await git(repoDir, "config", "--get", "remote.origin.fetch");
      } catch {
        await git(repoDir, "config", "remote.origin.fetch", "+refs/heads/*:refs/heads/*");
      }
      // Check if repo is empty. NOTE: rev-parse HEAD without --verify returns
      // the literal string "HEAD" with exit 0 in an empty repo, so --verify
      // is required to actually detect emptiness.
      try {
        await git(repoDir, "rev-parse", "--verify", "HEAD");
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
        await git(repoDir, "fetch", "origin");
      }
      return repoDir;
    });
  }

  /**
   * Resolve the default branch in a bare repo.
   * Tries symbolic-ref HEAD first, then falls back to common names.
   */
  private async resolveDefaultBranch(repoDir: string): Promise<string> {
    // In a bare repo, HEAD is a symbolic ref like "refs/heads/main"
    try {
      const ref = await git(repoDir, "symbolic-ref", "HEAD");
      const branchName = ref.replace(/^refs\/heads\//, "");
      // Verify the branch actually has commits
      await git(repoDir, "rev-parse", "--verify", `refs/heads/${branchName}`);
      return branchName;
    } catch {
      // HEAD symbolic ref missing or points to nonexistent branch
    }
    // Fallback: try common default branch names
    for (const name of ["main", "master"]) {
      try {
        await git(repoDir, "rev-parse", "--verify", `refs/heads/${name}`);
        return name;
      } catch {
        continue;
      }
    }
    throw new Error(`Cannot resolve default branch in ${repoDir} — repo may be empty`);
  }

  /**
   * Create feature branch off default branch if not exists. Idempotent.
   * In a bare repo, branches fetched from origin live directly under refs/heads/,
   * so there are no origin/* tracking refs.
   */
  async ensureFeatureBranch(repoDir: string, featureBranch: string): Promise<void> {
    return this.withLock(repoDir, async () => {
      // Check if branch already exists (covers both local and fetched-from-remote)
      try {
        await git(repoDir, "rev-parse", "--verify", `refs/heads/${featureBranch}`);
        return; // Already exists
      } catch {
        // Not found — create off default branch
      }
      const defaultBranch = await this.resolveDefaultBranch(repoDir);
      await git(repoDir, "branch", featureBranch, defaultBranch);
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
      const jobBranch = `job/${jobId}`;
      const worktreePath = join(WORKTREE_BASE, `job-${jobId}`);
      await mkdir(WORKTREE_BASE, { recursive: true });
      // Create branch off feature branch
      await git(repoDir, "branch", jobBranch, featureBranch);
      // Add worktree for the job branch
      await git(repoDir, "worktree", "add", worktreePath, jobBranch);
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
      await git(repoDir, "fetch", "--prune", "origin");

      // Verify each dep branch exists; skip missing ones with a warning
      const validBranches: string[] = [];
      for (const branch of depBranches) {
        try {
          await git(repoDir, "rev-parse", "--verify", `refs/heads/${branch}`);
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
      await git(repoDir, "branch", jobBranch, baseBranch);
      await git(repoDir, "worktree", "add", worktreePath, jobBranch);

      // Fan-in: merge additional dep branches into the worktree
      for (const branch of validBranches.slice(1)) {
        try {
          await execFileAsync("git", ["-C", worktreePath, "merge", "--no-ff", branch], { encoding: "utf8" });
        } catch (mergeErr) {
          // Abort the merge, clean up worktree and branch, then re-throw
          try {
            await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" });
          } catch {
            // ignore abort failure
          }
          await git(repoDir, "worktree", "remove", "--force", worktreePath);
          try { await git(repoDir, "branch", "-D", jobBranch); } catch { /* ignore */ }
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
    await execFileAsync("git", ["-C", worktreePath, "push", "origin", jobBranch], {
      encoding: "utf8",
    });
  }

  /**
   * Remove worktree (branch persists on remote). Uses --force since the worktree
   * may have uncommitted changes from a failed agent.
   */
  async removeJobWorktree(repoDir: string, worktreePath: string): Promise<void> {
    try {
      await git(repoDir, "worktree", "remove", "--force", worktreePath);
    } catch {
      // Worktree may already be removed; ignore.
    }
  }
}
