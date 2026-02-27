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

function commitFile(fileName: string, content: string, message: string): string {
  writeFileSync(join(repoDir, fileName), content);
  git(repoDir, "add", ".");
  git(repoDir, "commit", "-m", message);
  return git(repoDir, "rev-parse", "HEAD");
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
