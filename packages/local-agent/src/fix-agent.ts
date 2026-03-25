/**
 * fix-agent.ts — Fix Agent Manager
 *
 * Manages ephemeral Claude Code sessions that assist humans during the testing
 * phase. When a feature enters `testing`, the orchestrator sends a DeployToTest
 * message which triggers spawning a fix agent on the feature branch.
 *
 * The fix agent runs in a tmux session and receives issues via Slack. It makes
 * minimal fixes, commits, and pushes so the test server auto-redeploys.
 *
 * Lifecycle:
 *   DeployToTest   → spawn(featureId, featureBranch, slackChannel, slackThreadTs)
 *   Feature done   → cleanup(featureId)
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWorktree, removeWorktree } from "./branches.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpawnParams {
  featureId: string;
  featureBranch: string;
  slackChannel: string;
  slackThreadTs: string;
}

interface ActiveFixAgent {
  featureId: string;
  sessionName: string;
  worktreePath: string;
}

// ---------------------------------------------------------------------------
// FixAgentManager
// ---------------------------------------------------------------------------

export class FixAgentManager {
  private readonly activeAgents = new Map<string, ActiveFixAgent>();
  private readonly repoDir: string;

  constructor(repoDir: string) {
    this.repoDir = repoDir;
  }

  /**
   * Spawn a fix agent for the given feature. Idempotent — if an agent is
   * already active for this featureId, the call is a no-op.
   */
  async spawn(params: SpawnParams): Promise<void> {
    if (this.activeAgents.has(params.featureId)) return;

    // Sanitize featureId for tmux session name — only allow [a-zA-Z0-9-]
    const sanitizedId = params.featureId.replace(/[^a-z0-9-]/gi, '').slice(0, 8);
    if (!sanitizedId) {
      console.error(`[fix-agent] featureId "${params.featureId}" is empty after sanitization — aborting spawn`);
      return;
    }

    const sessionName = `fix-${sanitizedId}`;

    // 1. Create worktree on the feature branch
    const worktreePath = await createWorktree(this.repoDir, params.featureBranch);

    // 2. Build the prompt for the fix agent
    const safeChannel = sanitizeSlackField(params.slackChannel);
    const safeThread = sanitizeSlackField(params.slackThreadTs);

    const prompt = [
      "You are a fix agent for a feature currently in human testing.",
      "A human is testing this feature and will describe issues in Slack.",
      "Your job: fix issues on the current branch with minimal changes.",
      "After each fix, commit and push so the test server auto-redeploys.",
      "Only fix what the human reports. Do not refactor or add features.",
      `Slack channel: ${safeChannel}`,
      `Thread: ${safeThread}`,
    ].join(" ");

    // 3. Spawn tmux session with claude -p
    // Unset CLAUDECODE so nested sessions aren't blocked.
    const shellCmd = `unset CLAUDECODE; ${shellEscape(["claude", "-p", prompt])}`;

    await execFileAsync("tmux", [
      "new-session",
      "-d",
      "-s", sessionName,
      "-c", worktreePath,
      shellCmd,
    ]);

    this.activeAgents.set(params.featureId, {
      featureId: params.featureId,
      sessionName,
      worktreePath,
    });

    console.log(
      `[fix-agent] Spawned fix agent — featureId=${params.featureId}, ` +
        `session=${sessionName}, worktree=${worktreePath}`
    );
  }

  /**
   * Clean up a fix agent: kill the tmux session and remove the worktree.
   * No-op if no agent is active for this featureId.
   */
  async cleanup(featureId: string): Promise<void> {
    const agent = this.activeAgents.get(featureId);
    if (!agent) return;

    // Kill tmux session (best-effort)
    try {
      await execFileAsync("tmux", ["kill-session", "-t", agent.sessionName]);
      console.log(`[fix-agent] Killed tmux session: ${agent.sessionName}`);
    } catch {
      // Session may already be dead
    }

    // Remove worktree
    await removeWorktree(this.repoDir, agent.worktreePath);

    this.activeAgents.delete(featureId);
    console.log(`[fix-agent] Cleaned up fix agent — featureId=${featureId}`);
  }

  /** Check whether a fix agent is active for the given featureId. */
  isActive(featureId: string): boolean {
    return this.activeAgents.has(featureId);
  }
}

// ---------------------------------------------------------------------------
// Helper: Sanitize Slack fields before embedding in prompt
// ---------------------------------------------------------------------------

/** Strip characters that could enable prompt injection or shell metachar abuse. */
function sanitizeSlackField(s: string): string {
  // Allow printable ASCII except backticks, $, \, and quotes
  return s.replace(/[`$\\"'\n\r]/g, '').slice(0, 200);
}

// ---------------------------------------------------------------------------
// Helper: Shell escaping (same pattern as executor.ts)
// ---------------------------------------------------------------------------

function shellEscape(parts: string[]): string {
  return parts
    .map((p) => `'${p.replace(/'/g, "'\"'\"'")}'`)
    .join(" ");
}
