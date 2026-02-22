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
 *   slotType=codex                     → `codex --full-auto` (exits after completion)
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
import type { StartJob, StopJob, AgentMessage, FailureReason, SlotType, MessageInbound } from "@zazigv2/shared";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { SlotTracker } from "./slots.js";

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

/** Agent workspace directory for CPO (holds .mcp.json for MCP tool access). */
const CPO_WORKSPACE_DIR = join(homedir(), ".zazigv2", "cpo-workspace");

/** Max time to wait for CPO to become idle before dropping a message. */
const INJECT_MAX_WAIT_MS = 5 * 60_000;
/** Poll interval when waiting for CPO idle. */
const INJECT_POLL_INTERVAL_MS = 5_000;

/** Directory where per-job tmux pipe-pane log files are written. */
const JOB_LOG_DIR = "/tmp/zazig-job-logs";

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
  private readonly companyId: string;
  private readonly slots: SlotTracker;
  private readonly send: SendFn;
  private readonly supabase: SupabaseClient;
  private readonly afterJobComplete?: AfterJobCompleteFn;
  private readonly supabaseUrl: string;
  private readonly supabaseAnonKey: string;

  /** Map of jobId → active job state. */
  private readonly activeJobs = new Map<string, ActiveJob>();

  /** jobId of the active CPO persistent agent job, if any. */
  private cpoJobId: string | null = null;

  /** Message queue for injecting into CPO tmux session when idle. */
  private readonly messageQueue: QueuedMessage[] = [];
  private processingQueue = false;

  constructor(
    machineId: string,
    companyId: string,
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

    // --- 2b. Persistent agent (CPO) — separate lifecycle from regular jobs ---
    if (msg.role === "cpo") {
      await this.handleStartCpo(jobId, slotType);
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

    // --- 4. Build command based on complexity/model ---
    const { cmd, args } = buildCommand(slotType, complexity, model, assembledContext);
    const sessionName = `${this.machineId}-${jobId}`;

    // --- 5. Clear stale report before spawning (prevents reading a previous job's report) ---
    const reportPath = `${process.env["HOME"] ?? "/tmp"}/${REPORT_RELATIVE_PATH}`;
    try { unlinkSync(reportPath); } catch { /* no stale report — fine */ }

    // --- 6. Spawn tmux session ---
    try {
      await spawnTmuxSession(sessionName, cmd, args);
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
    if (!this.cpoJobId) {
      console.warn(`[executor] MessageInbound dropped — no CPO job running. from=${msg.from}, conversationId=${msg.conversationId}`);
      return;
    }

    const job = this.activeJobs.get(this.cpoJobId);
    if (!job) {
      console.warn(`[executor] MessageInbound dropped — CPO job not in activeJobs. cpoJobId=${this.cpoJobId}`);
      return;
    }

    const formatted = `[Message from ${msg.from}, conversation:${msg.conversationId}]\n${msg.text}`;
    console.log(`[executor] Queuing inbound message from ${msg.from} for CPO session=${job.sessionName}`);
    void this.enqueueMessage(formatted);
  }

  // ---------------------------------------------------------------------------
  // Public: StopJob
  // ---------------------------------------------------------------------------
  // Public: Graceful shutdown
  // ---------------------------------------------------------------------------

  /**
   * Stops all active jobs. Called by the process shutdown handler before
   * disconnecting from Supabase.
   */
  async stopAll(): Promise<void> {
    this.cpoJobId = null;

    // Kill all remaining active tmux sessions and release slots
    for (const [, job] of this.activeJobs) {
      this.clearJobTimers(job);
      await killTmuxSession(job.sessionName);
      this.slots.release(job.slotType);
    }
    this.activeJobs.clear();
  }

  // ---------------------------------------------------------------------------
  // Private: CPO persistent agent
  // ---------------------------------------------------------------------------

  /**
   * Handles a start_job for the CPO persistent agent (role === "cpo").
   *
   * Unlike regular jobs the CPO session:
   *   - Runs Claude Code in interactive TUI mode (not -p print mode)
   *   - Has no poll/timeout timers — it runs indefinitely until StopJob
   *   - Receives inbound messages via handleMessageInbound (injected into tmux)
   *
   * Before spawning, creates an agent workspace at ~/.zazigv2/cpo-workspace/
   * with a .mcp.json that gives the CPO access to the zazig-messaging MCP server.
   */
  private async handleStartCpo(jobId: string, slotType: SlotType): Promise<void> {
    // --- Create agent workspace with .mcp.json ---
    try {
      mkdirSync(CPO_WORKSPACE_DIR, { recursive: true });

      // Resolve path to the compiled agent-mcp-server.js relative to this file's dist/ location
      const thisDir = dirname(fileURLToPath(import.meta.url));
      const mcpServerPath = join(thisDir, "agent-mcp-server.js");

      const mcpConfig = {
        mcpServers: {
          "zazig-messaging": {
            command: "node",
            args: [mcpServerPath],
            env: {
              SUPABASE_URL: this.supabaseUrl,
              SUPABASE_ANON_KEY: this.supabaseAnonKey,
              ZAZIG_JOB_ID: jobId,
            },
          },
        },
      };

      writeFileSync(
        join(CPO_WORKSPACE_DIR, ".mcp.json"),
        JSON.stringify(mcpConfig, null, 2),
      );
      console.log(`[executor] CPO workspace created at ${CPO_WORKSPACE_DIR}`);
    } catch (err) {
      console.error(`[executor] CPO: failed to create workspace:`, err);
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to create CPO workspace: ${String(err)}`, "agent_crash");
      return;
    }

    // --- Spawn the persistent CPO tmux session in the workspace directory ---
    let sessionName: string;
    try {
      sessionName = await spawnPersistentCpoSession(this.machineId, CPO_WORKSPACE_DIR);
    } catch (err) {
      console.error(`[executor] CPO: failed to spawn tmux session:`, err);
      this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to start CPO session: ${String(err)}`, "agent_crash");
      return;
    }

    this.cpoJobId = jobId;

    // Track in activeJobs (no poll/timeout timers — CPO runs indefinitely)
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
    console.log(`[executor] CPO session=${sessionName} ready — jobId=${jobId}`);
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
    if (jobId === this.cpoJobId) {
      this.cpoJobId = null;
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
    if (jobId === this.cpoJobId) {
      this.cpoJobId = null;
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
    if (jobId === this.cpoJobId) {
      this.cpoJobId = null;
    }

    // Atomically claim the shared report file by renaming it to a per-job path.
    // If two jobs finish simultaneously, only one rename succeeds — the other
    // gets "no report" which is safe (the orchestrator still gets JobComplete).
    const homeDir = process.env["HOME"] ?? "/tmp";
    const reportPath = `${homeDir}/${REPORT_RELATIVE_PATH}`;
    const archiveDir = `${homeDir}/${REPORT_ARCHIVE_DIR}`;
    const jobReportPath = `${archiveDir}/${jobId}.md`;

    let result = "Job completed.";
    let report: string | undefined;

    try {
      mkdirSync(archiveDir, { recursive: true });
      renameSync(reportPath, jobReportPath);
      report = readFileSync(jobReportPath, "utf-8");
      result = report.split("\n")[0] ?? "Job completed.";
      console.log(`[executor] Claimed report for jobId=${jobId} → ${jobReportPath}`);
    } catch {
      // rename failed → no report file, or another job already claimed it
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
        await this.injectWhenIdle(item.text);
        item.resolve();
      } catch (err) {
        console.error("[executor] Failed to inject message:", err);
        item.reject(err);
      }
    }
    this.processingQueue = false;
  }

  /**
   * Waits for the CPO tmux session to be idle, then injects the message.
   * Polls every INJECT_POLL_INTERVAL_MS up to INJECT_MAX_WAIT_MS before dropping.
   */
  private async injectWhenIdle(message: string): Promise<void> {
    const cpoJob = this.cpoJobId ? this.activeJobs.get(this.cpoJobId) : null;
    if (!cpoJob) {
      console.warn("[executor] injectWhenIdle: no CPO job — dropping message");
      return;
    }

    const deadline = Date.now() + INJECT_MAX_WAIT_MS;
    let idle = false;

    while (Date.now() < deadline) {
      if (await isCpoIdle(cpoJob.sessionName)) {
        idle = true;
        break;
      }
      console.log(`[executor] CPO busy — waiting ${INJECT_POLL_INTERVAL_MS / 1000}s before retry`);
      await sleep(INJECT_POLL_INTERVAL_MS);
    }

    if (!idle) {
      console.warn(`[executor] CPO still busy after ${INJECT_MAX_WAIT_MS / 60_000} min — dropping message`);
      return;
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
 * Decision table (slotType is the primary routing signal):
 *   slotType=codex       → `codex --full-auto` (auto-exits after completion)
 *   slotType=claude_code → `claude -p` with the resolved model (print mode, exits after completion)
 *
 * Model resolution (for claude CLI):
 *   model override from orchestrator → the `model` field takes precedence
 *   complexity=complex               → claude-opus-4-6
 *   otherwise                        → claude-sonnet-4-6
 *
 * Non-interactive execution:
 *   - `claude -p "<task>"` — print mode: processes the task and exits (no REPL)
 *   - `codex --full-auto "<task>"` — full-auto mode: completes and exits
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
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, "subagent-personality.md"), subAgentPrompt, "utf8");
    parts.push(`# Sub-Agent Instructions\nWhen spawning sub-agents, begin their prompt with the content of:\n~/.zazigv2/job-${jobId}/subagent-personality.md`);
  }

  parts.push(taskContext);

  return parts.join("\n\n---\n\n");
}

