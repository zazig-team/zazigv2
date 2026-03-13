import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let repoDir = "";
let tempHomeDir = "";
let originalHome: string | undefined;
let createdWorktrees: string[] = [];
let branches: typeof import("./branches.js");

function git(repoDirPath: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repoDirPath, ...args], { encoding: "utf8" }).trim();
}

function commitFileInRepo(repoDirPath: string, fileName: string, content: string, message: string): string {
  writeFileSync(join(repoDirPath, fileName), content);
  git(repoDirPath, "add", ".");
  git(repoDirPath, "commit", "-m", message);
  return git(repoDirPath, "rev-parse", "HEAD");
}

function commitFile(fileName: string, content: string, message: string): string {
  return commitFileInRepo(repoDir, fileName, content, message);
}

function createSourceRepo(): string {
  const sourceDir = mkdtempSync(join(tmpdir(), "branch-source-"));
  git(sourceDir, "init");
  git(sourceDir, "config", "user.email", "test@test.com");
  git(sourceDir, "config", "user.name", "Test");
  writeFileSync(join(sourceDir, "README.md"), "source\n");
  git(sourceDir, "add", ".");
  git(sourceDir, "commit", "-m", "init source");
  git(sourceDir, "branch", "-M", "main");
  return sourceDir;
}

beforeEach(async () => {
  originalHome = process.env.HOME;
  tempHomeDir = mkdtempSync(join(tmpdir(), "branch-home-"));
  process.env.HOME = tempHomeDir;

  vi.resetModules();
  branches = await import("./branches.js");

  repoDir = mkdtempSync(join(tmpdir(), "branch-test-"));
  git(repoDir, "init");
  git(repoDir, "config", "user.email", "test@test.com");
  git(repoDir, "config", "user.name", "Test");

  writeFileSync(join(repoDir, "README.md"), "initial\n");
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", "initial commit");
  git(repoDir, "branch", "-M", "main");

  createdWorktrees = [];
});

