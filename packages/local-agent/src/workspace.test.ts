import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:fs at module level (before importing the module under test)
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
  symlinkSync: vi.fn(),
  rmSync: vi.fn(),
  readFileSync: vi.fn(() => ""),
  appendFileSync: vi.fn(),
}));

import { generateAllowedTools, generateMcpConfig, setupJobWorkspace } from "./workspace.js";
import * as fsModule from "node:fs";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateAllowedTools", () => {
  it("returns standard tools only for cpo role when no mcpTools provided", () => {
    expect(generateAllowedTools("cpo")).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
    ]);
  });

  it("returns prefixed tool names for cpo role when mcpTools provided", () => {
    expect(generateAllowedTools("cpo", ["query_projects", "create_feature", "update_feature", "request_work"])).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "mcp__zazig-messaging__query_projects",
      "mcp__zazig-messaging__create_feature",
      "mcp__zazig-messaging__update_feature",
      "mcp__zazig-messaging__request_work",
    ]);
  });

  it("returns standard tools only for breakdown-specialist when no mcpTools provided", () => {
    expect(generateAllowedTools("breakdown-specialist")).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
    ]);
  });

  it("returns prefixed tool names for breakdown-specialist when mcpTools provided", () => {
    expect(generateAllowedTools("breakdown-specialist", ["query_features", "batch_create_jobs"])).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "mcp__zazig-messaging__query_features",
      "mcp__zazig-messaging__batch_create_jobs",
    ]);
  });

  it("returns standard tools only for job-combiner", () => {
    expect(generateAllowedTools("job-combiner")).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
    ]);
  });

  it("returns standard tools only for unknown role", () => {
    expect(generateAllowedTools("nonexistent-role")).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
    ]);
  });
});

describe("generateMcpConfig", () => {
  it("returns correct MCP server structure", () => {
    const config = generateMcpConfig("/path/to/server.js", {
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-123",
    });
    expect(config).toEqual({
      mcpServers: {
        "zazig-messaging": {
          command: "node",
          args: ["/path/to/server.js"],
          env: {
            SUPABASE_URL: "https://test.supabase.co",
            SUPABASE_ANON_KEY: "test-key",
            ZAZIG_JOB_ID: "job-123",
          },
        },
      },
    });
  });
});

describe("setupJobWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates workspace directory, .mcp.json, CLAUDE.md, and settings.json", () => {
    const mkdirSyncMock = fsModule.mkdirSync as unknown as ReturnType<typeof vi.fn>;
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-456",
      role: "breakdown-specialist",
      claudeMdContent: "# Test CLAUDE.md",
    });

    // Verify mkdirSync called with workspaceDir (recursive)
    expect(mkdirSyncMock).toHaveBeenCalledWith("/tmp/test-workspace", { recursive: true });

    // Verify writeFileSync called 3 times (mcp.json, CLAUDE.md, settings.json)
    expect(writeFileSyncMock).toHaveBeenCalledTimes(3);

    // 1. .mcp.json
    const mcpCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes(".mcp.json"),
    );
    expect(mcpCall).toBeDefined();
    const mcpContent = JSON.parse(mcpCall![1] as string);
    expect(mcpContent.mcpServers["zazig-messaging"]).toBeDefined();
    expect(mcpContent.mcpServers["zazig-messaging"].env.ZAZIG_JOB_ID).toBe("job-456");

    // 2. CLAUDE.md
    const claudeCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("CLAUDE.md"),
    );
    expect(claudeCall).toBeDefined();
    expect(claudeCall![1]).toBe("# Test CLAUDE.md");

    // 3. .claude/settings.json
    const settingsCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("settings.json"),
    );
    expect(settingsCall).toBeDefined();
    const settingsContent = JSON.parse(settingsCall![1] as string);
    expect(settingsContent.permissions.allow).toEqual(
      generateAllowedTools("breakdown-specialist"),
    );
  });

  it("copies skill files when skills and repoSkillsDir are provided", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    existsSyncMock.mockImplementation((p: string) =>
      typeof p === "string" && p.endsWith(".md"),
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-789",
      role: "breakdown-specialist",
      claudeMdContent: "# Test",
      skills: ["jobify"],
      repoSkillsDir: "/repo/projects/skills",
    });

    expect(copyFileSyncMock).toHaveBeenCalledWith(
      "/repo/projects/skills/jobify.md",
      "/tmp/test-workspace/.claude/skills/jobify/SKILL.md",
    );
  });

  it("loads skill from interactive skills directory when not present in pipeline dir", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    existsSyncMock.mockImplementation((p: string) =>
      typeof p === "string" && p === "/repo/.claude/skills/scrum/SKILL.md",
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-interactive",
      role: "cpo",
      claudeMdContent: "# Test",
      skills: ["scrum"],
      repoSkillsDir: "/repo/projects/skills",
      repoInteractiveSkillsDir: "/repo/.claude/skills",
    });

    expect(copyFileSyncMock).toHaveBeenCalledWith(
      "/repo/.claude/skills/scrum/SKILL.md",
      "/tmp/test-workspace/.claude/skills/scrum/SKILL.md",
    );
  });

  it("creates symlinked skill files when useSymlinks is enabled", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const symlinkSyncMock = fsModule.symlinkSync as unknown as ReturnType<typeof vi.fn>;
    const rmSyncMock = fsModule.rmSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    existsSyncMock.mockImplementation((p: string) =>
      typeof p === "string" && p === "/repo/projects/skills/jobify.md",
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-symlink",
      role: "breakdown-specialist",
      claudeMdContent: "# Test",
      skills: ["jobify"],
      repoSkillsDir: "/repo/projects/skills",
      useSymlinks: true,
    });

    expect(rmSyncMock).toHaveBeenCalledWith(
      "/tmp/test-workspace/.claude/skills/jobify/SKILL.md",
      { force: true, recursive: true },
    );
    expect(symlinkSyncMock).toHaveBeenCalledWith(
      "/repo/projects/skills/jobify.md",
      "/tmp/test-workspace/.claude/skills/jobify/SKILL.md",
    );
    expect(copyFileSyncMock).not.toHaveBeenCalled();
  });

  it("warns and skips missing skill files", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    existsSyncMock.mockReturnValue(false);

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-missing",
      role: "breakdown-specialist",
      claudeMdContent: "# Test",
      skills: ["nonexistent"],
      repoSkillsDir: "/repo/projects/skills",
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skill \"nonexistent\" not found"),
    );
    expect(copyFileSyncMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("skips skill injection when skills array is empty", () => {
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-no-skills",
      role: "breakdown-specialist",
      claudeMdContent: "# Test",
      skills: [],
    });

    expect(copyFileSyncMock).not.toHaveBeenCalled();
  });
});
