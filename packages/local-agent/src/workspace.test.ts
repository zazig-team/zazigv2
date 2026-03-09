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

import { generateAllowedTools, generateExecSkill, generateMcpConfig, publishSharedExecSkill, setupJobWorkspace } from "./workspace.js";
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
      "Agent",
      "mcp__zazig-messaging__query_projects",
      "mcp__zazig-messaging__create_feature",
      "mcp__zazig-messaging__create_decision",
      "mcp__zazig-messaging__update_feature",
      "mcp__zazig-messaging__request_work",
      "mcp__zazig-messaging__start_expert_session",
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
      machineId: "machine-123",
    });

    // Verify mkdirSync called with workspaceDir (recursive)
    expect(mkdirSyncMock).toHaveBeenCalledWith("/tmp/test-workspace", { recursive: true });

    // Verify writeFileSync called 5 times (.mcp.json, CLAUDE.md, settings.json, workspace-config.json, settings.local.json)
    expect(writeFileSyncMock).toHaveBeenCalledTimes(5);

    // 1. .mcp.json
    const mcpCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes(".mcp.json"),
    );
    expect(mcpCall).toBeDefined();
    const mcpContent = JSON.parse(mcpCall![1] as string);
    expect(mcpContent.mcpServers["zazig-messaging"]).toBeDefined();
    expect(mcpContent.mcpServers["zazig-messaging"].env.ZAZIG_JOB_ID).toBe("job-456");
    expect(mcpContent.mcpServers["zazig-messaging"].env.ZAZIG_MACHINE_ID).toBe("machine-123");

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
    expect(settingsContent.permissions.additionalDirectories).toBeUndefined();

    // 4. .claude/workspace-config.json
    const workspaceConfigCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("workspace-config.json"),
    );
    expect(workspaceConfigCall).toBeDefined();
    const workspaceConfigContent = JSON.parse(workspaceConfigCall![1] as string);
    expect(workspaceConfigContent.machineId).toBe("machine-123");
    expect(workspaceConfigContent.role).toBe("breakdown-specialist");

    // 5. .claude/settings.local.json
    const settingsLocalCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("settings.local.json"),
    );
    expect(settingsLocalCall).toBeDefined();
    const settingsLocalContent = JSON.parse(settingsLocalCall![1] as string);
    expect(settingsLocalContent).toEqual({
      enableAllProjectMcpServers: true,
      enabledMcpjsonServers: ["zazig-messaging"],
    });
  });

  it("adds worktree metadata path to settings permissions when .git points to an absolute gitdir", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const readFileSyncMock = fsModule.readFileSync as unknown as ReturnType<typeof vi.fn>;
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) =>
      p === "/tmp/test-workspace/.git",
    );
    readFileSyncMock.mockImplementation((p: string) =>
      p === "/tmp/test-workspace/.git"
        ? "gitdir: /tmp/repos/project/worktrees/job-456\n"
        : "",
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-456",
      role: "breakdown-specialist",
      claudeMdContent: "# Test CLAUDE.md",
    });

    const settingsCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("settings.json"),
    );
    expect(settingsCall).toBeDefined();
    const settingsContent = JSON.parse(settingsCall![1] as string);
    expect(settingsContent.permissions.additionalDirectories).toEqual([
      "/tmp/repos/project/worktrees/job-456",
    ]);
  });

  it("resolves relative gitdir paths to absolute metadata directories", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const readFileSyncMock = fsModule.readFileSync as unknown as ReturnType<typeof vi.fn>;
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) =>
      p === "/tmp/test-workspace/.git",
    );
    readFileSyncMock.mockImplementation((p: string) =>
      p === "/tmp/test-workspace/.git"
        ? "gitdir: ../repos/project/worktrees/job-456\n"
        : "",
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-456",
      role: "breakdown-specialist",
      claudeMdContent: "# Test CLAUDE.md",
    });

    const settingsCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => typeof call[0] === "string" && (call[0] as string).includes("settings.json"),
    );
    expect(settingsCall).toBeDefined();
    const settingsContent = JSON.parse(settingsCall![1] as string);
    expect(settingsContent.permissions.additionalDirectories).toEqual([
      "/tmp/repos/project/worktrees/job-456",
    ]);
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

  it("writes HEARTBEAT.md and seeds heartbeat-state.json for persistent exec workspaces", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) =>
      p === "/tmp/test-workspace/.claude/HEARTBEAT.md" ? false : false,
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-heartbeat",
      role: "cpo",
      claudeMdContent: "# Test",
      heartbeatMd: "# Heartbeat tasks",
    });

    const heartbeatCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => call[0] === "/tmp/test-workspace/.claude/HEARTBEAT.md",
    );
    expect(heartbeatCall).toBeDefined();
    const heartbeatContent = heartbeatCall![1] as string;
    expect(heartbeatContent).toContain("# Heartbeat tasks");
    expect(heartbeatContent).toContain("## Memory Maintenance");
    expect(heartbeatContent).toContain("At the end of every work session");

    const stateCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => call[0] === "/tmp/test-workspace/.claude/memory/heartbeat-state.json",
    );
    expect(stateCall).toBeDefined();
    expect(JSON.parse(stateCall![1] as string)).toEqual({
      lastWakeAt: null,
      taskCompletions: {},
    });
  });

  it("preserves existing heartbeat-state.json across resets", () => {
    const existsSyncMock = fsModule.existsSync as unknown as ReturnType<typeof vi.fn>;
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    existsSyncMock.mockImplementation((p: string) =>
      p === "/tmp/test-workspace/.claude/memory/heartbeat-state.json",
    );

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-heartbeat-existing",
      role: "cpo",
      claudeMdContent: "# Test",
      heartbeatMd: "# Heartbeat tasks",
    });

    expect(writeFileSyncMock).not.toHaveBeenCalledWith(
      "/tmp/test-workspace/.claude/memory/heartbeat-state.json",
      expect.anything(),
    );
  });

  it("does not duplicate memory maintenance section when already present", () => {
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-heartbeat-existing-section",
      role: "cpo",
      claudeMdContent: "# Test",
      heartbeatMd: "## Daily Tasks\n- Check pipeline\n\n## Memory Maintenance\nCustom existing section",
    });

    const heartbeatCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => call[0] === "/tmp/test-workspace/.claude/HEARTBEAT.md",
    );
    expect(heartbeatCall).toBeDefined();
    const heartbeatContent = heartbeatCall![1] as string;
    expect(heartbeatContent).toContain("## Daily Tasks");
    expect(heartbeatContent.match(/## Memory Maintenance/g)).toHaveLength(1);
  });

  it("does not write HEARTBEAT.md for non-persistent jobs", () => {
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    setupJobWorkspace({
      workspaceDir: "/tmp/test-workspace",
      mcpServerPath: "/path/to/server.js",
      supabaseUrl: "https://test.supabase.co",
      supabaseAnonKey: "test-key",
      jobId: "job-non-persistent",
      role: "breakdown-specialist",
      claudeMdContent: "# Test",
    });

    const heartbeatCall = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => call[0] === "/tmp/test-workspace/.claude/HEARTBEAT.md",
    );
    expect(heartbeatCall).toBeUndefined();
  });
});

