/**
 * workspace.ts — Shared workspace generation logic
 *
 * Centralises the creation of per-job and per-agent workspaces so that both
 * ephemeral jobs and persistent agents get a consistent directory layout:
 *   - .mcp.json           — MCP server config pointing at zazig-messaging
 *   - CLAUDE.md           — context / prompt stack for the agent
 *   - .claude/settings.json — role-scoped tool permissions
 *   - .claude/skills/     — optional skill files copied (or symlinked) from the repo
 */

import { writeFileSync, mkdirSync, existsSync, copyFileSync, readFileSync, appendFileSync, lstatSync, symlinkSync, readlinkSync, unlinkSync } from "node:fs";
import { join } from "node:path";

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
  companyId?: string;
  role: string;
  claudeMdContent: string;
  skills?: string[];
  repoSkillsDir?: string;
  /** MCP tool names this role may invoke. Forwarded as ZAZIG_ALLOWED_TOOLS env var. */
  mcpTools?: string[];
  useSymlinks?: boolean;           // default: false (copies)
  repoInteractiveSkillsDir?: string; // path to .claude/skills/ in repo root
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maps role names to the raw MCP tool names they are allowed to invoke.
 * The `mcp__zazig-messaging__` prefix is added by `generateAllowedTools`.
 */
export const ROLE_ALLOWED_TOOLS: Record<string, string[]> = {
  cpo: ["query_projects", "create_feature", "update_feature"],
  "project-architect": ["create_project", "batch_create_features", "query_projects"],
  "breakdown-specialist": ["query_features", "batch_create_jobs"],
  "senior-engineer": ["query_features"],
  reviewer: ["query_features"],
  "monitoring-agent": ["send_message"],
  "verification-specialist": ["query_features", "query_jobs", "batch_create_jobs"],
  "pipeline-technician": ["query_features", "query_jobs", "execute_sql"],
  "job-combiner": [],
  deployer: [],
};

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
  env: { supabaseUrl: string; supabaseAnonKey: string; jobId: string; companyId?: string; allowedTools?: string[] },
): object {
  return {
    mcpServers: {
      "zazig-messaging": {
        command: "node",
        args: [mcpServerPath],
        env: {
          SUPABASE_URL: env.supabaseUrl,
          SUPABASE_ANON_KEY: env.supabaseAnonKey,
          ZAZIG_JOB_ID: env.jobId,
          ...(env.companyId ? { ZAZIG_COMPANY_ID: env.companyId } : {}),
          ...(env.allowedTools ? { ZAZIG_ALLOWED_TOOLS: env.allowedTools.join(",") } : {}),
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
 * Returns the fully-prefixed MCP tool names that a given role is allowed to
 * invoke, plus the standard Claude Code tools every agent needs.
 * Unknown roles default to standard tools only (no MCP tools).
 */
export function generateAllowedTools(role: string, mcpTools?: string[]): string[] {
  const toolList = (mcpTools ?? ROLE_ALLOWED_TOOLS[role] ?? []).map(
    (name) => `mcp__zazig-messaging__${name}`,
  );
  return [...STANDARD_TOOLS, ...toolList];
}

// ---------------------------------------------------------------------------
// Workspace setup
// ---------------------------------------------------------------------------

/**
 * Resolves the source path for a named skill, trying in priority order:
 *   1. {repoSkillsDir}/{name}/SKILL.md  (directory format — pipeline skills)
 *   2. {repoSkillsDir}/{name}.md        (flat file format)
 *   3. {repoInteractiveSkillsDir}/{name}/SKILL.md (interactive skills)
 * Returns the resolved path or null if not found.
 */
function resolveSkillSource(
  skillName: string,
  repoSkillsDir: string,
  repoInteractiveSkillsDir?: string,
): string | null {
  const dirFormat = join(repoSkillsDir, skillName, "SKILL.md");
  if (existsSync(dirFormat)) return dirFormat;

  const flatFormat = join(repoSkillsDir, `${skillName}.md`);
  if (existsSync(flatFormat)) return flatFormat;

  if (repoInteractiveSkillsDir) {
    const interactiveFormat = join(repoInteractiveSkillsDir, skillName, "SKILL.md");
    if (existsSync(interactiveFormat)) return interactiveFormat;
  }

  return null;
}

/**
 * Installs a skill file at destPath, either as a copy or symlink depending
 * on useSymlinks. Handles idempotency and broken-symlink repair.
 */
function installSkillFile(sourcePath: string, destPath: string, useSymlinks: boolean): void {
  if (useSymlinks) {
    let destStat: { isSymbolicLink(): boolean; isFile(): boolean } | null = null;
    try {
      destStat = lstatSync(destPath);
    } catch {
      // dest doesn't exist — create fresh symlink below
    }

    if (destStat !== null) {
      if (destStat.isSymbolicLink()) {
        const currentTarget = readlinkSync(destPath);
        if (currentTarget === sourcePath) {
          return; // already pointing at the right place — skip
        }
        unlinkSync(destPath);
      } else {
        // regular file copy — replace with symlink
        unlinkSync(destPath);
      }
    }

    symlinkSync(sourcePath, destPath);
  } else {
    copyFileSync(sourcePath, destPath);
  }
}

/**
 * Creates (or overwrites) a complete workspace directory for a job or
 * persistent agent. The resulting directory contains everything Claude Code
 * needs to run with the correct MCP server, permissions, prompt, and skills.
 */
export function setupJobWorkspace(config: WorkspaceConfig): void {
  // 1. Ensure workspace directory exists
  mkdirSync(config.workspaceDir, { recursive: true });

  // 2. Write .mcp.json
  const mcpConfig = generateMcpConfig(config.mcpServerPath, {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
    jobId: config.jobId,
    companyId: config.companyId,
    allowedTools: config.mcpTools ?? ROLE_ALLOWED_TOOLS[config.role],
  });
  writeFileSync(
    join(config.workspaceDir, ".mcp.json"),
    JSON.stringify(mcpConfig, null, 2),
  );

  // 3. Write CLAUDE.md
  writeFileSync(
    join(config.workspaceDir, "CLAUDE.md"),
    config.claudeMdContent,
  );

  // 4. Create .claude/ directory
  const claudeDir = join(config.workspaceDir, ".claude");
  mkdirSync(claudeDir, { recursive: true });

  // 5. Write .claude/settings.json with role-scoped permissions
  writeFileSync(
    join(claudeDir, "settings.json"),
    JSON.stringify(
      { permissions: { allow: generateAllowedTools(config.role, config.mcpTools) } },
      null,
      2,
    ),
  );

  // 6. Copy or symlink skill files if provided
  if (config.skills && config.repoSkillsDir && config.skills.length > 0) {
    const useSymlinks = config.useSymlinks ?? false;
    for (const skillName of config.skills) {
      const sourcePath = resolveSkillSource(
        skillName,
        config.repoSkillsDir,
        config.repoInteractiveSkillsDir,
      );
      if (sourcePath === null) {
        console.warn(`[workspace] Skill file not found: ${skillName}`);
        continue;
      }
      const destDir = join(config.workspaceDir, ".claude", "skills", skillName);
      mkdirSync(destDir, { recursive: true });
      installSkillFile(sourcePath, join(destDir, "SKILL.md"), useSymlinks);
    }
  }

  // 7. If the workspace is inside a git worktree, update .gitignore to prevent
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
