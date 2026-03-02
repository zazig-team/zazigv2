/**
 * executor.ts — Job execution manager
 *
 * Handles the lifecycle of AI agent jobs dispatched by the orchestrator:
 *   1. Receives StartJob → acquires slot → spawns tmux session → sends JobAck + JobStatusMessage(executing)
 *   2. Polls the tmux session every 30 s to detect completion
 *   3. On success: reads output file if present → sends JobComplete → releases slot
 *   4. On failure (non-zero exit, timeout after 60 min): sends JobFailed → releases slot
 *   5. On StopJob: kills tmux session → releases slot → sends StopAck
 *
 * Tmux session naming: `{machineId}-{jobId}`
 * Model selection (slotType is the primary routing signal):
 *   slotType=codex                     → `codex exec --full-auto` (native Codex execution)
 *   slotType=claude_code               → `claude -p` (print mode, model from orchestrator)
 *   role != null (persistent agents)   → `claude -p` (claude-opus-4-6, print mode)
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync, renameSync, unlinkSync, mkdirSync, rmSync, appendFileSync, createWriteStream } from "node:fs";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StartJob, StopJob, AgentMessage, FailureReason, SlotType, MessageInbound, JobUnblocked } from "@zazigv2/shared";
import { PROTOCOL_VERSION, HEARTBEAT_INTERVAL_MS } from "@zazigv2/shared";
import type { SlotTracker } from "./slots.js";
import { setupJobWorkspace } from "./workspace.js";
import { RepoManager } from "./branches.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Poll the tmux session every 30 s to check for completion. */
const POLL_INTERVAL_MS = 30_000;

/** Reconcile active in-memory jobs against DB terminal states every 60 s. */
const SLOT_RECONCILE_INTERVAL_MS = 60_000;

/** Poll for merged PRs on pr_ready features every 60 s. */
const PR_MONITOR_INTERVAL_MS = 60_000;

/** Kill the job after 60 minutes regardless of status. */
const JOB_TIMEOUT_MS = 60 * 60_000;

/** Kill interactive (human-in-loop) jobs after 30 minutes. */
const INTERACTIVE_JOB_TIMEOUT_MS = 30 * 60_000;

/** Shared report file written by claude/codex agents. */
function reportRelativePath(role?: string): string {
  const reportFile = role ? `${role}-report.md` : "cpo-report.md";
  return `.claude/${reportFile}`;
}

/** Per-job report directory to prevent concurrent-completion races. */
const REPORT_ARCHIVE_DIR = ".claude/job-reports";

/** Roles that run without repository/worktree git context. */
const NO_CODE_CONTEXT_ROLES = new Set([
  "pipeline-technician",
  "monitoring-agent",
  "project-architect",
]);


/** Delay after CPO session spawn before allowing message injection (Claude Code startup). */
const CPO_STARTUP_DELAY_MS = 15_000;

/** Maximum number of messages held in the injection queue.
 *  When exceeded, the oldest notification-type message is dropped.
 *  Human messages are never dropped. */
export const MAX_QUEUE_SIZE = 20;

/** Directory where all per-job log files are written. */
const JOB_LOG_DIR = join(homedir(), ".zazigv2", "job-logs");

function buildScratchWorkspaceDir(companyId: string | undefined, role: string, jobId: string): string {
  const resolvedCompany = companyId && companyId.trim().length > 0
    ? companyId
    : "unknown-company";
  return join(homedir(), ".zazigv2", `${resolvedCompany}-${role}-${jobId}`);
}

/** Truncate both log files for a job so each run starts fresh. */
function clearJobLogs(jobId: string): void {
  try {
    mkdirSync(JOB_LOG_DIR, { recursive: true });
    writeFileSync(join(JOB_LOG_DIR, `${jobId}-pre-post.log`), "");
    writeFileSync(join(JOB_LOG_DIR, `${jobId}-pipe-pane.log`), "");
  } catch { /* best-effort */ }
}

/** Resolve repo root from the executor runtime location (dist/src) with a safe fallback. */
function resolveRepoRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(thisDir, "..", "..", ".."),
    process.cwd(),
  ];
  for (const candidate of candidates) {
    const hasPipelineSkills = existsSync(join(candidate, "projects", "skills"));
    const hasInteractiveSkills = existsSync(join(candidate, ".claude", "skills"));
    if (hasPipelineSkills && hasInteractiveSkills) return candidate;
  }
  console.warn(`[executor] Could not resolve repo root from runtime path; using process.cwd()=${process.cwd()}`);
  return process.cwd();
}

/** Write a timestamped line to a per-job lifecycle log file ({jobId}-pre-post.log). */
function jobLog(jobId: string, message: string): void {
  try {
    mkdirSync(JOB_LOG_DIR, { recursive: true });
    const line = `${new Date().toISOString()} ${message}\n`;
    appendFileSync(join(JOB_LOG_DIR, `${jobId}-pre-post.log`), line);
  } catch { /* best-effort */ }
}

/** Marker in promptStackMinusSkills where skill content is inserted by the local agent. */
const SKILLS_MARKER = "<!-- SKILLS -->";

/** Codex delegation instructions injected into context for codex-slotType jobs.
 *  Matches v1's token-budget routing: Claude supervises, Codex does the heavy lifting. */
const CODEX_ROUTING_INSTRUCTIONS = `## Codex Delegation (REQUIRED)

You MUST use codex-delegate for ALL code changes. Do NOT write code directly.

Run: codex-delegate implement --dir $(pwd) "description of what to implement"

Requirements:
- Clean git working tree required (commit or stash first)
- If codex-delegate fails or the task is too complex, you may fall back to writing code directly
- For investigation/research, use: codex-delegate investigate --dir $(pwd) "question"

After codex-delegate completes, review the diff output and decide whether to keep, modify, or discard changes.`;

/** Universal file-writing rules for all agents. Used locally for workspace setup. */
export const FILE_WRITING_RULES = `## File Writing Rules

ALL file operations (reads, writes, edits) MUST stay within your working directory.
Do NOT use absolute paths to other repositories or user home directories.

- Session reports → \`.claude/{role}-report.md\` in your working directory
- Design documents, proposals, plans, specs → \`docs/plans/YYYY-MM-DD-descriptive-slug.md\` (relative to your working directory)
- Never reference paths outside your working directory — they belong to other projects`;

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveJob {
  jobId: string;
  slotType: SlotType;
  sessionName: string;
  pollTimer: ReturnType<typeof setInterval> | null;
  timeoutTimer: ReturnType<typeof setTimeout> | null;
  /** Resolved to true when the job ends (either complete or failed). */
  settled: boolean;
  /** Timestamp (ms) when the job started executing — used for progress estimation. */
  startedAt: number;
  /** Absolute path to the pipe-pane log file for this job. */
  logPath: string;
  /** Byte offset of the last chunk sent to raw_log — enables append-only writes. */
  lastBytesSent: number;
  /** Ephemeral workspace directory (if created). Used for report lookup + cleanup. */
  workspaceDir?: string;
  /** Git worktree path for this job — agent CWD and workspace root. */
  worktreePath?: string;
  /** Bare repo directory used to manage this job's worktree. */
  repoDir?: string;
  /** Job branch name (job/{jobId}) pushed to origin after completion. */
  jobBranch?: string;
  /** Role of the agent that ran this job (used for role-specific report paths). */
  role?: string;
  /** Card type from the StartJob message — used to identify combine jobs for PR creation. */
  cardType?: string;
  /** GitHub repo URL (e.g. https://github.com/owner/repo) — used for PR creation. */
  repoUrl?: string;
  /** Feature branch name — used as PR head branch. */
  featureBranch?: string;
  /** Job spec text — stored for codex post-execution Haiku review. */
  spec?: string;
  /** Acceptance criteria text — stored for codex post-execution Haiku review. */
  acceptanceCriteria?: string;
  /** Human-readable job title — used in codex commit message. */
  jobTitle?: string;
}

interface ActivePersistentAgent {
  role: string;
  /** Tmux session name used for send-keys injection. */
  tmuxSession: string;
  jobId: string;
  companyId: string;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  /** Timestamp (ms) when the session was spawned — used to gate startup delay. */
  startedAt: number;
}

export interface PersistentAgentJobDefinition {
  role: string;
  prompt_stack_minus_skills: string;
  skills: string[];
  model: string;
  slot_type: string;
  mcp_tools?: string[];
}

export interface QueuedMessage {
  text: string;
  /** Tmux session to inject into. */
  sessionName: string;
  /** Spawn timestamp — used for startup delay check. */
  startedAt: number;
  resolve: () => void;
  reject: (err: unknown) => void;
  /** Discriminates pipeline notifications (droppable) from human messages (never dropped). */
  type: "notification" | "human";
}

/** Callback type for sending AgentMessage back to the orchestrator channel. */
export type SendFn = (msg: AgentMessage) => Promise<void>;

