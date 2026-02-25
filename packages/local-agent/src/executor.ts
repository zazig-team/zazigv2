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
 *   slotType=codex                     → `claude -p` (sonnet, with codex-delegate routing)
 *   slotType=claude_code               → `claude -p` (print mode, model from orchestrator)
 *   role != null (persistent agents)   → `claude -p` (claude-opus-4-6, print mode)
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync, renameSync, unlinkSync, mkdirSync, rmSync } from "node:fs";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StartJob, StopJob, AgentMessage, FailureReason, SlotType, MessageInbound, JobUnblocked } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { SlotTracker } from "./slots.js";
import { setupJobWorkspace } from "./workspace.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Poll the tmux session every 30 s to check for completion. */
const POLL_INTERVAL_MS = 30_000;

/** Kill the job after 60 minutes regardless of status. */
const JOB_TIMEOUT_MS = 60 * 60_000;

/** Shared report file written by claude/codex agents. */
const REPORT_RELATIVE_PATH = ".claude/cpo-report.md";

/** Per-job report directory to prevent concurrent-completion races. */
const REPORT_ARCHIVE_DIR = ".claude/job-reports";


/** Delay after CPO session spawn before allowing message injection (Claude Code startup). */
const CPO_STARTUP_DELAY_MS = 15_000;

/** Directory where per-job tmux pipe-pane log files are written. */
const JOB_LOG_DIR = "/tmp/zazig-job-logs";

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

/** Completion instructions injected into context for all jobs. */
const COMPLETION_INSTRUCTIONS = `## On Completion

Write your results to .claude/cpo-report.md including what was done and any issues.
Commit all work, then exit.`;

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
}

interface QueuedMessage {
  text: string;
  resolve: () => void;
  reject: (err: unknown) => void;
}

/** Callback type for sending AgentMessage back to the orchestrator channel. */
export type SendFn = (msg: AgentMessage) => Promise<void>;

