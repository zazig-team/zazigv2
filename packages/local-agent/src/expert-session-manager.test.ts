import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

let mockExecFileAsync: Mock;

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn(() => (...args: unknown[]) => mockExecFileAsync(...args)),
}));

vi.mock("./workspace.js", () => ({
  setupJobWorkspace: vi.fn(),
}));

vi.mock("node:fs", () => ({
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => "status: pass\nsummary: expert result"),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  rmSync: vi.fn(),
}));

vi.mock("./workspace.js", () => ({
  setupJobWorkspace: vi.fn(),
}));

import * as fsModule from "node:fs";
import { setupJobWorkspace } from "./workspace.js";

function makeSupabaseClient() {
  const updates: Array<{ table: string; data: Record<string, unknown>; eqColumn: string; eqValue: string }> = [];

  return {
    client: {
      from: vi.fn((table: string) => ({
        update: vi.fn((data: Record<string, unknown>) => ({
          eq: vi.fn((col: string, val: string) => {
            updates.push({ table, data, eqColumn: col, eqValue: val });
            return Promise.resolve({ error: null });
          }),
        })),
      })),
    },
    updates,
  };
}

function makeRepoManager(overrides?: Partial<{
  ensureRepo: Mock;
  fetchBranchForExpert: Mock;
}>) {
  return {
    ensureRepo: overrides?.ensureRepo ?? vi.fn().mockResolvedValue("/tmp/.zazigv2/repos/project"),
    fetchBranchForExpert: overrides?.fetchBranchForExpert ?? vi.fn().mockResolvedValue(undefined),
  };
}