/** Callback invoked after a job completes, before slot release. Enables verification pipeline. */
export type AfterJobCompleteFn = (jobId: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Queue helpers
// ---------------------------------------------------------------------------

/**
 * Pushes `message` onto `queue`, then enforces `maxSize` by dropping the oldest
 * notification-type message if the cap is exceeded.  Human messages are never
 * dropped.  If the queue is over-cap and contains only human messages, the cap
 * is not enforced and a warning is logged instead.
 *
 * Exported for unit testing.
 */
export function enqueueWithCap(queue: QueuedMessage[], message: QueuedMessage, maxSize: number): void {
  queue.push(message);
  if (queue.length > maxSize) {
    const notifIdx = queue.findIndex((m) => m.type === "notification");
    if (notifIdx !== -1) {
      const dropped = queue.splice(notifIdx, 1)[0]!;
      console.log(`[daemon] Dropped notification message due to queue cap: ${dropped.text.slice(0, 80)}`);
    } else {
      console.warn("[daemon] Queue cap exceeded but no notification messages to drop — queue contains only human messages");
    }
  }
}

// ---------------------------------------------------------------------------
// JobExecutor
// ---------------------------------------------------------------------------

export class JobExecutor {
  private readonly machineId: string;
  private readonly companyId: string | undefined;
  private readonly slots: SlotTracker;
  private readonly send: SendFn;
  private readonly supabase: SupabaseClient;
  private readonly afterJobComplete?: AfterJobCompleteFn;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  /** Map of jobId → active job state. */
  private readonly activeJobs = new Map<string, ActiveJob>();

  /** Jobs that have been attempted (including failures) — prevents duplicate dispatch. */
  private readonly attemptedJobs = new Set<string>();

  /** Manages bare repo clones and job worktrees for all dispatched jobs. */
  private readonly repoManager = new RepoManager();

  /** Map of role → active persistent agent state. Supports simultaneous CPO, CTO, etc. */
  private readonly persistentAgents = new Map<string, ActivePersistentAgent>();

  /** Cached machine UUID for persistent_agents DB writes. */
  private machineUuid: string | null = null;

  /** Message queue for injecting into persistent agent tmux sessions. */
  private readonly messageQueue: QueuedMessage[] = [];
  private processingQueue = false;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private prMonitorTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    machineId: string,
    companyId: string | undefined,
    slots: SlotTracker,
    send: SendFn,
    supabase: SupabaseClient,
    supabaseUrl: string,
    supabaseAnonKey: string,
    afterJobComplete?: AfterJobCompleteFn,
  ) {
    this.machineId = machineId;
    this.companyId = companyId;
    this.slots = slots;
    this.send = send;
    this.supabase = supabase;
    this.supabaseUrl = supabaseUrl;
    this.supabaseAnonKey = supabaseAnonKey;
    this.afterJobComplete = afterJobComplete;

    this.reconcileTimer = setInterval(() => {
      void this.reconcileSlots();
    }, SLOT_RECONCILE_INTERVAL_MS);

    this.prMonitorTimer = setInterval(() => {
      void this.monitorMergedPRs();
    }, PR_MONITOR_INTERVAL_MS);
  }

  /** Resolve the machine UUID from the machines table (cached after first call). */
  private async resolveMachineUuid(companyId: string): Promise<string | null> {
    if (this.machineUuid) return this.machineUuid;
    const { data, error } = await this.supabase
      .from("machines")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", this.machineId)
      .single();
    if (error || !data) {
      console.warn(`[executor] Could not resolve machine UUID for "${this.machineId}": ${error?.message ?? "not found"}`);
      return null;
    }
    this.machineUuid = data.id;
    return data.id;
  }

  // ---------------------------------------------------------------------------
  // Public: StartJob
  // ---------------------------------------------------------------------------

  async handleStartJob(msg: StartJob): Promise<void> {
    const { jobId, slotType, complexity, model } = msg;

    clearJobLogs(jobId);
    jobLog(jobId, `START handleStartJob — slotType=${slotType}, complexity=${complexity}, model=${model}, role=${msg.role ?? "none"}, cardType=${msg.cardType}`);
    console.log(
      `[executor] handleStartJob — jobId=${jobId}, slotType=${slotType}, ` +
        `complexity=${complexity}, model=${model}`
    );

    if (this.activeJobs.has(jobId) || this.attemptedJobs.has(jobId)) {
      jobLog(jobId, `SKIP duplicate start_job — already attempted`);
      console.warn(`[executor] Duplicate start_job ignored for jobId=${jobId}`);
      return;
    }
    this.attemptedJobs.add(jobId);

    try {
      await this._handleStartJobInner(msg);
    } catch (err) {
      jobLog(jobId, `FATAL handleStartJob crashed: ${String(err)}`);
      console.error(`[executor] FATAL handleStartJob crashed for jobId=${jobId}:`, err);
      // Best-effort: release slot and notify orchestrator
      try { this.slots.release(slotType); } catch { /* already released or never acquired */ }
      try { await this.sendJobFailed(jobId, `Agent crash: ${String(err)}`, "agent_crash"); } catch { /* best-effort */ }
    }
  }

  private async _handleStartJobInner(msg: StartJob): Promise<void> {
    const { jobId, slotType, complexity, model } = msg;

    // --- 1b. Persistent agent — separate lifecycle, does NOT consume a slot ---
    if (msg.cardType === "persistent_agent") {
      await this.sendJobAck(jobId);
      await this.handlePersistentJob(jobId, msg, slotType);
      return;
    }

    // --- 1. Acquire slot (throws if none available) ---
    try {
      this.slots.acquire(slotType);
      jobLog(jobId, `Slot acquired: ${slotType}`);
    } catch (err) {
      jobLog(jobId, `FAILED no slot available: ${String(err)}`);
      console.error(`[executor] No slot available for jobId=${jobId}:`, err);
      await this.sendJobFailed(jobId, `No available slot: ${String(err)}`, "unknown");
      return;
    }

    // --- 2. Send JobAck immediately to confirm delivery ---
    await this.sendJobAck(jobId);

    const isInteractive = msg.interactive === true;

    // --- 3. Assemble context from pre-built promptStackMinusSkills ---
    // The orchestrator builds the full prompt stack with a <!-- SKILLS --> marker.
    // We insert skill file content at the marker position.
    const assembledContext = assembleContext(msg);

    console.log(`[executor] Assembled context for jobId=${jobId}:\n${assembledContext}`);

    // --- 3c. Prepare execution workspace ---
    // Code-context roles run in git worktrees. NO_CODE_CONTEXT roles run in scratch workspaces.
    let ephemeralWorkspaceDir: string | undefined;
    let worktreePath: string | undefined;
    let repoDir: string | undefined;
    let jobBranch: string | undefined;
    const roleName = msg.role ?? "senior-engineer";
    const requiresCodeContext = !NO_CODE_CONTEXT_ROLES.has(roleName);

    const cleanupPreparedWorkspace = async (): Promise<void> => {
      if (worktreePath && repoDir) {
        // TEMP: disabled worktree cleanup for debugging
        // await this.repoManager.removeJobWorktree(repoDir, worktreePath);
      } else if (ephemeralWorkspaceDir) {
        cleanupJobWorkspace(jobId, ephemeralWorkspaceDir);
      }
    };

    try {
      if (requiresCodeContext) {
        if (!msg.repoUrl || !msg.featureBranch) {
          throw new Error("Missing repoUrl/featureBranch for code-context role");
        }

        const projectName = msg.repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? jobId;
        repoDir = await this.repoManager.ensureRepo(msg.repoUrl, projectName);
        await this.repoManager.ensureFeatureBranch(repoDir, msg.featureBranch);
        const routing = msg.dependencyBranches && msg.dependencyBranches.length > 0
          ? "createDependentJobWorktree"
          : "createJobWorktree";
        clearJobLogs(jobId);
        jobLog(jobId, `Branch routing: dependencyBranches=${JSON.stringify(msg.dependencyBranches)}, using=${routing}`);
        jobLog(jobId, `featureBranch=${msg.featureBranch}, repoDir=${repoDir}`);
        console.log(`[executor] Branch routing for jobId=${jobId}: dependencyBranches=${JSON.stringify(msg.dependencyBranches)}, using=${routing}`);
        const worktreeResult = (msg.dependencyBranches && msg.dependencyBranches.length > 0)
          ? await this.repoManager.createDependentJobWorktree(repoDir, msg.featureBranch, jobId, msg.dependencyBranches)
          : await this.repoManager.createJobWorktree(repoDir, msg.featureBranch, jobId);
        worktreePath = worktreeResult.worktreePath;
        jobBranch = worktreeResult.jobBranch;
        ephemeralWorkspaceDir = worktreePath;

        jobLog(jobId, `Worktree created at ${worktreePath} (branch: ${jobBranch})`);
        console.log(`[executor] Git worktree created at ${worktreePath} (branch: ${jobBranch}) for jobId=${jobId}`);
      } else {
        ephemeralWorkspaceDir = buildScratchWorkspaceDir(this.companyId, roleName, jobId);
        mkdirSync(ephemeralWorkspaceDir, { recursive: true });
        jobLog(jobId, `Scratch workspace created at ${ephemeralWorkspaceDir} (no git context role=${roleName})`);
        console.log(`[executor] Scratch workspace created at ${ephemeralWorkspaceDir} for no-code role ${roleName} jobId=${jobId}`);
      }
    } catch (err) {
      jobLog(jobId, `FAILED to prepare workspace: ${String(err)}`);
      console.error(`[executor] Failed to prepare workspace for jobId=${jobId}:`, err);
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to prepare workspace: ${String(err)}`, "agent_crash");
      return;
    }

    // Set up workspace overlay (CLAUDE.md, .mcp.json, .claude/).
    const thisDir = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolveRepoRoot();
    const mcpServerPath = join(thisDir, "agent-mcp-server.js");
    try {
      setupJobWorkspace({
        workspaceDir: ephemeralWorkspaceDir!,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId,
        companyId: this.companyId,
        role: roleName,
        claudeMdContent: assembledContext,
        skills: msg.roleSkills,
        repoSkillsDir: join(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join(repoRoot, ".claude", "skills"),
        mcpTools: msg.roleMcpTools,
        tmuxSession: `${this.machineId}-${jobId}`,
      });
      console.log(`[executor] Workspace overlay written to ${ephemeralWorkspaceDir} for jobId=${jobId}`);
    } catch (err) {
      console.warn(`[executor] Failed to write workspace overlay for jobId=${jobId}: ${String(err)}`);
      // Non-fatal — job can still run without workspace overlay
    }

    // --- 4. Build command based on complexity/model ---
    let cmd: string;
    let cmdArgs: string[];
    // Compute promptFilePath early so it can be embedded in codex args.
    const promptFilePath = join(ephemeralWorkspaceDir!, ".zazig-prompt.txt");
    if (isInteractive) {
      // Interactive TUI mode — no -p flag, agent can use /remote-control
      const resolvedModel = msg.model && msg.model !== "codex" ? msg.model : "claude-sonnet-4-6";
      cmd = "claude";
      cmdArgs = ["--model", resolvedModel];
    } else {
      const built = buildCommand(slotType, complexity, model, worktreePath, promptFilePath);
      cmd = built.cmd;
      cmdArgs = built.args;
    }
    const sessionName = `${this.machineId}-${jobId}`;

    // --- 4b. Write prompt to file (piped via stdin for claude, or as positional arg for codex) ---
    mkdirSync(ephemeralWorkspaceDir!, { recursive: true });
    writeFileSync(promptFilePath, assembledContext);

    // --- 5. Clear stale report before spawning (prevents reading a previous job's report) ---
    const reportPath = `${process.env["HOME"] ?? "/tmp"}/${reportRelativePath(msg.role)}`;
    try { unlinkSync(reportPath); } catch { /* no stale report — fine */ }

    // --- 6. Kill stale tmux session if it exists (from a previous dispatch) ---
    if (await isTmuxSessionAlive(sessionName)) {
      console.warn(`[executor] Stale tmux session ${sessionName} exists — killing before respawn`);
      await killTmuxSession(sessionName);
    }

    // --- 6a. Spawn tmux session ---
    try {
      if (isInteractive) {
        // Spawn TUI mode — prompt will be injected after startup delay
        const claudeCmd = shellEscape([cmd, ...cmdArgs]);
        const shellCmd = `unset CLAUDECODE; ${claudeCmd}`;
        await execFileAsync("tmux", [
          "new-session", "-d", "-s", sessionName,
          ...(ephemeralWorkspaceDir ? ["-c", ephemeralWorkspaceDir] : []),
          shellCmd,
        ]);

        // Dismiss the "trust this folder" prompt after it appears (~3s)
        setTimeout(async () => {
          try {
            await execFileAsync("tmux", ["send-keys", "-t", sessionName, "Enter"]);
            jobLog(jobId, "Sent Enter to dismiss trust prompt");
          } catch (err) {
            jobLog(jobId, `Failed to dismiss trust prompt: ${err}`);
          }
        }, 3_000);

        // Inject the prompt after Claude Code fully initializes
        setTimeout(async () => {
          try {
            const promptText = readFileSync(promptFilePath, "utf8");
            await execFileAsync("tmux", ["send-keys", "-t", sessionName, "-l", promptText]);
            // Wait for the TUI to process the pasted text before submitting
            await new Promise((resolve) => setTimeout(resolve, 2_000));
            await execFileAsync("tmux", ["send-keys", "-t", sessionName, "Enter"]);
            jobLog(jobId, `Injected prompt into interactive session (${promptText.length} chars)`);
          } catch (err) {
            jobLog(jobId, `Failed to inject prompt: ${err}`);
          }
        }, CPO_STARTUP_DELAY_MS);
      } else {
        // For codex: prompt is a positional CLI arg already embedded in args — do NOT pipe via stdin.
        // For claude -p: pipe prompt via stdin to avoid OS ARG_MAX limits.
        await spawnTmuxSession(sessionName, cmd, cmdArgs, ephemeralWorkspaceDir, slotType === "codex" ? undefined : promptFilePath);
      }
    } catch (err) {
      console.error(`[executor] Failed to spawn tmux session for jobId=${jobId}:`, err);
      await cleanupPreparedWorkspace();
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to start tmux session: ${String(err)}`, "agent_crash");
      return;
    }

    jobLog(jobId, `Tmux session started — session=${sessionName}, cmd=${cmd}, cwd=${ephemeralWorkspaceDir ?? "none"}`);
    console.log(`[executor] Tmux session started — session=${sessionName}, cmd=${cmd}`);

    // --- 6b. Start pipe-pane to stream session output to a log file ---
    const logPath = jobLogPath(jobId);
    try {
      mkdirSync(JOB_LOG_DIR, { recursive: true });
      await startPipePane(sessionName, logPath);
    } catch (err) {
      // Pipe-pane failure is non-fatal — logs simply won't be captured
      console.warn(`[executor] pipe-pane start failed for jobId=${jobId}: ${String(err)}`);
    }

    // --- 6c. Open terminal window for the session (dev/testing) ---
    if (process.env["ZAZIG_OPEN_SESSIONS"]) {
      execFile("bash", ["-c", `ghostty -e bash -c 'tmux attach -t ${sessionName}'`], (err) => {
        if (err) console.warn(`[executor] Could not open Ghostty window: ${err.message}`);
      });
    }

    // --- 7. Send JobStatusMessage(executing) ---
    await this.sendJobStatus(jobId, "executing");

    // --- 8. Register active job and set up polling + timeout ---
    const activeJob: ActiveJob = {
      jobId,
      slotType,
      sessionName,
      pollTimer: null,
      timeoutTimer: null,
      settled: false,
      startedAt: Date.now(),
      logPath,
      lastBytesSent: 0,
      workspaceDir: ephemeralWorkspaceDir,
      worktreePath,
      repoDir,
      jobBranch,
      role: msg.role,
      cardType: msg.cardType,
      repoUrl: msg.repoUrl ?? undefined,
      featureBranch: msg.featureBranch ?? undefined,
      spec: msg.spec,
      acceptanceCriteria: msg.acceptanceCriteria,
      jobTitle: msg.title,
    };
    this.activeJobs.set(jobId, activeJob);

    // Timeout: kill after JOB_TIMEOUT_MS (or INTERACTIVE_JOB_TIMEOUT_MS for human-in-loop jobs)
    activeJob.timeoutTimer = setTimeout(() => {
      void this.onJobTimeout(jobId);
    }, isInteractive ? INTERACTIVE_JOB_TIMEOUT_MS : JOB_TIMEOUT_MS);

    // Poll loop: check every POLL_INTERVAL_MS
    activeJob.pollTimer = setInterval(() => {
      this.pollJob(jobId).catch((err) => {
        jobLog(jobId, `pollJob CRASHED: ${String(err)}`);
        console.error(`[executor] pollJob crashed for jobId=${jobId}:`, err);
      });
    }, POLL_INTERVAL_MS);
    jobLog(jobId, `Poll timer started (interval=${POLL_INTERVAL_MS}ms)`);
  }

  // ---------------------------------------------------------------------------
  // Public: Spawn a persistent agent from a job definition
  // ---------------------------------------------------------------------------

  /**
   * Spawns a persistent agent from a company-persistent-jobs definition.
   * Builds a synthetic StartJob-like message and delegates to handlePersistentJob.
   */
  async spawnPersistentAgent(
    job: PersistentAgentJobDefinition,
    companyId: string,
  ): Promise<void> {
    const syntheticMsg = {
      type: "start_job" as const,
      protocolVersion: 1,
      jobId: `persistent-${job.role}-${companyId}`,
      cardId: `persistent-${job.role}`,
      cardType: "persistent_agent" as const,
      complexity: "medium" as const,
      slotType: job.slot_type as SlotType,
      model: job.model,
      role: job.role,
      promptStackMinusSkills: job.prompt_stack_minus_skills,
      roleSkills: job.skills?.length ? job.skills : undefined,
      roleMcpTools: job.mcp_tools?.length ? job.mcp_tools : undefined,
    };

    // Persistent agents don't consume slots — they run alongside dispatched jobs.
    await this.handlePersistentJob(
      `persistent-${job.role}`,
      syntheticMsg as StartJob,
      syntheticMsg.slotType,
      companyId,
    );
  }

  hasPersistentAgent(role: string): boolean {
    return this.persistentAgents.has(role);
  }

  /**
   * Hot-reload a running persistent role.
   * Reuses the normal spawn path so CLAUDE.md assembly and tmux startup stay consistent.
   */
  async reloadPersistentAgent(
    job: PersistentAgentJobDefinition,
    companyId: string,
  ): Promise<void> {
    const existing = this.persistentAgents.get(job.role);
    if (!existing) {
      console.log(`[executor] reloadPersistentAgent skipped — no active agent for role=${job.role}`);
      return;
    }

    const activeJob = this.activeJobs.get(existing.jobId);
    if (activeJob) {
      activeJob.settled = true;
      this.clearJobTimers(activeJob);
      this.activeJobs.delete(existing.jobId);
      // No slots.release — persistent agents don't consume slots
    } else {
      console.warn(
        `[executor] reloadPersistentAgent: active job missing for role=${job.role}, jobId=${existing.jobId}`,
      );
    }

    this.clearPersistentAgent(job.role);
    await this.spawnPersistentAgent(job, companyId);
  }

  // ---------------------------------------------------------------------------
  // Public: MessageInbound
  // ---------------------------------------------------------------------------

  /**
   * Handles an inbound message from an external platform (Slack, Discord, etc.)
   * by formatting it and injecting into the target persistent agent's tmux session.
   * Messages are queued and injected one at a time.
   *
   * Routing: uses msg.role when present; falls back to the single running agent
   * (backward-compatible with single-role deployments where role is omitted).
   */
  handleMessageInbound(msg: MessageInbound): void {
    if (this.persistentAgents.size === 0) {
      console.warn(`[executor] MessageInbound dropped — no persistent agents running. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }

    // Determine target role: explicit > sole running agent (backward compat) > warn
    const targetRole = msg.role
      ?? (this.persistentAgents.size === 1 ? this.persistentAgents.keys().next().value : undefined);

    if (!targetRole) {
      console.warn(`[executor] MessageInbound dropped — multiple persistent agents running but no role specified. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }

    const agent = this.persistentAgents.get(targetRole);
    if (!agent) {
      console.warn(`[executor] MessageInbound dropped — no persistent agent for role=${targetRole}. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }

    const formatted = `[Message from ${msg.from}, conversation:${msg.conversationId}]\n${msg.text}`;
    console.log(`[executor] Queuing inbound message from ${msg.from} for role=${targetRole} session=${agent.tmuxSession}`);
    void this.enqueueMessage(formatted, agent.tmuxSession, agent.startedAt);
  }

  // ---------------------------------------------------------------------------
  // Public: StopJob
  // ---------------------------------------------------------------------------
  // Public: JobUnblocked
  // ---------------------------------------------------------------------------

  /**
   * Handles a job_unblocked message from the orchestrator.
   * For V1: the orchestrator already updated the job context in the DB.
   * If the tmux session is still alive, the agent will pick up the answer
   * from its DB context on next iteration. If the session died, the
   * dispatcher will re-pick the job since it's now back to `executing`.
   */
  async handleJobUnblocked(msg: JobUnblocked): Promise<void> {
    const job = this.activeJobs.get(msg.jobId);
    if (!job) {
      console.log(`[executor] JobUnblocked for unknown jobId=${msg.jobId} — session may have died, dispatcher will re-pick`);
      return;
    }

    console.log(`[executor] JobUnblocked — jobId=${msg.jobId}, session=${job.sessionName} still alive, agent will read answer from DB context`);
  }

  // ---------------------------------------------------------------------------
  // Public: Graceful shutdown
  // ---------------------------------------------------------------------------

  /**
   * Stops all active jobs. Called by the process shutdown handler before
   * disconnecting from Supabase.
   */
  async stopAll(): Promise<void> {
    if (this.reconcileTimer !== null) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    if (this.prMonitorTimer !== null) {
      clearInterval(this.prMonitorTimer);
      this.prMonitorTimer = null;
    }

    // Clear all persistent agents (fires DB status updates + stops heartbeat timers)
    this.clearPersistentAgent();

    // Kill all remaining active tmux sessions and release slots
    for (const [, job] of this.activeJobs) {
      this.clearJobTimers(job);
      await killTmuxSession(job.sessionName);
      if (job.worktreePath && job.repoDir) {
        // TEMP: disabled worktree cleanup for debugging
        // await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
      } else {
        cleanupJobWorkspace(job.jobId, job.workspaceDir);
      }
      this.slots.release(job.slotType);
    }
    this.activeJobs.clear();
  }

  /**
   * Monitors features in pr_ready status for merged PRs.
   * When a PR is detected as merged via `gh` CLI, advances the feature to complete.
   */
  private async monitorMergedPRs(): Promise<void> {
    const { data: features } = await this.supabase
      .from("features")
      .select("id, pr_url, company_id")
      .eq("status", "pr_ready")
      .not("pr_url", "is", null)
      .limit(50);

    if (!features || features.length === 0) return;

    for (const feature of features) {
      try {
        const { stdout } = await execFileAsync("gh", [
          "pr", "view", feature.pr_url!, "--json", "state",
        ], { encoding: "utf8" });
        const { state } = JSON.parse(stdout);

        if (state === "MERGED") {
          const { data: updated } = await this.supabase
            .from("features")
            .update({ status: "complete", completed_at: new Date().toISOString() })
            .eq("id", feature.id)
            .eq("status", "pr_ready") // CAS guard
            .select("id");

          if (updated?.length) {
            await this.supabase.from("events").insert({
              company_id: feature.company_id,
              event_type: "feature_status_changed",
              detail: { featureId: feature.id, from: "pr_ready", to: "complete", reason: "pr_merged" },
            });
            console.log(`[executor] PR merged — feature ${feature.id} → complete`);
          }
        }
      } catch {
        // gh CLI failed — skip, will retry next cycle
      }
    }
  }

  /**
   * Reconciles in-memory active jobs with DB terminal status.
   * This closes slot leaks when jobs are externally marked terminal in the DB
   * without a matching StopJob reaching this daemon.
   */
  private async reconcileSlots(): Promise<void> {
    try {
      const activeJobIds = [...this.activeJobs.values()]
        .filter((job) => !job.settled && !this.isPersistentJob(job.jobId))
        .map((job) => job.jobId);

      // No active non-persistent jobs means there is nothing to reconcile.
      if (activeJobIds.length === 0) return;

      const { data, error } = await this.supabase
        .from("jobs")
        .select("id,status")
        .in("id", activeJobIds);

      if (error) {
        console.warn(`[executor] Slot reconciliation query failed: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) return;

      const terminalStatuses = new Set(["failed", "complete", "cancelled"]);
      for (const row of data as Array<{ id: string; status: string }>) {
        if (!terminalStatuses.has(row.status)) continue;

        const job = this.activeJobs.get(row.id);
        if (!job || job.settled || this.isPersistentJob(job.jobId)) continue;

        console.log(
          `[executor] Slot reconciliation: job ${job.jobId} externally terminated ` +
            `(DB status=${row.status}), releasing slot`
        );
        try {
          await this.teardownReconciledJob(job);
        } catch (teardownErr) {
          console.warn(`[executor] Slot reconciliation teardown failed for job ${job.jobId}: ${String(teardownErr)}`);
        }
      }
    } catch (err) {
      console.warn(`[executor] Slot reconciliation failed: ${String(err)}`);
    }
  }

  private isPersistentJob(jobId: string): boolean {
    return jobId.startsWith("persistent-");
  }

  private async teardownReconciledJob(job: ActiveJob): Promise<void> {
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(job.jobId);

    const sessionAlive = await isTmuxSessionAlive(job.sessionName);
    if (sessionAlive) {
      await killTmuxSession(job.sessionName);
    }

    if (job.worktreePath && job.repoDir) {
      await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(job.jobId, job.workspaceDir);
    }

    this.slots.release(job.slotType);
  }

  // ---------------------------------------------------------------------------
  // Private: Persistent agent (role-agnostic)
  // ---------------------------------------------------------------------------

  /**
   * Handles a start_job for a persistent agent (cardType === "persistent_agent").
   *
   * Unlike regular jobs the persistent session:
   *   - Runs Claude Code in interactive TUI mode (not -p print mode)
   *   - Has no poll/timeout timers — it runs indefinitely until StopJob
   *   - Receives inbound messages via handleMessageInbound (injected into tmux)
   *
   * Before spawning, creates an agent workspace at ~/.zazigv2/{role}-workspace/
   * with a .mcp.json that gives the agent access to the zazig-messaging MCP server.
   * CLAUDE.md content comes from assembleContext(msg) (promptStackMinusSkills with skills inserted).
   */
  private async handlePersistentJob(jobId: string, msg: StartJob, slotType: SlotType, companyId?: string): Promise<void> {
    const role = msg.role ?? "agent";
    const resolvedCompanyId = companyId ?? process.env["ZAZIG_COMPANY_ID"] ?? "";
    const workspaceDir = resolvedCompanyId
      ? join(homedir(), ".zazigv2", `${resolvedCompanyId}-${role}-workspace`)
      : join(homedir(), ".zazigv2", `${role}-workspace`);

    // --- Create agent workspace with .mcp.json ---
    try {
      // Resolve path to the compiled agent-mcp-server.js relative to this file's dist/ location
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const repoRoot = resolveRepoRoot();
      const mcpServerPath = join(thisDir, "agent-mcp-server.js");

      setupJobWorkspace({
        workspaceDir,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId,
        companyId: resolvedCompanyId,
        role,
        claudeMdContent: assembleContext(msg),
        skills: msg.roleSkills,
        repoSkillsDir: join(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join(repoRoot, ".claude", "skills"),
        useSymlinks: true,
        mcpTools: msg.roleMcpTools,
        tmuxSession: `${this.machineId}-${this.companyId ? this.companyId.slice(0, 8) + "-" : ""}${role}`,
      });

      // --- Write prompt freshness metadata for SessionStart hook ---
      // Fetch the raw role prompt to hash — msg.rolePrompt may not be set on
      // persistent agents (synthetic StartJob messages carry promptStackMinusSkills).
      let rolePromptForHash = msg.rolePrompt ?? "";
      if (!rolePromptForHash) {
        const { data: roleRow } = await this.supabase
          .from("roles")
          .select("prompt")
          .eq("name", role)
          .single();
        rolePromptForHash = roleRow?.prompt ?? "";
      }
      const promptHash = createHash("sha256").update(rolePromptForHash).digest("hex");
      writeFileSync(join(workspaceDir, ".role"), role);
      writeFileSync(join(workspaceDir, ".prompt-hash"), promptHash);
      if (resolvedCompanyId) {
        writeFileSync(join(workspaceDir, ".company-id"), resolvedCompanyId);
      }
      writeFileSync(join(workspaceDir, ".claude", ".file-writing-rules"), FILE_WRITING_RULES);

      // Add SessionStart hook to settings.json for prompt freshness checks
      const freshnessScript = join(repoRoot, "packages", "local-agent", "scripts", "check-prompt-freshness.sh");
      const settingsPath = join(workspaceDir, ".claude", "settings.json");
      const existingSettings = JSON.parse(readFileSync(settingsPath, "utf8"));
      existingSettings.hooks = {
        ...existingSettings.hooks,
        SessionStart: [
          { matcher: "", hooks: [{ type: "command", command: `bash ${freshnessScript}` }] },
        ],
      };
      writeFileSync(settingsPath, JSON.stringify(existingSettings, null, 2));

      console.log(`[executor] Persistent agent workspace created at ${workspaceDir}`);

      // Upsert into persistent_agents for observability
      if (resolvedCompanyId) {
        const machineUuid = await this.resolveMachineUuid(resolvedCompanyId);
        if (machineUuid) {
          this.supabase
            .from("persistent_agents")
            .upsert(
              {
                company_id: resolvedCompanyId,
                role,
                machine_id: machineUuid,
                status: "running",
                prompt_stack: msg.promptStackMinusSkills ?? "",
                last_heartbeat: new Date().toISOString(),
              },
              { onConflict: "company_id,role,machine_id" }
            )
            .then(({ error }) => {
              if (error) console.warn(`[executor] Failed to upsert persistent_agents for ${role}: ${error.message}`);
            });
        }
      }
    } catch (err) {
      console.error(`[executor] Persistent agent: failed to create workspace:`, err);
      await this.sendJobFailed(jobId, `Failed to create agent workspace: ${String(err)}`, "agent_crash");
      return;
    }

    // --- Spawn the persistent tmux session in the workspace directory ---
    const companyPrefix = this.companyId ? this.companyId.slice(0, 8) + "-" : "";
    const sessionName = `${this.machineId}-${companyPrefix}${role}`;
    try {
      // Kill any stale session from a previous run
      await killTmuxSession(sessionName);

      const shellCmd = `unset CLAUDECODE; claude --model claude-opus-4-6`;
      const tmuxArgs = [
        "new-session",
        "-d",
        "-s", sessionName,
        "-c", workspaceDir,
        shellCmd,
      ];
      await execFileAsync("tmux", tmuxArgs);

      console.log(`[executor] Spawned persistent ${role} session: ${sessionName} (cwd=${workspaceDir})`);
    } catch (err) {
      console.error(`[executor] Persistent agent: failed to spawn tmux session:`, err);
      await this.sendJobFailed(jobId, `Failed to start agent session: ${String(err)}`, "agent_crash");
      return;
    }

    const spawnedAt = Date.now();

    // Register persistent agent in map keyed by role
    const persistentAgent: ActivePersistentAgent = {
      role,
      tmuxSession: sessionName,
      jobId,
      companyId: resolvedCompanyId,
      heartbeatTimer: null,
      startedAt: spawnedAt,
    };
    this.persistentAgents.set(role, persistentAgent);

    // Start heartbeat timer for persistent_agents table
    if (resolvedCompanyId && this.machineUuid) {
      const uuid = this.machineUuid;
      persistentAgent.heartbeatTimer = setInterval(() => {
        this.supabase
          .from("persistent_agents")
          .update({ last_heartbeat: new Date().toISOString() })
          .eq("company_id", resolvedCompanyId)
          .eq("machine_id", uuid)
          .eq("status", "running")
          .then(({ error }) => {
            if (error) console.warn(`[executor] Heartbeat update failed for persistent_agents: ${error.message}`);
          });
      }, HEARTBEAT_INTERVAL_MS);
    }

    // Track in activeJobs (no poll/timeout timers — persistent agent runs indefinitely)
    this.activeJobs.set(jobId, {
      jobId,
      slotType,
      sessionName,
      pollTimer: null,
      timeoutTimer: null,
      settled: false,
      startedAt: spawnedAt,
      logPath: "",
      lastBytesSent: 0,
      role: msg.role,
    });

    await this.sendJobStatus(jobId, "executing");
    console.log(`[executor] Persistent ${role} session=${sessionName} ready — jobId=${jobId}`);
  }

  // ---------------------------------------------------------------------------

  async handleStopJob(msg: StopJob): Promise<void> {
    const { jobId, reason } = msg;
    console.log(`[executor] handleStopJob — jobId=${jobId}, reason=${reason}`);
    try {
      await this._handleStopJobInner(msg);
    } catch (err) {
      jobLog(jobId, `FATAL handleStopJob crashed: ${String(err)}`);
      console.error(`[executor] FATAL handleStopJob crashed for jobId=${jobId}:`, err);
    }
  }

  private async _handleStopJobInner(msg: StopJob): Promise<void> {
    const { jobId, reason } = msg;

    const job = this.activeJobs.get(jobId);
    if (!job) {
      console.warn(`[executor] StopJob for unknown jobId=${jobId} — sending StopAck anyway`);
      await this.sendStopAck(jobId);
      return;
    }

    // Settle the job to prevent concurrent poll/timeout callbacks from firing
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);

    // Clear persistent agent state if this is a persistent job
    const stoppedPersistentRole = [...this.persistentAgents.values()].find(a => a.jobId === jobId)?.role;
    if (stoppedPersistentRole) {
      this.clearPersistentAgent(stoppedPersistentRole);
    }

    // Kill the tmux session (best-effort)
    await killTmuxSession(job.sessionName);

    // Final log flush before cleanup
    const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
    if (logChunk !== null) {
      const { error: appendErr } = await this.supabase.rpc("append_raw_log", {
        job_id: jobId,
        chunk: logChunk.chunk,
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }

    // Best-effort push: capture work even when stopping early
    if (job.worktreePath && job.jobBranch) {
      try {
        await this.repoManager.pushJobBranch(job.worktreePath, job.jobBranch);
      } catch (pushErr) {
        console.warn(`[executor] handleStopJob: push failed for jobId=${jobId} (best-effort): ${String(pushErr)}`);
      }
    }

    // Clean up log file and worktree
    // deleteLogFile(job.logPath); // Disabled — keeping logs for debugging
    if (job.worktreePath && job.repoDir) {
      // TEMP: disabled worktree cleanup for debugging
      // await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }

    // Release the slot (persistent agents don't consume slots)
    if (!stoppedPersistentRole) {
      this.slots.release(job.slotType);
    }

    // Confirm to orchestrator
    await this.sendStopAck(jobId);
  }

  // ---------------------------------------------------------------------------
  // Private: Poll loop
  // ---------------------------------------------------------------------------

  private async pollJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) {
      jobLog(jobId, `pollJob skipped — job=${job ? "exists" : "missing"}, settled=${job?.settled}`);
      return;
    }

    const alive = await isTmuxSessionAlive(job.sessionName);
    jobLog(jobId, `pollJob — session=${job.sessionName}, alive=${alive}`);
    if (alive) {
      // Write time-based progress estimate (linear over JOB_TIMEOUT_MS, capped at 95)
      const elapsedMs = Date.now() - job.startedAt;
      const progress = Math.min(95, Math.floor((elapsedMs / JOB_TIMEOUT_MS) * 100));

      // Update progress estimate + heartbeat
      const { error: progressErr } = await this.supabase
        .from("jobs")
        .update({ progress, updated_at: new Date().toISOString() })
        .eq("id", jobId);
      if (progressErr) {
        jobLog(jobId, `Progress write failed: ${progressErr.message}`);
        console.warn(`[executor] Progress write failed for jobId=${jobId}: ${progressErr.message}`);
      }

      // Append any new log bytes since the last poll (append-only — avoids resending full log)
      const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
      if (logChunk !== null) {
        const { error: appendErr } = await this.supabase.rpc("append_raw_log", {
          job_id: jobId,
          chunk: logChunk.chunk,
        });
        if (appendErr) {
          console.warn(`[executor] Log append failed for jobId=${jobId}: ${appendErr.message}`);
        } else {
          job.lastBytesSent = logChunk.newOffset;
        }
      }
      jobLog(jobId, `Still running — progress=${progress}`);
      console.log(`[executor] Job still running — jobId=${jobId}, session=${job.sessionName}, progress=${progress}`);
      return;
    }

    // Session is gone — check exit code via tmux last-exit-status if available,
    // but since the session already ended we use presence of output file as a
    // success signal; absence or error output means failure.
    jobLog(jobId, `Tmux session ended — triggering onJobEnded`);
    console.log(`[executor] Tmux session ended — jobId=${jobId}, session=${job.sessionName}`);
    await this.onJobEnded(jobId, false /* not a forced timeout */);
  }

  // ---------------------------------------------------------------------------
  // Private: Timeout
  // ---------------------------------------------------------------------------

  private async onJobTimeout(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) return;

    jobLog(jobId, `TIMEOUT after ${JOB_TIMEOUT_MS / 60_000} min`);
    console.warn(`[executor] Job timed out after ${JOB_TIMEOUT_MS / 60_000} min — jobId=${jobId}`);
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);

    // Clear persistent agent state if this is a persistent job (should not time out, but handle defensively)
    const timedOutPersistentRole = [...this.persistentAgents.values()].find(a => a.jobId === jobId)?.role;
    if (timedOutPersistentRole) {
      this.clearPersistentAgent(timedOutPersistentRole);
    }

    await killTmuxSession(job.sessionName);

    // Final log flush before marking failed
    const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
    if (logChunk !== null) {
      const { error: appendErr } = await this.supabase.rpc("append_raw_log", {
        job_id: jobId,
        chunk: logChunk.chunk,
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }
    // Best-effort push: capture partial work on timeout
    if (job.worktreePath && job.jobBranch) {
      try {
        await this.repoManager.pushJobBranch(job.worktreePath, job.jobBranch);
      } catch (pushErr) {
        console.warn(`[executor] onJobTimeout: push failed for jobId=${jobId} (best-effort): ${String(pushErr)}`);
      }
    }

    // deleteLogFile(job.logPath); // Disabled — keeping logs for debugging
    if (job.worktreePath && job.repoDir) {
      // TEMP: disabled worktree cleanup for debugging
      // await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }

    // Only release slot for non-persistent jobs
    if (!timedOutPersistentRole) {
      this.slots.release(job.slotType);
    }
    await this.sendJobFailed(jobId, "Job exceeded 60-minute timeout", "timeout");
  }

  // ---------------------------------------------------------------------------
  // Private: Job ended (session exited naturally)
  // ---------------------------------------------------------------------------

  private async onJobEnded(jobId: string, _timedOut: boolean): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) {
      jobLog(jobId, `onJobEnded SKIPPED — job=${job ? "exists" : "missing"}, settled=${job?.settled}`);
      return;
    }

    jobLog(jobId, `onJobEnded START — role=${job.role ?? "none"}, worktree=${job.worktreePath ?? "none"}`);

    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);

    // Clear persistent agent state if the persistent session exited unexpectedly
    const exitedPersistentRole = [...this.persistentAgents.values()].find(a => a.jobId === jobId)?.role;
    if (exitedPersistentRole) {
      this.clearPersistentAgent(exitedPersistentRole);
    } else {
      // Only release slot for non-persistent jobs
      this.slots.release(job.slotType);
    }

    // Codex post-execution review: run Haiku to verify the diff before completing.
    // Only applies to codex jobs with a worktree (code-context jobs).
    if (job.slotType === "codex" && job.worktreePath) {
      const reviewResult = await runCodexReview(job, job.spec ?? "", job.acceptanceCriteria ?? "");
      jobLog(jobId, `Codex review: pass=${reviewResult.pass}, reason=${reviewResult.reason}`);
      console.log(`[executor] Codex review for jobId=${jobId}: pass=${reviewResult.pass}, reason=${reviewResult.reason}`);

      if (!reviewResult.pass) {
        // Revert any uncommitted changes
        try {
          await execFileAsync("git", ["checkout", "."], { cwd: job.worktreePath });
          jobLog(jobId, "Reverted uncommitted codex changes via git checkout .");
        } catch (revertErr) {
          jobLog(jobId, `git checkout . failed (non-fatal): ${String(revertErr)}`);
        }
        // Flush log before failing
        const failLogChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
        if (failLogChunk !== null) {
          await this.supabase.rpc("append_raw_log", { job_id: jobId, chunk: failLogChunk.chunk });
        }
        await this.sendJobFailed(jobId, reviewResult.reason, "unknown");
        return;
      }

      // Review passed — commit the changes
      const commitMsg = `codex: ${job.jobTitle ?? jobId}`;
      try {
        await execFileAsync("git", ["add", "-A"], { cwd: job.worktreePath });
        await execFileAsync("git", ["commit", "-m", commitMsg], { cwd: job.worktreePath });
        jobLog(jobId, `Codex changes committed: ${commitMsg}`);
        console.log(`[executor] Codex commit for jobId=${jobId}: "${commitMsg}"`);
      } catch (commitErr) {
        jobLog(jobId, `git commit failed (non-fatal, will still push): ${String(commitErr)}`);
        console.warn(`[executor] Codex commit failed for jobId=${jobId}: ${String(commitErr)}`);
      }
    }

    // Look for the report file. Agents write .claude/cpo-report.md relative to
    // their CWD which is the ephemeral workspace dir (e.g. ~/.zazigv2/job-<id>/).
    // Fall back to $HOME for persistent agents that don't have a workspace dir.
    const homeDir = process.env["HOME"] ?? "/tmp";
    const archiveDir = `${homeDir}/${REPORT_ARCHIVE_DIR}`;
    const jobReportPath = `${archiveDir}/${jobId}.md`;

    // Candidate paths in priority order: worktree first, then legacy workspace dir, then $HOME
    const rpPath = reportRelativePath(job.role);
    const candidatePaths: string[] = [];
    if (job.worktreePath) {
      candidatePaths.push(`${job.worktreePath}/${rpPath}`);
    } else if (job.workspaceDir) {
      candidatePaths.push(`${job.workspaceDir}/${rpPath}`);
    }
    candidatePaths.push(`${homeDir}/${rpPath}`);

    // Fallback: some role prompts write reports under a different filename than
    // the executor's convention ({role}-report.md).  Add known alternates so we
    // find the report regardless of which name the agent used.
    const REPORT_FALLBACKS: Record<string, string> = {
      reviewer: ".claude/verify-report.md",
      deployer: ".claude/deploy-report.md",
      "test-deployer": ".claude/deploy-report.md",
      tester: ".claude/tester-report.md",
    };
    const fallback = job.role ? REPORT_FALLBACKS[job.role] : undefined;
    if (fallback && fallback !== rpPath) {
      if (job.worktreePath) candidatePaths.push(`${job.worktreePath}/${fallback}`);
      else if (job.workspaceDir) candidatePaths.push(`${job.workspaceDir}/${fallback}`);
      candidatePaths.push(`${homeDir}/${fallback}`);
    }

    let result = "NO_REPORT";
    let report: string | undefined;

    jobLog(jobId, `Report search — rpPath=${rpPath}, fallback=${fallback ?? "none"}, candidates=${JSON.stringify(candidatePaths)}`);

    mkdirSync(archiveDir, { recursive: true });
    for (const candidatePath of candidatePaths) {
      try {
        renameSync(candidatePath, jobReportPath);
        report = readFileSync(jobReportPath, "utf-8");
        jobLog(jobId, `Report FOUND at ${candidatePath} (${report.length} chars)`);
        console.log(`[executor] Claimed report for jobId=${jobId} from ${candidatePath} → ${jobReportPath}`);
        break;
      } catch {
        jobLog(jobId, `Report not at ${candidatePath}`);
      }
    }

    if (report) {
      // Check for structured report format (status: pass/success/fail)
      const passMatch = report.match(/^status:\s*(pass|success|fail)\s*$/m);
      if (passMatch) {
        const prefix = passMatch[1] === "fail" ? "FAILED" : "PASSED";
        const reasonMatch = report.match(/^failure_reason:\s*(.+)$/m);
        result = reasonMatch?.[1]?.trim() ? `${prefix}: ${reasonMatch[1].trim()}` : prefix;
      } else {
        // Scan for PASSED/FAILED anywhere in the report (agents sometimes bury it in markdown)
        const passedAnywhere = report.match(/\*?\*?PASSED\*?\*?/);
        const failedAnywhere = report.match(/\*?\*?FAILED\*?\*?/);
        if (passedAnywhere && !failedAnywhere) {
          result = "PASSED";
        } else if (failedAnywhere) {
          result = "FAILED";
        } else {
          // No verdict found in any format — mark as job failure so the pipeline
          // doesn't silently advance on an agent that couldn't complete its work.
          result = "VERDICT_MISSING";
        }
      }
      jobLog(jobId, `Report parsed — result="${result}"`);
    } else {
      jobLog(jobId, `Report NOT FOUND — result="NO_REPORT"`);
      console.log(`[executor] No report file for jobId=${jobId}, result=NO_REPORT`);
    }

    // Final log flush — capture anything written after the last poll tick
    const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
    if (logChunk !== null) {
      const { error: appendErr } = await this.supabase.rpc("append_raw_log", {
        job_id: jobId,
        chunk: logChunk.chunk,
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }
    // deleteLogFile(job.logPath); // Disabled — keeping logs for debugging

    // Push job branch and record in DB before sending JobComplete
    if (job.worktreePath && job.jobBranch) {
      jobLog(jobId, `Pushing branch ${job.jobBranch} from ${job.worktreePath}`);
      try {
        await this.repoManager.pushJobBranch(job.worktreePath, job.jobBranch);
        jobLog(jobId, `Push succeeded for ${job.jobBranch}`);
        console.log(`[executor] Pushed branch ${job.jobBranch} for jobId=${jobId}`);
      } catch (pushErr) {
        jobLog(jobId, `Push FAILED for ${job.jobBranch}: ${String(pushErr)}`);
        console.warn(`[executor] onJobEnded: push failed for jobId=${jobId}: ${String(pushErr)}`);
      }
      await this.supabase.from("jobs").update({ branch: job.jobBranch }).eq("id", jobId);
      try {
        await this.repoManager.removeJobWorktree(job.repoDir!, job.worktreePath);
      } catch (worktreeErr) {
        jobLog(jobId, `Worktree cleanup failed (non-fatal): ${String(worktreeErr)}`);
        console.warn(`[executor] Worktree cleanup failed for jobId=${jobId}: ${String(worktreeErr)}`);
      }

      // Create GitHub PR for combine jobs (after branch push succeeds)
      if (job.cardType === "combine" && job.repoUrl && job.featureBranch) {
        await this.createPRForCombineJob(jobId, job);
      }
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }

    // If the verify report had no verdict, treat as a job failure (not completion)
    if (result === "VERDICT_MISSING") {
      jobLog(jobId, `Sending JobFailed (no verdict) — result="${result}"`);
      try {
        await this.sendJobFailed(jobId, result, "unknown");
        jobLog(jobId, `JobFailed sent successfully`);
      } catch (sendErr) {
        jobLog(jobId, `sendJobFailed FAILED: ${String(sendErr)}`);
        console.error(`[executor] sendJobFailed failed for jobId=${jobId}:`, sendErr);
      }
    } else {
      jobLog(jobId, `Sending JobComplete — result="${result}", hasReport=${!!report}`);
      try {
        await this.sendJobComplete(jobId, result, report);
        jobLog(jobId, `JobComplete sent successfully`);
      } catch (sendErr) {
        jobLog(jobId, `sendJobComplete FAILED: ${String(sendErr)}`);
        console.error(`[executor] sendJobComplete failed for jobId=${jobId}:`, sendErr);
      }
    }

    // Trigger verification pipeline if a callback is registered.
    // The orchestrator may also send a VerifyJob in response to JobComplete,
    // but this hook allows inline verification without a round-trip.
    if (this.afterJobComplete) {
      try {
        await this.afterJobComplete(jobId);
      } catch (err) {
        console.error(`[executor] afterJobComplete failed for jobId=${jobId}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: PR creation for combine jobs
  // ---------------------------------------------------------------------------

  private async createPRForCombineJob(jobId: string, job: ActiveJob): Promise<void> {
    const repoUrl = job.repoUrl!;
    const featureBranch = job.featureBranch!;

    // Look up feature_id and title from the job's DB row
    const { data: jobRow } = await this.supabase
      .from("jobs")
      .select("feature_id")
      .eq("id", jobId)
      .single();

    const featureId = jobRow?.feature_id as string | undefined;
    let featureTitle: string | undefined;

    if (featureId) {
      const { data: feature } = await this.supabase
        .from("features")
        .select("title")
        .eq("id", featureId)
        .single();
      featureTitle = (feature as { title?: string } | null)?.title ?? undefined;
    }

    const match = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) {
      jobLog(jobId, `PR skipped — cannot parse owner/repo from "${repoUrl}"`);
      return;
    }
    const ownerRepo = match[1];
    const prTitle = `feat: ${featureTitle ?? featureId ?? jobId}`;
    const prBody = [
      "## Auto-generated PR",
      "",
      `Feature: ${featureTitle ?? "N/A"}`,
      `Feature ID: ${featureId ?? "N/A"}`,
      "",
      "This PR was automatically created by the zazig pipeline.",
    ].join("\n");

    try {
      const { stdout } = await execFileAsync("gh", [
        "pr", "create",
        "--repo", ownerRepo,
        "--base", "master",
        "--head", featureBranch,
        "--title", prTitle,
        "--body", prBody,
      ], { encoding: "utf8" });
      const prUrl = stdout.trim();
      if (prUrl && featureId) {
        const { data: prWriteData, error: prWriteErr } = await this.supabase.from("features")
          .update({ pr_url: prUrl })
          .eq("id", featureId)
          .select("id");
        if (prWriteErr) {
          jobLog(jobId, `PR URL DB write FAILED for feature ${featureId}: ${prWriteErr.message}`);
          console.error(`[executor] PR URL DB write failed for feature ${featureId}:`, prWriteErr.message);
        } else if (!prWriteData?.length) {
          jobLog(jobId, `PR URL DB write matched 0 rows for feature ${featureId} — possible RLS block`);
          console.warn(`[executor] PR URL DB write matched 0 rows for feature ${featureId} — possible RLS block`);
        } else {
          jobLog(jobId, `PR URL persisted for feature ${featureId}: ${prUrl}`);
        }
      }
      jobLog(jobId, `PR created for feature ${featureId ?? "unknown"}: ${prUrl}`);
      console.log(`[executor] PR created for feature ${featureId ?? "unknown"}: ${prUrl}`);
    } catch (prErr: unknown) {
      jobLog(jobId, `PR creation failed: ${String(prErr)} — checking for existing PR`);
      console.warn(`[executor] PR creation failed for jobId=${jobId}: ${String(prErr)}`);
      // PR may already exist — try to find it
      try {
        const { stdout } = await execFileAsync("gh", [
          "pr", "list",
          "--repo", ownerRepo,
          "--head", featureBranch,
          "--json", "url",
          "--limit", "1",
        ], { encoding: "utf8" });
        const prs = JSON.parse(stdout) as Array<{ url?: string }>;
        if (prs.length > 0 && prs[0].url && featureId) {
          const { data: fallbackData } = await this.supabase.from("features")
            .update({ pr_url: prs[0].url })
            .eq("id", featureId)
            .select("id");
          if (!fallbackData?.length) {
            jobLog(jobId, `PR URL fallback write matched 0 rows for feature ${featureId} — possible RLS block`);
          } else {
            jobLog(jobId, `Found existing PR for feature ${featureId}: ${prs[0].url}`);
          }
          console.log(`[executor] Found existing PR for feature ${featureId}: ${prs[0].url}`);
        }
      } catch { /* best-effort */ }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Message injection queue (ported from SlackChatRouter)
  // ---------------------------------------------------------------------------

  private enqueueMessage(message: string, sessionName: string, startedAt: number, type: "notification" | "human" = "human"): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      enqueueWithCap(this.messageQueue, { text: message, sessionName, startedAt, type, resolve, reject }, MAX_QUEUE_SIZE);
      if (!this.processingQueue) {
        void this.processMessageQueue();
      }
    });
  }

  private async processMessageQueue(): Promise<void> {
    this.processingQueue = true;
    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift()!;
      try {
        await this.injectMessage(item.text, item.sessionName, item.startedAt);
        item.resolve();
      } catch (err) {
        console.error("[executor] Failed to inject message:", err);
        item.reject(err);
      }
    }
    this.processingQueue = false;
  }

  /**
   * Injects a message into a persistent agent's tmux session immediately.
   * Claude Code's interactive TUI auto-queues input — no idle detection needed.
   * If the session just started, waits for CPO_STARTUP_DELAY_MS to let Claude Code initialize.
   */
  private async injectMessage(message: string, sessionName: string, startedAt: number): Promise<void> {
    // Wait for Claude Code to finish initializing if the session just spawned
    const elapsed = Date.now() - startedAt;
    if (elapsed < CPO_STARTUP_DELAY_MS) {
      const wait = CPO_STARTUP_DELAY_MS - elapsed;
      console.log(`[executor] Session ${sessionName} is ${Math.round(elapsed / 1000)}s old — waiting ${Math.round(wait / 1000)}s for startup`);
      await sleep(wait);
    }

    // Normalise newlines — tmux send-keys treats literal \n as Enter
    const singleLine = message.replace(/\r?\n/g, " ");

    // Use -l (literal) flag so control sequences are not interpreted as keystrokes.
    // Send Enter as a separate keystroke.
    await execFileAsync("tmux", ["send-keys", "-t", sessionName, "-l", singleLine]);
    await execFileAsync("tmux", ["send-keys", "-t", sessionName, "Enter"]);

    console.log(`[executor] Injected message into session=${sessionName}`);
  }

  // ---------------------------------------------------------------------------
  // Private: Persistent agent cleanup
  // ---------------------------------------------------------------------------

  /**
   * Marks a persistent agent as stopped in the DB, clears its heartbeat timer,
   * and removes it from the persistentAgents map.
   *
   * @param role - The role key to look up in persistentAgents. If omitted, clears ALL agents.
   */
  private clearPersistentAgent(role?: string): void {
    const agentsToClear = role
      ? (this.persistentAgents.has(role) ? [this.persistentAgents.get(role)!] : [])
      : [...this.persistentAgents.values()];

    for (const agent of agentsToClear) {
      if (agent.heartbeatTimer) {
        clearInterval(agent.heartbeatTimer);
        agent.heartbeatTimer = null;
      }

      if (agent.companyId && this.machineUuid) {
        this.supabase
          .from("persistent_agents")
          .update({ status: "stopped" })
          .eq("company_id", agent.companyId)
          .eq("role", agent.role)
          .eq("machine_id", this.machineUuid)
          .then(({ error }) => {
            if (error) console.warn(`[executor] Failed to update persistent_agents status for role=${agent.role}: ${error.message}`);
          });
      }

      this.persistentAgents.delete(agent.role);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Timer management
  // ---------------------------------------------------------------------------

  private clearJobTimers(job: ActiveJob): void {
    if (job.pollTimer !== null) {
      clearInterval(job.pollTimer);
      job.pollTimer = null;
    }
    if (job.timeoutTimer !== null) {
      clearTimeout(job.timeoutTimer);
      job.timeoutTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Context resolution
  // ---------------------------------------------------------------------------

  private async resolveContext(
    context: string | undefined,
    contextRef: string | undefined
  ): Promise<string> {
    // contextRef takes priority when present (large payloads stored remotely)
    if (contextRef) {
      console.log(`[executor] Fetching context from contextRef: ${contextRef}`);
      const response = await fetch(contextRef);
      if (!response.ok) {
        throw new Error(`Failed to fetch contextRef (HTTP ${response.status}): ${contextRef}`);
      }
      return await response.text();
    }
    if (context) {
      return context;
    }
    throw new Error("StartJob has neither context nor contextRef");
  }

  // ---------------------------------------------------------------------------
  // Private: Message senders
  // ---------------------------------------------------------------------------

  private async sendJobAck(jobId: string): Promise<void> {
    await this.send({
      type: "job_ack",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
    });
  }

  private async sendJobStatus(
    jobId: string,
    status: "executing" | "reviewing" | "complete" | "failed",
    output?: string
  ): Promise<void> {
    // Primary: write directly to DB.
    // Skip for persistent agents — they don't have real job rows (jobId is not a UUID).
    if (!jobId.startsWith("persistent-")) {
      const { error: dbErr } = await this.supabase
        .from("jobs")
        .update({ status })
        .eq("id", jobId);

      if (dbErr) {
        console.warn(`[executor] sendJobStatus DB write failed for jobId=${jobId}: ${dbErr.message}`);
      }
    }

    // Secondary: broadcast via Realtime
    await this.send({
      type: "job_status",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      status,
      ...(output !== undefined ? { output } : {}),
    });
  }

  private async sendJobComplete(
    jobId: string,
    result: string,
    report?: string
  ): Promise<void> {
    // Primary: write directly to DB.
    // Skip for persistent agents — they don't have real job rows (jobId is not a UUID).
    if (!jobId.startsWith("persistent-")) {
      jobLog(jobId, `DB write: status=complete, result="${result.slice(0, 100)}"`);
      const { error: dbErr } = await this.supabase
        .from("jobs")
        .update({
          status: "complete",
          result,
          completed_at: new Date().toISOString(),
          progress: 100,
        })
        .eq("id", jobId);

      if (dbErr) {
        jobLog(jobId, `DB write FAILED: ${dbErr.message}`);
        console.warn(`[executor] sendJobComplete DB write failed for jobId=${jobId}: ${dbErr.message}`);
      } else {
        jobLog(jobId, `DB write succeeded`);
      }
    }

    // Secondary: broadcast via Realtime
    await this.send({
      type: "job_complete",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
      result,
      ...(report !== undefined ? { report } : {}),
    });
  }

  private async sendJobFailed(
    jobId: string,
    error: string,
    failureReason: FailureReason
  ): Promise<void> {
    jobLog(jobId, `FAILED — reason=${failureReason}, error="${error.slice(0, 200)}"`);
    // Primary: write directly to DB — persist error detail in result column.
    // Skip for persistent agents — they don't have real job rows (jobId is not a UUID).
    if (!jobId.startsWith("persistent-")) {
      const { error: dbErr } = await this.supabase
        .from("jobs")
        .update({ status: "failed", result: "FAILED" })
        .eq("id", jobId);

      if (dbErr) {
        jobLog(jobId, `DB write FAILED: ${dbErr.message}`);
        console.warn(`[executor] sendJobFailed DB write failed for jobId=${jobId}: ${dbErr.message}`);
      }
    }

    // Secondary: broadcast via Realtime
    await this.send({
      type: "job_failed",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
      error,
      failureReason,
    });
  }

  private async sendStopAck(jobId: string): Promise<void> {
    await this.send({
      type: "stop_ack",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
    });
  }
}

// ---------------------------------------------------------------------------
// Helper: Codex post-execution Haiku review
// ---------------------------------------------------------------------------

/**
 * Runs a Claude Haiku code review against the git diff produced by a codex job.
 *
 * Flow:
 *   1. git diff HEAD — if empty, returns FAIL "Codex produced no changes"
 *   2. Writes the review prompt to a temp file to avoid ARG_MAX issues
 *   3. Pipes the prompt into `claude --model claude-haiku-4-5-20251001 -p` via cat
 *   4. Parses "PASS" or "FAIL: reason" from the output
 *   5. On any error, returns FAIL with the error message
 */
async function runCodexReview(
  job: ActiveJob,
  jobSpec: string,
  acceptanceCriteria: string,
): Promise<{ pass: boolean; reason: string }> {
  const worktreePath = job.worktreePath!;

  // 1. Check for any changes
  let diff: string;
  try {
    const { stdout } = await execFileAsync("git", ["diff", "HEAD"], { cwd: worktreePath });
    diff = stdout;
  } catch (err) {
    return { pass: false, reason: `git diff failed: ${String(err)}` };
  }

  if (!diff.trim()) {
    return { pass: false, reason: "Codex produced no changes" };
  }

  // 2. Build and write review prompt
  const reviewPrompt = [
    "You are reviewing a code diff produced by an automated coding agent.",
    "## Original Spec",
    jobSpec,
    "## Acceptance Criteria",
    acceptanceCriteria,
    "## Diff",
    diff,
    "PASS if: changes address the spec, no obvious bugs, no placeholder code.",
    "FAIL if: incomplete, obvious errors, unrelated file changes, missed acceptance criteria.",
    "Respond with exactly: PASS or FAIL: reason",
  ].join("\n");

  const reviewPromptPath = join(worktreePath, ".zazig-review-prompt.txt");
  writeFileSync(reviewPromptPath, reviewPrompt, "utf-8");

  // 3. Run Haiku via cat pipe to avoid ARG_MAX
  let reviewOutput: string;
  try {
    const shellCmd = `cat ${shellEscape([reviewPromptPath])} | claude --model claude-haiku-4-5-20251001 -p`;
    const { stdout } = await execFileAsync("bash", ["-c", shellCmd], {
      cwd: worktreePath,
      maxBuffer: 1024 * 1024,
    } as object);
    reviewOutput = stdout.trim();
  } catch (err) {
    return { pass: false, reason: `Haiku review failed: ${String(err)}` };
  }

  // 4. Parse PASS / FAIL
  if (reviewOutput.startsWith("PASS")) {
    return { pass: true, reason: "PASS" };
  }
  const failMatch = reviewOutput.match(/^FAIL:\s*(.+)/s);
  return {
    pass: false,
    reason: failMatch ? failMatch[1].trim() : reviewOutput || "Haiku returned no output",
  };
}

// ---------------------------------------------------------------------------
// Helper: Build CLI command
// ---------------------------------------------------------------------------

/**
 * Determine the CLI binary and arguments based on slot type, complexity, and model.
 *
 * All jobs run through `claude -p` (print mode, exits after completion).
 * For codex slots, Claude delegates to codex-delegate internally (matching v1 pattern
 * where Claude supervises Codex rather than Codex running standalone).
 *
 * Model resolution:
 *   model override from orchestrator → the `model` field takes precedence
 *   slotType=codex                   → claude-sonnet-4-6 (lighter model — Codex does heavy lifting)
 *   complexity=complex               → claude-opus-4-6
 *   otherwise                        → claude-sonnet-4-6
 */

// ---------------------------------------------------------------------------
// Helper: 4-layer context assembly
// ---------------------------------------------------------------------------

/**
 * Resolves the path to a skill's SKILL.md file.
 * Skill names may contain colons (e.g. "commit-commands:commit") which are valid path separators.
 */
function skillFilePath(name: string): string {
  return join(homedir(), ".claude", "skills", name, "SKILL.md");
}

/**
 * Assembles the final agent context from a pre-built promptStackMinusSkills.
 *
 * The orchestrator builds the full prompt stack with a <!-- SKILLS --> marker
 * where skill content belongs. This function:
 *   1. Inserts skill file content at the marker position
 *   2. Appends sub-agent personality instructions (writes to local disk)
 *   3. Appends codex routing instructions if applicable
 *
 * Missing skill files are warned and skipped — they do not fail the job.
 */
function assembleContext(msg: StartJob): string {
  let assembled = msg.promptStackMinusSkills ?? msg.context ?? "";

  // Insert skill content at the marker position
  if (msg.roleSkills && msg.roleSkills.length > 0) {
    const skillParts: string[] = [];
    for (const name of msg.roleSkills) {
      try {
        skillParts.push(readFileSync(skillFilePath(name), "utf8"));
      } catch {
        console.warn(`[executor] Skill file not found, skipping: ${skillFilePath(name)}`);
      }
    }
    const skillContent = skillParts.join("\n\n---\n\n");
    assembled = assembled.replace(SKILLS_MARKER, skillContent);
  } else {
    // No skills — remove the marker and its surrounding separators
    assembled = assembled.replace(`\n\n---\n\n${SKILLS_MARKER}\n\n---\n\n`, "\n\n---\n\n");
  }

  // Sub-agent personality (writes to local disk — must stay local)
  if (msg.subAgentPrompt) {
    const workspaceDir = join(homedir(), ".zazigv2", `job-${msg.jobId}`);
    mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
    const personalityFile = join(workspaceDir, "subagent-personality.md");
    writeFileSync(personalityFile, msg.subAgentPrompt, { encoding: "utf8", mode: 0o600 });
    assembled += `\n\n---\n\n# Sub-Agent Instructions\nWhen spawning sub-agents, begin their prompt with the content of:\n${personalityFile}`;
  }

  // Codex routing (static string, could move server-side later)
  if (msg.slotType === "codex") {
    assembled += `\n\n---\n\n${CODEX_ROUTING_INSTRUCTIONS}`;
  }

  return assembled;
}

function buildCommand(
  slotType: SlotType,
  complexity: string,
  model: string,
  worktreePath?: string,
  promptFilePath?: string,
): { cmd: string; args: string[] } {
  const resolvedModel =
    model && model !== "codex"
      ? model
      : slotType === "codex"
        ? "claude-sonnet-4-6"      // lighter model — Codex does the heavy lifting
        : complexity === "complex"
          ? "claude-opus-4-6"
          : "claude-sonnet-4-6";

  if (slotType === "codex") {
    // Native Codex execution — prompt is passed as a positional CLI arg (not stdin).
    return {
      cmd: "codex",
      args: ["exec", "-m", resolvedModel, "--full-auto", "-C", worktreePath ?? process.cwd(), "--skip-git-repo-check", promptFilePath ?? ""],
    };
  }

  // All non-codex jobs run through claude -p.
  // The prompt is piped via stdin (not passed as CLI arg) to avoid OS
  // argument length limits when context is large.
  return {
    cmd: "claude",
    args: ["--model", resolvedModel, "-p", "--verbose", "--output-format", "stream-json"],
  };
}

// ---------------------------------------------------------------------------
// Helper: Tmux session management
// ---------------------------------------------------------------------------

/**
 * Spawn a new detached tmux session that runs the given command.
 *
 * Session name format: `{machineId}-{jobId}`
 *
 * Equivalent shell:
 *   tmux new-session -d -s <session> <cmd> [args...]
 */
async function spawnTmuxSession(
  sessionName: string,
  cmd: string,
  args: string[],
  cwd?: string,
  promptFile?: string,
): Promise<void> {
  // Combine into a single shell string for tmux new-session.
  // Unset CLAUDECODE so nested `claude -p` sessions don't get blocked by
  // "cannot be launched inside another Claude Code session" detection.
  // When a promptFile is provided, pipe it via stdin to avoid OS argument
  // length limits (ARG_MAX) when the assembled context is large.
  const claudeCmd = shellEscape([cmd, ...args]);
  const shellCmd = promptFile
    ? `unset CLAUDECODE; cat ${shellEscape([promptFile])} | ${claudeCmd}`
    : `unset CLAUDECODE; ${claudeCmd}`;

  const tmuxArgs = [
    "new-session",
    "-d",           // detached
    "-s", sessionName,
    ...(cwd ? ["-c", cwd] : []),
    shellCmd,       // the command the session runs
  ];
  await execFileAsync("tmux", tmuxArgs);
}

/**
 * Kill a tmux session by name. Best-effort: errors are logged but not re-thrown.
 */
async function killTmuxSession(sessionName: string): Promise<void> {
  try {
    await execFileAsync("tmux", ["kill-session", "-t", sessionName]);
    console.log(`[executor] Killed tmux session: ${sessionName}`);
  } catch (err) {
    // Session may already be dead — that's fine
    console.warn(`[executor] Could not kill tmux session ${sessionName}:`, err);
  }
}

/**
 * Returns true if the given tmux session exists and is alive.
 * Uses `tmux has-session -t <name>` which exits 0 if alive, 1 if not.
 */
async function isTmuxSessionAlive(sessionName: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}


function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Helper: Job log capture (tmux pipe-pane)
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the pipe-pane log file for a given job.
 */
function jobLogPath(jobId: string): string {
  return `${JOB_LOG_DIR}/${jobId}-pipe-pane.log`;
}

/**
 * Starts piping the tmux pane's output to a log file via pipe-pane.
 * The pane writes its stdout to the log file on each flush.
 * Call once after the session is created; the pipe runs until the session ends.
 */
async function startPipePane(sessionName: string, logPath: string): Promise<void> {
  // pipe-pane feeds pane output into the given command via stdin.
  // Using `cat >>` appends all output as it arrives.
  // Single-quote the path — jobId is a UUID so this is safe.
  await execFileAsync("tmux", [
    "pipe-pane",
    "-t", sessionName,
    `cat >> '${logPath}'`,
  ]);
}

/**
 * Reads new bytes from the pipe-pane log file starting at `offsetBytes`,
 * strips ANSI escape codes, and returns the cleaned chunk plus the new
 * total file size (to be stored as `lastBytesSent`).
 * Returns null if the file has no new content at or beyond the offset.
 */
function readLogFileFrom(logPath: string, offsetBytes: number): { chunk: string; newOffset: number } | null {
  try {
    const buf = readFileSync(logPath);
    if (buf.length <= offsetBytes) return null;
    const raw = buf.subarray(offsetBytes).toString("utf8");
    // Strip ANSI: CSI sequences, OSC sequences, charset designators, and lone ESCs
    const clean = raw.replace(/\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07]*\x07|[()#][A-Za-z0-9]|.)/g, "");
    if (!clean) return null;
    return { chunk: clean, newOffset: buf.length };
  } catch {
    return null;
  }
}

/**
 * Deletes the job log file. Best-effort — errors are silently ignored.
 */
function deleteLogFile(logPath: string): void {
  try {
    rmSync(logPath);
  } catch {
    // File may not exist or already deleted
  }
}

function cleanupJobWorkspace(jobId: string, workspaceDir?: string): void {
  try {
    const target = workspaceDir && workspaceDir.trim().length > 0
      ? workspaceDir
      : join(homedir(), ".zazigv2", `job-${jobId}`);
    rmSync(target, { recursive: true });
  } catch {
    // workspace may not exist (no subAgentPrompt was written) -- fine
  }
}

// ---------------------------------------------------------------------------
// Helper: Shell escaping
// ---------------------------------------------------------------------------

/**
 * Produce a single shell-safe string by single-quoting each argument
 * (replacing embedded single quotes with '"'"').
 *
 * Example: ["claude", "--model", "opus", "do stuff 'here'"]
 *   → "claude --model opus 'do stuff '\"'\"'here'\"'\"''"
 */
function shellEscape(parts: string[]): string {
  return parts
    .map((p) => `'${p.replace(/'/g, "'\"'\"'")}'`)
    .join(" ");
}