describe("generateExecSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes an exec-local skill with role context and heartbeat tasks", () => {
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    generateExecSkill(
      {
        name: "cpo",
        prompt: "# Role prompt",
        heartbeat_md: "1. Check pipeline",
      },
      "/tmp/test-workspace",
    );

    expect(writeFileSyncMock).toHaveBeenCalledWith(
      "/tmp/test-workspace/.claude/skills/as-cpo/SKILL.md",
      expect.stringContaining("# Operating as CPO"),
    );
    const content = writeFileSyncMock.mock.calls.find(
      (call: unknown[]) => call[0] === "/tmp/test-workspace/.claude/skills/as-cpo/SKILL.md",
    )?.[1] as string;
    expect(content).toContain("## Role Context");
    expect(content).toContain("# Role prompt");
    expect(content).toContain("## Current Heartbeat Tasks");
    expect(content).toContain("1. Check pipeline");
  });
});

describe("publishSharedExecSkill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes a sanitized skill to the repo shared skills directory", () => {
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;
    const originalHome = process.env.HOME;
    process.env.HOME = "/Users/testuser";

    try {
      publishSharedExecSkill(
        {
          name: "cpo",
          prompt: "Line one of prompt\nLine two\nLine three\nLine four\nLine five\nLine six (should be truncated)",
          heartbeat_md: "1. Check pipeline",
        },
        "/Users/testuser/.zazigv2/company-cpo-workspace",
        "/Users/testuser/repos/zazigv2",
      );

      const call = writeFileSyncMock.mock.calls.find(
        (c: unknown[]) => c[0] === "/Users/testuser/repos/zazigv2/.claude/skills/as-cpo/SKILL.md",
      );
      expect(call).toBeDefined();
      const content = call![1] as string;

      // Sanitization checks
      expect(content).toContain("# Operating as CPO");
      expect(content).toContain("## Role Summary");
      expect(content).not.toContain("## Role Context"); // exec-local uses "Role Context"
      expect(content).toContain("Summarised"); // truncation marker
      expect(content).not.toContain("Line six"); // 6th line truncated

      // Portable paths
      expect(content).toContain("~/.zazigv2/company-cpo-workspace/.claude/memory/");
      expect(content).not.toContain("/Users/testuser/.zazigv2"); // absolute path replaced

      // Read-only warning
      expect(content).toContain("READ ONLY");

      // Consumer guidance
      expect(content).toContain("## How to Use This Skill");
      expect(content).toContain("You are not the cpo");
      expect(content).toContain("do NOT write to them");

      // Heartbeat tasks included
      expect(content).toContain("## Current Heartbeat Tasks");
      expect(content).toContain("1. Check pipeline");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("omits truncation marker when prompt is short", () => {
    const writeFileSyncMock = fsModule.writeFileSync as unknown as ReturnType<typeof vi.fn>;

    publishSharedExecSkill(
      { name: "cto", prompt: "Short prompt", heartbeat_md: "" },
      "/home/user/.zazigv2/company-cto-workspace",
      "/home/user/repos/zazigv2",
    );

    const call = writeFileSyncMock.mock.calls.find(
      (c: unknown[]) => c[0] === "/home/user/repos/zazigv2/.claude/skills/as-cto/SKILL.md",
    );
    expect(call).toBeDefined();
    const content = call![1] as string;
    expect(content).toContain("Short prompt");
    expect(content).not.toContain("Summarised");
    expect(content).not.toContain("## Current Heartbeat Tasks"); // empty heartbeat omitted
  });
});