afterEach(async () => {
  for (const worktreePath of createdWorktrees) {
    await branches.removeWorktree(repoDir, worktreePath);
  }

  rmSync(repoDir, { recursive: true, force: true });
  rmSync(tempHomeDir, { recursive: true, force: true });

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

describe("createFeatureBranch", () => {
  it("creates branch named feature/{name} from main", async () => {
    const branchName = await branches.createFeatureBranch(repoDir, "search");
    expect(branchName).toBe("feature/search");
    expect(git(repoDir, "branch", "--list", branchName)).toContain(branchName);

    const mainHead = git(repoDir, "rev-parse", "main");
    const featureHead = git(repoDir, "rev-parse", branchName);
    expect(featureHead).toBe(mainHead);
  });

  it("always branches from main even if HEAD is elsewhere", async () => {
    git(repoDir, "checkout", "-b", "scratch");
    commitFile("scratch.txt", "scratch branch\n", "scratch commit");

    const mainHead = git(repoDir, "rev-parse", "main");
    const featureBranch = await branches.createFeatureBranch(repoDir, "from-main");
    const featureHead = git(repoDir, "rev-parse", featureBranch);

    expect(featureHead).toBe(mainHead);
  });
});

describe("createJobBranch", () => {
  it("creates branch named job/{name} from the feature branch", async () => {
    const featureBranch = await branches.createFeatureBranch(repoDir, "search");
    const featureHead = git(repoDir, "rev-parse", featureBranch);

    const jobBranch = await branches.createJobBranch(repoDir, featureBranch, "implement-search");
    expect(jobBranch).toBe("job/implement-search");
    expect(git(repoDir, "branch", "--list", jobBranch)).toContain(jobBranch);
    expect(git(repoDir, "rev-parse", jobBranch)).toBe(featureHead);
  });
});

describe("rebaseOnBranch", () => {
  it("successfully rebases when no conflicts", async () => {
    const featureBranch = await branches.createFeatureBranch(repoDir, "rebase-success");
    commitFile("feature.txt", "feature change\n", "feature commit");

    git(repoDir, "checkout", "main");
    commitFile("main.txt", "main change\n", "main commit");

    const result = await branches.rebaseOnBranch(repoDir, featureBranch, "main");
    expect(result).toEqual({ success: true });
    expect(() => git(repoDir, "merge-base", "--is-ancestor", "main", featureBranch)).not.toThrow();
  });

  it("returns failure and aborts rebase when conflicts occur", async () => {
    const featureBranch = await branches.createFeatureBranch(repoDir, "rebase-conflict");
    commitFile("conflict.txt", "feature version\n", "feature conflict");

    git(repoDir, "checkout", "main");
    commitFile("conflict.txt", "main version\n", "main conflict");

    const result = await branches.rebaseOnBranch(repoDir, featureBranch, "main");
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(() => git(repoDir, "rev-parse", "--verify", "REBASE_HEAD")).toThrow();
  });
});

describe("mergeJobIntoFeature", () => {
  it("merges job branch into feature branch", async () => {
    const featureBranch = await branches.createFeatureBranch(repoDir, "merge-job");
    const jobBranch = await branches.createJobBranch(repoDir, featureBranch, "job-merge");
    const jobCommit = commitFile("job.txt", "job change\n", "job commit");

    const result = await branches.mergeJobIntoFeature(repoDir, jobBranch, featureBranch);
    expect(result).toEqual({ success: true });
    expect(() => git(repoDir, "merge-base", "--is-ancestor", jobCommit, featureBranch)).not.toThrow();
  });

  it("returns failure and aborts merge when conflicts occur", async () => {
    const featureBranch = await branches.createFeatureBranch(repoDir, "merge-conflict");
    const jobBranch = await branches.createJobBranch(repoDir, featureBranch, "merge-conflict-job");
    commitFile("conflict.txt", "job version\n", "job conflict");

    git(repoDir, "checkout", featureBranch);
    commitFile("conflict.txt", "feature version\n", "feature conflict");

    const result = await branches.mergeJobIntoFeature(repoDir, jobBranch, featureBranch);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(() => git(repoDir, "rev-parse", "--verify", "MERGE_HEAD")).toThrow();
  });
});

describe("mergeFeatureIntoMain", () => {
  it("merges feature branch into main", async () => {
    const featureBranch = await branches.createFeatureBranch(repoDir, "merge-main");
    const featureCommit = commitFile("feature.txt", "feature change\n", "feature commit");

    const result = await branches.mergeFeatureIntoMain(repoDir, featureBranch);
    expect(result).toEqual({ success: true });
    expect(() => git(repoDir, "merge-base", "--is-ancestor", featureCommit, "main")).not.toThrow();
  });
});

describe("cleanupBranches", () => {
  it("deletes specified branches", async () => {
    const featureBranch = await branches.createFeatureBranch(repoDir, "cleanup");
    const jobBranch = await branches.createJobBranch(repoDir, featureBranch, "cleanup-job");
    git(repoDir, "checkout", "main");

    await branches.cleanupBranches(repoDir, [featureBranch, jobBranch]);

    expect(git(repoDir, "branch", "--list", featureBranch)).toBe("");
    expect(git(repoDir, "branch", "--list", jobBranch)).toBe("");
  });

  it("does not throw for non-existent branches", async () => {
    await expect(branches.cleanupBranches(repoDir, ["missing-branch"])).resolves.toBeUndefined();
  });
});

describe("createWorktree", () => {
  it("creates a worktree at the expected path", async () => {
    await branches.createFeatureBranch(repoDir, "worktree-setup");

    const worktreePath = await branches.createWorktree(repoDir, "main");
    createdWorktrees.push(worktreePath);

    const expectedPath = join(branches.WORKTREE_BASE, "main");
    expect(worktreePath).toBe(expectedPath);
    expect(existsSync(worktreePath)).toBe(true);
  });
});

describe("removeWorktree", () => {
  it("removes a previously created worktree", async () => {
    await branches.createFeatureBranch(repoDir, "worktree-remove-setup");

    const worktreePath = await branches.createWorktree(repoDir, "main");
    await branches.removeWorktree(repoDir, worktreePath);

    expect(existsSync(worktreePath)).toBe(false);
  });

  it("does not throw if worktree doesn't exist", async () => {
    const missingWorktreePath = join(branches.WORKTREE_BASE, "missing-worktree");
    await expect(branches.removeWorktree(repoDir, missingWorktreePath)).resolves.toBeUndefined();
  });
});

describe("RepoManager.ensureRepo", () => {
  it("configures selective fetch refspecs with force for master/feature/expert and non-force for job", async () => {
    const sourceDir = createSourceRepo();
    try {
      const manager = new branches.RepoManager();
      const bareDir = await manager.ensureRepo(sourceDir, "ensure-repo-fetch-config-project");
      const fetchConfig = git(bareDir, "config", "--get-all", "remote.origin.fetch")
        .split("\n")
        .filter(Boolean);

      expect(fetchConfig).toHaveLength(4);
      expect(fetchConfig).toEqual([
        "+refs/heads/master:refs/heads/master",
        "+refs/heads/feature/*:refs/heads/feature/*",
        "+refs/heads/expert/*:refs/heads/expert/*",
        "refs/heads/job/*:refs/heads/job/*",
      ]);
      expect(fetchConfig[0]?.startsWith("+")).toBe(true);
      expect(fetchConfig[1]?.startsWith("+")).toBe(true);
      expect(fetchConfig[2]?.startsWith("+")).toBe(true);
      expect(fetchConfig[3]?.startsWith("+")).toBe(false);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

describe("RepoManager.ensureWorktree", () => {
  it("creates the shared worktree on main when master is absent", async () => {
    const sourceDir = createSourceRepo();
    try {
      const manager = new branches.RepoManager();
      await manager.ensureRepo(sourceDir, "main-only-project");
      const worktreePath = await manager.ensureWorktree("main-only-project");

      expect(existsSync(worktreePath)).toBe(true);
      expect(git(worktreePath, "branch", "--show-current")).toBe("main");
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

describe("RepoManager.refreshWorktree", () => {
  it("is a no-op when the shared worktree is already up to date", async () => {
    const sourceDir = createSourceRepo();
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const manager = new branches.RepoManager();
      const bareDir = await manager.ensureRepo(sourceDir, "refresh-noop-project");
      const worktreePath = await manager.ensureWorktree("refresh-noop-project");
      const beforeHead = git(worktreePath, "rev-parse", "HEAD");

      consoleLogSpy.mockClear();
      await manager.refreshWorktree("refresh-noop-project");

      expect(git(worktreePath, "rev-parse", "HEAD")).toBe(beforeHead);
      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("[RepoManager] refreshed refresh-noop-project worktree:"),
      );
      expect(git(bareDir, "rev-parse", "refs/heads/main")).toBe(beforeHead);
    } finally {
      consoleLogSpy.mockRestore();
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("resets the shared worktree when it is behind the bare repo branch", async () => {
    const sourceDir = createSourceRepo();
    try {
      const manager = new branches.RepoManager();
      await manager.ensureRepo(sourceDir, "refresh-behind-project");
      const worktreePath = await manager.ensureWorktree("refresh-behind-project");
      const oldHead = git(worktreePath, "rev-parse", "HEAD");
      const newHead = commitFileInRepo(sourceDir, "behind.txt", "remote change\n", "remote advance");

      await manager.refreshWorktree("refresh-behind-project");

      expect(git(worktreePath, "rev-parse", "HEAD")).toBe(newHead);
      expect(git(worktreePath, "merge-base", oldHead, newHead)).toBe(oldHead);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("rebases local commits when the shared worktree has diverged", async () => {
    const sourceDir = createSourceRepo();
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const manager = new branches.RepoManager();
      await manager.ensureRepo(sourceDir, "refresh-diverged-project");
      const worktreePath = await manager.ensureWorktree("refresh-diverged-project");

      git(worktreePath, "config", "user.email", "test@test.com");
      git(worktreePath, "config", "user.name", "Test");
      git(worktreePath, "checkout", "--detach");
      commitFileInRepo(worktreePath, "local-only.txt", "local change\n", "local detached commit");
      const remoteHead = commitFileInRepo(sourceDir, "remote-only.txt", "remote change\n", "remote commit");

      await manager.refreshWorktree("refresh-diverged-project");

      // After rebase, the local commit should be on top of the remote head.
      // Both files should exist (local-only.txt rebased onto remote-only.txt).
      const newHead = git(worktreePath, "rev-parse", "HEAD");
      expect(newHead).not.toBe(remoteHead); // rebased commit is a new hash
      expect(git(worktreePath, "merge-base", "--is-ancestor", remoteHead, newHead)).toBe("");
      expect(existsSync(join(worktreePath, "local-only.txt"))).toBe(true);
      expect(existsSync(join(worktreePath, "remote-only.txt"))).toBe(true);
    } finally {
      consoleLogSpy.mockRestore();
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("handles bare repo fetch failures gracefully", async () => {
    const sourceDir = createSourceRepo();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const manager = new branches.RepoManager();
      await manager.ensureRepo(sourceDir, "refresh-fetch-warning-project");
      const worktreePath = await manager.ensureWorktree("refresh-fetch-warning-project");
      const initialHead = git(worktreePath, "rev-parse", "HEAD");
      commitFileInRepo(sourceDir, "remote-warning.txt", "remote warning\n", "remote warning commit");

      const originalGit = (manager as any).git.bind(manager);
      const bareDir = join(tempHomeDir, ".zazigv2", "repos", "refresh-fetch-warning-project");
      const gitSpy = vi.spyOn(manager as any, "git").mockImplementation(async (repoDirPath: unknown, ...args: unknown[]) => {
        const repoDirPathStr = String(repoDirPath);
        const gitArgs = args.map(String);
        if (repoDirPathStr === bareDir && gitArgs[0] === "fetch") {
          throw new Error("simulated fetch failure");
        }
        return originalGit(repoDirPathStr, ...gitArgs);
      });

      await expect(manager.refreshWorktree("refresh-fetch-warning-project")).resolves.toBeUndefined();

      expect(git(worktreePath, "rev-parse", "HEAD")).toBe(initialHead);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[RepoManager] refreshWorktree: fetch FAILED for refresh-fetch-warning-project: simulated fetch failure",
      );
      gitSpy.mockRestore();
    } finally {
      consoleWarnSpy.mockRestore();
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

describe("RepoManager.fetchBranchForExpert", () => {
  it("force-fetches the requested branch into refs/heads", async () => {
    const sourceDir = createSourceRepo();
    try {
      git(sourceDir, "checkout", "-b", "expert/review");
      const expertHead = commitFileInRepo(sourceDir, "expert.txt", "expert branch\n", "expert branch commit");
      git(sourceDir, "checkout", "main");

      const manager = new branches.RepoManager();
      await manager.ensureRepo(sourceDir, "expert-fetch-project");
      await manager.fetchBranchForExpert("expert-fetch-project", "expert/review");

      const bareDir = join(tempHomeDir, ".zazigv2", "repos", "expert-fetch-project");
      expect(git(bareDir, "rev-parse", "refs/heads/expert/review")).toBe(expertHead);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("serializes concurrent branch fetches through the repo lock", async () => {
    const manager = new branches.RepoManager();
    const started: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const gitSpy = vi.spyOn(manager as any, "git").mockImplementation(async (_repoDirPath: unknown, ...args: unknown[]) => {
      const branchArg = String(args[3] ?? "");
      started.push(branchArg);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (started.length === 1) {
        await firstBlocked;
      }
      inFlight -= 1;
      return "";
    });

    const firstFetch = manager.fetchBranchForExpert("locked-project", "branch-a");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const secondFetch = manager.fetchBranchForExpert("locked-project", "branch-b");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(started).toHaveLength(1);

    releaseFirst();
    await Promise.all([firstFetch, secondFetch]);

    expect(maxInFlight).toBe(1);
    expect(started).toEqual([
      "+refs/heads/branch-a:refs/heads/branch-a",
      "+refs/heads/branch-b:refs/heads/branch-b",
    ]);

    gitSpy.mockRestore();
  });
});
