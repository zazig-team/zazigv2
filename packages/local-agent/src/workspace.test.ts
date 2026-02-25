import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock node:fs at module level (before importing the module under test)
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn(() => false),
  copyFileSync: vi.fn(),
  readFileSync: vi.fn(() => ""),
  appendFileSync: vi.fn(),
  lstatSync: vi.fn(() => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); }),
  symlinkSync: vi.fn(),
  readlinkSync: vi.fn(() => ""),
  unlinkSync: vi.fn(),
}));

import { generateAllowedTools, generateMcpConfig, setupJobWorkspace, ROLE_ALLOWED_TOOLS } from "./workspace.js";
import * as fsModule from "node:fs";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateAllowedTools", () => {
  it("returns prefixed tool names for cpo role", () => {
    expect(generateAllowedTools("cpo")).toEqual([
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "mcp__zazig-messaging__query_projects",
      "mcp__zazig-messaging__create_feature",
      "mcp__zazig-messaging__update_feature",
      "mcp__zazig-messaging__commission_contractor",
    ]);
  });

  it("returns prefixed tool names for breakdown-specialist", () => {
    expect(generateAllowedTools("breakdown-specialist")).toEqual([
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
    // Default lstatSync throws ENOENT (nothing exists at dest)
    (fsModule.lstatSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
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

  it("copies skill flat file ({name}.md) when directory format not found", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    // Only the flat-file path exists (not the directory format)
    existsSyncMock.mockImplementation((p: string) =>
      typeof p === "string" && p === "/repo/projects/skills/jobify.md",
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
      expect.stringContaining("Skill file not found"),
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

describe("setupJobWorkspace — skill source resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fsModule.lstatSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });
  });

  const baseConfig = {
    workspaceDir: "/tmp/ws",
    mcpServerPath: "/server.js",
    supabaseUrl: "https://x.supabase.co",
    supabaseAnonKey: "key",
    jobId: "job-1",
    role: "breakdown-specialist",
    claudeMdContent: "# Test",
  };

  it("resolves directory format ({name}/SKILL.md) before flat file", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    // Directory format exists
    existsSyncMock.mockImplementation((p: string) =>
      p === "/repo/skills/myjob/SKILL.md",
    );

    setupJobWorkspace({
      ...baseConfig,
      skills: ["myjob"],
      repoSkillsDir: "/repo/skills",
    });

    expect(copyFileSyncMock).toHaveBeenCalledWith(
      "/repo/skills/myjob/SKILL.md",
      "/tmp/ws/.claude/skills/myjob/SKILL.md",
    );
  });

  it("falls back to flat-file format when directory format not found", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    // Only flat-file format exists
    existsSyncMock.mockImplementation((p: string) =>
      p === "/repo/skills/myjob.md",
    );

    setupJobWorkspace({
      ...baseConfig,
      skills: ["myjob"],
      repoSkillsDir: "/repo/skills",
    });

    expect(copyFileSyncMock).toHaveBeenCalledWith(
      "/repo/skills/myjob.md",
      "/tmp/ws/.claude/skills/myjob/SKILL.md",
    );
  });

  it("falls back to repoInteractiveSkillsDir when pipeline skill formats not found", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    // Only interactive skill exists
    existsSyncMock.mockImplementation((p: string) =>
      p === "/repo/.claude/skills/myjob/SKILL.md",
    );

    setupJobWorkspace({
      ...baseConfig,
      skills: ["myjob"],
      repoSkillsDir: "/repo/skills",
      repoInteractiveSkillsDir: "/repo/.claude/skills",
    });

    expect(copyFileSyncMock).toHaveBeenCalledWith(
      "/repo/.claude/skills/myjob/SKILL.md",
      "/tmp/ws/.claude/skills/myjob/SKILL.md",
    );
  });

  it("warns and skips when no source format found", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    existsSyncMock.mockReturnValue(false);

    setupJobWorkspace({
      ...baseConfig,
      skills: ["missing"],
      repoSkillsDir: "/repo/skills",
      repoInteractiveSkillsDir: "/repo/.claude/skills",
    });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Skill file not found"));
    expect(copyFileSyncMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("setupJobWorkspace — symlink mode (useSymlinks: true)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseConfig = {
    workspaceDir: "/tmp/ws",
    mcpServerPath: "/server.js",
    supabaseUrl: "https://x.supabase.co",
    supabaseAnonKey: "key",
    jobId: "job-1",
    role: "breakdown-specialist",
    claudeMdContent: "# Test",
    useSymlinks: true as const,
    skills: ["myjob"],
    repoSkillsDir: "/repo/skills",
  };

  it("creates symlink with absolute path when destination does not exist", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const symlinkSyncMock = fsModule.symlinkSync as unknown as ReturnType<typeof vi.fn>;
    const copyFileSyncMock = fsModule.copyFileSync as unknown as ReturnType<typeof vi.fn>;
    const lstatSyncMock = fsModule.lstatSync as unknown as ReturnType<typeof vi.fn>;

    // Source exists (directory format)
    existsSyncMock.mockImplementation((p: string) => p === "/repo/skills/myjob/SKILL.md");
    // Dest doesn't exist (lstatSync throws ENOENT)
    lstatSyncMock.mockImplementation(() => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    });

    setupJobWorkspace(baseConfig);

    expect(symlinkSyncMock).toHaveBeenCalledWith(
      "/repo/skills/myjob/SKILL.md",
      "/tmp/ws/.claude/skills/myjob/SKILL.md",
    );
    expect(copyFileSyncMock).not.toHaveBeenCalled();
  });

  it("deletes existing regular file before creating symlink", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const symlinkSyncMock = fsModule.symlinkSync as unknown as ReturnType<typeof vi.fn>;
    const unlinkSyncMock = fsModule.unlinkSync as unknown as ReturnType<typeof vi.fn>;
    const lstatSyncMock = fsModule.lstatSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) => p === "/repo/skills/myjob/SKILL.md");
    // Dest is a regular file
    lstatSyncMock.mockReturnValue({ isSymbolicLink: () => false, isFile: () => true });

    setupJobWorkspace(baseConfig);

    expect(unlinkSyncMock).toHaveBeenCalledWith("/tmp/ws/.claude/skills/myjob/SKILL.md");
    expect(symlinkSyncMock).toHaveBeenCalledWith(
      "/repo/skills/myjob/SKILL.md",
      "/tmp/ws/.claude/skills/myjob/SKILL.md",
    );
  });

  it("skips symlink creation when destination already points to correct target (idempotent)", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const symlinkSyncMock = fsModule.symlinkSync as unknown as ReturnType<typeof vi.fn>;
    const unlinkSyncMock = fsModule.unlinkSync as unknown as ReturnType<typeof vi.fn>;
    const lstatSyncMock = fsModule.lstatSync as unknown as ReturnType<typeof vi.fn>;
    const readlinkSyncMock = fsModule.readlinkSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) => p === "/repo/skills/myjob/SKILL.md");
    // Dest is already a symlink
    lstatSyncMock.mockReturnValue({ isSymbolicLink: () => true, isFile: () => false });
    // Pointing to the correct absolute target
    readlinkSyncMock.mockReturnValue("/repo/skills/myjob/SKILL.md");

    setupJobWorkspace(baseConfig);

    expect(unlinkSyncMock).not.toHaveBeenCalled();
    expect(symlinkSyncMock).not.toHaveBeenCalled();
  });

  it("replaces wrong-target symlink with correct symlink", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const symlinkSyncMock = fsModule.symlinkSync as unknown as ReturnType<typeof vi.fn>;
    const unlinkSyncMock = fsModule.unlinkSync as unknown as ReturnType<typeof vi.fn>;
    const lstatSyncMock = fsModule.lstatSync as unknown as ReturnType<typeof vi.fn>;
    const readlinkSyncMock = fsModule.readlinkSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) => p === "/repo/skills/myjob/SKILL.md");
    // Dest is a symlink but pointing to wrong path
    lstatSyncMock.mockReturnValue({ isSymbolicLink: () => true, isFile: () => false });
    readlinkSyncMock.mockReturnValue("/old/path/SKILL.md");

    setupJobWorkspace(baseConfig);

    expect(unlinkSyncMock).toHaveBeenCalledWith("/tmp/ws/.claude/skills/myjob/SKILL.md");
    expect(symlinkSyncMock).toHaveBeenCalledWith(
      "/repo/skills/myjob/SKILL.md",
      "/tmp/ws/.claude/skills/myjob/SKILL.md",
    );
  });

  it("repairs broken symlink by deleting and recreating", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const symlinkSyncMock = fsModule.symlinkSync as unknown as ReturnType<typeof vi.fn>;
    const unlinkSyncMock = fsModule.unlinkSync as unknown as ReturnType<typeof vi.fn>;
    const lstatSyncMock = fsModule.lstatSync as unknown as ReturnType<typeof vi.fn>;
    const readlinkSyncMock = fsModule.readlinkSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) => p === "/repo/skills/myjob/SKILL.md");
    // Dest is a broken symlink (lstatSync succeeds but readlink shows stale path)
    lstatSyncMock.mockReturnValue({ isSymbolicLink: () => true, isFile: () => false });
    readlinkSyncMock.mockReturnValue("/stale/path/SKILL.md");

    setupJobWorkspace(baseConfig);

    expect(unlinkSyncMock).toHaveBeenCalledWith("/tmp/ws/.claude/skills/myjob/SKILL.md");
    expect(symlinkSyncMock).toHaveBeenCalledWith(
      "/repo/skills/myjob/SKILL.md",
      "/tmp/ws/.claude/skills/myjob/SKILL.md",
    );
  });
});