/** Callback invoked after a job completes, before slot release. Enables verification pipeline. */
export type AfterJobCompleteFn = (jobId: string) => Promise<void>;

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

  /** jobId of the active CPO persistent agent job, if any. */
  private persistentJobId: string | null = null;

  /** Message queue for injecting into CPO tmux session when idle. */
  private readonly messageQueue: QueuedMessage[] = [];
  private processingQueue = false;

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
  }

  // ---------------------------------------------------------------------------
  // Public: StartJob
  // ---------------------------------------------------------------------------

  async handleStartJob(msg: StartJob): Promise<void> {
    const { jobId, slotType, complexity, context, contextRef, model } = msg;

    console.log(
      `[executor] handleStartJob — jobId=${jobId}, slotType=${slotType}, ` +
        `complexity=${complexity}, model=${model}`
    );

    // --- 1. Acquire slot (throws if none available) ---
    try {
      this.slots.acquire(slotType);
    } catch (err) {
      console.error(`[executor] No slot available for jobId=${jobId}:`, err);
      await this.sendJobFailed(jobId, `No available slot: ${String(err)}`, "unknown");
      return;
    }

    // --- 2. Send JobAck immediately to confirm delivery ---
    await this.sendJobAck(jobId);

    // --- 2b. Persistent agent — separate lifecycle from regular jobs ---
    if (msg.cardType === "persistent_agent" || msg.role === "cpo") {
      await this.handlePersistentJob(jobId, msg, slotType);
      return;
    }

    // --- 3. Resolve context (inline or remote ref) ---
    let taskContext: string;
    try {
      taskContext = await this.resolveContext(context, contextRef);
    } catch (err) {
      console.error(`[executor] Failed to resolve context for jobId=${jobId}:`, err);
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to resolve context: ${String(err)}`, "unknown");
      return;
    }

    // --- 3b. Assemble 4-layer context: personality → role → skills → task ---
    // Order follows U-shaped LLM attention (Tolibear): highest-priority content first and last.
    // Backward compat: if no personalityPrompt/rolePrompt/roleSkills, taskContext passes through unchanged.
    const assembledContext = assembleContext(msg, taskContext);

    console.log(`[executor] Assembled context for jobId=${jobId}:\n${assembledContext}`);

    // --- 3c. Persist assembled context to DB for debugging ---
    this.supabase
      .from("jobs")
      .update({ assembled_context: assembledContext })
      .eq("id", jobId)
      .then(({ error }) => {
        if (error) console.warn(`[executor] Failed to save assembled_context for jobId=${jobId}: ${error.message}`);
      });

    // --- 3d. Set up workspace for role-based ephemeral jobs ---
    let ephemeralWorkspaceDir: string | undefined;
    if (msg.role) {
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const mcpServerPath = join(thisDir, "agent-mcp-server.js");
      ephemeralWorkspaceDir = join(homedir(), ".zazigv2", `job-${jobId}`);

      try {
        setupJobWorkspace({
          workspaceDir: ephemeralWorkspaceDir,
          mcpServerPath,
          supabaseUrl: this.supabaseUrl,
          supabaseAnonKey: this.supabaseAnonKey,
          jobId,
          role: msg.role,
          claudeMdContent: assembledContext,
          skills: msg.roleSkills,
          repoSkillsDir: join(process.cwd(), "projects", "skills"),
        });
        console.log(`[executor] Ephemeral workspace created at ${ephemeralWorkspaceDir} for role=${msg.role}`);
      } catch (err) {
        console.warn(`[executor] Failed to create ephemeral workspace for jobId=${jobId}: ${String(err)}`);
        // Non-fatal — job can still run without workspace
        ephemeralWorkspaceDir = undefined;
      }
    }

    // --- 4. Build command based on complexity/model ---
    const { cmd, args } = buildCommand(slotType, complexity, model);
    const sessionName = `${this.machineId}-${jobId}`;

    // --- 4b. Write prompt to file (piped via stdin to avoid CLI arg length limits) ---
    const promptDir = ephemeralWorkspaceDir ?? join(homedir(), ".zazigv2", `job-${jobId}`);
    mkdirSync(promptDir, { recursive: true });
    const promptFilePath = join(promptDir, ".zazig-prompt.txt");
    writeFileSync(promptFilePath, assembledContext);

    // --- 5. Clear stale report before spawning (prevents reading a previous job's report) ---
    const reportPath = `${process.env["HOME"] ?? "/tmp"}/${REPORT_RELATIVE_PATH}`;
    try { unlinkSync(reportPath); } catch { /* no stale report — fine */ }

    // --- 6. Spawn tmux session ---
    try {
      await spawnTmuxSession(sessionName, cmd, args, ephemeralWorkspaceDir, promptFilePath);
    } catch (err) {
      console.error(`[executor] Failed to spawn tmux session for jobId=${jobId}:`, err);
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to start tmux session: ${String(err)}`, "agent_crash");
      return;
    }

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
    };
    this.activeJobs.set(jobId, activeJob);

    // Timeout: kill after JOB_TIMEOUT_MS
    activeJob.timeoutTimer = setTimeout(() => {
      void this.onJobTimeout(jobId);
    }, JOB_TIMEOUT_MS);

    // Poll loop: check every POLL_INTERVAL_MS
    activeJob.pollTimer = setInterval(() => {
      void this.pollJob(jobId);
    }, POLL_INTERVAL_MS);
  }

  // ---------------------------------------------------------------------------
  // Public: MessageInbound
  // ---------------------------------------------------------------------------

  /**
   * Handles an inbound message from an external platform (Slack, Discord, etc.)
   * by formatting it and injecting into the CPO's tmux session.
   * Messages are queued and injected one at a time, waiting for CPO idle state.
   */
  handleMessageInbound(msg: MessageInbound): void {
    if (!this.persistentJobId) {
      console.warn(`[executor] MessageInbound dropped — no CPO job running. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }

    const job = this.activeJobs.get(this.persistentJobId);
    if (!job) {
      console.warn(`[executor] MessageInbound dropped — CPO job not in activeJobs. persistentJobId=${this.persistentJobId}`);
      return;
    }

    const formatted = `[Message from ${msg.from}, conversation:${msg.conversationId}]\n${msg.text}`;
    console.log(`[executor] Queuing inbound message from ${msg.from} for CPO session=${job.sessionName}`);
    void this.enqueueMessage(formatted);
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
    this.persistentJobId = null;

    // Kill all remaining active tmux sessions and release slots
    for (const [jobId, job] of this.activeJobs) {
      this.clearJobTimers(job);
      await killTmuxSession(job.sessionName);
      cleanupJobWorkspace(jobId);
      this.slots.release(job.slotType);
    }
    this.activeJobs.clear();
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
   * CLAUDE.md content comes from msg.context (pre-assembled by orchestrator).
   */
  private async handlePersistentJob(jobId: string, msg: StartJob, slotType: SlotType): Promise<void> {
    const role = msg.role ?? "agent";
    const workspaceDir = join(homedir(), ".zazigv2", `${role}-workspace`);

    // --- Create agent workspace with .mcp.json ---
    try {
      // Resolve path to the compiled agent-mcp-server.js relative to this file's dist/ location
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const mcpServerPath = join(thisDir, "agent-mcp-server.js");

      setupJobWorkspace({
        workspaceDir,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId,
        role,
        claudeMdContent: msg.context ?? "",
      });

      // Persist context to DB for observability (fire-and-forget)
      this.supabase
        .from("jobs")
        .update({ prompt_stack: msg.context ?? "" })
        .eq("id", jobId)
        .then(({ error }) => {
          if (error) console.warn(`[executor] Failed to save prompt_stack for jobId=${jobId}: ${error.message}`);
        });

      console.log(`[executor] Persistent agent workspace created at ${workspaceDir}`);
    } catch (err) {
      console.error(`[executor] Persistent agent: failed to create workspace:`, err);
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to create agent workspace: ${String(err)}`, "agent_crash");
      return;
    }

    // --- Spawn the persistent tmux session in the workspace directory ---
    const sessionName = `${this.machineId}-${role}`;
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
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to start agent session: ${String(err)}`, "agent_crash");
      return;
    }

    this.persistentJobId = jobId;

    // Track in activeJobs (no poll/timeout timers — persistent agent runs indefinitely)
    this.activeJobs.set(jobId, {
      jobId,
      slotType,
      sessionName,
      pollTimer: null,
      timeoutTimer: null,
      settled: false,
      startedAt: Date.now(),
      logPath: "",
      lastBytesSent: 0,
    });

    await this.sendJobStatus(jobId, "executing");
    console.log(`[executor] Persistent ${role} session=${sessionName} ready — jobId=${jobId}`);
  }

  // ---------------------------------------------------------------------------

  async handleStopJob(msg: StopJob): Promise<void> {
    const { jobId, reason } = msg;
    console.log(`[executor] handleStopJob — jobId=${jobId}, reason=${reason}`);

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

    // Clear CPO job ID if this is the CPO job
    if (jobId === this.persistentJobId) {
      this.persistentJobId = null;
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

    // Clean up log file
    deleteLogFile(job.logPath);
    cleanupJobWorkspace(jobId);

    // Release the slot
    this.slots.release(job.slotType);

    // Confirm to orchestrator
    await this.sendStopAck(jobId);
  }

  // ---------------------------------------------------------------------------
  // Private: Poll loop
  // ---------------------------------------------------------------------------

  private async pollJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) return;

    const alive = await isTmuxSessionAlive(job.sessionName);
    if (alive) {
      // Write time-based progress estimate (linear over JOB_TIMEOUT_MS, capped at 95)
      const elapsedMs = Date.now() - job.startedAt;
      const progress = Math.min(95, Math.floor((elapsedMs / JOB_TIMEOUT_MS) * 100));

      // Update progress estimate
      const { error: progressErr } = await this.supabase
        .from("jobs")
        .update({ progress })
        .eq("id", jobId);
      if (progressErr) {
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
      console.log(`[executor] Job still running — jobId=${jobId}, session=${job.sessionName}, progress=${progress}`);
      return;
    }

    // Session is gone — check exit code via tmux last-exit-status if available,
    // but since the session already ended we use presence of output file as a
    // success signal; absence or error output means failure.
    console.log(`[executor] Tmux session ended — jobId=${jobId}, session=${job.sessionName}`);
    await this.onJobEnded(jobId, false /* not a forced timeout */);
  }

  // ---------------------------------------------------------------------------
  // Private: Timeout
  // ---------------------------------------------------------------------------

  private async onJobTimeout(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) return;

    console.warn(`[executor] Job timed out after ${JOB_TIMEOUT_MS / 60_000} min — jobId=${jobId}`);
    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);

    // Clear CPO job ID if this is the CPO job (should not time out, but handle defensively)
    if (jobId === this.persistentJobId) {
      this.persistentJobId = null;
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
    deleteLogFile(job.logPath);
    cleanupJobWorkspace(jobId);

    this.slots.release(job.slotType);
    await this.sendJobFailed(jobId, "Job exceeded 60-minute timeout", "timeout");
  }

  // ---------------------------------------------------------------------------
  // Private: Job ended (session exited naturally)
  // ---------------------------------------------------------------------------

  private async onJobEnded(jobId: string, _timedOut: boolean): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job || job.settled) return;

    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);
    this.slots.release(job.slotType);

    // Clear CPO job ID if the CPO session exited unexpectedly
    if (jobId === this.persistentJobId) {
      this.persistentJobId = null;
    }

    // Look for the report file. Agents write .claude/cpo-report.md relative to
    // their CWD which is the ephemeral workspace dir (e.g. ~/.zazigv2/job-<id>/).
    // Fall back to $HOME for persistent agents that don't have a workspace dir.
    const homeDir = process.env["HOME"] ?? "/tmp";
    const archiveDir = `${homeDir}/${REPORT_ARCHIVE_DIR}`;
    const jobReportPath = `${archiveDir}/${jobId}.md`;

    // Candidate paths in priority order: workspace dir first, then $HOME
    const candidatePaths: string[] = [];
    if (job.workspaceDir) {
      candidatePaths.push(`${job.workspaceDir}/${REPORT_RELATIVE_PATH}`);
    }
    candidatePaths.push(`${homeDir}/${REPORT_RELATIVE_PATH}`);

    let result = "Job completed.";
    let report: string | undefined;

    mkdirSync(archiveDir, { recursive: true });
    for (const candidatePath of candidatePaths) {
      try {
        renameSync(candidatePath, jobReportPath);
        report = readFileSync(jobReportPath, "utf-8");
        result = report.split("\n")[0] ?? "Job completed.";
        console.log(`[executor] Claimed report for jobId=${jobId} from ${candidatePath} → ${jobReportPath}`);
        break;
      } catch {
        // This candidate didn't have a report — try next
      }
    }
    if (!report) {
      console.log(`[executor] No report file for jobId=${jobId}, using default result`);
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
    deleteLogFile(job.logPath);
    cleanupJobWorkspace(jobId);

    await this.sendJobComplete(jobId, result, report);

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
  // Private: Message injection queue (ported from SlackChatRouter)
  // ---------------------------------------------------------------------------

  private enqueueMessage(message: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.messageQueue.push({ text: message, resolve, reject });
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
        await this.injectMessage(item.text);
        item.resolve();
      } catch (err) {
        console.error("[executor] Failed to inject message:", err);
        item.reject(err);
      }
    }
    this.processingQueue = false;
  }

  /**
   * Injects a message into the CPO tmux session immediately.
   * Claude Code's interactive TUI auto-queues input — no idle detection needed.
   * If the session just started, waits for CPO_STARTUP_DELAY_MS to let Claude Code initialize.
   */
  private async injectMessage(message: string): Promise<void> {
    const cpoJob = this.persistentJobId ? this.activeJobs.get(this.persistentJobId) : null;
    if (!cpoJob) {
      console.warn("[executor] injectMessage: no CPO job — dropping message");
      return;
    }

    // Wait for Claude Code to finish initializing if the session just spawned
    const elapsed = Date.now() - cpoJob.startedAt;
    if (elapsed < CPO_STARTUP_DELAY_MS) {
      const wait = CPO_STARTUP_DELAY_MS - elapsed;
      console.log(`[executor] CPO session is ${Math.round(elapsed / 1000)}s old — waiting ${Math.round(wait / 1000)}s for startup`);
      await sleep(wait);
    }

    // Normalise newlines — tmux send-keys treats literal \n as Enter
    const singleLine = message.replace(/\r?\n/g, " ");

    // Use -l (literal) flag so control sequences are not interpreted as keystrokes.
    // Send Enter as a separate keystroke.
    await execFileAsync("tmux", ["send-keys", "-t", cpoJob.sessionName, "-l", singleLine]);
    await execFileAsync("tmux", ["send-keys", "-t", cpoJob.sessionName, "Enter"]);

    console.log(`[executor] Injected message into CPO session=${cpoJob.sessionName}`);
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
    // Primary: write directly to DB
    const { error: dbErr } = await this.supabase
      .from("jobs")
      .update({ status })
      .eq("id", jobId);

    if (dbErr) {
      console.warn(`[executor] sendJobStatus DB write failed for jobId=${jobId}: ${dbErr.message}`);
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
    // Primary: write directly to DB
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
      console.warn(`[executor] sendJobComplete DB write failed for jobId=${jobId}: ${dbErr.message}`);
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
    // Primary: write directly to DB — persist error detail in result column
    const { error: dbErr } = await this.supabase
      .from("jobs")
      .update({ status: "failed", result: `FAILED: ${error}` })
      .eq("id", jobId);

    if (dbErr) {
      console.warn(`[executor] sendJobFailed DB write failed for jobId=${jobId}: ${dbErr.message}`);
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
 * Assembles the 4-layer context stack from a StartJob message and the resolved task context.
 *
 * Layer order (U-shaped LLM attention — highest priority first and last):
 *   1. personalityPrompt — who the agent is (Layer 1)
 *   2. rolePrompt        — what the agent is operationally responsible for (Layer 2)
 *   3. skill content     — tools and skills the agent has (Layer 3)
 *   4. taskContext       — the actual task (Layer 4)
 *
 * Backward compatible: if no layers are present, returns taskContext unchanged.
 * Missing skill files are warned and skipped — they do not fail the job.
 */
function assembleContext(msg: StartJob, taskContext: string): string {
  const { personalityPrompt, rolePrompt, roleSkills, subAgentPrompt, jobId } = msg;

  // Fast path: no enrichment needed
  if (!personalityPrompt && !rolePrompt && (!roleSkills || roleSkills.length === 0) && !subAgentPrompt) {
    return taskContext;
  }

  const parts: string[] = [];

  if (personalityPrompt) {
    parts.push(personalityPrompt);
  }

  if (rolePrompt) {
    parts.push(rolePrompt);
  }

  if (roleSkills && roleSkills.length > 0) {
    for (const name of roleSkills) {
      const filePath = skillFilePath(name);
      try {
        const content = readFileSync(filePath, "utf8");
        parts.push(content);
      } catch {
        console.warn(`[executor] Skill file not found, skipping: ${filePath}`);
      }
    }
  }

  // Sub-agent personality: write to disk and inject forward instruction
  if (subAgentPrompt) {
    const workspaceDir = join(homedir(), ".zazigv2", `job-${jobId}`);
    mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
    const personalityFile = join(workspaceDir, "subagent-personality.md");
    writeFileSync(personalityFile, subAgentPrompt, { encoding: "utf8", mode: 0o600 });
    parts.push(`# Sub-Agent Instructions\nWhen spawning sub-agents, begin their prompt with the content of:\n${personalityFile}`);
  }

  // Codex routing: Claude supervises, Codex does the heavy lifting (matches v1 pattern)
  if (msg.slotType === "codex") {
    parts.push(CODEX_ROUTING_INSTRUCTIONS);
  }

  parts.push(taskContext);

  // Completion instructions for all jobs (improves report quality)
  parts.push(COMPLETION_INSTRUCTIONS);

  return parts.join("\n\n---\n\n");
}

function buildCommand(
  slotType: SlotType,
  complexity: string,
  model: string,
): { cmd: string; args: string[] } {
  // All jobs run through claude -p. For codex slots, Claude delegates
  // to codex-delegate internally (matching v1 pattern).
  // The prompt is piped via stdin (not passed as CLI arg) to avoid OS
  // argument length limits when context is large.
  const resolvedModel =
    model && model !== "codex"
      ? model
      : slotType === "codex"
        ? "claude-sonnet-4-6"      // lighter model — Codex does the heavy lifting
        : complexity === "complex"
          ? "claude-opus-4-6"
          : "claude-sonnet-4-6";

  return {
    cmd: "claude",
    args: ["--model", resolvedModel, "-p"],
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
  return `${JOB_LOG_DIR}/${jobId}.log`;
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

function cleanupJobWorkspace(jobId: string): void {
  try {
    rmSync(join(homedir(), ".zazigv2", `job-${jobId}`), { recursive: true });
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
