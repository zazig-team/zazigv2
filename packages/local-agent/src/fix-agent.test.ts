import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock branches module
vi.mock("./branches.js", () => ({
  createWorktree: vi.fn().mockResolvedValue("/tmp/worktrees/feature-auth"),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process.execFile to intercept tmux calls
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";
import { createWorktree, removeWorktree } from "./branches.js";

// Build a promisified mock that resolves by default
const execFileMock = vi.mocked(execFile);
const createWorktreeMock = vi.mocked(createWorktree);
const removeWorktreeMock = vi.mocked(removeWorktree);

beforeEach(() => {
  vi.clearAllMocks();
  // Make execFile's promisified form resolve successfully by default.
  // promisify(execFile) calls execFile with a callback as the last arg.
  execFileMock.mockImplementation((_cmd: any, _args: any, cb: any) => {
    if (typeof cb === "function") cb(null, { stdout: "", stderr: "" });
    return {} as any;
  });
});

// Dynamically import so mocks are applied
let FixAgentManager: typeof import("./fix-agent.js")["FixAgentManager"];

beforeEach(async () => {
  vi.resetModules();

  // Re-apply mocks after resetModules
  vi.doMock("./branches.js", () => ({
    createWorktree: createWorktreeMock,
    removeWorktree: removeWorktreeMock,
  }));

  vi.doMock("node:child_process", () => ({
    execFile: execFileMock,
  }));

  const mod = await import("./fix-agent.js");
  FixAgentManager = mod.FixAgentManager;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FixAgentManager", () => {
  describe("spawn", () => {
    it("creates a worktree and spawns a tmux session", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.spawn({
        featureId: "feat-1234-abcd-5678-efgh",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      // Should create worktree on the feature branch
      expect(createWorktreeMock).toHaveBeenCalledWith("/repo", "feature/auth");

      // Should spawn tmux session with claude -p command
      expect(execFileMock).toHaveBeenCalled();
      const tmuxCall = execFileMock.mock.calls[0];
      expect(tmuxCall[0]).toBe("tmux");
      const tmuxArgs = tmuxCall[1] as string[];
      expect(tmuxArgs[0]).toBe("new-session");
      expect(tmuxArgs).toContain("-d");
      // Session name should contain the featureId prefix
      const sessionNameIdx = tmuxArgs.indexOf("-s") + 1;
      expect(tmuxArgs[sessionNameIdx]).toContain("fix-");
    });

    it("is idempotent — second spawn with same featureId does nothing", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.spawn({
        featureId: "feat-1234",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      // Clear call counts
      createWorktreeMock.mockClear();
      execFileMock.mockClear();

      await manager.spawn({
        featureId: "feat-1234",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      // Should NOT have called createWorktree or tmux again
      expect(createWorktreeMock).not.toHaveBeenCalled();
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it("sanitizes featureId in the tmux session name", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.spawn({
        featureId: "feat.1234:bad chars!@#",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      const tmuxCall = execFileMock.mock.calls[0];
      const tmuxArgs = tmuxCall[1] as string[];
      const sessionNameIdx = tmuxArgs.indexOf("-s") + 1;
      const sessionName = tmuxArgs[sessionNameIdx];
      // Only [a-zA-Z0-9-] should remain — dots, colons, special chars stripped
      expect(sessionName).toBe("fix-feat1234");
    });

    it("aborts spawn when featureId is empty after sanitization", async () => {
      const manager = new FixAgentManager("/repo");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await manager.spawn({
        featureId: "...:::!!!",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      // Should NOT create worktree or spawn tmux
      expect(createWorktreeMock).not.toHaveBeenCalled();
      expect(execFileMock).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("empty after sanitization")
      );
      expect(manager.isActive("...:::!!!")).toBe(false);

      consoleSpy.mockRestore();
    });

    it("includes the fix agent prompt in the tmux command", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.spawn({
        featureId: "feat-prompt-test",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      const tmuxCall = execFileMock.mock.calls[0];
      const tmuxArgs = tmuxCall[1] as string[];
      // The last arg should be the shell command containing claude -p
      const shellCmd = tmuxArgs[tmuxArgs.length - 1];
      expect(shellCmd).toContain("claude");
      expect(shellCmd).toContain("-p");
    });
  });

  describe("cleanup", () => {
    it("kills tmux session and removes worktree", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.spawn({
        featureId: "feat-cleanup",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      // Clear previous spawn calls
      execFileMock.mockClear();

      await manager.cleanup("feat-cleanup");

      // Should kill the tmux session
      expect(execFileMock).toHaveBeenCalled();
      const killCall = execFileMock.mock.calls[0];
      expect(killCall[0]).toBe("tmux");
      const killArgs = killCall[1] as string[];
      expect(killArgs[0]).toBe("kill-session");

      // Should remove the worktree
      expect(removeWorktreeMock).toHaveBeenCalledWith("/repo", "/tmp/worktrees/feature-auth");
    });

    it("does nothing when featureId is not active", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.cleanup("nonexistent");

      expect(execFileMock).not.toHaveBeenCalled();
      expect(removeWorktreeMock).not.toHaveBeenCalled();
    });

    it("removes the agent from active tracking after cleanup", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.spawn({
        featureId: "feat-track",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      expect(manager.isActive("feat-track")).toBe(true);
      await manager.cleanup("feat-track");
      expect(manager.isActive("feat-track")).toBe(false);
    });
  });

  describe("isActive", () => {
    it("returns false when no agent spawned for featureId", () => {
      const manager = new FixAgentManager("/repo");
      expect(manager.isActive("nonexistent")).toBe(false);
    });

    it("returns true after spawning a fix agent", async () => {
      const manager = new FixAgentManager("/repo");

      await manager.spawn({
        featureId: "feat-active",
        featureBranch: "feature/auth",
        slackChannel: "#testing",
        slackThreadTs: "1234567890.123456",
      });

      expect(manager.isActive("feat-active")).toBe(true);
    });
  });
});
