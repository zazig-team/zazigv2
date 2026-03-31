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

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StartExpertMessage } from "@zazigv2/shared";
import type { RepoManager } from "./branches.js";
import { setupJobWorkspace } from "./workspace.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExpertSessionState {
  sessionId: string;
  /** Root workspace dir (~/.zazigv2/expert-{sessionId}). */
  workspaceDir: string;
  /** Effective workspace dir used as tmux cwd (repo worktree when available). */
  effectiveWorkspaceDir: string;
  repoDir?: string;
  /** Parent clone directory used to manage this session's worktree. */
  cloneDir?: string;
  /** Resolved default branch of the repo (e.g. "master" or "main"). */
  defaultBranch?: string;
  /** Branch used for expert work and post-session push/merge handling. */
  branch?: string;
  /** Isolated expert branch checked out in the worktree (expert/{role}-{shortId}). */
  expertBranch?: string;
  /** Commit hash at worktree creation — used to detect unpushed commits. */
  startCommit?: string;
  displayName: string;
  tmuxSession: string;
  viewerSession?: string;
  viewerWindowName?: string;
}

interface ViewerLinkResult {
  viewerSession: string;
  viewerWindowName: string;
}

interface ExpertSessionManagerOpts {
  machineId: string;
  companyId: string;
  companyName: string;
  supabase: SupabaseClient;
  supabaseUrl: string;
  supabaseAnonKey: string;
  repoManager: RepoManager;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function shellEscape(parts: string[]): string {
  return parts
    .map((p) => `'${p.replace(/'/g, "'\"'\"'")}'`)
    .join(" ");
}

function slugifyBranchSegment(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "expert";
}

const AVAILABLE_CONTEXT_HEADING = "## Available Context";
const AVAILABLE_CONTEXT_SECTION = `${AVAILABLE_CONTEXT_HEADING}

Exec context skills are available in this session. To load an exec's current priorities, decisions, and working context:

- \`/as-cpo\` — CPO's context: product priorities, active decisions, strategic direction
- \`/as-cto\` — CTO's context: architecture decisions, technical constraints, infra state

Use these if you need to understand why your task was commissioned. Read the exec's memory files — do not modify them.`;

function assembleExpertBrief(brief: string): string {
  if (brief.includes(AVAILABLE_CONTEXT_HEADING)) {
    return brief;
  }

  const trimmedBrief = brief.trimEnd();
  return `${trimmedBrief}\n\n${AVAILABLE_CONTEXT_SECTION}`;
}

/** Resolve the MCP server entry point from the executor's dist directory. */
function resolveMcpServerPath(): string {
  // Check for compiled binary in ~/.zazigv2/bin/ first
  const binPath = join(homedir(), ".zazigv2", "bin", "agent-mcp-server");
  if (existsSync(binPath)) return binPath;

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
  private readonly companyName: string;
  private readonly supabase: SupabaseClient;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;
  private readonly repoManager: RepoManager;
  private readonly activeSessions = new Map<string, ExpertSessionState>();
  private readonly activePollers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly exitingSessions = new Set<string>();
  /** Session IDs currently being set up (synchronous guard against concurrent duplicate deliveries). */
  private readonly startingSessions = new Set<string>();

  constructor(opts: ExpertSessionManagerOpts) {
    this.machineId = opts.machineId;
    this.companyId = opts.companyId;
    this.companyName = opts.companyName;
    this.supabase = opts.supabase;
    this.supabaseUrl = opts.supabaseUrl;
    this.supabaseAnonKey = opts.supabaseAnonKey;
    this.repoManager = opts.repoManager;
  }

  async handleStartExpert(msg: StartExpertMessage): Promise<void> {
    const sessionId = msg.session_id;

    // Deduplicate: skip sessions we're already handling.
    // startingSessions is checked/set synchronously (before any await) to prevent
    // two concurrent deliveries (Realtime + poll) from both proceeding.
    if (this.activeSessions.has(sessionId) || this.startingSessions.has(sessionId)) {
      console.log(`[expert] Duplicate start_expert ignored for session ${sessionId}`);
      return;
    }
    this.startingSessions.add(sessionId);

    // Immediately mark as "starting" so the poll endpoint stops re-sending
    await this.updateSessionStatus(sessionId, "starting");

    const shortId = sessionId.slice(0, 8);
    const roleName =
      (msg as StartExpertMessage & { role_name?: string }).role_name
      ?? msg.display_name
      ?? "expert";
    const expertBranch = `expert/${slugifyBranchSegment(roleName)}-${shortId}`;
    const tmuxSessionName = `expert-${shortId}`;
    const displayName = msg.display_name ?? `Expert ${shortId}`;

    console.log(`[expert] Starting expert session ${sessionId} (${displayName})`);

    // 2. Create workspace directory
    const workspaceDir = join(homedir(), ".zazigv2", `expert-${sessionId}`);
    mkdirSync(workspaceDir, { recursive: true });

    // 3. Git worktree setup — skipped for repo-free experts (needs_repo === false)
    let repoDir: string | undefined;
    let cloneDir: string | undefined;
    let startCommitHash: string | undefined;
    let resolvedDefaultBranch: string | undefined;

    const needsRepo = msg.needs_repo !== false;

    if (needsRepo && msg.project_id && msg.repo_url) {
      try {
        const projectName = msg.repo_url.split("/").pop()?.replace(/\.git$/, "") ?? msg.project_id;
        cloneDir = await this.repoManager.ensureRepo(msg.repo_url, projectName);
        const worktreeTarget = join(workspaceDir, "repo");

        // Remove stale metadata/dir from interrupted sessions so each start gets a fresh worktree.
        try {
          await execFileAsync("git", [
            "-C", cloneDir,
            "worktree", "remove", "--force", worktreeTarget,
          ]);
        } catch {
          // No pre-existing worktree at this path — that's fine.
        }
        rmSync(worktreeTarget, { recursive: true, force: true });
        await execFileAsync("git", ["-C", cloneDir, "worktree", "prune"]);

        // Fetch latest — updates origin/* tracking refs without touching worktrees.
        const { defaultBranch, tempRef } = await this.repoManager.fetchForExpertSession(
          projectName, sessionId,
        );
        resolvedDefaultBranch = defaultBranch;

        // Create expert branch from the remote tracking ref.
        await execFileAsync("git", [
          "-C", cloneDir,
          "worktree", "add", "-b", expertBranch, worktreeTarget,
          tempRef,
        ]);

        const { stdout } = await execFileAsync("git", ["-C", worktreeTarget, "rev-parse", "HEAD"]);
        startCommitHash = stdout.trim();

        repoDir = worktreeTarget;
        console.log(`[expert] Git worktree created at ${worktreeTarget} (branch: ${expertBranch}, base: ${defaultBranch})`);
        console.log(`[expert] Worktree at commit: ${startCommitHash.slice(0, 8)}`);
      } catch (err) {
        console.error(`[expert] Failed to create git worktree:`, err);
        this.startingSessions.delete(sessionId);
        await this.updateSessionStatus(sessionId, "failed");
        return;
      }
    } else if (needsRepo && (msg.project_id || msg.repo_url)) {
      console.error(
        `[expert] Invalid start_expert payload for ${sessionId}: project_id and repo_url must both be set together`,
      );
      this.startingSessions.delete(sessionId);
      await this.updateSessionStatus(sessionId, "failed");
      return;
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
      if (needsRepo) {
        const defaultBranchForInstructions = resolvedDefaultBranch ?? "master";
        claudeMdParts.push(`
## Expert Session Instructions

You are working as an interactive expert. Your task brief is in \`.claude/expert-brief.md\`.

### Workflow
1. Read and understand the brief in \`.claude/expert-brief.md\`
2. You are on branch \`${expertBranch}\` — all your work goes here
3. Work through the brief methodically
4. Show diffs before applying changes
5. When done: push your branch and merge to ${defaultBranchForInstructions} from your current worktree context, then delete the remote expert branch
   - \`git push origin ${expertBranch}\`
   - \`git push origin ${expertBranch}:${defaultBranchForInstructions}\`
   - \`git push origin --delete ${expertBranch}\`
   - If \`git push origin ${expertBranch}:${defaultBranchForInstructions}\` is rejected (for example, conflicts), create a PR instead: \`gh pr create --base ${defaultBranchForInstructions} --head ${expertBranch}\`

`);
      } else {
        claudeMdParts.push(`
## Expert Session Instructions

You are working as an autonomous expert. Your task brief is in \`.claude/expert-brief.md\`.

### Workflow
1. Read and understand the brief in \`.claude/expert-brief.md\`
2. Work through the brief methodically using the MCP tools available
3. When done, your session will end automatically — no git or file operations are needed

`);
      }

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
        mcpTools: Array.isArray(msg.role.mcp_tools) ? msg.role.mcp_tools : msg.role.mcp_tools?.allowed,
        tmuxSession: tmuxSessionName,
      });

      // 8. Write brief to .claude/expert-brief.md
      const claudeDir = join(effectiveWorkspaceDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(join(claudeDir, "expert-brief.md"), assembleExpertBrief(msg.brief));

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
          {
            matcher: "",
            hooks: [{
              type: "command",
              command: `cat ${shellEscape([join(claudeDir, "expert-brief.md")])}`,
            }],
          },
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
      this.startingSessions.delete(sessionId);
      await this.updateSessionStatus(sessionId, "failed");
      return;
    }

    if (msg.headless === true) {
      try {
        // Write prompt to a file and pipe it to avoid ARG_MAX limits on long briefs
        const promptFilePath = join(effectiveWorkspaceDir, ".zazig-prompt.txt");
        writeFileSync(promptFilePath, msg.brief);

        const claudeCmd = shellEscape([
          "claude",
          "--model",
          msg.model,
          "-p",
        ]);
        const shellCmd = `unset CLAUDECODE; cat ${shellEscape([promptFilePath])} | ${claudeCmd}`;

        // Kill any stale session from interrupted runs.
        await killTmuxSession(tmuxSessionName);

        await execFileAsync("tmux", [
          "new-session", "-d",
          "-s", tmuxSessionName,
          "-c", effectiveWorkspaceDir,
          shellCmd,
        ]);

        console.log(`[expert] Spawned headless tmux session: ${tmuxSessionName} (cwd=${effectiveWorkspaceDir})`);
      } catch (err) {
        console.error(`[expert] Failed to spawn headless tmux session:`, err);
        this.startingSessions.delete(sessionId);
        await this.updateSessionStatus(sessionId, "failed");
        return;
      }

      await this.updateSessionStatus(sessionId, "running");

      const sessionState: ExpertSessionState = {
        sessionId,
        workspaceDir,
        effectiveWorkspaceDir,
        repoDir,
        cloneDir,
        defaultBranch: resolvedDefaultBranch,
        branch: msg.branch ?? undefined,
        expertBranch: repoDir ? expertBranch : undefined,
        startCommit: repoDir ? startCommitHash : undefined,
        displayName,
        tmuxSession: tmuxSessionName,
      };
      this.startingSessions.delete(sessionId);
      this.activeSessions.set(sessionId, sessionState);
      this.startExitPolling(sessionState);

      console.log(`[expert] Headless expert session ${sessionId} is running (tmux=${tmuxSessionName})`);
      return;
    }

    // 10. Spawn tmux session
    try {
      // Kill any stale session
      if (await isTmuxSessionAlive(tmuxSessionName)) {
        await killTmuxSession(tmuxSessionName);
      }

      const claudeCmd = shellEscape([
        "claude",
        "--model",
        msg.model,
      ]);
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
      this.startingSessions.delete(sessionId);
      await this.updateSessionStatus(sessionId, "failed");
      return;
    }

    // 11. Update DB: expert_sessions → running
    await this.updateSessionStatus(sessionId, "running");

    // 12. Link window into viewer TUI and switch
    const viewerLink = await this.linkToViewerTui(msg, tmuxSessionName, displayName);

    // 13. Store session state
    const sessionState: ExpertSessionState = {
      sessionId,
      workspaceDir,
      effectiveWorkspaceDir,
      repoDir,
      cloneDir,
      defaultBranch: resolvedDefaultBranch,
      branch: repoDir ? expertBranch : undefined,
      expertBranch: repoDir ? expertBranch : undefined,
      startCommit: repoDir ? startCommitHash : undefined,
      displayName,
      tmuxSession: tmuxSessionName,
      viewerSession: viewerLink?.viewerSession,
      viewerWindowName: viewerLink?.viewerWindowName,
    };
    this.startingSessions.delete(sessionId);
    this.activeSessions.set(sessionId, sessionState);

    // 14. Start polling for tmux session exit
    this.startExitPolling(sessionState);

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
      if (status === "completed") {
        update.completed_at = new Date().toISOString();
      }
      const { error, data } = await this.supabase
        .from("expert_sessions")
        .update(update)
        .eq("id", sessionId)
        .select("id");
      if (error) {
        console.warn(`[expert] DB update failed for session ${sessionId}: ${error.message}`);
      } else if (!data || data.length === 0) {
        console.warn(`[expert] DB update for session ${sessionId} matched 0 rows (RLS may be blocking)`);
      } else {
        console.log(`[expert] Updated session ${sessionId} → ${status}`);
      }
    } catch (err) {
      console.error(`[expert] DB update error for session ${sessionId}:`, err);
    }
  }

  private async linkToViewerTui(
    msg: StartExpertMessage,
    tmuxSessionName: string,
    displayName: string,
  ): Promise<ViewerLinkResult | null> {
    // Derive viewer session name from company_name (message field, then instance field)
    let viewerSession: string | undefined;
    const companyName = msg.company_name || this.companyName;
    if (companyName) {
      viewerSession = viewerSessionName(companyName);
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
      return null;
    }

    // Check if viewer session exists
    if (!(await isTmuxSessionAlive(viewerSession))) {
      console.log(`[expert] Viewer session ${viewerSession} not alive — skipping TUI linking`);
      return null;
    }

    try {
      // Get window ID of the expert session
      const { stdout: windowId } = await execFileAsync("tmux", [
        "list-windows", "-t", tmuxSessionName, "-F", "#{window_id}",
      ]);
      const expertWindowId = windowId.trim().split("\n")[0];
      if (!expertWindowId) {
        console.warn(`[expert] Could not determine window ID for ${tmuxSessionName}`);
        return null;
      }

      const viewerWindowName = displayName.toUpperCase().replace(/\s+/g, "-");

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
        viewerWindowName,
      ]);

      // Switch to the new window
      try {
        await execFileAsync("tmux", [
          "select-window",
          "-t", `${viewerSession}:${viewerWindowName}`,
        ]);
      } catch {
        // select-window may fail if no client is attached — that's fine
      }

      console.log(`[expert] Linked expert window to viewer session ${viewerSession}`);
      return { viewerSession, viewerWindowName };
    } catch (err) {
      console.warn(`[expert] Failed to link expert window to viewer TUI:`, err);
      return null;
    }
  }

  private startExitPolling(session: ExpertSessionState): void {
    const existing = this.activePollers.get(session.sessionId);
    if (existing) {
      clearInterval(existing);
    }

    const interval = setInterval(() => {
      void (async () => {
        try {
          if (this.exitingSessions.has(session.sessionId)) return;

          const alive = await isTmuxSessionAlive(session.tmuxSession);
          if (!alive) {
            clearInterval(interval);
            this.activePollers.delete(session.sessionId);
            await this.handleSessionExit(session);
          }
        } catch (err) {
          // Keep polling on transient failures.
          console.error("[expert] Poll error:", err);
        }
      })();
    }, 10_000);

    this.activePollers.set(session.sessionId, interval);
  }

  private async handleSessionExit(session: ExpertSessionState): Promise<void> {
    if (this.exitingSessions.has(session.sessionId)) return;
    this.exitingSessions.add(session.sessionId);

    const poller = this.activePollers.get(session.sessionId);
    if (poller) {
      clearInterval(poller);
      this.activePollers.delete(session.sessionId);
    }

    await this.updateSessionStatus(session.sessionId, "completed");
    await this.injectSummaryIntoCpo(session);
    await this.switchViewerToCpo(session);
    await this.pushUnpushedCommits(session);
    await this.cleanupWorktree(session);

    try {
      rmSync(session.workspaceDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`[expert] Failed to remove workspace ${session.workspaceDir}:`, err);
    }

    this.activeSessions.delete(session.sessionId);
    this.exitingSessions.delete(session.sessionId);
    console.log(`[expert] Session ${session.sessionId} exited and cleaned up`);
  }

  private async injectSummaryIntoCpo(session: ExpertSessionState): Promise<void> {
    const companyPrefix = this.companyId ? `${this.companyId.slice(0, 8)}-` : "";
    const cpoSessionName = `${this.machineId}-${companyPrefix}cpo`;

    if (!(await isTmuxSessionAlive(cpoSessionName))) {
      console.warn(`[expert] CPO session ${cpoSessionName} not found; skipping summary injection`);
      return;
    }

    const message = `[Expert session ended — ${session.displayName}]`;
    const singleLine = message.replace(/\r?\n/g, " ").trim();
    if (!singleLine) return;

    try {
      await execFileAsync("tmux", ["send-keys", "-t", cpoSessionName, "-l", singleLine]);
      await execFileAsync("tmux", ["send-keys", "-t", cpoSessionName, "Enter"]);
      console.log(`[expert] Injected expert summary into CPO session ${cpoSessionName}`);
    } catch (err) {
      console.warn(`[expert] Failed to inject summary into CPO session ${cpoSessionName}:`, err);
    }
  }

  private async switchViewerToCpo(session: ExpertSessionState): Promise<void> {
    if (!session.viewerSession) return;
    if (!(await isTmuxSessionAlive(session.viewerSession))) return;

    if (session.viewerWindowName) {
      try {
        await execFileAsync("tmux", [
          "unlink-window",
          "-k",
          "-t", `${session.viewerSession}:${session.viewerWindowName}`,
        ]);
      } catch (err) {
        console.warn(
          `[expert] Failed to unlink expert window ${session.viewerWindowName} from ${session.viewerSession}:`,
          err,
        );
      }
    }

    const directTargets = [
      `${session.viewerSession}:CPO`,
      `${session.viewerSession}:cpo`,
    ];
    for (const target of directTargets) {
      try {
        await execFileAsync("tmux", ["select-window", "-t", target]);
        return;
      } catch {
        // Try next candidate.
      }
    }

    try {
      const { stdout } = await execFileAsync("tmux", [
        "list-windows",
        "-t", session.viewerSession,
        "-F", "#{window_index}:#{window_name}",
      ]);
      const lines = stdout.trim().split("\n").filter(Boolean);
      const cpoLine = lines.find((line) => line.split(":")[1]?.toLowerCase() === "cpo");
      const cpoIndex = cpoLine?.split(":")[0];
      if (!cpoIndex) {
        console.warn(`[expert] Could not find CPO window in viewer session ${session.viewerSession}`);
        return;
      }
      await execFileAsync("tmux", ["select-window", "-t", `${session.viewerSession}:${cpoIndex}`]);
    } catch (err) {
      console.warn(`[expert] Failed to switch viewer ${session.viewerSession} back to CPO:`, err);
    }
  }

  /**
   * Safety net: before destroying the worktree, check if the expert made
   * commits that were never pushed. If so, push them to origin so work
   * isn't silently lost when the session ends.
   */
  private async pushUnpushedCommits(session: ExpertSessionState): Promise<void> {
    const expertBranch = session.expertBranch ?? session.branch;
    if (!session.repoDir || !session.cloneDir || !expertBranch || !session.startCommit) return;

    try {
      const { stdout: currentHead } = await execFileAsync("git", [
        "-C", session.repoDir, "rev-parse", "HEAD",
      ]);
      const head = currentHead.trim();

      if (head === session.startCommit) {
        return; // No new commits — nothing to push
      }

      // There are local commits. Push them to the expert branch first.
      console.log(
        `[expert] Session ${session.sessionId} has unpushed commits (${session.startCommit.slice(0, 8)}..${head.slice(0, 8)}). Pushing to origin/${expertBranch}...`,
      );

      try {
        await execFileAsync("git", [
          "-C", session.repoDir,
          "push", "origin", `HEAD:refs/heads/${expertBranch}`,
        ]);
        console.log(`[expert] Pushed unpushed commits to origin/${expertBranch}`);

        try {
          const defaultBranch = session.defaultBranch ?? "master";
          await execFileAsync("git", [
            "-C", session.repoDir, "push", "origin", `${expertBranch}:${defaultBranch}`,
          ]);
          await execFileAsync("git", ["-C", session.repoDir, "push", "origin", "--delete", expertBranch]);
          console.log(
            `[expert] Pushed ${expertBranch} to ${defaultBranch} and deleted origin/${expertBranch}`,
          );
        } catch (mergeErr) {
          console.warn(`[expert] Push-to-merge failed for ${expertBranch} -> ${defaultBranch}; attempting PR fallback`, mergeErr);
          try {
            await execFileAsync("gh", [
              "-C", session.repoDir,
              "pr", "create",
              "--base", defaultBranch,
              "--head", expertBranch,
              "--title", `[expert] Merge ${expertBranch} into ${defaultBranch}`,
              "--body", "Automated fallback: push-to-merge was rejected, opening PR for manual resolution.",
            ]);
            console.log(`[expert] Created PR fallback for ${expertBranch} -> ${defaultBranch}`);
          } catch (prErr) {
            console.warn(
              `[expert] PR fallback also failed for ${expertBranch} -> ${defaultBranch}; leaving origin/${expertBranch} for manual resolution`,
              prErr,
            );
          }
        }
      } catch (pushErr) {
        // Push to the expert branch failed (maybe it advanced).
        // Create a rescue branch so the work is recoverable.
        const rescueBranch = `rescue/expert-${session.sessionId.slice(0, 8)}`;
        console.warn(
          `[expert] Push to origin/${expertBranch} failed — saving work to ${rescueBranch}`,
        );
        try {
          await execFileAsync("git", [
            "-C", session.repoDir,
            "push", "origin", `HEAD:refs/heads/${rescueBranch}`,
          ]);
          console.log(`[expert] Saved work to rescue branch origin/${rescueBranch}`);
        } catch (rescueErr) {
          console.error(
            `[expert] CRITICAL: Failed to push rescue branch for session ${session.sessionId}. Work may be lost.`,
            rescueErr,
          );
        }
      }
    } catch (err) {
      console.warn(`[expert] Failed to check for unpushed commits in session ${session.sessionId}:`, err);
    }
  }

  private async cleanupWorktree(session: ExpertSessionState): Promise<void> {
    if (!session.repoDir) return;

    try {
      if (session.cloneDir) {
        await execFileAsync("git", [
          "-C", session.cloneDir,
          "worktree", "remove", "--force", session.repoDir,
        ]);
        await execFileAsync("git", [
          "-C", session.cloneDir,
          "worktree", "prune",
        ]);
      } else {
        await execFileAsync("git", ["worktree", "remove", "--force", session.repoDir]);
      }
      console.log(`[expert] Removed git worktree ${session.repoDir}`);
    } catch (err) {
      console.warn(`[expert] Failed to remove git worktree ${session.repoDir}:`, err);
    }
  }

  cleanup(): void {
    for (const poller of this.activePollers.values()) {
      clearInterval(poller);
    }
    this.activePollers.clear();
  }

  /** Returns active session state (for exit detection poller). */
  getActiveSessions(): Map<string, ExpertSessionState> {
    return this.activeSessions;
  }
}
