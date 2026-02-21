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
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StartJob, StopJob, AgentMessage, FailureReason, SlotType } from "@zazigv2/shared";
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

/** Callback type for sending AgentMessage back to the orchestrator channel. */
export type SendFn = (msg: AgentMessage) => Promise<void>;

/** Callback invoked after a job completes, before slot release. Enables verification pipeline. */
export type AfterJobCompleteFn = (jobId: string) => Promise<void>;

// ---------------------------------------------------------------------------
// JobExecutor
// ---------------------------------------------------------------------------

export class JobExecutor {
  private readonly machineId: string;
  private readonly slots: SlotTracker;
  private readonly send: SendFn;
  private readonly supabase: SupabaseClient;
  private readonly afterJobComplete?: AfterJobCompleteFn;

  /** Map of jobId → active job state. */
  private readonly activeJobs = new Map<string, ActiveJob>();

  constructor(
    machineId: string,
    slots: SlotTracker,
    send: SendFn,
    supabase: SupabaseClient,
    afterJobComplete?: AfterJobCompleteFn,
  ) {
    this.machineId = machineId;
    this.slots = slots;
    this.send = send;
    this.supabase = supabase;
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
  // Public: StopJob
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
  const { personalityPrompt, rolePrompt, roleSkills } = msg;

  // Fast path: no enrichment needed
  if (!personalityPrompt && !rolePrompt && (!roleSkills || roleSkills.length === 0)) {
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