describe("ExpertSessionManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockExecFileAsync = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("startExitPolling invokes exit handler when tmux session no longer exists", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const session = {
      sessionId: "session-123",
      workspaceDir: "/tmp/workspace",
      effectiveWorkspaceDir: "/tmp/workspace/repo",
      displayName: "Expert 123",
      tmuxSession: "expert-session",
    };

    const exitSpy = vi.spyOn(manager as any, "handleSessionExit").mockResolvedValue(undefined);

    // has-session check rejects => session dead
    mockExecFileAsync.mockRejectedValueOnce(new Error("dead session"));

    (manager as any).startExitPolling(session);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(exitSpy).toHaveBeenCalledWith(session);
    expect((manager as any).activePollers.has(session.sessionId)).toBe(false);
  });

  it("starts expert session without Claude permission-bypass flag", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const fsReadMock = vi.mocked(fsModule.readFileSync);
    fsReadMock.mockImplementation((path: unknown) =>
      String(path).endsWith("settings.json")
        ? JSON.stringify({ permissions: { allow: ["Read"] } })
        : "status: pass\nsummary: expert result",
    );

    await manager.handleStartExpert({
      type: "start_expert",
      session_id: "session-12345678",
      display_name: "Research Expert",
      role: {
        name: "expert",
        prompt: "You are an expert.",
        mcp_tools: [],
        settings_overrides: null,
        skills: [],
      },
      model: "claude-sonnet-4-6",
      brief: "Investigate and fix issue.",
      branch: null,
      company_name: null,
      company_id: "company-12345678",
      project_id: null,
      repo_url: null,
    } as any);

    expect(setupJobWorkspace).toHaveBeenCalled();

    const tmuxNewSessionCall = mockExecFileAsync.mock.calls.find((call) =>
      call[0] === "tmux"
      && Array.isArray(call[1])
      && call[1][0] === "new-session"
    );
    expect(tmuxNewSessionCall).toBeDefined();
    const shellCmd = tmuxNewSessionCall?.[1][6];
    expect(shellCmd).toContain("'claude'");
    expect(shellCmd).toContain("'--model'");
    expect(shellCmd).toContain("'claude-sonnet-4-6'");
    expect(shellCmd).not.toContain("dangerously");

    const briefWriteCall = vi.mocked(fsModule.writeFileSync).mock.calls.find((call) =>
      String(call[0]).endsWith("expert-brief.md"),
    );
    expect(briefWriteCall).toBeDefined();
    expect(String(briefWriteCall?.[1])).toContain("## Available Context");
    expect(String(briefWriteCall?.[1])).toContain("/as-cpo");
    expect(String(briefWriteCall?.[1])).toContain("/as-cto");
  });

  it("handleStartExpert in headless mode spawns detached tmux and skips viewer linking", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const fsReadMock = vi.mocked(fsModule.readFileSync);
    fsReadMock.mockImplementation((path: unknown) =>
      String(path).endsWith("settings.json")
        ? JSON.stringify({ permissions: { allow: ["Read"] } })
        : "status: pass\nsummary: expert result",
    );

    const linkSpy = vi.spyOn(manager as any, "linkToViewerTui");
    const pollSpy = vi.spyOn(manager as any, "startExitPolling");
    const statusSpy = vi.spyOn(manager as any, "updateSessionStatus");

    await manager.handleStartExpert({
      type: "start_expert",
      protocolVersion: 1,
      session_id: "feedface-1234-5678-90ab-cdef12345678",
      display_name: "Headless Expert",
      role: {
        name: "expert",
        prompt: "You are an expert.",
        mcp_tools: [],
        settings_overrides: null,
        skills: [],
      },
      model: "claude-sonnet-4-6",
      brief: "Run fully autonomously.",
      branch: "master",
      company_name: null,
      company_id: "company-12345678",
      project_id: null,
      repo_url: null,
      headless: true,
    } as any);

    const tmuxNewSessionCall = mockExecFileAsync.mock.calls.find((call) =>
      call[0] === "tmux"
      && Array.isArray(call[1])
      && call[1][0] === "new-session"
    );
    expect(tmuxNewSessionCall).toBeDefined();
    expect(tmuxNewSessionCall?.[1][1]).toBe("-d");
    const shellCmd = tmuxNewSessionCall?.[1][6];
    expect(shellCmd).toContain("'claude'");
    expect(shellCmd).toContain("'--model'");
    expect(shellCmd).toContain("'claude-sonnet-4-6'");
    expect(shellCmd).toContain("'-p'");
    expect(shellCmd).toContain("cat ");
    expect(shellCmd).toContain(".zazig-prompt.txt");

    expect(linkSpy).not.toHaveBeenCalled();
    expect(pollSpy).toHaveBeenCalledTimes(1);
    expect(statusSpy).toHaveBeenCalledWith("feedface-1234-5678-90ab-cdef12345678", "running");
  });

  it("headless lifecycle exits cleanly and injects session summary", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const fsExistsMock = vi.mocked(fsModule.existsSync);
    const fsReadMock = vi.mocked(fsModule.readFileSync);
    fsExistsMock.mockImplementation((path: unknown) => String(path).endsWith("expert-report.md"));
    fsReadMock.mockImplementation((path: unknown) => {
      if (String(path).endsWith("settings.json")) return JSON.stringify({ permissions: { allow: ["Read"] } });
      if (String(path).endsWith("expert-report.md")) return "Headless summary";
      return "";
    });

    let expertHasSessionChecks = 0;
    mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "tmux" && args[0] === "has-session") {
        const sessionName = args[2];
        if (sessionName === "expert-feedface") {
          expertHasSessionChecks += 1;
          if (expertHasSessionChecks === 1) return { stdout: "", stderr: "" };
          throw new Error("dead");
        }
        return { stdout: "", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    const exitSpy = vi.spyOn(manager as any, "handleSessionExit");
    const injectSpy = vi.spyOn(manager as any, "injectSummaryIntoCpo");
    const fsRmMock = vi.mocked(fsModule.rmSync);
    const sessionId = "feedface-1234-5678-90ab-cdef12345678";

    await manager.handleStartExpert({
      type: "start_expert",
      protocolVersion: 1,
      session_id: sessionId,
      display_name: "Headless Expert",
      role: {
        name: "expert",
        prompt: "You are an expert.",
        mcp_tools: [],
        settings_overrides: null,
        skills: [],
      },
      model: "claude-sonnet-4-6",
      brief: "Run fully autonomously.",
      branch: "master",
      company_name: null,
      company_id: "company-12345678",
      project_id: null,
      repo_url: null,
      headless: true,
    } as any);

    await vi.advanceTimersByTimeAsync(20_000);

    expect(exitSpy).toHaveBeenCalled();
    expect(injectSpy).toHaveBeenCalledWith(expect.objectContaining({ sessionId }));
    expect(fsRmMock).toHaveBeenCalledWith(expect.stringContaining(`/.zazigv2/expert-${sessionId}`), {
      recursive: true,
      force: true,
    });
    expect((manager as any).getActiveSessions().has(sessionId)).toBe(false);

    expect(supabase.updates.find((u) => u.table === "expert_sessions" && u.data.summary !== undefined)).toBeUndefined();
  });

  it("interactive regression: non-headless sessions still link to viewer TUI", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const fsReadMock = vi.mocked(fsModule.readFileSync);
    fsReadMock.mockImplementation((path: unknown) =>
      String(path).endsWith("settings.json")
        ? JSON.stringify({ permissions: { allow: ["Read"] } })
        : "",
    );

    const linkSpy = vi.spyOn(manager as any, "linkToViewerTui").mockResolvedValue(null);

    await manager.handleStartExpert({
      type: "start_expert",
      protocolVersion: 1,
      session_id: "cafebabe-1234-5678-90ab-cdef12345678",
      display_name: "Interactive Expert",
      role: {
        name: "expert",
        prompt: "You are an expert.",
        mcp_tools: [],
        settings_overrides: null,
        skills: [],
      },
      model: "claude-sonnet-4-6",
      brief: "Interactive flow.",
      branch: "master",
      company_name: null,
      company_id: "company-12345678",
      project_id: null,
      repo_url: null,
      headless: false,
    } as any);

    expect(linkSpy).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate Available Context section if already present in brief", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const fsReadMock = vi.mocked(fsModule.readFileSync);
    fsReadMock.mockImplementation((path: unknown) =>
      String(path).endsWith("settings.json")
        ? JSON.stringify({ permissions: { allow: ["Read"] } })
        : "status: pass\nsummary: expert result",
    );

    const existingContextBrief = [
      "Investigate and fix issue.",
      "",
      "## Available Context",
      "",
      "Exec context skills are available in this session.",
    ].join("\n");

    await manager.handleStartExpert({
      type: "start_expert",
      session_id: "session-abcdef12",
      display_name: "Research Expert",
      role: {
        name: "expert",
        prompt: "You are an expert.",
        mcp_tools: [],
        settings_overrides: null,
        skills: [],
      },
      model: "claude-sonnet-4-6",
      brief: existingContextBrief,
      branch: null,
      company_name: null,
      company_id: "company-12345678",
      project_id: null,
      repo_url: null,
    } as any);

    const briefWriteCall = vi.mocked(fsModule.writeFileSync).mock.calls.find((call) =>
      String(call[0]).endsWith("expert-brief.md"),
    );
    expect(briefWriteCall).toBeDefined();
    const briefContent = String(briefWriteCall?.[1] ?? "");
    const sectionMatches = briefContent.match(/## Available Context/g) ?? [];
    expect(sectionMatches).toHaveLength(1);
  });

  it("handleSessionExit writes summary, injects into CPO, and cleans resources", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const fsExistsMock = vi.mocked(fsModule.existsSync);
    const fsReadMock = vi.mocked(fsModule.readFileSync);
    const fsRmMock = vi.mocked(fsModule.rmSync);

    fsExistsMock.mockImplementation((path: unknown) => String(path).endsWith("expert-report.md"));
    fsReadMock.mockReturnValue("Expert summary line 1\nline 2");

    mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "tmux" && args[0] === "has-session") {
        return { stdout: "", stderr: "" };
      }
      if (cmd === "tmux" && args[0] === "list-windows") {
        return { stdout: "0:CPO\n1:EXPERT-TASK\n", stderr: "" };
      }
      return { stdout: "", stderr: "" };
    });

    const session = {
      sessionId: "session-123",
      workspaceDir: "/tmp/workspace-root",
      effectiveWorkspaceDir: "/tmp/workspace-root/repo",
      repoDir: "/tmp/workspace-root/repo",
      bareRepoDir: "/tmp/repos/project.git",
      displayName: "Research Expert",
      tmuxSession: "expert-123",
      viewerSession: "zazig-view-acme",
      viewerWindowName: "RESEARCH-EXPERT",
    };

    (manager as any).getActiveSessions().set(session.sessionId, session);
    (manager as any).activePollers.set(session.sessionId, setInterval(() => {}, 1_000));

    await (manager as any).handleSessionExit(session);

    expect(supabase.updates.find((u) => u.table === "expert_sessions")).toBeUndefined();

    const sendKeysLiteral = mockExecFileAsync.mock.calls.find((call) =>
      call[0] === "tmux"
      && Array.isArray(call[1])
      && call[1][0] === "send-keys"
      && call[1][3] === "-l"
    );
    expect(sendKeysLiteral).toBeDefined();
    expect(sendKeysLiteral?.[1][4]).toContain("[Expert session ended — Research Expert]");

    expect(mockExecFileAsync).toHaveBeenCalledWith("tmux", ["select-window", "-t", "zazig-view-acme:CPO"]);
    expect(mockExecFileAsync).toHaveBeenCalledWith("git", ["-C", "/tmp/repos/project.git", "worktree", "remove", "--force", "/tmp/workspace-root/repo"]);
    expect(mockExecFileAsync).toHaveBeenCalledWith("git", ["-C", "/tmp/repos/project.git", "worktree", "prune"]);
    expect(fsRmMock).toHaveBeenCalledWith("/tmp/workspace-root", { recursive: true, force: true });
    expect((manager as any).getActiveSessions().has(session.sessionId)).toBe(false);
    expect((manager as any).activePollers.has(session.sessionId)).toBe(false);
  });

  it("handleStartExpert fetches latest branch and creates repo worktree", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });
    const sessionId = "8badf00d-1234-4567-89ab-abcdef012345";

    const fsReadMock = vi.mocked(fsModule.readFileSync);
    fsReadMock.mockImplementation((path: unknown) => {
      if (String(path).endsWith("settings.json")) return "{}";
      return "";
    });

    mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "tmux" && args[0] === "has-session") {
        throw new Error("session missing");
      }
      return { stdout: "", stderr: "" };
    });

    await manager.handleStartExpert({
      type: "start_expert",
      protocolVersion: 1,
      session_id: sessionId,
      display_name: "Research Expert",
      project_id: "project-123",
      repo_url: "https://github.com/acme/project.git",
      model: "claude-opus",
      brief: "review latest implementation",
      role: { prompt: "system prompt" },
    });

    expect(repoManager.ensureRepo).toHaveBeenCalledWith("https://github.com/acme/project.git", "project");
    expect(repoManager.fetchBranchForExpert).toHaveBeenCalledWith("project", "master");
    expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
      "-C",
      expect.stringContaining("/.zazigv2/repos/project"),
      "worktree",
      "add",
      "-b",
      expect.stringMatching(/^expert\/.+-[a-f0-9]{8}$/),
      expect.stringContaining(`/.zazigv2/expert-${sessionId}/repo`),
      expect.stringContaining("master"),
    ]);
    expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
      "-C",
      expect.stringContaining(`/.zazigv2/expert-${sessionId}/repo`),
      "rev-parse",
      "HEAD",
    ]);
    expect(mockExecFileAsync).toHaveBeenCalledWith("tmux", [
      "new-session",
      "-d",
      "-s",
      "expert-8badf00d",
      "-c",
      expect.stringContaining(`/.zazigv2/expert-${sessionId}/repo`),
      expect.any(String),
    ]);

    const worktreeAddCall = mockExecFileAsync.mock.calls.find((call) =>
      call[0] === "git"
      && Array.isArray(call[1])
      && call[1][2] === "worktree"
      && call[1][3] === "add",
    );
    expect(worktreeAddCall).toBeDefined();
    const worktreeAddArgs = worktreeAddCall?.[1] as string[];
    const branchArgIndex = worktreeAddArgs.indexOf("-b");
    expect(branchArgIndex).toBeGreaterThan(-1);
    const expertBranch = worktreeAddArgs[branchArgIndex + 1];
    expect(expertBranch).toBeDefined();

    expect(vi.mocked(setupJobWorkspace)).toHaveBeenCalled();
    const setupArgs = vi.mocked(setupJobWorkspace).mock.calls[0]?.[0];
    expect(setupArgs?.claudeMdContent).toContain(`You are on branch \`${expertBranch}\``);

    const statusUpdates = supabase.updates
      .filter((u) => u.table === "expert_sessions")
      .map((u) => u.data.status);
    expect(statusUpdates).toContain("running");
  });

  it("handleStartExpert creates an expert branch with role slug and hex suffix", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    const fsReadMock = vi.mocked(fsModule.readFileSync);
    fsReadMock.mockImplementation((path: unknown) => {
      if (String(path).endsWith("settings.json")) return "{}";
      return "";
    });

    mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
      if (cmd === "tmux" && args[0] === "has-session") {
        throw new Error("session missing");
      }
      return { stdout: "", stderr: "" };
    });

    await manager.handleStartExpert({
      type: "start_expert",
      protocolVersion: 1,
      session_id: "deadbeef-1234-4567-89ab-abcdef012345",
      display_name: "Research Expert",
      project_id: "project-123",
      repo_url: "https://github.com/acme/project.git",
      model: "claude-opus",
      brief: "review latest implementation",
      role: { prompt: "system prompt" },
    });

    const worktreeAddCall = mockExecFileAsync.mock.calls.find((call) =>
      call[0] === "git"
      && Array.isArray(call[1])
      && call[1][2] === "worktree"
      && call[1][3] === "add",
    );
    expect(worktreeAddCall).toBeDefined();

    const worktreeAddArgs = worktreeAddCall?.[1] as string[];
    const branchArgIndex = worktreeAddArgs.indexOf("-b");
    expect(branchArgIndex).toBeGreaterThan(-1);
    const expertBranch = worktreeAddArgs[branchArgIndex + 1];

    expect(expertBranch.startsWith("expert/")).toBe(true);
    expect(expertBranch).toContain("research-expert");
    expect(expertBranch).toMatch(/-[a-f0-9]{8}$/);
  });

  describe("pushUnpushedCommits", () => {
    it("pushes expert branch commits, merges to master, and deletes remote expert branch", async () => {
      const supabase = makeSupabaseClient();
      const repoManager = makeRepoManager();
      const { ExpertSessionManager } = await import("./expert-session-manager.js");
      const manager = new ExpertSessionManager({
        machineId: "machine-1",
        companyId: "company-12345678",
        companyName: "test-company",
        supabase: supabase.client as any,
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "anon-key",
        repoManager: repoManager as any,
      });

      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "git" && args[2] === "rev-parse" && args[3] === "HEAD") {
          return { stdout: "deadbeefcafebabe\n", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      });

      await (manager as any).pushUnpushedCommits({
        sessionId: "deadbeef-1234-4567-89ab-abcdef012345",
        repoDir: "/tmp/workspace-root/repo",
        bareRepoDir: "/tmp/repos/project.git",
        expertBranch: "expert/research-expert-deadbeef",
        startCommit: "abc12345",
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo",
        "push", "origin", "HEAD:refs/heads/expert/research-expert-deadbeef",
      ]);
      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo", "checkout", "master",
      ]);
      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo", "merge", "expert/research-expert-deadbeef",
      ]);
      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo", "push", "origin", "master",
      ]);
      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo", "push", "origin", "--delete", "expert/research-expert-deadbeef",
      ]);
    });

    it("does not delete remote expert branch when merge to master fails", async () => {
      const supabase = makeSupabaseClient();
      const repoManager = makeRepoManager();
      const { ExpertSessionManager } = await import("./expert-session-manager.js");
      const manager = new ExpertSessionManager({
        machineId: "machine-1",
        companyId: "company-12345678",
        companyName: "test-company",
        supabase: supabase.client as any,
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "anon-key",
        repoManager: repoManager as any,
      });

      const mergeErr = new Error("merge conflict");
      mockExecFileAsync.mockImplementation(async (cmd: string, args: string[]) => {
        if (cmd === "git" && args[2] === "rev-parse" && args[3] === "HEAD") {
          return { stdout: "deadbeefcafebabe\n", stderr: "" };
        }
        if (cmd === "git" && args[2] === "merge") {
          throw mergeErr;
        }
        return { stdout: "", stderr: "" };
      });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await (manager as any).pushUnpushedCommits({
        sessionId: "deadbeef-1234-4567-89ab-abcdef012345",
        repoDir: "/tmp/workspace-root/repo",
        bareRepoDir: "/tmp/repos/project.git",
        expertBranch: "expert/research-expert-deadbeef",
        startCommit: "abc12345",
      });

      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo",
        "push", "origin", "HEAD:refs/heads/expert/research-expert-deadbeef",
      ]);
      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo", "checkout", "master",
      ]);
      expect(mockExecFileAsync).toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo", "merge", "expert/research-expert-deadbeef",
      ]);
      expect(mockExecFileAsync).not.toHaveBeenCalledWith("git", [
        "-C", "/tmp/workspace-root/repo", "push", "origin", "--delete", "expert/research-expert-deadbeef",
      ]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Merge/push to master failed after pushing expert/research-expert-deadbeef"),
        mergeErr,
      );
      warnSpy.mockRestore();
    });
  });

  it("handleStartExpert marks session failed when repo worktree setup fails", async () => {
    const supabase = makeSupabaseClient();
    const repoManager = makeRepoManager({
      fetchBranchForExpert: vi.fn().mockRejectedValue(new Error("targeted fetch failed")),
    });
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      companyName: "test-company",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
      repoManager: repoManager as any,
    });

    await manager.handleStartExpert({
      type: "start_expert",
      protocolVersion: 1,
      session_id: "session-123456789",
      project_id: "project-123",
      repo_url: "https://github.com/acme/project.git",
      model: "claude-opus",
      brief: "review latest implementation",
      role: { prompt: "system prompt" },
    });

    expect(repoManager.fetchBranchForExpert).toHaveBeenCalledWith("project", "master");
    const statusUpdates = supabase.updates
      .filter((u) => u.table === "expert_sessions")
      .map((u) => u.data.status);
    expect(statusUpdates).toContain("failed");
    expect(vi.mocked(setupJobWorkspace)).not.toHaveBeenCalled();
    expect(mockExecFileAsync).not.toHaveBeenCalledWith(
      "tmux",
      expect.arrayContaining(["new-session"]),
    );
  });
});
