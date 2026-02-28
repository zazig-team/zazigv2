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
  repoInteractiveSkillsDir?: string;
  useSymlinks?: boolean;
  /** MCP tool names this role may invoke. Forwarded as ZAZIG_ALLOWED_TOOLS env var. */
  mcpTools?: string[];
  /** Tmux session name for this job/agent. Forwarded as ZAZIG_TMUX_SESSION for enable_remote. */
  tmuxSession?: string;
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

/**
 * Maps role names to the raw MCP tool names they are allowed to invoke.
 * The `mcp__zazig-messaging__` prefix is added by `generateAllowedTools`.
 */
export const ROLE_ALLOWED_TOOLS: Record<string, string[]> = {
  cpo: ["query_projects", "create_feature", "update_feature", "request_work"],
  cto: ["request_work"],
  "project-architect": ["create_project", "batch_create_features", "query_projects"],
  "breakdown-specialist": ["query_features", "batch_create_jobs"],
  "senior-engineer": ["query_features"],
  reviewer: ["query_features"],
  "monitoring-agent": ["send_message"],
  "verification-specialist": ["query_features", "query_jobs", "batch_create_jobs", "request_work"],
  "pipeline-technician": ["query_features", "query_jobs", "execute_sql"],
  "job-combiner": [],
  deployer: [],
  "test-deployer": ["enable_remote", "send_message"],
  tester: ["enable_remote", "send_message"],
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
  env: {
    supabaseUrl: string;
    supabaseAnonKey: string;
    jobId: string;
    companyId?: string;
    allowedTools?: string[];
    tmuxSession?: string;
    role?: string;
  },
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
          ...(env.tmuxSession ? { ZAZIG_TMUX_SESSION: env.tmuxSession } : {}),
          ...(env.role ? { ZAZIG_ROLE: env.role } : {}),
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
    tmuxSession: config.tmuxSession,
    role: config.role,
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

  // 6. Inject skill files if provided
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
