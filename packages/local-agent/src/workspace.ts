/**
 * workspace.ts — Shared workspace generation logic
 *
 * Centralises the creation of per-job and per-agent workspaces so that both
 * ephemeral jobs and persistent agents get a consistent directory layout:
 *   - .mcp.json           — MCP server config pointing at zazig-messaging
 *   - CLAUDE.md           — context / prompt stack for the agent
 *   - .claude/settings.json — role-scoped tool permissions
 *   - .claude/skills/     — optional skill files copied from the repo
 */

import { writeFileSync, mkdirSync, existsSync, copyFileSync, readFileSync, appendFileSync, symlinkSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

type SubagentRoleConfig = {
  name: string;
  description: string;
  subagent_type: string;
  model: string;
  tools: string[];
  prompt: string;
};

type SubagentConfigs = {
  roles: Record<string, SubagentRoleConfig>;
};

const SUBAGENT_CONFIGS: SubagentConfigs = {
  roles: {
    "code-investigator": {
      name: "Code Investigator",
      description: "Read-only codebase exploration — answers questions about code structure, patterns, and implementation details",
      subagent_type: "Explore",
      model: "claude-sonnet-4-6",
      tools: ["Read", "Grep", "Glob", "Bash"],
      prompt: "You are a Code Investigator sub-agent. Your job is to explore the provided codebase(s) and answer the question given to you. You have READ-ONLY access. Do not write, edit, or delete any files. Do not run commands that modify the repository. Search thoroughly, trace execution paths, and return a clear, concise answer with relevant file paths and line numbers.",
    },
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Configuration needed to set up a job or agent workspace directory. */
export interface WorkspaceConfig {
  workspaceDir: string;
  mcpServerPath: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  jobId: string;
  /** Optional idea UUID for idea-pipeline jobs. Exposed to MCP tools as ZAZIG_IDEA_ID. */
  ideaId?: string;
  companyId?: string;
  role: string;
  roleDisplayName?: string;
  claudeMdContent: string;
  heartbeatMd?: string;
  skills?: string[];
  repoSkillsDir?: string;
  repoInteractiveSkillsDir?: string;
  useSymlinks?: boolean;
  /** MCP tool names this role may invoke. Forwarded as ZAZIG_ALLOWED_TOOLS env var. */
  mcpTools?: string[];
  /** Tmux session name for this job/agent. Forwarded as ZAZIG_TMUX_SESSION for enable_remote. */
  tmuxSession?: string;
  /** Stable daemon machine identifier exposed to skills via workspace config + MCP env. */
  machineId?: string;
}

function resolveSkillSourcePath(config: WorkspaceConfig, skillName: string): string | null {
  if (config.repoSkillsDir) {
    // Legacy pipeline format: projects/skills/{name}.md
    const flatPath = join(config.repoSkillsDir, `${skillName}.md`);
    if (existsSync(flatPath)) return flatPath;

    // Preferred pipeline format: projects/skills/{name}/SKILL.md
    const nestedPath = join(config.repoSkillsDir, skillName, "SKILL.md");
    if (existsSync(nestedPath)) return nestedPath;
  }

  // Interactive skill format: .claude/skills/{name}/SKILL.md
  if (config.repoInteractiveSkillsDir) {
    const interactivePath = join(config.repoInteractiveSkillsDir, skillName, "SKILL.md");
    if (existsSync(interactivePath)) return interactivePath;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// MCP tool permissions are stored in the `roles.mcp_tools` column in the DB.
// The orchestrator reads them and sends them in the dispatch message.
// If no tools are provided, the agent gets standard Claude Code tools only.

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Generates the `.mcp.json` configuration object for a workspace.
 * Points the `zazig-messaging` MCP server at the given Supabase instance
 * and binds it to the specified job ID.
 */
export function generateMcpConfig(
  mcpServerPath: string,
  env: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    jobId: string;
    ideaId?: string;
    companyId?: string;
    allowedTools?: string[];
    tmuxSession?: string;
    role?: string;
    machineId?: string;
  },
): object {
  // Compiled binaries (no .js/.mjs extension) run directly; scripts need node
  const isCompiledBinary = !mcpServerPath.endsWith(".js") && !mcpServerPath.endsWith(".mjs");
  return {
    mcpServers: {
      "zazig-messaging": {
        command: isCompiledBinary ? mcpServerPath : "node",
        args: isCompiledBinary ? [] : [mcpServerPath],
        env: {
          SUPABASE_URL: env.supabaseUrl,
          SUPABASE_ANON_KEY: env.supabaseAnonKey,
          ZAZIG_JOB_ID: env.jobId,
          ...(env.ideaId ? { ZAZIG_IDEA_ID: env.ideaId } : {}),
          ...(env.companyId ? { ZAZIG_COMPANY_ID: env.companyId } : {}),
          ...(env.allowedTools ? { ZAZIG_ALLOWED_TOOLS: env.allowedTools.join(",") } : {}),
          ...(env.tmuxSession ? { ZAZIG_TMUX_SESSION: env.tmuxSession } : {}),
          ...(env.role ? { ZAZIG_ROLE: env.role } : {}),
          ...(env.machineId ? { ZAZIG_MACHINE_ID: env.machineId } : {}),
        },
      },
    },
  };
}

/**
 * Standard Claude Code tools every agent needs to do its work.
 * These are always included regardless of role.
 */
const STANDARD_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
];

/**
 * idea-triage role: triage agent for classifying and enriching incoming ideas.
 *
 * The triage agent must:
 * - Classify each idea as bug | feature | task | initiative
 * - Research the codebase (git log, Grep, web search) to enrich the idea with context
 * - Be opinionated — for clear ideas, complete triage without asking questions
 * - Only use ask_user for genuinely ambiguous ideas (minimal questions, don't over-ask)
 * - Set status to 'enriched' when triage is complete
 * - Set status to 'awaiting_response' when user input is required
 */

/**
 * Default MCP tools granted to specific roles when no explicit mcpTools list
 * is provided. These match the roles' expected DB-level permissions.
 */
const ROLE_DEFAULT_MCP_TOOLS: Record<string, string[]> = {
  "cpo": ["query_projects", "create_decision", "start_expert_session", "ask_user"],
  "breakdown-specialist": ["query_features", "ask_user"],
  // triage-analyst: update_idea injected at runtime via roleMcpTools
  "triage-analyst": ["ask_user", "execute_sql", "query_projects", "query_features"],
  "idea-triage": [
    "ask_user",
    "query_ideas",
    "query_projects",
    // update_idea: granted at runtime via roleMcpTools (not hardcoded in static defaults)
  ],
  "senior-engineer": ["create_project_rule", "ask_user"],
  "junior-engineer": ["create_project_rule", "ask_user"],
  "job-combiner": ["create_project_rule", "ask_user"],
  "test-engineer": ["create_project_rule", "ask_user"],
  "fix-agent": ["create_project_rule", "ask_user"],
};

const MEMORY_MAINTENANCE_SECTION = `## Memory Maintenance

At the end of every work session, update your memory files in \`.claude/memory/\`:

- **priorities.md** — Reflect current P0-P3 items
- **decisions.md** — Add new open decisions; mark resolved ones
- **context.md** — Update what's in flight, what happened, what's blocked
- **handoff.md** — Write notes for cross-session consumers (expert sessions, diagnostics)

These files are read by other sessions via the exec context skill. Keep them current.
`;

const PERSISTENT_MEMORY_SYSTEM_SECTION = `## Workspace Memory System (.memory/)

Memory lives at \`.memory/\` in the workspace root.

- \`.memory/MEMORY.md\` is the index: one line per entry, max 150 characters per line, max 200 lines total.
- Each memory is its own file with frontmatter fields: \`name\`, \`description\`, \`type\`, then body content.
- Valid memory types are: \`user\`, \`feedback\`, \`project\`, \`reference\`.
- Write memory inline during conversation when notable information appears (decisions, corrections, preferences, context).
- Before creating a memory file, check for existing memory on the topic and update it instead of creating duplicates.
- Do not create memory for routine operations (standups, pipeline queries, status checks).
- On idle sync prompts, review memories, remove stale entries, and merge near-duplicates.
`;

function withPersistentMemorySystemSection(claudeMdContent: string): string {
  if (claudeMdContent.includes("## Workspace Memory System (.memory/)")) {
    return claudeMdContent;
  }
  const separator = claudeMdContent.endsWith("\n") ? "\n" : "\n\n";
  return `${claudeMdContent}${separator}${PERSISTENT_MEMORY_SYSTEM_SECTION}`;
}

/**
 * Returns the fully-prefixed MCP tool names that a given role is allowed to
 * invoke, plus the standard Claude Code tools every agent needs.
 * Unknown roles default to standard tools only (no MCP tools).
 */
export function generateAllowedTools(role: string, mcpTools?: string[]): string[] {
  const roleDefaults = ROLE_DEFAULT_MCP_TOOLS[role] ?? [];
  const extra = mcpTools ?? [];
  const allMcp = [...new Set([...roleDefaults, ...extra])];
  const toolList = allMcp.map((name) => `mcp__zazig-messaging__${name}`);
  const extraClaudeTools = role === "cpo" ? ["Agent"] : [];
  return [...STANDARD_TOOLS, ...extraClaudeTools, ...toolList];
}

export async function writeSubagentsConfig(
  workspaceDir: string,
  subagentsConfig: SubagentConfigs = SUBAGENT_CONFIGS,
): Promise<void> {
  const subagentsPath = join(workspaceDir, ".claude", "subagents.json");
  writeFileSync(subagentsPath, JSON.stringify(subagentsConfig, null, 2));
}

export function generateExecSkill(
  role: { name: string; prompt: string; heartbeat_md?: string },
  workspacePath: string,
): void {
  const skillDir = join(workspacePath, ".claude", "skills", `as-${role.name}`);
  mkdirSync(skillDir, { recursive: true });

  const displayName = role.name.toUpperCase();
  const sections = [
    "---",
    `name: as-${role.name}`,
    `description: Load ${displayName}'s context into this session`,
    "---",
    "",
    `# Operating as ${displayName}`,
    "",
    "## Role Context",
    role.prompt,
    "",
    "## Workspace",
    `- Memory: ${workspacePath}/.claude/memory/`,
    `- Repos: ${workspacePath}/repos/`,
  ];

  if (role.heartbeat_md?.trim()) {
    sections.push(
      "",
      "## Current Heartbeat Tasks",
      role.heartbeat_md,
    );
  }

  writeFileSync(join(skillDir, "SKILL.md"), `${sections.join("\n")}\n`);
}

/**
 * Publish a sanitized exec skill to the shared repo skills directory.
 * Any session assembled with repoInteractiveSkillsDir pointing here
 * (expert sessions, other execs, contractors) can `/as-{role}` to
 * side-load this exec's context.
 *
 * Differences from the exec-local skill (generateExecSkill):
 * - Role prompt is summarised, not dumped verbatim
 * - Workspace paths use ~ shorthand (portable across machines)
 * - Memory files marked read-only
 * - Includes "How to Use" guidance for non-exec consumers
 */
export function publishSharedExecSkill(
  role: { name: string; prompt: string; heartbeat_md?: string },
  workspacePath: string,
  repoRoot: string,
): void {
  const skillDir = join(repoRoot, ".claude", "skills", `as-${role.name}`);
  mkdirSync(skillDir, { recursive: true });

  const displayName = role.name.toUpperCase();
  // Portable path: replace $HOME with ~ so it works across machines
  const homedir = process.env.HOME ?? "/root";
  const portablePath = workspacePath.startsWith(homedir)
    ? workspacePath.replace(homedir, "~")
    : workspacePath;

  // Summarise the role prompt: first 3 lines or 300 chars, whichever is shorter.
  // The full prompt is in the exec-local skill — shared consumers get the gist.
  const promptLines = role.prompt.split("\n").filter(l => l.trim());
  const summary = promptLines.slice(0, 5).join("\n");
  const truncated = summary.length < role.prompt.length ? `${summary}\n\n_(Summarised — full context available in the exec's own workspace)_` : summary;

  const sections = [
    "---",
    `name: as-${role.name}`,
    `description: |`,
    `  Load ${displayName}'s context, knowledge, and workspace links into this session.`,
    `  Use when you need ${role.name}-level awareness in a non-persistent context.`,
    "---",
    "",
    `# Operating as ${displayName}`,
    "",
    "## Role Summary",
    truncated,
    "",
    "## Workspace (read-only access)",
    `- Memory: ${portablePath}/.claude/memory/ _(READ ONLY — do not modify)_`,
    `- Repos: ${portablePath}/repos/`,
    `- State: ${portablePath}/.claude/workspace-config.json`,
  ];

  if (role.heartbeat_md?.trim()) {
    sections.push(
      "",
      "## Current Heartbeat Tasks",
      role.heartbeat_md,
    );
  }

  sections.push(
    "",
    "## How to Use This Skill",
    `You are not the ${role.name}. You are a session that has been given ${displayName}'s`,
    "context and workspace access. Use this to:",
    `- Make decisions consistent with ${displayName}'s perspective`,
    `- Read ${displayName}'s memory and state files (do NOT write to them)`,
    `- Continue work that ${displayName} started`,
    `- Provide ${role.name}-level analysis without needing the persistent session`,
    "",
    `If you need to communicate something to ${displayName}, write a report to your`,
    "own workspace — do not modify the exec's memory files directly.",
  );

  writeFileSync(join(skillDir, "SKILL.md"), `${sections.join("\n")}\n`);
}

function defaultRoleDisplayName(role: string): string {
  return role
    .split("-")
    .map((part) => {
      if (part.length <= 3) return part.toUpperCase();
      if (part.toUpperCase() === part) return part;
      return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
    })
    .join(" ");
}

function seedMemoryFiles(claudeDir: string, roleDisplayName: string): void {
  const memoryDir = join(claudeDir, "memory");
  mkdirSync(memoryDir, { recursive: true });

  const fileTemplates: Array<{ name: string; content: string }> = [
    {
      name: "priorities.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Priorities",
        "",
        "## P0 - Critical This Wake",
        "- [ ]",
        "",
        "## P1 - Active This Week",
        "- [ ]",
        "",
        "## P2 - Important, Not Urgent",
        "- [ ]",
        "",
        "## P3 - Parked / Backlog",
        "- [ ]",
        "",
      ].join("\n"),
    },
    {
      name: "decisions.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Open Decisions",
        "",
        "## Decision",
        "- Summary:",
        "- Options:",
        "- Owner:",
        "- Needed by:",
        "- Status: Open",
        "",
      ].join("\n"),
    },
    {
      name: "context.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Working Context",
        "",
        "## What's In Flight",
        "-",
        "",
        "## Recent Events",
        "-",
        "",
        "## Blocked On",
        "-",
        "",
      ].join("\n"),
    },
    {
      name: "handoff.md",
      content: [
        `_Updated by ${roleDisplayName} on each wake._`,
        "",
        "# Handoff Notes",
        "",
        "## If You're Picking Up My Work",
        "-",
        "",
        "## Active Decisions Waiting on Human",
        "-",
        "",
        "## Known Issues",
        "-",
        "",
      ].join("\n"),
    },
  ];

  for (const template of fileTemplates) {
    const filePath = join(memoryDir, template.name);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, template.content);
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace setup
// ---------------------------------------------------------------------------

/**
 * Creates (or overwrites) a complete workspace directory for a job or
 * persistent agent. The resulting directory contains everything Claude Code
 * needs to run with the correct MCP server, permissions, prompt, and skills.
 */
export function setupJobWorkspace(config: WorkspaceConfig): void {
  // 1. Ensure workspace directory exists
  mkdirSync(config.workspaceDir, { recursive: true });

  // 1a. Ensure workspace memory directory exists and seed MEMORY.md once.
  const workspaceMemoryDir = join(config.workspaceDir, ".memory");
  mkdirSync(workspaceMemoryDir, { recursive: true });
  const workspaceMemoryMdPath = join(workspaceMemoryDir, "MEMORY.md");
  if (!existsSync(workspaceMemoryMdPath)) {
    writeFileSync(workspaceMemoryMdPath, "");
  }

  // 1b. Create .claude/ directory early so generated files can live under it.
  const claudeDir = join(config.workspaceDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });
  const reportsDir = join(config.workspaceDir, ".reports");
  mkdirSync(reportsDir, { recursive: true });

  // 2. Write .mcp.json
  const mcpConfig = generateMcpConfig(config.mcpServerPath, {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    jobId: config.jobId,
    ideaId: config.ideaId,
    companyId: config.companyId,
    allowedTools: config.mcpTools,
    tmuxSession: config.tmuxSession,
    role: config.role,
    machineId: config.machineId,
  });
  writeFileSync(
    join(config.workspaceDir, ".mcp.json"),
    JSON.stringify(mcpConfig, null, 2),
  );

  // 3. Write CLAUDE.md
  const claudeMdContent = config.heartbeatMd !== undefined
    ? withPersistentMemorySystemSection(config.claudeMdContent)
    : config.claudeMdContent;
  writeFileSync(
    join(config.workspaceDir, "CLAUDE.md"),
    claudeMdContent,
  );

  // 3b. Write HEARTBEAT.md for persistent execs, even when blank, so resets
  // can clear stale task files when the DB value changes.
  if (config.heartbeatMd !== undefined) {
    // Persistent agents also use the workspace-root .memory/ system documented in CLAUDE.md.
    const hasMemoryMaintenance = config.heartbeatMd.includes("## Memory Maintenance");
    const heartbeatContent = hasMemoryMaintenance
      ? config.heartbeatMd
      : `${config.heartbeatMd}${config.heartbeatMd.endsWith("\n") || config.heartbeatMd.length === 0 ? "" : "\n\n"}${MEMORY_MAINTENANCE_SECTION}`;
    writeFileSync(
      join(claudeDir, "HEARTBEAT.md"),
      heartbeatContent,
    );
    seedMemoryFiles(claudeDir, config.roleDisplayName ?? defaultRoleDisplayName(config.role));
  }

  // 3c. Seed heartbeat-state.json once so recurring tasks can dedupe across resets.
  if (config.heartbeatMd !== undefined) {
    const memoryDir = join(claudeDir, "memory");
    mkdirSync(memoryDir, { recursive: true });
    const heartbeatStatePath = join(memoryDir, "heartbeat-state.json");
    if (!existsSync(heartbeatStatePath)) {
      writeFileSync(
        heartbeatStatePath,
        JSON.stringify(
          {
            lastWakeAt: null,
            taskCompletions: {},
          },
          null,
          2,
        ),
      );
    }
  }

  // 5. Write .claude/settings.json with role-scoped permissions
  const worktreeMetadataDir = resolveGitWorktreeMetadataDir(config.workspaceDir);
  const permissions = {
    allow: generateAllowedTools(config.role, config.mcpTools),
    ...(worktreeMetadataDir ? { additionalDirectories: [worktreeMetadataDir] } : {}),
  };
  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify(
      { permissions },
      null,
      2,
    ),
  );

  // 5b. Write .claude/settings.local.json to auto-trust the zazig-messaging MCP server
  writeFileSync(
    join(claudeDir, "settings.local.json"),
    JSON.stringify(
      {
        enableAllProjectMcpServers: true,
        enabledMcpjsonServers: ["zazig-messaging"],
      },
      null,
      2,
    ),
  );

  // 6. Write machine/workspace metadata for skills that need daemon context.
  writeFileSync(
    join(claudeDir, "workspace-config.json"),
    JSON.stringify(
      {
        machineId: config.machineId ?? null,
        companyId: config.companyId ?? null,
        jobId: config.jobId,
        role: config.role,
      },
      null,
      2,
    ),
  );

  // 7. Inject skill files if provided
  if (config.skills && config.skills.length > 0) {
    for (const skillName of config.skills) {
      const sourcePath = resolveSkillSourcePath(config, skillName);
      if (!sourcePath) {
        console.warn(`[workspace] Skill "${skillName}" not found in repo sources`);
        continue;
      }

      const destDir = join(config.workspaceDir, ".claude", "skills", skillName);
      const destPath = join(destDir, "SKILL.md");
      mkdirSync(destDir, { recursive: true });

      if (config.useSymlinks) {
        // Idempotent replacement for existing file/symlink.
        rmSync(destPath, { force: true, recursive: true });
        try {
          symlinkSync(sourcePath, destPath);
        } catch (err) {
          console.warn(`[workspace] Failed to symlink skill "${skillName}", falling back to copy: ${String(err)}`);
          copyFileSync(sourcePath, destPath);
        }
      } else {
        copyFileSync(sourcePath, destPath);
      }
    }
  }

  // 8. If the workspace is inside a git worktree, update .gitignore to prevent
  //    agents from accidentally committing overlay files.
  const gitMarker = join(config.workspaceDir, ".git");
  if (existsSync(gitMarker)) {
    const GITIGNORE_MARKER = "# zazig workspace files (auto-generated)";
    const gitignorePath = join(config.workspaceDir, ".gitignore");
    const GITIGNORE_BLOCK = [
      GITIGNORE_MARKER,
      "CLAUDE.md",
      ".mcp.json",
      ".claude/",
      ".reports/",
      ".zazig-prompt.txt",
      "subagent-personality.md",
      "",
    ].join("\n");

    const existingContent = existsSync(gitignorePath)
      ? readFileSync(gitignorePath, "utf8")
      : "";
    if (!existingContent.includes(GITIGNORE_MARKER)) {
      appendFileSync(gitignorePath, (existingContent.endsWith("\n") || existingContent === "" ? "" : "\n") + GITIGNORE_BLOCK);
    }
  }
}

function resolveGitWorktreeMetadataDir(workspaceDir: string): string | null {
  const gitMarker = join(workspaceDir, ".git");
  if (!existsSync(gitMarker)) return null;

  try {
    const gitMarkerContent = readFileSync(gitMarker, "utf8").trim();
    const match = gitMarkerContent.match(/^gitdir:\s*(.+)\s*$/i);
    if (!match?.[1]) return null;

    const gitDirPath = match[1].trim();
    return resolve(dirname(gitMarker), gitDirPath);
  } catch {
    // Not a worktree .git file (e.g. normal repo with .git directory) or unreadable.
    return null;
  }
}
