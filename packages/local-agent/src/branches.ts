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
 * Manages repo clones, feature branches, job worktrees, pushing, and cleanup.
 * Uses a normal (non-bare) clone as the worktree parent. The clone's working
 * tree is never used directly — all work happens in linked worktrees.
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
   * Clone repoUrl to ~/.zazigv2/repos/{name}/ if not exists, else fetch.
   * If an existing clone is bare (legacy), removes and re-clones as normal.
   * If the repo is empty (no commits), seeds it with an initial empty commit.
   * Returns the repo dir path.
   */
  async ensureRepo(repoUrl: string, projectName: string): Promise<string> {
    const repoDir = join(REPOS_BASE, projectName);
    return this.withLock(repoDir, async () => {
      await mkdir(REPOS_BASE, { recursive: true });

      // Migrate legacy bare clones: detect and re-clone as normal
      if (existsSync(repoDir)) {
        try {
          const isBare = await this.git(repoDir, "rev-parse", "--is-bare-repository");
          if (isBare === "true") {
            console.log(`[RepoManager] Migrating legacy bare clone to normal clone: ${repoDir}`);
            rmSync(repoDir, { recursive: true, force: true });
          }
        } catch {
          // Not a valid git repo — remove and re-clone
          rmSync(repoDir, { recursive: true, force: true });
        }
      }

      if (!existsSync(repoDir)) {
        await execFileAsync("git", ["clone", repoUrl, repoDir], { encoding: "utf8" });
      }

      // Check if repo is empty
      try {
        await this.git(repoDir, "rev-parse", "--verify", "HEAD");
      } catch {
        // Empty repo — create an initial commit, push it
        const tmpDir = join(REPOS_BASE, `.tmp-init-${projectName}`);
        try {
          await execFileAsync("git", ["clone", repoUrl, tmpDir], { encoding: "utf8" });
          await execFileAsync("git", ["-C", tmpDir, "commit", "--allow-empty", "-m", "Initial commit"], { encoding: "utf8" });
          await execFileAsync("git", ["-C", tmpDir, "push", "origin", "HEAD"], { encoding: "utf8" });
        } finally {
          await execFileAsync("rm", ["-rf", tmpDir]).catch(() => {});
        }
        await this.git(repoDir, "fetch", "origin");
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
    const cloneDir = join(REPOS_BASE, projectName);
    const worktreeDir = join(REPOS_BASE, `${projectName}-worktree`);

    return this.withLock(cloneDir, async () => {
      try {
        if (!existsSync(cloneDir)) {
          throw new Error(`Repo clone missing: ${cloneDir}`);
        }

        await this.git(cloneDir, "fetch", "origin");

        const targetBranch = await this.resolveSharedWorktreeBranch(cloneDir);
        console.log(`[RepoManager] ensureWorktree project=${projectName} branch=${targetBranch} path=${worktreeDir}`);

        if (existsSync(worktreeDir)) {
          const isValid = await this.isValidWorktree(worktreeDir);
          if (!isValid) {
            console.warn(`[RepoManager] ensureWorktree found invalid worktree at ${worktreeDir}; recreating`);
            rmSync(worktreeDir, { recursive: true, force: true });
            await this.git(cloneDir, "worktree", "prune");
          }
        }

        if (!existsSync(worktreeDir)) {
          // Detach HEAD in the clone so the target branch isn't "checked out" there,
          // allowing git worktree add to use it without conflict.
          await this.git(cloneDir, "checkout", "--detach").catch(() => {});
          // Create worktree from the latest remote tracking ref
          await this.git(cloneDir, "worktree", "add", worktreeDir, targetBranch);
          console.log(`[RepoManager] ensureWorktree created ${worktreeDir} on ${targetBranch}`);
        } else {
          await this.git(worktreeDir, "checkout", targetBranch);
          await this.git(worktreeDir, "reset", "--hard", `origin/${targetBranch}`);
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
    const cloneDir = join(REPOS_BASE, projectName);
    const worktreeDir = join(REPOS_BASE, `${projectName}-worktree`);

    if (!existsSync(worktreeDir)) {
      return;
    }

    await this.withLock(cloneDir, async () => {
      if (!existsSync(worktreeDir)) {
        return;
      }

      const targetBranch = await this.resolveSharedWorktreeBranch(cloneDir);

      // Fetch latest from origin — updates origin/* tracking refs without
      // touching any local branches or worktrees.
      try {
        await this.git(cloneDir, "fetch", "origin");
      } catch (error) {
        console.warn(
          `[RepoManager] refreshWorktree: fetch FAILED for ${projectName}: ${getErrorMessage(error)}`,
        );
        return;
      }

      const remoteHead = await this.git(cloneDir, "rev-parse", `origin/${targetBranch}`);
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
          await this.git(worktreeDir, "reset", "--hard", remoteHead);
          console.log(`[RepoManager] refreshed ${projectName}: ${worktreeHead.slice(0, 8)} → ${remoteHead.slice(0, 8)}`);
        } else {
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
   * Resolve the default branch by checking origin's HEAD.
   * Falls back to checking for common branch names.
   */
  private async resolveDefaultBranch(repoDir: string): Promise<string> {
    // Check what origin/HEAD points to
    try {
      const ref = await this.git(repoDir, "symbolic-ref", "refs/remotes/origin/HEAD");
      return ref.replace(/^refs\/remotes\/origin\//, "");
    } catch {
      // origin/HEAD not set
    }
    // Fallback: try common default branch names via tracking refs
    for (const name of ["main", "master"]) {
      try {
        await this.git(repoDir, "rev-parse", "--verify", `refs/remotes/origin/${name}`);
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
      await this.git(repoDir, "rev-parse", "--verify", "refs/remotes/origin/master");
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

      // Fetch latest so we branch from the current remote HEAD
      try {
        await this.git(repoDir, "fetch", "origin");
      } catch (e) {
        console.warn(`[RepoManager] ensureFeatureBranch: fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }

      await this.git(repoDir, "branch", featureBranch, `origin/${defaultBranch}`);
    });
  }

  async fetchBranchForExpert(projectName: string, branch: string): Promise<void> {
    const cloneDir = join(REPOS_BASE, projectName);
    return this.withLock(cloneDir, async () => {
      await this.git(cloneDir, "fetch", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`);
    });
  }

  /**
   * Fetch the default branch for an expert session.
   *
   * Returns the resolved default branch name and the remote tracking ref
   * that the worktree should be created from.
   */
  async fetchForExpertSession(
    projectName: string,
    _sessionId: string,
  ): Promise<{ defaultBranch: string; tempRef: string }> {
    const cloneDir = join(REPOS_BASE, projectName);
    return this.withLock(cloneDir, async () => {
      await this.git(cloneDir, "fetch", "origin");
      const defaultBranch = await this.resolveDefaultBranch(cloneDir);
      // Return the tracking ref — caller creates worktree from this
      return { defaultBranch, tempRef: `origin/${defaultBranch}` };
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
      // Fetch latest tracking refs
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
   * Validates all dependency branches exist and then creates
   * job/{jobId} from depBranches[0].
   */
  async createDependentJobWorktree(
    repoDir: string,
    featureBranch: string,
    jobId: string,
    depBranches: string[],
  ): Promise<{ worktreePath: string; jobBranch: string; conflictBranches: string[] }> {
    return this.withLock(repoDir, async () => {
      console.log(`[RepoManager] createDependentJobWorktree: jobId=${jobId}, depBranches=${JSON.stringify(depBranches)}`);
      try { await this.git(repoDir, "fetch", "origin"); } catch (e) {
        console.warn(`[RepoManager] fetch warning (non-fatal): ${getErrorMessage(e)}`);
      }

      if (depBranches.length === 0) {
        throw new Error("createDependentJobWorktree requires at least one dependency branch");
      }

      // Verify each dep branch exists before creating the worktree.
      // After a normal clone, branches are remote tracking refs (refs/remotes/origin/*)
      // not local refs (refs/heads/*), so check both locations.
      const missingBranches: string[] = [];
      const resolvedRefs = new Map<string, string>();
      for (const branch of depBranches) {
        let found = false;
        for (const refPrefix of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
          try {
            await execFileAsync("git", ["-C", repoDir, "rev-parse", "--verify", refPrefix], { encoding: "utf8" });
            resolvedRefs.set(branch, refPrefix === `refs/heads/${branch}` ? branch : `origin/${branch}`);
            found = true;
            break;
          } catch {
            // try next
          }
        }
        if (!found) {
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

      const baseBranch = resolvedRefs.get(depBranches[0]!) ?? depBranches[0] ?? featureBranch;
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
      try {
        await execFileAsync("git", ["-C", worktreePath, "config", "user.email"], { encoding: "utf8" });
      } catch {
        await execFileAsync("git", ["-C", worktreePath, "config", "user.email", "zazig-agent@zazig.com"], { encoding: "utf8" });
        await execFileAsync("git", ["-C", worktreePath, "config", "user.name", "zazig-agent"], { encoding: "utf8" });
      }
      const conflictBranches: string[] = [];
      for (const branch of depBranches.slice(1)) {
        const mergeRef = resolvedRefs.get(branch) ?? branch;
        try {
          await execFileAsync("git", ["-C", worktreePath, "merge", "--no-edit", mergeRef], { encoding: "utf8" });
          console.log(`[RepoManager] Merged dep branch "${branch}" cleanly into ${jobBranch}`);
        } catch (mergeErr) {
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
