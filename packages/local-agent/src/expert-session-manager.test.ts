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
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
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

  it("starts expert session with Claude permission-bypass flag", async () => {
    const supabase = makeSupabaseClient();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
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
    expect(shellCmd).toContain("--dangerously-skip-permissions");
    expect(shellCmd).toContain("--model");
    expect(shellCmd).toContain("claude-sonnet-4-6");
  });

  it("handleSessionExit writes summary, injects into CPO, and cleans resources", async () => {
    const supabase = makeSupabaseClient();
    const { ExpertSessionManager } = await import("./expert-session-manager.js");
    const manager = new ExpertSessionManager({
      machineId: "machine-1",
      companyId: "company-12345678",
      supabase: supabase.client as any,
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "anon-key",
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

    const dbUpdate = supabase.updates.find((u) => u.table === "expert_sessions");
    expect(dbUpdate).toBeDefined();
    expect(dbUpdate?.eqColumn).toBe("id");
    expect(dbUpdate?.eqValue).toBe(session.sessionId);
    expect(dbUpdate?.data.status).toBe("completed");
    expect(dbUpdate?.data.summary).toBe("Expert summary line 1\nline 2");
    expect(typeof dbUpdate?.data.completed_at).toBe("string");

    const sendKeysLiteral = mockExecFileAsync.mock.calls.find((call) =>
      call[0] === "tmux"
      && Array.isArray(call[1])
      && call[1][0] === "send-keys"
      && call[1][3] === "-l"
    );
    expect(sendKeysLiteral).toBeDefined();
    expect(sendKeysLiteral?.[1][4]).toContain("[Expert Report - Research Expert]");
    expect(sendKeysLiteral?.[1][4]).toContain("Expert summary line 1 line 2");

    expect(mockExecFileAsync).toHaveBeenCalledWith("tmux", ["select-window", "-t", "zazig-view-acme:CPO"]);
    expect(mockExecFileAsync).toHaveBeenCalledWith("git", ["-C", "/tmp/repos/project.git", "worktree", "remove", "--force", "/tmp/workspace-root/repo"]);
    expect(mockExecFileAsync).toHaveBeenCalledWith("git", ["-C", "/tmp/repos/project.git", "worktree", "prune"]);
    expect(fsRmMock).toHaveBeenCalledWith("/tmp/workspace-root", { recursive: true, force: true });
    expect((manager as any).getActiveSessions().has(session.sessionId)).toBe(false);
    expect((manager as any).activePollers.has(session.sessionId)).toBe(false);
  });
});