function buildCommand(
  slotType: SlotType,
  complexity: string,
  model: string,
  context: string
): { cmd: string; args: string[] } {
  // slotType is the authoritative signal for which CLI to use.
  // The orchestrator sets slotType to match the allocated slot, even when
  // a simple job falls back from codex to claude_code.
  if (slotType === "codex") {
    // codex CLI: `codex --full-auto "<task>"` — exits after completion
    return { cmd: "codex", args: ["--full-auto", context] };
  }

  // claude CLI: `claude -p "<task>" --model <model>`
  // -p (print mode) processes the task and exits — no interactive REPL.
  // The orchestrator already selects the correct model; we honour it.
  // Fallback based on local complexity if model is somehow unset.
  const resolvedModel =
    model && model !== "codex"
      ? model
      : complexity === "complex"
        ? "claude-opus-4-6"
        : "claude-sonnet-4-6";

  return {
    cmd: "claude",
    args: ["-p", context, "--model", resolvedModel],
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
  args: string[]
): Promise<void> {
  // Combine into a single shell string for tmux new-session.
  // Unset CLAUDECODE so nested `claude -p` sessions don't get blocked by
  // "cannot be launched inside another Claude Code session" detection.
  const shellCmd = `unset CLAUDECODE; ${shellEscape([cmd, ...args])}`;

  await execFileAsync("tmux", [
    "new-session",
    "-d",           // detached
    "-s", sessionName,
    shellCmd,       // the command the session runs
  ]);
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

/**
 * Spawn a persistent Claude Code session in interactive REPL mode for the CPO role.
 *
 * Unlike job sessions (which use `claude -p` and exit after completion), the CPO
 * session runs the interactive Claude Code TUI and stays alive indefinitely,
 * receiving inbound messages via `tmux send-keys` from handleMessageInbound.
 *
 * Session name: `{machineId}-cpo`
 * Model: claude-opus-4-6 (reasoning-grade for product decisions)
 *
 * If a session with the same name already exists it is killed first (clean restart).
 *
 * @param machineId Machine identifier for session naming.
 * @param workingDir Optional working directory — Claude Code picks up .mcp.json from cwd.
 * @returns The tmux session name (`{machineId}-cpo`)
 */
export async function spawnPersistentCpoSession(machineId: string, workingDir?: string): Promise<string> {
  const sessionName = `${machineId}-cpo`;

  // Kill any stale session from a previous run
  await killTmuxSession(sessionName);

  // Claude Code interactive TUI — no -p flag, stays in REPL
  // Model flag selects opus-4-6 for CPO-grade reasoning
  const shellCmd = `unset CLAUDECODE; claude --model claude-opus-4-6`;

  const tmuxArgs = [
    "new-session",
    "-d",             // detached
    "-s", sessionName,
    ...(workingDir ? ["-c", workingDir] : []),
    shellCmd,
  ];

  await execFileAsync("tmux", tmuxArgs);

  console.log(`[executor] Spawned persistent CPO session: ${sessionName}${workingDir ? ` (cwd=${workingDir})` : ""}`);
  return sessionName;
}

// ---------------------------------------------------------------------------
// Helper: CPO idle detection
// ---------------------------------------------------------------------------

/**
 * Returns true when the CPO's tmux pane shows the Claude Code prompt,
 * indicating it is idle and waiting for input.
 *
 * Claude Code's interactive prompt shows `❯` (or `>` in older versions)
 * on a visible line. Also accepts `$` / `%` as shell fallback.
 */
async function isCpoIdle(sessionName: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("tmux", [
      "capture-pane",
      "-t", sessionName,
      "-p",   // print to stdout
    ]);

    // Claude Code renders a status bar below the ❯ prompt line —
    // scan all lines for the prompt marker, not just the last line.
    const lines = stdout.trimEnd().split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[❯>]\s*$/.test(trimmed)) return true;
    }
    // Shell fallback: check last non-empty line for $ or %
    for (let i = lines.length - 1; i >= 0; i--) {
      const trimmed = lines[i]!.trim();
      if (!trimmed) continue;
      return /[$%]\s*$/.test(trimmed);
    }
    return false;
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
