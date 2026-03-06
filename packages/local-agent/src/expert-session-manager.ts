/**
 * expert-session-manager.ts — Handles interactive expert sessions.
 *
 * When the orchestrator sends a `start_expert` message, this manager:
 *   1. Creates a workspace directory
 *   2. Optionally sets up a git worktree for the project
 *   3. Configures the Claude workspace (CLAUDE.md, .mcp.json, settings.json, skills)
 *   4. Spawns an interactive Claude tmux session
 *   5. Updates the expert_sessions DB row
 *   6. Links the tmux window into the viewer TUI
 *
 * Expert sessions do NOT consume a job slot.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StartExpertMessage } from "@zazigv2/shared";
import { setupJobWorkspace, generateAllowedTools } from "./workspace.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpertSessionState {
  sessionId: string;
  workspaceDir: string;
  repoDir?: string;
  displayName: string;
  tmuxSession: string;
}

interface ExpertSessionManagerOpts {
  machineId: string;
  companyId: string;
  supabase: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shellEscape(parts: string[]): string {
  return parts
    .map((p) => `'${p.replace(/'/g, "'\"'\"'")}'`)
    .join(" ");
}

/** Resolve the MCP server entry point from the executor's dist directory. */
function resolveMcpServerPath(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const mjsPath = join(thisDir, "agent-mcp-server.mjs");
  if (existsSync(mjsPath)) return mjsPath;
  return join(thisDir, "agent-mcp-server.js");
}

/** Resolve the repo root (zazigv2 checkout) from the runtime location. */
function resolveRepoRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, "..", "..", ".."),
    process.cwd(),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "packages"))) return c;
  }
  return process.cwd();
}

