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
      return repoDir;
    });
  }

  /**
   * Create feature branch off default branch if not exists. Idempotent.
   */
  async ensureFeatureBranch(repoDir: string, featureBranch: string): Promise<void> {
    return this.withLock(repoDir, async () => {
      // Check if branch exists locally
      try {
        await git(repoDir, "rev-parse", "--verify", featureBranch);
        return; // Already exists
      } catch {
        // Not found locally
      }
      // Check remote
      try {
        await git(repoDir, "rev-parse", "--verify", `origin/${featureBranch}`);
        // Remote branch exists — create local tracking branch
        await git(repoDir, "branch", featureBranch, `origin/${featureBranch}`);
        return;
      } catch {
        // Not on remote either — create off HEAD
      }
      await git(repoDir, "branch", featureBranch, "HEAD");
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