/** Derive the viewer tmux session name from a company name (same logic as CLI chat.ts). */
function viewerSessionName(companyName: string): string {
  return `zazig-view-${companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

async function killTmuxSession(sessionName: string): Promise<void> {
  try {
    await execFileAsync("tmux", ["kill-session", "-t", sessionName]);
    console.log(`[expert] Killed stale tmux session: ${sessionName}`);
  } catch {
    // Session may already be dead — fine
  }
}

async function isTmuxSessionAlive(sessionName: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// ExpertSessionManager
// ---------------------------------------------------------------------------

export class ExpertSessionManager {
  private readonly machineId: string;
  private readonly companyId: string;
  private readonly supabase: SupabaseClient;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly activeSessions = new Map<string, ExpertSessionState>();

  constructor(opts: ExpertSessionManagerOpts) {
    this.machineId = opts.machineId;
    this.companyId = opts.companyId;
    this.supabase = opts.supabase;
    this.supabaseUrl = opts.supabaseUrl;
    this.supabaseAnonKey = opts.supabaseAnonKey;
  }

  async handleStartExpert(msg: StartExpertMessage): Promise<void> {
    // 1. Check if this message is for this machine
    if (msg.machine_id !== this.machineId) {
      console.log(`[expert] Ignoring start_expert for machine ${msg.machine_id} (this is ${this.machineId})`);
      return;
    }

    const sessionId = msg.session_id;
    const shortId = sessionId.slice(0, 8);
    const tmuxSessionName = `expert-${shortId}`;
    const displayName = msg.display_name ?? `Expert ${shortId}`;

    console.log(`[expert] Starting expert session ${sessionId} (${displayName})`);

    // 2. Create workspace directory
    const workspaceDir = join(homedir(), ".zazigv2", `expert-${sessionId}`);
    mkdirSync(workspaceDir, { recursive: true });

    // 3. Git worktree setup if project_id + repo_url provided
    let repoDir: string | undefined;
    if (msg.project_id && msg.repo_url) {
      try {
        const projectName = msg.repo_url.split("/").pop()?.replace(/\.git$/, "") ?? msg.project_id;
        const bareRepoDir = join(homedir(), ".zazigv2", "repos", projectName);
        const worktreeTarget = join(workspaceDir, "repo");
        const branch = msg.branch ?? "master";

        // Ensure bare repo exists
        if (!existsSync(bareRepoDir)) {
          console.log(`[expert] Cloning bare repo for ${projectName}...`);
          await execFileAsync("git", ["clone", "--bare", msg.repo_url, bareRepoDir]);
        }

        // Fetch latest
        await execFileAsync("git", ["-C", bareRepoDir, "fetch", "origin"]);

        // Create worktree — use detached HEAD from the target branch to avoid
        // "already checked out" errors on shared branches
        try {
          await execFileAsync("git", [
            "-C", bareRepoDir,
            "worktree", "add", "--detach", worktreeTarget,
            `origin/${branch}`,
          ]);
        } catch {
          // Fallback: try without origin/ prefix (local branch)
          await execFileAsync("git", [
            "-C", bareRepoDir,
            "worktree", "add", "--detach", worktreeTarget, branch,
          ]);
        }

        repoDir = worktreeTarget;
        console.log(`[expert] Git worktree created at ${worktreeTarget} (branch: ${branch})`);
      } catch (err) {
        console.error(`[expert] Failed to create git worktree:`, err);
        // Continue without repo — expert can still work
      }
    }

    // The effective workspace is the repo worktree if available, else the base dir
    const effectiveWorkspaceDir = repoDir ?? workspaceDir;

    // 4-7. Build CLAUDE.md and set up workspace
    try {
      const mcpServerPath = resolveMcpServerPath();
      const repoRoot = resolveRepoRoot();

      // Build CLAUDE.md content
      const claudeMdParts: string[] = [];

      // Role-specific system prompt
      if (msg.role.prompt) {
        claudeMdParts.push(msg.role.prompt);
      }

      // Expert instructions
      claudeMdParts.push(`
## Expert Session Instructions

You are working as an interactive expert. Your task brief is in \`.claude/expert-brief.md\`.

### Workflow
1. Read and understand the brief in \`.claude/expert-brief.md\`
2. Work through the brief methodically
3. Show diffs before merging any changes
4. When done, merge your work to master
5. Write a 2-3 sentence summary to \`.claude/expert-report.md\`
`);

      // Include brief reference
      claudeMdParts.push(`## Brief\n\nSee \`.claude/expert-brief.md\` for the full task brief.`);

      const claudeMdContent = claudeMdParts.join("\n\n");

      // Set up workspace via shared setupJobWorkspace
      setupJobWorkspace({
        workspaceDir: effectiveWorkspaceDir,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId: sessionId,
        companyId: this.companyId,
        role: "expert",
        claudeMdContent,
        skills: msg.role.skills,
        repoSkillsDir: join(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join(repoRoot, ".claude", "skills"),
        mcpTools: msg.role.mcp_tools,
        tmuxSession: tmuxSessionName,
      });

      // 8. Write brief to .claude/expert-brief.md
      const claudeDir = join(effectiveWorkspaceDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "expert-brief.md"), msg.brief);

      // 9. Inject SessionStart hook to display brief on session start
      const settingsPath = join(claudeDir, "settings.json");
      const existingSettings = JSON.parse(readFileSync(settingsPath, "utf8"));

      // Merge settings_overrides if provided
      if (msg.role.settings_overrides) {
        const overrides = msg.role.settings_overrides;
        for (const [key, value] of Object.entries(overrides)) {
          if (key === "hooks" || key === "permissions") continue; // handle separately
          existingSettings[key] = value;
        }
      }

      // Add SessionStart hook to cat the brief
      existingSettings.hooks = {
        ...(existingSettings.hooks ?? {}),
        ...(msg.role.settings_overrides?.hooks as Record<string, unknown> ?? {}),
        SessionStart: [
          ...(((msg.role.settings_overrides?.hooks as Record<string, unknown> | undefined)?.SessionStart as unknown[]) ?? []),
          { matcher: "", hooks: [{ type: "command", command: `cat ${shellEscape([join(claudeDir, "expert-brief.md")])}` }] },
        ],
      };

      // Merge additional permissions from settings_overrides
      if (msg.role.settings_overrides?.permissions) {
        const overridePerms = msg.role.settings_overrides.permissions as Record<string, unknown>;
        if (Array.isArray(overridePerms.allow)) {
          const existingAllow = existingSettings.permissions?.allow ?? [];
          existingSettings.permissions = {
            ...existingSettings.permissions,
            allow: [...new Set([...existingAllow, ...overridePerms.allow])],
          };
        }
      }

      writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

      console.log(`[expert] Workspace configured at ${effectiveWorkspaceDir}`);
    } catch (err) {
      console.error(`[expert] Failed to set up workspace:`, err);
      await this.updateSessionStatus(sessionId, "failed");
      return;
    }

    // 10. Spawn tmux session
    try {
      // Kill any stale session
      if (await isTmuxSessionAlive(tmuxSessionName)) {
        await killTmuxSession(tmuxSessionName);
      }

      const claudeCmd = shellEscape(["claude", "--model", msg.model]);
      const shellCmd = `unset CLAUDECODE; ${claudeCmd}`;

      await execFileAsync("tmux", [
        "new-session", "-d",
        "-s", tmuxSessionName,
        "-c", effectiveWorkspaceDir,
        shellCmd,
      ]);

      console.log(`[expert] Spawned tmux session: ${tmuxSessionName} (cwd=${effectiveWorkspaceDir})`);
    } catch (err) {
      console.error(`[expert] Failed to spawn tmux session:`, err);
      await this.updateSessionStatus(sessionId, "failed");
      return;
    }

    // 11. Update DB: expert_sessions → running
    await this.updateSessionStatus(sessionId, "running");

    // 12. Link window into viewer TUI and switch
    await this.linkToViewerTui(msg, tmuxSessionName, displayName);

    // 13. Store session state
    this.activeSessions.set(sessionId, {
      sessionId,
      workspaceDir: effectiveWorkspaceDir,
      repoDir,
      displayName,
      tmuxSession: tmuxSessionName,
    });

    console.log(`[expert] Expert session ${sessionId} is running (tmux=${tmuxSessionName})`);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    try {
      const update: Record<string, unknown> = { status };
      if (status === "running") {
        update.started_at = new Date().toISOString();
      }
      const { error } = await this.supabase
        .from("expert_sessions")
        .update(update)
        .eq("id", sessionId);
      if (error) {
        console.warn(`[expert] DB update failed for session ${sessionId}: ${error.message}`);
      }
    } catch (err) {
      console.error(`[expert] DB update error for session ${sessionId}:`, err);
    }
  }

  private async linkToViewerTui(
    msg: StartExpertMessage,
    tmuxSessionName: string,
    displayName: string,
  ): Promise<void> {
    // Derive viewer session name from company_name if provided
    let viewerSession: string | undefined;
    if (msg.company_name) {
      viewerSession = viewerSessionName(msg.company_name);
    } else {
      // Try to find the viewer session by looking for zazig-view-* sessions
      try {
        const { stdout } = await execFileAsync("tmux", [
          "list-sessions", "-F", "#{session_name}",
        ]);
        const sessions = stdout.trim().split("\n");
        viewerSession = sessions.find((s) => s.startsWith("zazig-view-"));
      } catch {
        // tmux not available or no sessions — skip linking
      }
    }

    if (!viewerSession) {
      console.log(`[expert] No viewer session found — expert window not linked to TUI`);
      return;
    }

    // Check if viewer session exists
    if (!(await isTmuxSessionAlive(viewerSession))) {
      console.log(`[expert] Viewer session ${viewerSession} not alive — skipping TUI linking`);
      return;
    }

    try {
      // Get window ID of the expert session
      const { stdout: windowId } = await execFileAsync("tmux", [
        "list-windows", "-t", tmuxSessionName, "-F", "#{window_id}",
      ]);
      const expertWindowId = windowId.trim().split("\n")[0];
      if (!expertWindowId) {
        console.warn(`[expert] Could not determine window ID for ${tmuxSessionName}`);
        return;
      }

      // Link the expert window into the viewer session
      await execFileAsync("tmux", [
        "link-window",
        "-s", expertWindowId,
        "-t", `${viewerSession}:`,
      ]);

      // Rename the linked window
      await execFileAsync("tmux", [
        "rename-window",
        "-t", expertWindowId,
        displayName.toUpperCase().replace(/\s+/g, "-"),
      ]);

      // Switch to the new window
      try {
        await execFileAsync("tmux", [
          "select-window",
          "-t", `${viewerSession}:${displayName.toUpperCase().replace(/\s+/g, "-")}`,
        ]);
      } catch {
        // select-window may fail if no client is attached — that's fine
      }

      console.log(`[expert] Linked expert window to viewer session ${viewerSession}`);
    } catch (err) {
      console.warn(`[expert] Failed to link expert window to viewer TUI:`, err);
    }
  }

  /** Returns active session state (for exit detection poller). */
  getActiveSessions(): Map<string, ExpertSessionState> {
    return this.activeSessions;
  }
}
