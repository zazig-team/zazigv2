/**
 * executor.ts — Job execution manager
 *
 * Handles the lifecycle of AI agent jobs claimed by the orchestrator:
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

import { execFile, execFileSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, unlinkSync, mkdirSync, rmSync, symlinkSync, appendFileSync, createWriteStream, statSync } from "node:fs";
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
import { generateExecSkill, publishSharedExecSkill, setupJobWorkspace, writeSubagentsConfig } from "./workspace.js";
import { extractFailureSummary, extractWorkspaceName } from "./ci-log-extractor.js";

/**
 * Resolve the MCP server path — prefers compiled binary in ~/.zazigv2/bin/,
 * then bundled .mjs (production), then tsc-compiled .js (dev mode).
 */
function resolveMcpServerPath(): string {
  // Check for compiled binary first
  const zazigHome = process.env["ZAZIG_HOME"] ?? join(homedir(), ".zazigv2");
  const binPath = join(zazigHome, "bin", "agent-mcp-server");
  if (existsSync(binPath)) return binPath;

  const thisDir = dirname(fileURLToPath(import.meta.url));
  const mjsPath = join(thisDir, "agent-mcp-server.mjs");
  if (existsSync(mjsPath)) return mjsPath;
  return join(thisDir, "agent-mcp-server.js");
}
import { RepoManager } from "./branches.js";
export { MasterChangePoller } from "./master-change-poller.js";

// [git master refresh] Poller started
// [git master refresh] Master SHA changed
// [git master refresh] Repo fetched successfully
// [git master refresh] Repo fetch failed
// [git master refresh] Notified active sessions
// [git master refresh] ls-remote failed (git ls-remote refs/heads/master)
// [git master refresh] Master branch updated on origin/master

const execFileAsync = promisify(execFile);

function loadProjectsFromCLI(companyId: string): CompanyProject[] {
  try {
    const stdout = execFileSync("zazig", ["projects", "--company", companyId], {
      encoding: "utf8",
      timeout: 10_000,
    });
    const parsed = JSON.parse(stdout) as { projects?: Array<{ name?: string; repo_url?: string; status?: string }> };
    const projects = Array.isArray(parsed?.projects) ? parsed.projects : [];

    return projects
      .filter((project) => typeof project?.name === "string" && typeof project?.repo_url === "string")
      .map((project) => ({ name: project.name as string, repo_url: project.repo_url as string }));
  } catch (err) {
    console.warn("[daemon] Failed to load projects from CLI — continuing with empty list:", err);
    return [];
  }
}

type ExecFileAsyncFn = (
  command: string,
  args: string[],
  options?: { encoding?: BufferEncoding; maxBuffer?: number },
) => Promise<{ stdout: string; stderr: string }>;

type MasterCiFeature = {
  id?: string;
  status?: string;
  tags?: string[] | null;
};

interface MasterCiMonitorDeps {
  owner: string;
  repo: string;
  execFileAsync?: ExecFileAsyncFn;
  createFeature: (payload: {
    title: string;
    description: string;
    spec: string;
    tags: string[];
    priority: "high";
    fast_track: true;
  }) => Promise<unknown>;
  queryActiveFixFeatures: (query: {
    tag: string;
    statuses: readonly string[];
  }) => Promise<{ data?: MasterCiFeature[] | null }>;
  queryCompletedFixFeatures: (query: {
    tag: string;
    status: "complete";
  }) => Promise<{ data?: MasterCiFeature[] | null }>;
}

function buildMasterCIFailureSpec(params: {
  runId: number;
  headSha: string;
  stepName: string;
  logOutput: string;
  ownerRepo: string;
  workspaceName: string | null;
}): string {
  // logOutput is pre-extracted: ANSI stripped, 8KB (8192-byte) cap enforced by extractFailureSummary.
  const lines = [
    `Master CI run: ${params.runId}`,
    `Commit SHA: ${params.headSha}`,
    `Failed step: ${params.stepName}`,
  ];

  if (params.workspaceName) {
    lines.push(`Failed workspace: ${params.workspaceName}`);
  }

  lines.push(
    "",
    "FAILURE SUMMARY:",
    params.logOutput,
    "",
    "HOW TO REPRODUCE:",
    `gh run view ${params.runId} --repo ${params.ownerRepo} --log-failed`,
    "",
    "Investigate and fix the root cause of this CI failure so master goes green.",
  );

  return lines.join("\n");
}

export class MasterCiMonitor {
  private static readonly ACTIVE_STATUSES = [
    "breaking_down",
    "building",
    "combining_and_pr",
    "ci_checking",
    "merging",
  ] as const;

  private readonly owner: string;
  private readonly repo: string;
  private readonly exec: ExecFileAsyncFn;
  private readonly createFeature: MasterCiMonitorDeps["createFeature"];
  private readonly queryActiveFixFeatures: MasterCiMonitorDeps["queryActiveFixFeatures"];
  private readonly queryCompletedFixFeatures: MasterCiMonitorDeps["queryCompletedFixFeatures"];

  private lastSeenRunId: number | null = null;
  public lastSuccessfulRunId: number | null = null;
  public generationCount = 0;
  public consecutiveFailures = 0;

  constructor(deps: MasterCiMonitorDeps) {
    this.owner = deps.owner;
    this.repo = deps.repo;
    this.exec = deps.execFileAsync ?? (execFileAsync as unknown as ExecFileAsyncFn);
    this.createFeature = deps.createFeature;
    this.queryActiveFixFeatures = deps.queryActiveFixFeatures;
    this.queryCompletedFixFeatures = deps.queryCompletedFixFeatures;
  }

  async poll(): Promise<void> {
    try {
      const { stdout } = await this.exec("gh", [
        "api",
        `repos/${this.owner}/${this.repo}/actions/runs?branch=master&event=push&per_page=1`,
      ], { encoding: "utf8" });

      const payload = JSON.parse(stdout) as {
        workflow_runs?: Array<{
          id?: number;
          conclusion?: string | null;
          head_sha?: string | null;
        }>;
      };
      const latestRun = payload.workflow_runs?.[0];
      if (!latestRun || typeof latestRun.id !== "number") return;

      const runId = latestRun.id;
      const conclusion = latestRun.conclusion;
      const headSha = typeof latestRun.head_sha === "string" ? latestRun.head_sha : "unknown";

      if (conclusion === null || conclusion === "in_progress" || conclusion === "queued") {
        return;
      }

      if (conclusion === "success") {
        this.lastSuccessfulRunId = runId;
        this.lastSeenRunId = runId;
        this.generationCount = 0;
        this.consecutiveFailures = 0;
        return;
      }

      if (conclusion !== "failure") {
        this.lastSeenRunId = runId;
        return;
      }

      if (runId === this.lastSeenRunId) {
        return;
      }
      this.lastSeenRunId = runId;

      const { data: activeFixes } = await this.queryActiveFixFeatures({
        tag: "master-ci-fix",
        statuses: MasterCiMonitor.ACTIVE_STATUSES,
      });
      if ((activeFixes?.length ?? 0) > 0) return;

      const { data: completedFixes } = await this.queryCompletedFixFeatures({
        tag: "master-ci-fix",
        status: "complete",
      });
      const highestCompletedGeneration = (completedFixes ?? [])
        .flatMap((feature) => feature.tags ?? [])
        .map((tag) => {
          const match = /^fix-generation:(\d+)$/.exec(tag);
          return match ? Number(match[1]) : 0;
        })
        .reduce((max, value) => Math.max(max, value), 0);

      if (highestCompletedGeneration >= 3) {
        console.warn("Master CI monitor loop guard reached generation cap: 3 consecutive fixes");
        return;
      }

      const generation = Math.max(1, highestCompletedGeneration + 1);
      const failureDetails = await this.fetchFailureDetails(runId);
      const stepName = failureDetails.stepName ?? "unknown step";

      await this.createFeature({
        title: `Fix master CI failure — ${stepName}`,
        description: `Automated fix for master CI failure on commit ${headSha}. Failed step: ${stepName}.`,
        spec: buildMasterCIFailureSpec({
          runId,
          headSha,
          stepName,
          logOutput: failureDetails.logOutput,
          ownerRepo: `${this.owner}/${this.repo}`,
          workspaceName: null,
        }),
        tags: ["master-ci-fix", `fix-generation:${generation}`],
        priority: "high",
        fast_track: true,
      });

      this.generationCount = generation;
      this.consecutiveFailures = generation;
    } catch (err) {
      console.error("[master-ci-monitor] poll failed", err);
    }
  }

  private async fetchFailureDetails(runId: number): Promise<{ stepName: string; logOutput: string }> {
    let stepName = "unknown step";
    let logOutput = `No failure log output available for run ${runId}.`;

    try {
      const { stdout } = await this.exec(
        "gh",
        ["api", `repos/${this.owner}/${this.repo}/actions/runs/${runId}/jobs?per_page=100`],
        { encoding: "utf8" },
      );
      const payload = JSON.parse(stdout) as {
        jobs?: Array<{
          name?: string | null;
          conclusion?: string | null;
          steps?: Array<{ name?: string | null; conclusion?: string | null }>;
        }>;
      };
      for (const job of payload.jobs ?? []) {
        const failedStep = job.steps?.find((step) => step.conclusion === "failure");
        if (failedStep?.name?.trim()) {
          stepName = failedStep.name.trim();
          break;
        }
        if (job.conclusion === "failure" && job.name?.trim()) {
          stepName = job.name.trim();
          break;
        }
      }
    } catch {
      // Best-effort: fallback values are already set.
    }

    try {
      const { stdout } = await this.exec(
        "gh",
        ["run", "view", String(runId), "--repo", `${this.owner}/${this.repo}`, "--log-failed"],
        { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      );
      if (stdout.trim().length > 0) {
        logOutput = stdout.trim();
      }
    } catch {
      // Best-effort: fallback values are already set.
    }

    return { stepName, logOutput };
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Poll the tmux session every 30 s to check for completion. */
const POLL_INTERVAL_MS = 30_000;

/** Reconcile active in-memory jobs against DB terminal states every 60 s. */
const SLOT_RECONCILE_INTERVAL_MS = 60_000;

/** Poll for merged PRs on pr_ready features every 60 s. */
const PR_MONITOR_INTERVAL_MS = 60_000;

/** Poll latest master branch CI run every 5 minutes. */
const CI_MONITOR_INTERVAL_MS = 300_000;

/** Kill the job after 60 minutes regardless of status. */
const JOB_TIMEOUT_MS = 60 * 60_000;

/** Kill the session if no pipe-pane output appears for 5 minutes. */
const STUCK_NO_OUTPUT_MS = 5 * 60_000;

/** Kill interactive (human-in-loop) jobs after 30 minutes. */
const INTERACTIVE_JOB_TIMEOUT_MS = 30 * 60_000;

/** Shared report file written by claude/codex agents. */
function reportRelativePath(role?: string): string {
  const reportFile = role ? `${role}-report.md` : "cpo-report.md";
  return `.reports/${reportFile}`;
}

/** Per-job report directory to prevent concurrent-completion races. */
const REPORT_ARCHIVE_DIR = ".reports/job-reports";

/** Roles that run without repository/worktree git context. */
const NO_CODE_CONTEXT_ROLES = new Set([
  "pipeline-technician",
  "monitoring-agent",
  "project-architect",
  "triage-analyst",
]);


/** Delay after CPO session spawn before allowing message injection (Claude Code startup). */
const CPO_STARTUP_DELAY_MS = 15_000;

const DEFAULT_BOOT_PROMPT =
  "If .memory/MEMORY.md exists, read it and load relevant memories before doing anything else. Read your state files. If .reports/{role}-report.md exists, review it for continuity. Check for pending work via your MCP tools. Orient yourself and begin.";

/** Minimum session age before Cache-TTL may reset a persistent exec. */
const MIN_SESSION_AGE_MS = 5 * 60_000;

/** Circuit-breaker window for repeated reset failures. */
const RESET_FAILURE_WINDOW_MS = 10 * 60_000;

/** Pause auto-reset after this many consecutive failures within the window. */
const MAX_RESET_FAILURES = 3;

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
export function jobLog(jobId: string, message: string): void {
  try {
    mkdirSync(JOB_LOG_DIR, { recursive: true });
    const line = `${new Date().toISOString()} ${message}\n`;
    appendFileSync(join(JOB_LOG_DIR, `${jobId}-pre-post.log`), line);
  } catch { /* best-effort */ }
}

/** Marker in promptStackMinusSkills where skill content is inserted by the local agent. */
const SKILLS_MARKER = "<!-- SKILLS -->";

/** Codex delegation instructions injected into non-codex contexts.
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

- Session reports → \`.reports/{role}-report.md\` in your working directory
- Design documents, proposals, plans, specs → \`docs/plans/YYYY-MM-DD-descriptive-slug.md\` (relative to your working directory)
- Never reference paths outside your working directory — they belong to other projects`;

function ensureRoleSkills(role: string, roleSkills?: string[]): string[] | undefined {
  const normalized = roleSkills ? [...roleSkills] : [];
  if (role === "cpo" && !normalized.includes("start-expert")) {
    normalized.push("start-expert");
  }
  return normalized.length > 0 ? normalized : undefined;
}

interface CompanyProjectContext {
  name: string;
  repo_url: string | null;
}

function normalizeCompanyProjects(raw: unknown): CompanyProjectContext[] {
  if (!Array.isArray(raw)) return [];

  const normalized: CompanyProjectContext[] = [];
  for (const project of raw) {
    if (!project || typeof project !== "object") continue;
    const name = (project as { name?: unknown }).name;
    const repoUrl = (project as { repo_url?: unknown }).repo_url;
    if (typeof name !== "string" || name.trim().length === 0) continue;
    if (repoUrl !== null && (typeof repoUrl !== "string" || repoUrl.trim().length === 0)) continue;
    normalized.push({ name: name.trim(), repo_url: repoUrl ?? null });
  }
  return normalized;
}


// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveJob {
  jobId: string;
  slotType: SlotType;
  slotAcquired: boolean;
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
  /** Byte offset for lifecycle log. */
  lastLifecycleBytesSent: number;
  /** Ephemeral workspace directory (if created). Used for report lookup + cleanup. */
  workspaceDir?: string;
  /** Git worktree path for this job — agent CWD and workspace root. */
  worktreePath?: string;
  /** Clone directory used to manage this job's worktree. */
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
  /** Git HEAD commit recorded BEFORE Codex spawns — needed for self-commit detection. */
  startingCommit?: string;
  /** Current codex attempt count (1-based) for review/fix retries. */
  attempt: number;
  /** Maximum number of codex attempts before terminal failure. */
  maxAttempts: number;
  /** Ordered list of codex review failure reasons collected across attempts. */
  fixReasons: string[];
  /** Complexity from StartJob — reused when spawning codex retry attempts. */
  complexity?: string;
  /** Model from StartJob — reused when spawning codex retry attempts. */
  model?: string;
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
  lastActivityAt: number;
  lastOutputHash: string;
  cacheTtlMinutes: number;
  hardTtlMinutes: number;
  heartbeatTasksRun: boolean;
  consecutiveResetFailures: number;
  lastResetAt: number | null;
  rolePromptSnapshot: string;
  originalJob: PersistentStartJob;
  resetInProgress: boolean;
  /** Timestamp of last memory sync nudge, or null if not yet nudged this idle period. */
  lastMemorySyncAt: number | null;
  /** Whether agent was active since last memory sync (used to reset sync state). */
  wasActiveAfterSync: boolean;
  respawnFailureCount: number;
  lastRespawnFailureAt: number | null;
}

export interface CompanyProject {
  name: string;
  repo_url: string;
}

export interface PersistentAgentJobDefinition {
  role: string;
  prompt_stack_minus_skills: string;
  sub_agent_prompt?: string;
  skills: string[];
  model: string;
  slot_type: string;
  mcp_tools?: string[];
  projects?: CompanyProjectContext[];
}

type PersistentStartJob = StartJob & {
  companyProjects?: CompanyProjectContext[];
};

type PersistentRoleConfig = {
  prompt: string;
  heartbeatMd: string;
  cacheTtlMinutes: number;
  hardTtlMinutes: number;
  bootPrompt: string | null;
};

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

  /** Manages repo clones and job worktrees for all active jobs. */
  public readonly repoManager = new RepoManager();

  /** Map of role → active persistent agent state. Supports simultaneous CPO, CTO, etc. */
  private readonly persistentAgents = new Map<string, ActivePersistentAgent>();

  /** Cached machine UUID for persistent_agents DB writes. */
  private machineUuid: string | null = null;

  /** Message queue for injecting into persistent agent tmux sessions. */
  private readonly messageQueue: QueuedMessage[] = [];
  private processingQueue = false;
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;
  private prMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private ciMonitorTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeenCIRunId: number | null = null;
  private consecutiveFailedGenerations: number = 0;
  private companyProjects: CompanyProject[] = [];

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

    this.ciMonitorTimer = setInterval(() => {
      void this.monitorMasterCI();
    }, CI_MONITOR_INTERVAL_MS);

  }

  setCompanyProjects(projects: CompanyProject[]): void {
    this.companyProjects = [...projects];
  }

  getCompanyProjects(): CompanyProject[] {
    return [...this.companyProjects];
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

  private async loadPersistentRoleConfig(role: string): Promise<PersistentRoleConfig> {
    const { data, error } = await this.supabase
      .from("roles")
      .select("prompt, heartbeat_md, cache_ttl_minutes, hard_ttl_minutes, boot_prompt")
      .eq("name", role)
      .single();

    if (error) {
      throw new Error(`Failed to load role config for ${role}: ${error.message}`);
    }
    if (!data) {
      throw new Error(`Role ${role} not found in DB`);
    }

    return {
      prompt: data.prompt ?? "",
      heartbeatMd: data.heartbeat_md ?? "",
      cacheTtlMinutes: data.cache_ttl_minutes ?? 30,
      hardTtlMinutes: data.hard_ttl_minutes ?? 240,
      bootPrompt: data.boot_prompt ?? null,
    };
  }

  private buildHeartbeatSessionStartCommand(): string {
    return [
      "cat <<'HEARTBEAT_EOF'",
      "Read .claude/HEARTBEAT.md for your recurring tasks.",
      "Read .claude/memory/heartbeat-state.json for what you've already completed.",
      "Skip any Daily task completed today. Skip any Weekly task completed this week.",
      "After completing tasks, update heartbeat-state.json with new timestamps.",
      "HEARTBEAT_EOF",
    ].join("\n");
  }

  private refreshPersistentPromptStack(
    promptStackMinusSkills: string | undefined,
    previousRolePrompt: string,
    nextRolePrompt: string,
  ): string | undefined {
    if (!promptStackMinusSkills) {
      return promptStackMinusSkills;
    }
    if (previousRolePrompt && promptStackMinusSkills.includes(previousRolePrompt)) {
      return promptStackMinusSkills.replace(previousRolePrompt, nextRolePrompt);
    }
    return promptStackMinusSkills;
  }

  private async withExpertRosterSection(claudeMdContent: string): Promise<string> {
    const { data, error } = await this.supabase
      .from("expert_roles")
      .select("name, display_name, description");

    if (error) {
      console.warn(`[executor] Failed to load expert_roles: ${error.message}`);
      return claudeMdContent;
    }

    const expertRoles = (data ?? []) as Array<{ name: string; display_name?: string | null; description?: string | null }>;
    if (expertRoles.length === 0) return claudeMdContent;

    const rosterLines = expertRoles.map((role) => {
      const displayName = role.display_name?.trim() || role.name;
      const description = role.description?.replace(/\s+/g, " ").trim() || "No description provided.";
      return `- **${role.name}** (${displayName}): ${description}`;
    });

    const rosterSection = [
      "",
      "## Expert Agents Available",
      "",
      "You can trigger expert agents for specialized work. Call the start_expert_session MCP tool to spawn one.",
      "",
      ...rosterLines,
      "",
      "Proactively suggest expert sessions when the task requires specialized expertise.",
    ].join("\n");

    return `${claudeMdContent}${rosterSection}`;
  }

  private async resolvePersistentProjects(msg: PersistentStartJob, companyId: string): Promise<CompanyProjectContext[]> {
    const fromMessage = normalizeCompanyProjects(msg.companyProjects);
    if (fromMessage.length > 0) {
      return fromMessage;
    }
    if (!companyId) {
      return [];
    }

    const { data, error } = await this.supabase
      .from("projects")
      .select("name, repo_url")
      .eq("company_id", companyId)
      .eq("status", "active");

    if (error) {
      console.warn(`[executor] Failed to load projects for persistent agent company ${companyId}: ${error.message}`);
      return [];
    }

    return normalizeCompanyProjects(data);
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

    if (this.activeJobs.has(jobId)) {
      jobLog(jobId, `SKIP duplicate start_job — already running`);
      console.warn(`[executor] Duplicate start_job ignored for jobId=${jobId} (currently active)`);
      return;
    }

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

    // --- 1. Acquire slot (soft — never reject a claimed job) ---
    const slotAcquired = this.slots.tryAcquire(slotType);
    if (slotAcquired) {
      jobLog(jobId, `Slot acquired: ${slotType}`);
    } else {
      jobLog(jobId, `WARN slot overcommit: running despite no free ${slotType} slot`);
      console.warn(`[executor] Slot overcommit for jobId=${jobId} — running anyway (${slotType})`);
    }

    // --- 2. Send JobAck immediately to confirm delivery ---
    await this.sendJobAck(jobId);

    const isInteractive = msg.interactive === true;
    const roleName = msg.role ?? "senior-engineer";
    const roleSkills = ensureRoleSkills(roleName, msg.roleSkills);

    const repoRoot = resolveRepoRoot();

    // --- 3. Assemble context from pre-built promptStackMinusSkills ---
    // The orchestrator builds the full prompt stack with a <!-- SKILLS --> marker.
    // We insert skill file content at the marker position.
    const assembledContext = assembleContext(msg, repoRoot);
    const cpoContext = roleName === "cpo"
      ? await this.withExpertRosterSection(assembledContext)
      : assembledContext;

    console.log(`[executor] Assembled context for jobId=${jobId}:\n${cpoContext}`);

    // --- 3c. Prepare execution workspace ---
    // Code-context roles run in git worktrees. NO_CODE_CONTEXT roles run in scratch workspaces.
    let ephemeralWorkspaceDir: string | undefined;
    let worktreePath: string | undefined;
    let repoDir: string | undefined;
    let jobBranch: string | undefined;
    let startingCommit: string | undefined;
    const requiresCodeContext = !NO_CODE_CONTEXT_ROLES.has(roleName);

    const cleanupPreparedWorkspace = async (): Promise<void> => {
      if (worktreePath && repoDir) {
        await this.repoManager.removeJobWorktree(repoDir, worktreePath);
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

        // Header line: agent role + local-agent build commit (zazigv2 repo)
        let buildCommit = "unknown";
        try {
          const agentDir = dirname(fileURLToPath(import.meta.url));
          const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%h %s"], { cwd: agentDir });
          buildCommit = stdout.trim();
        } catch { /* non-fatal */ }
        jobLog(jobId, `Agent=${roleName} slot=${slotType} model=${msg.model} build=${buildCommit}`);

        jobLog(jobId, `Branch routing: dependencyBranches=${JSON.stringify(msg.dependencyBranches)}, using=${routing}`);
        jobLog(jobId, `featureBranch=${msg.featureBranch}, repoDir=${repoDir}`);
        console.log(`[executor] Branch routing for jobId=${jobId}: dependencyBranches=${JSON.stringify(msg.dependencyBranches)}, using=${routing}`);

        if (msg.dependencyBranches && msg.dependencyBranches.length > 0) {
          const depResult = await this.repoManager.createDependentJobWorktree(repoDir, msg.featureBranch, jobId, msg.dependencyBranches);
          worktreePath = depResult.worktreePath;
          jobBranch = depResult.jobBranch;

          // Handle merge conflicts from multi-dep fan-in
          if (depResult.conflictBranches.length > 0) {
            jobLog(jobId, `Merge conflicts with branches: ${depResult.conflictBranches.join(", ")} — spawning conflict resolution agent`);
            console.log(`[executor] Merge conflicts for jobId=${jobId}: ${depResult.conflictBranches.join(", ")}`);

            const resolved = await this.resolveDepMergeConflicts(
              jobId, worktreePath, msg.dependencyBranches[0], depResult.conflictBranches,
            );

            if (!resolved) {
              jobLog(jobId, `FAILED to resolve merge conflicts — failing job`);
              if (slotAcquired) this.slots.release(slotType);
              jobLog(jobId, "Sending JobFailed for merge_conflict...");
              try {
                await this.sendJobFailed(
                  jobId,
                  `Merge conflict resolution failed for dependency branches: ${depResult.conflictBranches.join(", ")}. Requires human attention.`,
                  "merge_conflict",
                );
                jobLog(jobId, "JobFailed sent successfully for merge_conflict");
              } catch (sendErr) {
                jobLog(jobId, `sendJobFailed FAILED for merge_conflict: ${String(sendErr)}`);
                console.error(`[executor] sendJobFailed failed for merge_conflict jobId=${jobId}:`, sendErr);
              }
              return;
            }
            jobLog(jobId, `Merge conflicts resolved successfully`);
          }
        } else {
          const simpleResult = await this.repoManager.createJobWorktree(repoDir, msg.featureBranch, jobId);
          worktreePath = simpleResult.worktreePath;
          jobBranch = simpleResult.jobBranch;
        }

        ephemeralWorkspaceDir = worktreePath;

        jobLog(jobId, `Worktree created at ${worktreePath} (branch: ${jobBranch})`);
        console.log(`[executor] Git worktree created at ${worktreePath} (branch: ${jobBranch}) for jobId=${jobId}`);

        // Record HEAD before Codex runs — self-commit detection needs pre-execution baseline.
        if (msg.slotType === "codex") {
          try {
            const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
            startingCommit = stdout.trim();
          } catch { /* non-fatal — runCodexReview falls back to recording inline */ }
        }
      } else {
        ephemeralWorkspaceDir = buildScratchWorkspaceDir(this.companyId, roleName, jobId);
        mkdirSync(ephemeralWorkspaceDir, { recursive: true });
        jobLog(jobId, `Scratch workspace created at ${ephemeralWorkspaceDir} (no git context role=${roleName})`);
        console.log(`[executor] Scratch workspace created at ${ephemeralWorkspaceDir} for no-code role ${roleName} jobId=${jobId}`);
      }
    } catch (err) {
      jobLog(jobId, `FAILED to prepare workspace: ${String(err)}`);
      console.error(`[executor] Failed to prepare workspace for jobId=${jobId}:`, err);
      if (slotAcquired) this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to prepare workspace: ${String(err)}`, "agent_crash");
      return;
    }

    // Set up workspace overlay (CLAUDE.md, .mcp.json, .claude/).
    const mcpServerPath = resolveMcpServerPath();
    try {
      setupJobWorkspace({
        workspaceDir: ephemeralWorkspaceDir!,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId,
        companyId: this.companyId,
        role: roleName,
        claudeMdContent: cpoContext,
        skills: roleSkills,
        repoSkillsDir: join(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join(repoRoot, ".claude", "skills"),
        mcpTools: msg.roleMcpTools,
        tmuxSession: `${this.machineId}-${jobId}`,
        machineId: this.machineId,
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
      const built = buildCommand(slotType, complexity, model, worktreePath, promptFilePath, repoDir);
      cmd = built.cmd;
      cmdArgs = built.args;
    }
    const sessionName = `${this.machineId}-${jobId}`;

    // --- 4b. Write prompt to file (piped via stdin for claude, or as positional arg for codex) ---
    mkdirSync(ephemeralWorkspaceDir!, { recursive: true });
    writeFileSync(promptFilePath, cpoContext);

    // --- 5. Clear stale report before spawning (prevents reading a previous job's report) ---
    const reportPath = `${process.env["HOME"] ?? "/tmp"}/${reportRelativePath(msg.role)}`;
    try { unlinkSync(reportPath); } catch { /* no stale report — fine */ }
    if (msg.role === "reviewer" && worktreePath) {
      try { unlinkSync(`${worktreePath}/.reports/reviewer-report.md`); } catch { /* no stale report — fine */ }
    }

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
        // Both codex and claude -p receive the prompt via stdin.
        // codex exec reads from stdin when no positional arg is given (per CLI docs).
        await spawnTmuxSession(sessionName, cmd, cmdArgs, ephemeralWorkspaceDir, promptFilePath);
      }
    } catch (err) {
      console.error(`[executor] Failed to spawn tmux session for jobId=${jobId}:`, err);
      await cleanupPreparedWorkspace();
      if (slotAcquired) this.slots.release(slotType);
      await this.sendJobFailed(jobId, `Failed to start tmux session: ${String(err)}`, "agent_crash");
      return;
    }

    const logPath = jobLogPath(jobId);
    const activeJob: ActiveJob = {
      jobId,
      slotType,
      slotAcquired,
      sessionName,
      pollTimer: null,
      timeoutTimer: null,
      settled: false,
      startedAt: Date.now(),
      logPath,
      lastBytesSent: 0,
      lastLifecycleBytesSent: 0,
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
      startingCommit,
      attempt: 1,
      maxAttempts: 3,
      fixReasons: [],
      complexity: msg.complexity,
      model: msg.model,
    };

    console.log(`[codex] Starting job — title="${activeJob.jobTitle ?? jobId}", id=${jobId.slice(0, 8)}, complexity=${msg.complexity}, attempt=${activeJob.attempt}/${activeJob.maxAttempts}`);
    // Security audit (AC-2-2): these log lines emit only the command name and
    // its CLI flags (e.g. "claude --model X -p --verbose --output-format
    // stream-json"). They do NOT include shellCmd, tmuxArgs, or process.env, so
    // ANTHROPIC_API_KEY is not exposed in any log output.
    jobLog(jobId, `Tmux session started — session=${sessionName}, cmd=${cmd} ${cmdArgs.join(" ")}, cwd=${ephemeralWorkspaceDir ?? "none"}`);
    console.log(`[executor] Tmux session started — session=${sessionName}, cmd=${cmd}`);

    // --- 6b. Start pipe-pane to stream session output to a log file ---
    try {
      mkdirSync(JOB_LOG_DIR, { recursive: true });
      await startPipePane(sessionName, logPath);
      jobLog(jobId, `pipe-pane started → ${logPath}`);
    } catch (err) {
      // Pipe-pane failure is non-fatal — logs simply won't be captured
      jobLog(jobId, `pipe-pane FAILED: ${String(err)}`);
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
      ...(job.sub_agent_prompt ? { subAgentPrompt: job.sub_agent_prompt } : {}),
      roleSkills: job.skills?.length ? job.skills : undefined,
      roleMcpTools: job.mcp_tools?.length ? job.mcp_tools : undefined,
      companyProjects: job.projects?.length ? job.projects : undefined,
    };

    // Persistent agents don't consume slots — they run alongside claimed jobs.
    await this.handlePersistentJob(
      `persistent-${job.role}`,
      syntheticMsg as PersistentStartJob,
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
    // Human input resets memory sync state so the next idle period gets a fresh nudge
    agent.lastMemorySyncAt = null;
    console.log(`[memory-sync] ${targetRole}: state reset on human input from ${msg.from}`);
    void this.enqueueMessage(formatted, agent.tmuxSession, agent.startedAt);
  }

  // ---------------------------------------------------------------------------
  // Public: StopJob
  // ---------------------------------------------------------------------------
  /** Returns the job IDs of all currently executing jobs. */
  public getActiveJobIds(): string[] {
    return Array.from(this.activeJobs.keys());
  }

  /** Returns tmux session targets for persistent agents and active jobs. */
  public getMasterRefreshTargets(): Array<{ name: string; startedAt: number }> {
    const targets = new Map<string, number>();

    for (const [, agent] of this.persistentAgents) {
      targets.set(agent.tmuxSession, agent.startedAt);
    }

    for (const [, job] of this.activeJobs) {
      targets.set(job.sessionName, job.startedAt);
    }

    return [...targets.entries()].map(([name, startedAt]) => ({ name, startedAt }));
  }

  /** Broadcasts a droppable notification to all selected active sessions. */
  public async broadcastMasterRefreshNotification(message: string, sessionNames?: string[]): Promise<number> {
    const targetSessions = this.getMasterRefreshTargets()
      .filter((target) => !sessionNames || sessionNames.includes(target.name));

    let delivered = 0;
    for (const target of targetSessions) {
      try {
        await this.enqueueMessage(message, target.name, target.startedAt, "notification");
        delivered++;
      } catch (err) {
        console.warn(`[git master refresh] Failed to notify session ${target.name}:`, err);
      }
    }
    return delivered;
  }

  /** Stops a single active job by ID using the standard stop flow. */
  public async stopJob(jobId: string): Promise<void> {
    await this.handleStopJob({
      type: "stop_job",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      reason: "graceful_shutdown",
    });
  }

  public async killAllRunningJobs(reason: FailureReason): Promise<number> {
    const jobIds = [...this.activeJobs.keys()];
    let killed = 0;

    for (const jobId of jobIds) {
      const job = this.activeJobs.get(jobId);
      if (!job || job.settled) continue;

      // Mark settled early to prevent poll/timeout races from double-reporting.
      job.settled = true;
      this.clearJobTimers(job);
      jobLog(jobId, `Force-killed by daemon — reason=${reason}`);

      try {
        await killTmuxSession(job.sessionName);
      } catch (err) {
        console.warn(`[executor] Failed to kill tmux session for jobId=${jobId}: ${String(err)}`);
      }

      try {
        await this.sendJobFailed(jobId, `Daemon killed job: ${reason}`, reason);
      } catch (err) {
        console.warn(`[executor] Failed to report forced failure for jobId=${jobId}: ${String(err)}`);
      } finally {
        try {
          await this.settleJob(jobId);
        } catch (err) {
          console.warn(`[executor] Failed to settle force-killed jobId=${jobId}: ${String(err)}`);
        }
      }

      killed++;
    }

    return killed;
  }

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
    if (this.ciMonitorTimer !== null) {
      clearInterval(this.ciMonitorTimer);
      this.ciMonitorTimer = null;
    }
    // Clear all persistent agents (fires DB status updates + stops heartbeat timers)
    this.clearPersistentAgent();

    // Kill all remaining active tmux sessions and release slots
    for (const [, job] of this.activeJobs) {
      this.clearJobTimers(job);
      await killTmuxSession(job.sessionName);
      if (job.worktreePath && job.repoDir) {
        await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
      } else {
        cleanupJobWorkspace(job.jobId, job.workspaceDir);
      }
      if (job.slotAcquired) this.slots.release(job.slotType);
    }
    this.activeJobs.clear();
  }

  private async monitorMasterCI(): Promise<void> {
    try {
      if (this.companyId) {
        const refreshedProjects = loadProjectsFromCLI(this.companyId);
        if (refreshedProjects.length > 0) {
          this.companyProjects = [...refreshedProjects];
        }
      }

      const repoUrl = this.companyProjects[0]?.repo_url;
      if (!repoUrl) {
        console.log("[executor] Master CI monitor skipped: missing project repo_url");
        return;
      }

      const match = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      if (!match) {
        console.warn(`[executor] Master CI monitor skipped: cannot parse owner/repo from "${repoUrl}"`);
        return;
      }

      const ownerRepo = match[1];
      const { stdout } = await execFileAsync("gh", [
        "api",
        `repos/${ownerRepo}/actions/workflows/deploy-edge-functions.yml/runs?branch=master&event=push&per_page=1`,
      ], { encoding: "utf8" });
      const payload = JSON.parse(stdout) as {
        workflow_runs?: Array<{
          id?: number;
          conclusion?: string | null;
          head_sha?: string | null;
        }>;
      };

      const latestRun = payload.workflow_runs?.[0];
      if (!latestRun) {
        console.log(`[executor] Master CI monitor: no workflow runs found for ${ownerRepo}`);
        return;
      }

      const runId = typeof latestRun.id === "number" ? latestRun.id : null;
      if (runId === null) {
        console.warn("[executor] Master CI monitor skipped: latest workflow run missing numeric id");
        return;
      }

      const conclusion = latestRun.conclusion;
      const headSha = typeof latestRun.head_sha === "string" ? latestRun.head_sha : "";

      if (conclusion === null || conclusion === "in_progress" || conclusion === "queued") {
        console.log(`[executor] Master CI run ${runId} not finished yet (conclusion=${conclusion ?? "null"})`);
        return;
      }

      if (conclusion === "success") {
        this.consecutiveFailedGenerations = 0;
        this.lastSeenCIRunId = runId;
        return;
      }

      if (conclusion === "failure") {
        if (runId === this.lastSeenCIRunId) return;
        this.lastSeenCIRunId = runId;
        await this.handleMasterCIFailure(runId, headSha);
        return;
      }
    } catch (err) {
      console.warn(`[executor] Master CI monitor failed: ${String(err)}`);
      return;
    }
  }

  private async handleMasterCIFailure(runId: number, headSha: string): Promise<void> {
    try {
      if (await this.isCIFixInFlight()) return;

      const generation = await this.computeNextCIFixGeneration();
      if (generation === null) return;

      const failureLogs = await this.fetchCIFailureLogs(runId);
      const stepName = failureLogs?.stepName?.trim() || "unknown step";
      const logOutput = failureLogs?.logOutput?.trim() || `No failure log output available for run ${runId}.`;
      const workspaceName = failureLogs?.workspaceName ?? null;
      const normalizedHeadSha = headSha.trim().length > 0 ? headSha : "unknown";

      if (!this.companyId) {
        console.warn(`[CI Monitor] Skipping fix feature for run ${runId}: missing companyId`);
        return;
      }

      const repoUrl = this.companyProjects[0]?.repo_url;
      if (!repoUrl) {
        console.warn(`[CI Monitor] Skipping fix feature for run ${runId}: missing project repo_url`);
        return;
      }

      const projectId = await this.resolveProjectIdForRepo(repoUrl);
      if (!projectId) {
        console.warn(`[CI Monitor] Skipping fix feature for run ${runId}: could not resolve project_id for ${repoUrl}`);
        return;
      }

      const featureTitle = `Fix master CI failure — ${stepName}`;
      const featureDescription = `Automated fix for master CI failure on commit ${normalizedHeadSha}. Failed step: ${stepName}.`;
      const repoMatch = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
      const ownerRepo = failureLogs?.ownerRepo ?? repoMatch?.[1] ?? "owner/repo";
      const featureSpec = buildMasterCIFailureSpec({
        runId,
        headSha: normalizedHeadSha,
        stepName,
        logOutput,
        ownerRepo,
        workspaceName,
      });

      const cliArgs = [
        "create-feature",
        "--company", this.companyId,
        "--project-id", projectId,
        "--title", featureTitle,
        "--description", featureDescription,
        "--spec", featureSpec,
        "--acceptance-tests", `Given master CI run ${runId} fails on step "${stepName}", when the fix is applied, then master CI passes.`,
        "--priority", "high",
        "--fast-track", "true",
      ];

      try {
        await execFileAsync("zazig", cliArgs, { encoding: "utf8" });
      } catch (cliErr: unknown) {
        const msg = cliErr instanceof Error ? cliErr.message : String(cliErr);
        console.warn(`[CI Monitor] zazig create-feature failed for run ${runId}: ${msg}`);
        return;
      }

      this.consecutiveFailedGenerations += 1;
      console.log(`[CI Monitor] Created fix feature (generation ${generation}) for run ${runId}`);
    } catch (err) {
      console.warn(`[CI Monitor] Failed to create fix feature for run ${runId}: ${String(err)}`);
      return;
    }
  }

  private async fetchCIFailureLogs(runId: number): Promise<{
    stepName: string;
    logOutput: string;
    workspaceName: string | null;
    ownerRepo: string;
  } | null> {
    const repoUrl = this.companyProjects[0]?.repo_url;
    if (!repoUrl) return null;

    const match = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) {
      console.warn(`[CI Monitor] Cannot parse owner/repo from "${repoUrl}" while fetching failure logs`);
      return null;
    }

    const ownerRepo = match[1];

    try {
      const { stdout: jobsStdout } = await execFileAsync(
        "gh",
        ["api", `repos/${ownerRepo}/actions/runs/${runId}/jobs?per_page=100`],
        { encoding: "utf8" },
      );

      const jobsPayload = JSON.parse(jobsStdout) as {
        jobs?: Array<{
          name?: string | null;
          conclusion?: string | null;
          steps?: Array<{ name?: string | null; conclusion?: string | null }>;
        }>;
      };

      let stepName = "unknown step";
      for (const job of jobsPayload.jobs ?? []) {
        const failedStep = job.steps?.find((step) => step.conclusion === "failure");
        if (failedStep?.name && failedStep.name.trim().length > 0) {
          stepName = failedStep.name.trim();
          break;
        }
        if (job.conclusion === "failure" && job.name && job.name.trim().length > 0) {
          stepName = job.name.trim();
          break;
        }
      }

      let logOutput = "";
      let workspaceName: string | null = null;
      try {
        const { stdout: failedLogStdout } = await execFileAsync(
          "gh",
          ["run", "view", String(runId), "--repo", ownerRepo, "--log-failed"],
          { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
        );
        const rawLogOutput = failedLogStdout.trim();
        if (rawLogOutput.length > 0) {
          logOutput = extractFailureSummary(rawLogOutput, runId);
          workspaceName = extractWorkspaceName(rawLogOutput);
        }
      } catch (err) {
        console.warn(`[CI Monitor] Failed to fetch failed log output for run ${runId}: ${String(err)}`);
      }

      if (!logOutput) {
        logOutput = `No failure log output available for run ${runId}.`;
      }

      return { stepName, logOutput, workspaceName, ownerRepo };
    } catch (err) {
      console.warn(`[CI Monitor] Failed to fetch CI failure context for run ${runId}: ${String(err)}`);
      return null;
    }
  }

  private async resolveProjectIdForRepo(repoUrl: string): Promise<string | null> {
    if (!this.companyId) return null;

    const targetRepoMatch = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    const targetOwnerRepo = targetRepoMatch?.[1]?.toLowerCase() ?? null;

    const { data, error } = await this.supabase
      .from("projects")
      .select("id, repo_url")
      .eq("company_id", this.companyId)
      .eq("status", "active");

    if (error) {
      console.warn(`[CI Monitor] Failed to resolve project for repo "${repoUrl}": ${error.message}`);
      return null;
    }

    const projects = (data ?? []) as Array<{ id?: string | null; repo_url?: string | null }>;
    if (projects.length === 0) return null;

    if (targetOwnerRepo) {
      const match = projects.find((project) => {
        if (!project.repo_url) return false;
        const projectRepoMatch = project.repo_url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
        return projectRepoMatch?.[1]?.toLowerCase() === targetOwnerRepo;
      });
      if (match?.id) return match.id;
    }

    if (projects.length === 1 && projects[0]?.id) {
      return projects[0].id;
    }

    return null;
  }

  private async isCIFixInFlight(): Promise<boolean> {
    const activeStatuses = [
      "breaking_down",
      "building",
      "combining_and_pr",
      "ci_checking",
      "merging",
    ] as const;

    const { data, error } = await this.supabase
      .from("features")
      .select("id")
      .contains("tags", ["master-ci-fix"])
      .in("status", activeStatuses);

    if (error) {
      console.warn(`[executor] Failed to query active master CI fixes: ${error.message}`);
      return false;
    }

    const activeFixCount = data?.length ?? 0;
    const inFlight = activeFixCount > 0;
    if (inFlight) {
      console.warn(`[executor] Master CI fix already in flight (${activeFixCount} active feature(s)) — skipping auto-fix creation`);
    }
    return inFlight;
  }

  private async computeNextCIFixGeneration(): Promise<number | null> {
    if (this.consecutiveFailedGenerations >= 3) {
      console.warn(`[executor] Master CI fix generation cap reached (${this.consecutiveFailedGenerations}) — skipping auto-fix creation`);
      return null;
    }
    return this.consecutiveFailedGenerations + 1;
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

    if (job.slotAcquired) this.slots.release(job.slotType);
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
  private async handlePersistentJob(jobId: string, msg: PersistentStartJob, slotType: SlotType, companyId?: string): Promise<void> {
    const role = msg.role ?? "agent";
    const roleSkills = ensureRoleSkills(role, msg.roleSkills);
    const resolvedCompanyId = companyId ?? process.env["ZAZIG_COMPANY_ID"] ?? "";
    const isStaging = process.env["ZAZIG_ENV"] === "staging";
    const stagingSegment = isStaging ? "staging-" : "";
    const sessionCompanyPrefix = this.companyId ? this.companyId.slice(0, 8) + "-" : "";
    const persistentSessionName = `${this.machineId}-${sessionCompanyPrefix}${stagingSegment}${role}`;
    const workspaceDir = resolvedCompanyId
      ? join(homedir(), ".zazigv2", `${resolvedCompanyId}-${role}-workspace`)
      : join(homedir(), ".zazigv2", `${role}-workspace`);
    let roleConfig: PersistentRoleConfig;

    // --- Create agent workspace with .mcp.json ---
    try {
      const repoRoot = resolveRepoRoot();
      roleConfig = await this.loadPersistentRoleConfig(role);
      const mcpServerPath = resolveMcpServerPath();
      const assembledContext = assembleContext(msg, repoRoot);
      const claudeMdContent = role === "cpo"
        ? await this.withExpertRosterSection(assembledContext)
        : assembledContext;

      setupJobWorkspace({
        workspaceDir,
        mcpServerPath,
        supabaseUrl: this.supabaseUrl,
        supabaseAnonKey: this.supabaseAnonKey,
        jobId,
        companyId: resolvedCompanyId,
        role,
        claudeMdContent,
        heartbeatMd: roleConfig.heartbeatMd,
        skills: roleSkills,
        repoSkillsDir: join(repoRoot, "projects", "skills"),
        repoInteractiveSkillsDir: join(repoRoot, ".claude", "skills"),
        useSymlinks: true,
        mcpTools: msg.roleMcpTools,
        tmuxSession: persistentSessionName,
        machineId: this.machineId,
      });

      if (role === "cpo") {
        await writeSubagentsConfig(workspaceDir);
      }

      const projects = await this.resolvePersistentProjects(msg, resolvedCompanyId);
      const reposDir = join(workspaceDir, "repos");
      mkdirSync(reposDir, { recursive: true });
      console.log(`[executor] Persistent agent repo symlink dir ready: ${reposDir}`);
      for (const project of projects) {
        try {
          if (!project.repo_url) {
            console.warn(`[executor] Persistent agent repo link skipped for project=${project.name}: missing repo_url`);
            continue;
          }
          await this.repoManager.ensureRepo(project.repo_url, project.name);
          const worktreeDir = await this.repoManager.ensureWorktree(project.name);
          const projectLinkPath = join(reposDir, project.name);
          rmSync(projectLinkPath, { force: true, recursive: true });
          symlinkSync(worktreeDir, projectLinkPath);
          console.log(`[executor] Persistent agent repo symlinked: ${project.name} -> ${worktreeDir}`);
        } catch (err) {
          console.error(`[executor] Persistent agent repo link failed for project=${project.name}:`, err);
        }
      }

      generateExecSkill(
        {
          name: role,
          prompt: claudeMdContent,
          heartbeat_md: roleConfig.heartbeatMd,
        },
        workspaceDir,
      );

      // Publish sanitized exec skill to shared repo skills directory.
      // Other sessions (expert sessions, contractors, other execs) can
      // `/as-{role}` to side-load this exec's context.
      publishSharedExecSkill(
        {
          name: role,
          prompt: claudeMdContent,
          heartbeat_md: roleConfig.heartbeatMd,
        },
        workspaceDir,
        repoRoot,
      );

      // --- Write prompt freshness metadata for SessionStart hook ---
      const rolePromptForHash = msg.rolePrompt ?? roleConfig.prompt;
      const promptHash = createHash("sha256").update(rolePromptForHash).digest("hex");
      writeFileSync(join(workspaceDir, ".role"), role);
      writeFileSync(join(workspaceDir, ".prompt-hash"), promptHash);
      if (resolvedCompanyId) {
        writeFileSync(join(workspaceDir, ".company-id"), resolvedCompanyId);
      }

      // Add SessionStart hook to settings.json for prompt freshness checks
      const freshnessScript = join(repoRoot, "packages", "local-agent", "scripts", "check-prompt-freshness.sh");
      const settingsPath = join(workspaceDir, ".claude", "settings.json");
      const existingSettings = JSON.parse(readFileSync(settingsPath, "utf8"));
      const existingSessionStartHooks = Array.isArray(existingSettings.hooks?.SessionStart)
        ? existingSettings.hooks.SessionStart
        : [];
      const sessionStartHooks = [
        ...existingSessionStartHooks,
        { matcher: "", hooks: [{ type: "command", command: `bash ${freshnessScript}` }] },
      ];
      if (roleConfig.heartbeatMd.trim().length > 0) {
        sessionStartHooks.push({
          matcher: "",
          hooks: [{ type: "command", command: this.buildHeartbeatSessionStartCommand() }],
        });
      }
      existingSettings.hooks = {
        ...existingSettings.hooks,
        SessionStart: sessionStartHooks,
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
    const sessionName = persistentSessionName;
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

    const startedAt = Date.now();
    const bootPrompt = roleConfig.bootPrompt ?? DEFAULT_BOOT_PROMPT;
    void this.enqueueMessage(bootPrompt, sessionName, startedAt).catch((err) => {
      console.error(`[executor] Failed to enqueue boot prompt for ${role}:`, err);
    });

    let initialOutputHash = "";
    try {
      const output = await capturePane(sessionName);
      initialOutputHash = createHash("sha256").update(output).digest("hex");
    } catch {
      // Session may still be rendering its first frame; heartbeat will retry.
    }

    // Register persistent agent in map keyed by role
    const persistentAgent: ActivePersistentAgent = {
      role,
      tmuxSession: sessionName,
      jobId,
      companyId: resolvedCompanyId,
      heartbeatTimer: null,
      startedAt,
      lastActivityAt: startedAt,
      lastOutputHash: initialOutputHash,
      cacheTtlMinutes: roleConfig.cacheTtlMinutes,
      hardTtlMinutes: roleConfig.hardTtlMinutes,
      heartbeatTasksRun: roleConfig.heartbeatMd.trim().length > 0,
      consecutiveResetFailures: 0,
      lastResetAt: null,
      rolePromptSnapshot: roleConfig.prompt,
      originalJob: { ...msg, companyProjects: msg.companyProjects ? [...msg.companyProjects] : undefined },
      resetInProgress: false,
      lastMemorySyncAt: null,
      wasActiveAfterSync: false,
      respawnFailureCount: 0,
      lastRespawnFailureAt: null,
    };
    this.persistentAgents.set(role, persistentAgent);

    const uuid = this.machineUuid;
    persistentAgent.heartbeatTimer = setInterval(() => {
      void (async () => {
        if (persistentAgent.resetInProgress) {
          return;
        }

        try {
          const captureOutput = await capturePane(persistentAgent.tmuxSession);
          const outputHash = createHash("sha256").update(captureOutput).digest("hex");
          const changed = outputHash !== persistentAgent.lastOutputHash;
          if (changed) {
            const now = Date.now();
            persistentAgent.lastOutputHash = outputHash;
            persistentAgent.lastActivityAt = now;
            // Output changes should NOT re-arm the sync nudge — only human input resets lastMemorySyncAt.
            console.log(`[memory-sync] ${persistentAgent.role}: output changed, state preserved (lastMemorySyncAt=${persistentAgent.lastMemorySyncAt})`);
            persistentAgent.wasActiveAfterSync = true;
          }
          console.log(
            `[executor] Persistent heartbeat ${persistentAgent.role}: changed=${changed} idle=${Math.floor((Date.now() - persistentAgent.lastActivityAt) / 1000)}s`,
          );

          const IDLE_SYNC_THRESHOLD_MS = 5 * 60_000;
          const idleSinceActivity = Date.now() - persistentAgent.lastActivityAt;
          const shouldNudge =
            idleSinceActivity >= IDLE_SYNC_THRESHOLD_MS &&
            persistentAgent.lastMemorySyncAt === null &&
            !persistentAgent.resetInProgress;

          if (shouldNudge) {
            const now = Date.now();
            persistentAgent.lastMemorySyncAt = now;
            const syncPrompt =
              "Review this session. If anything worth remembering happened — decisions, preferences, corrections, context — update your .memory/ files. Remove or update any stale memories. If nothing notable, do nothing.";
            try {
              await execFileAsync("tmux", [
                "send-keys",
                "-t",
                persistentAgent.tmuxSession,
                syncPrompt,
                "Enter",
              ]);
              console.log(`[memory-sync] ${persistentAgent.role}: nudge fired (idle=${Math.floor(idleSinceActivity / 1000)}s)`);
            } catch (err) {
              console.warn(`[memory-sync] ${persistentAgent.role}: nudge failed: ${String(err)}`);
            }
          } else if (idleSinceActivity >= IDLE_SYNC_THRESHOLD_MS && persistentAgent.lastMemorySyncAt !== null) {
            console.log(`[memory-sync] ${persistentAgent.role}: nudge skipped, already synced at ${new Date(persistentAgent.lastMemorySyncAt).toISOString()}`);
          }
        } catch (err) {
          console.warn(`[executor] Failed to capture pane for ${persistentAgent.role}: ${String(err)}`);
        }

        if (Date.now() - persistentAgent.startedAt >= MIN_SESSION_AGE_MS && persistentAgent.consecutiveResetFailures > 0) {
          persistentAgent.consecutiveResetFailures = 0;
          persistentAgent.lastResetAt = null;
        }

        await this.checkCacheTtl(persistentAgent);

        if (resolvedCompanyId && uuid) {
          this.supabase
            .from("persistent_agents")
            .update({ last_heartbeat: new Date().toISOString() })
            .eq("company_id", resolvedCompanyId)
            .eq("machine_id", uuid)
            .eq("status", "running")
            .then(({ error }) => {
              if (error) console.warn(`[executor] Heartbeat update failed for persistent_agents: ${error.message}`);
            });
        }
      })().catch((err) => {
        console.error(`[executor] Persistent heartbeat crashed for ${persistentAgent.role}:`, err);
      });
    }, HEARTBEAT_INTERVAL_MS);

    // Track in activeJobs (no poll/timeout timers — persistent agent runs indefinitely)
    this.activeJobs.set(jobId, {
      jobId,
      slotType,
      slotAcquired: false,
      sessionName,
      pollTimer: null,
      timeoutTimer: null,
      settled: false,
      startedAt: Date.now(),
      logPath: "",
      lastBytesSent: 0,
      lastLifecycleBytesSent: 0,
      role: msg.role,
      attempt: 1,
      maxAttempts: 3,
      fixReasons: [],
      complexity: msg.complexity,
      model: msg.model,
    });

    await this.sendJobStatus(jobId, "executing");
    console.log(`[executor] Persistent ${role} session=${sessionName} ready — jobId=${jobId}`);
  }

  // ---------------------------------------------------------------------------

  // TODO(memory): TTL-based resets are a blunt proxy for context management — they discard
  // session state rather than preserving it. Real context management should detect context
  // pressure, distill the current session into memory files, then restart and reload from them.
  // Until that exists, persistent exec roles (CPO, CTO) run with both TTLs disabled (= 0).
  // See: cache_ttl_minutes / hard_ttl_minutes in the roles table.
  private async checkCacheTtl(agent: ActivePersistentAgent): Promise<void> {
    if (agent.resetInProgress) return;
    if (agent.cacheTtlMinutes <= 0 && agent.hardTtlMinutes <= 0) return;

    const now = Date.now();
    const idleMs = now - agent.lastActivityAt;
    const sessionAgeMs = now - agent.startedAt;

    if (sessionAgeMs < MIN_SESSION_AGE_MS) {
      return;
    }

    let humanAttached = false;
    try {
      const { stdout } = await execFileAsync("tmux", ["list-clients", "-t", agent.tmuxSession]);
      humanAttached = stdout.trim().length > 0;
    } catch {
      humanAttached = false;
    }

    if (humanAttached) {
      agent.lastActivityAt = now;
    }

    const idleTtlExpired = agent.cacheTtlMinutes > 0 && idleMs > agent.cacheTtlMinutes * 60_000;
    const hardTtlExpired = agent.hardTtlMinutes > 0 && sessionAgeMs > agent.hardTtlMinutes * 60_000;

    if (!hardTtlExpired && (!idleTtlExpired || humanAttached)) {
      if (idleTtlExpired && humanAttached) {
        console.log(`[executor] Cache-TTL suppressed for ${agent.role}: human attached`);
      }
      return;
    }

    const reason = hardTtlExpired ? "hard-TTL" : "idle-TTL";
    console.log(
      `[executor] Cache-TTL reset triggered for ${agent.role}: ${reason} (idle=${Math.floor(idleMs / 1000)}s, age=${Math.floor(sessionAgeMs / 1000)}s)`,
    );
    await this.resetPersistentSession(agent, reason);
  }

  private async resetPersistentSession(
    agent: ActivePersistentAgent,
    reason: string,
  ): Promise<void> {
    if (agent.resetInProgress) {
      return;
    }

    agent.resetInProgress = true;

    try {
      await execFileAsync("tmux", ["send-keys", "-t", agent.tmuxSession, "exit", "Enter"]);
      await sleep(5_000);

      try {
        await execFileAsync("tmux", ["has-session", "-t", agent.tmuxSession]);
        await execFileAsync("tmux", ["send-keys", "-t", agent.tmuxSession, "C-c"]);
        await sleep(3_000);
        try {
          await execFileAsync("tmux", ["kill-session", "-t", agent.tmuxSession]);
        } catch {
          // Session already exited.
        }
      } catch {
        // Session is already gone.
      }

      const refreshedRoleConfig = await this.loadPersistentRoleConfig(agent.role);

      const activeJob = this.activeJobs.get(agent.jobId);
      if (activeJob) {
        activeJob.settled = true;
        this.clearJobTimers(activeJob);
        this.activeJobs.delete(agent.jobId);
      }

      const replayJob: PersistentStartJob = {
        ...agent.originalJob,
        promptStackMinusSkills: this.refreshPersistentPromptStack(
          agent.originalJob.promptStackMinusSkills,
          agent.rolePromptSnapshot,
          refreshedRoleConfig.prompt,
        ),
        rolePrompt: refreshedRoleConfig.prompt,
      };

      this.clearPersistentAgent(agent.role, { updateDbStatus: false });
      await this.handlePersistentJob(agent.jobId, replayJob, replayJob.slotType, agent.companyId);

      const restartedAgent = this.persistentAgents.get(agent.role);
      if (restartedAgent) {
        restartedAgent.consecutiveResetFailures = 0;
        restartedAgent.lastResetAt = Date.now();
      }

      console.log(`[executor] Cache-TTL reset complete for ${agent.role} (reason: ${reason})`);
    } catch (err) {
      agent.consecutiveResetFailures += 1;
      const now = Date.now();
      const lastResetAt = agent.lastResetAt;
      agent.lastResetAt = now;
      agent.resetInProgress = false;

      console.error(`[executor] Cache-TTL reset FAILED for ${agent.role} (attempt ${agent.consecutiveResetFailures}):`, err);

      if (
        agent.consecutiveResetFailures >= MAX_RESET_FAILURES
        && lastResetAt !== null
        && now - lastResetAt <= RESET_FAILURE_WINDOW_MS
      ) {
        console.error(`[executor] CIRCUIT BREAKER: ${agent.role} reset loop detected — pausing auto-reset`);
        agent.cacheTtlMinutes = 0;
      }
    }
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
      const { error: appendErr } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "tmux",
        p_chunk: logChunk.chunk,
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }

    // Lifecycle log flush
    const lifecycleLogPath1 = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
    const lifecycleChunk1 = readLogFileFrom(lifecycleLogPath1, job.lastLifecycleBytesSent);
    if (lifecycleChunk1 !== null) {
      const { error } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "lifecycle",
        p_chunk: lifecycleChunk1.chunk,
      });
      if (!error) {
        job.lastLifecycleBytesSent = lifecycleChunk1.newOffset;
      } else {
        console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
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
      await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }

    // Release the slot (persistent agents don't consume slots)
    if (!stoppedPersistentRole && job.slotAcquired) {
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
      // Stuck detection: check pipe-pane last-modified
      try {
        const stat = statSync(job.logPath);
        const silenceMs = Date.now() - stat.mtimeMs;
        if (silenceMs > STUCK_NO_OUTPUT_MS) {
          const silenceMin = (silenceMs / 60_000).toFixed(1);
          jobLog(jobId, `Stuck detected - no pipe-pane output for ${silenceMin}m, killing session`);
          console.log(`[executor] Killing job ${jobId} - no pipe-pane output for ${silenceMin} minutes`);
          await killTmuxSession(job.sessionName);
          await this.sendJobFailed(jobId, `No pipe-pane output for ${silenceMin} minutes`, "stuck_no_output");
          await this.settleJob(jobId);
          return;
        }
      } catch (err) {
        // If stat fails (file doesn't exist yet), skip stuck detection for this tick
        jobLog(jobId, `Could not stat logPath for stuck detection: ${String(err)}`);
      }

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
        const { error: appendErr } = await this.supabase.rpc("append_job_log", {
          p_job_id: jobId,
          p_type: "tmux",
          p_chunk: logChunk.chunk,
        });
        if (appendErr) {
          console.warn(`[executor] Log append failed for jobId=${jobId}: ${appendErr.message}`);
        } else {
          job.lastBytesSent = logChunk.newOffset;
        }
      }

      // Lifecycle log flush
      const lifecycleLogPath2 = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
      const lifecycleChunk2 = readLogFileFrom(lifecycleLogPath2, job.lastLifecycleBytesSent);
      if (lifecycleChunk2 !== null) {
        const { error } = await this.supabase.rpc("append_job_log", {
          p_job_id: jobId,
          p_type: "lifecycle",
          p_chunk: lifecycleChunk2.chunk,
        });
        if (!error) {
          job.lastLifecycleBytesSent = lifecycleChunk2.newOffset;
        } else {
          console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
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
      const { error: appendErr } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "tmux",
        p_chunk: logChunk.chunk,
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }

    // Lifecycle log flush
    const lifecycleLogPath3 = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
    const lifecycleChunk3 = readLogFileFrom(lifecycleLogPath3, job.lastLifecycleBytesSent);
    if (lifecycleChunk3 !== null) {
      const { error } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "lifecycle",
        p_chunk: lifecycleChunk3.chunk,
      });
      if (!error) {
        job.lastLifecycleBytesSent = lifecycleChunk3.newOffset;
      } else {
        console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
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
      await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }

    // Only release slot for non-persistent jobs
    if (!timedOutPersistentRole && job.slotAcquired) {
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

    // Codex post-execution review: stage+commit codex output, then run Haiku on
    // the committed diff before completing. Only applies to codex jobs with a
    // worktree (code-context jobs). Skip for non-code roles that don't have
    // specs/acceptance criteria (ci-checker, reviewer, job-merger, etc.).
    const SKIP_REVIEW_ROLES = new Set(["ci-checker", "reviewer", "job-merger"]);
    if (job.slotType === "codex" && job.worktreePath && !SKIP_REVIEW_ROLES.has(job.role ?? "")) {
      let reviewResult: Awaited<ReturnType<typeof runCodexReview>>;
      try {
        reviewResult = await runCodexReview(job, job.spec ?? "", job.acceptanceCriteria ?? "");
      } catch (reviewErr) {
        reviewResult = {
          pass: false,
          reason: `Codex review crashed: ${String(reviewErr)}`,
          committed: false,
        };
      }
      jobLog(jobId, `Codex review: pass=${reviewResult.pass}, reason=${reviewResult.reason}`);
      console.log(`[executor] Codex review for jobId=${jobId}: pass=${reviewResult.pass}, reason=${reviewResult.reason}`);

      if (!reviewResult.pass) {
        job.fixReasons.push(reviewResult.reason);

        if (job.attempt < job.maxAttempts) {
          job.attempt += 1;
          console.log(`[codex] Review FAILED (attempt ${job.attempt - 1}/${job.maxAttempts}) — ${reviewResult.reason}`);
          console.log(`[codex] Retrying with fix prompt — attempt ${job.attempt}/${job.maxAttempts}, keeping existing changes in place`);
          jobLog(
            jobId,
            `Codex review failed — retrying attempt ${job.attempt}/${job.maxAttempts}. reason="${reviewResult.reason}"`,
          );

          try {
            const fixPromptPath = buildFixPrompt(job);
            const built = buildCommand(
              job.slotType,
              job.complexity ?? "medium",
              job.model ?? "codex",
              job.worktreePath,
              fixPromptPath,
              job.repoDir,
            );

            if (await isTmuxSessionAlive(job.sessionName)) {
              await killTmuxSession(job.sessionName);
            }

            await spawnTmuxSession(job.sessionName, built.cmd, built.args, job.worktreePath);
            try {
              await startPipePane(job.sessionName, job.logPath);
              jobLog(jobId, `pipe-pane restarted for retry attempt ${job.attempt}`);
            } catch (pipeErr) {
              jobLog(jobId, `pipe-pane restart FAILED (retry attempt ${job.attempt}): ${String(pipeErr)}`);
              console.warn(`[executor] pipe-pane restart failed for retry jobId=${jobId}: ${String(pipeErr)}`);
            }

            job.startedAt = Date.now();
            job.settled = false;
            job.timeoutTimer = setTimeout(() => {
              void this.onJobTimeout(jobId);
            }, JOB_TIMEOUT_MS);
            job.pollTimer = setInterval(() => {
              this.pollJob(jobId).catch((err) => {
                jobLog(jobId, `pollJob CRASHED: ${String(err)}`);
                console.error(`[executor] pollJob crashed for jobId=${jobId}:`, err);
              });
            }, POLL_INTERVAL_MS);
            jobLog(jobId, `Retry timers started (interval=${POLL_INTERVAL_MS}ms)`);

            // Flush lifecycle logs accumulated during this attempt before returning —
            // the next alive=true poll will capture them if the retry session runs
            // long enough, but if it dies quickly we'd lose them without this flush.
            const retryLifecycleLogPath = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
            const retryLifecycleChunk = readLogFileFrom(retryLifecycleLogPath, job.lastLifecycleBytesSent);
            if (retryLifecycleChunk !== null) {
              try {
                const { error: retryFlushErr } = await this.supabase.rpc("append_job_log", {
                  p_job_id: jobId,
                  p_type: "lifecycle",
                  p_chunk: retryLifecycleChunk.chunk,
                });
                if (!retryFlushErr) {
                  job.lastLifecycleBytesSent = retryLifecycleChunk.newOffset;
                } else {
                  console.warn(`[executor] Retry lifecycle flush failed for jobId=${jobId}: ${retryFlushErr.message}`);
                }
              } catch (retryFlushCrash) {
                console.warn(`[executor] Retry lifecycle flush crashed for jobId=${jobId}: ${String(retryFlushCrash)}`);
              }
            }

            return;
          } catch (retryErr) {
            jobLog(jobId, `Retry spawn FAILED on attempt ${job.attempt}: ${String(retryErr)}`);
          }
        }

        // Final attempt failed — revert everything to startingCommit
        console.log(`[codex] All ${job.maxAttempts} attempts exhausted — reverting to starting commit`);
        console.log(`[codex] Failure reasons: ${job.fixReasons.map((r, i) => `[${i + 1}] ${r}`).join(" | ")}`);
        try {
          await execFileAsync("git", ["reset", "--hard", job.startingCommit!], { cwd: job.worktreePath });
          jobLog(jobId, `Reverted to startingCommit ${job.startingCommit} after ${job.attempt} failed attempts.`);
        } catch (revertErr) {
          jobLog(jobId, `Final revert failed (non-fatal): ${String(revertErr)}`);
        }

        this.activeJobs.delete(jobId);
        const exitedPersistentRole = [...this.persistentAgents.values()].find(a => a.jobId === jobId)?.role;
        if (exitedPersistentRole) {
          this.clearPersistentAgent(exitedPersistentRole);
        } else if (job.slotAcquired) {
          this.slots.release(job.slotType);
        }

        // Flush log before failing
        const failLogChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
        if (failLogChunk !== null) {
          try {
            const { error: appendErr } = await this.supabase.rpc("append_job_log", {
              p_job_id: jobId,
              p_type: "tmux",
              p_chunk: failLogChunk.chunk,
            });
            if (appendErr) {
              console.warn(`[executor] Final failure log flush failed for jobId=${jobId}: ${appendErr.message}`);
            }
          } catch (appendErr) {
            console.warn(`[executor] Final failure log flush crashed for jobId=${jobId}: ${String(appendErr)}`);
          }
        }

        // Lifecycle log flush (best-effort)
        const lifecycleLogPath4 = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
        const lifecycleChunk4 = readLogFileFrom(lifecycleLogPath4, job.lastLifecycleBytesSent);
        if (lifecycleChunk4 !== null) {
          try {
            const { error } = await this.supabase.rpc("append_job_log", {
              p_job_id: jobId,
              p_type: "lifecycle",
              p_chunk: lifecycleChunk4.chunk,
            });
            if (!error) {
              job.lastLifecycleBytesSent = lifecycleChunk4.newOffset;
            } else {
              console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
            }
          } catch (appendErr) {
            console.warn(`[executor] Lifecycle log flush crashed for jobId=${jobId}: ${String(appendErr)}`);
          }
        }

        await this.sendJobFailed(jobId, job.fixReasons.join(" | "), "unknown");

        // Final lifecycle flush — captures the "FAILED" and "job_failed event sent"
        // log entries written inside sendJobFailed after the pre-send flush above.
        const finalFailLifecycleLogPath = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
        const finalFailLifecycleChunk = readLogFileFrom(finalFailLifecycleLogPath, job.lastLifecycleBytesSent);
        if (finalFailLifecycleChunk !== null) {
          try {
            const { error: finalFailFlushErr } = await this.supabase.rpc("append_job_log", {
              p_job_id: jobId,
              p_type: "lifecycle",
              p_chunk: finalFailLifecycleChunk.chunk,
            });
            if (finalFailFlushErr) {
              console.warn(`[executor] Post-sendJobFailed lifecycle flush failed for jobId=${jobId}: ${finalFailFlushErr.message}`);
            }
          } catch (finalFailFlushCrash) {
            console.warn(`[executor] Post-sendJobFailed lifecycle flush crashed for jobId=${jobId}: ${String(finalFailFlushCrash)}`);
          }
        }

        return;
      }

      if (job.attempt > 1) {
        console.log(`[codex] Review PASSED (attempt ${job.attempt}/${job.maxAttempts}) — fixed after ${job.attempt - 1} retry`);
      }
    }

    this.activeJobs.delete(jobId);

    // Clear persistent agent state if the persistent session exited unexpectedly
    const exitedPersistentRole = [...this.persistentAgents.values()].find(a => a.jobId === jobId)?.role;
    if (exitedPersistentRole) {
      this.clearPersistentAgent(exitedPersistentRole);
    } else if (job.slotAcquired) {
      // Only release slot for non-persistent jobs
      this.slots.release(job.slotType);
    }

    // Look for the report file. Agents write .reports/cpo-report.md relative to
    // their CWD which is the ephemeral workspace dir (e.g. ~/.zazigv2/job-<id>/).
    // Fall back to $HOME for persistent agents that don't have a workspace dir.
    const homeDir = process.env["HOME"] ?? "/tmp";
    const archiveDir = `${homeDir}/${REPORT_ARCHIVE_DIR}`;
    const jobReportPath = `${archiveDir}/${jobId}.md`;

    let result = "NO_REPORT";
    let report: string | undefined;
    mkdirSync(archiveDir, { recursive: true });

    if (job.role === "reviewer") {
      if (!job.worktreePath) {
        result = "FAILED: Reviewer job missing required worktreePath";
        jobLog(jobId, "Report search ERROR — reviewer job missing required worktreePath");
      } else {
        const reviewerReportPath = `${job.worktreePath}/.reports/reviewer-report.md`;
        jobLog(jobId, `Report search — reviewer canonical path=${reviewerReportPath}`);
        try {
          renameSync(reviewerReportPath, jobReportPath);
          report = readFileSync(jobReportPath, "utf-8");
          jobLog(jobId, `Report FOUND at ${reviewerReportPath} (${report.length} chars)`);
          console.log(`[executor] Claimed report for jobId=${jobId} from ${reviewerReportPath} → ${jobReportPath}`);
        } catch {
          jobLog(jobId, `Report not at ${reviewerReportPath}`);
        }
      }
    } else {
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
        deployer: ".reports/deploy-report.md",
        "test-deployer": ".reports/deploy-report.md",
        tester: ".reports/tester-report.md",
        "job-merger": ".reports/job-merger-report.md",
      };
      const fallback = job.role ? REPORT_FALLBACKS[job.role] : undefined;
      if (fallback && fallback !== rpPath) {
        if (job.worktreePath) candidatePaths.push(`${job.worktreePath}/${fallback}`);
        else if (job.workspaceDir) candidatePaths.push(`${job.workspaceDir}/${fallback}`);
        candidatePaths.push(`${homeDir}/${fallback}`);
      }

      jobLog(jobId, `Report search — rpPath=${rpPath}, fallback=${fallback ?? "none"}, candidates=${JSON.stringify(candidatePaths)}`);
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
    }

    if (report) {
      // Check for structured report format (status: pass/passed/success/fail/failed)
      const passMatch = report.match(/^status:\s*(pass(?:ed)?|success|fail(?:ed)?)\s*$/m);
      if (passMatch) {
        const prefix = passMatch[1].startsWith("fail") ? "FAILED" : "PASSED";
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
    } else if (result === "NO_REPORT") {
      jobLog(jobId, `Report NOT FOUND — result="NO_REPORT"`);
      console.log(`[executor] No report file for jobId=${jobId}, result=NO_REPORT`);
    } else {
      jobLog(jobId, `Report retrieval failed — result="${result}"`);
      console.log(`[executor] Report retrieval failed for jobId=${jobId}, result=${result}`);
    }

    // Final log flush — capture anything written after the last poll tick
    const logChunk = readLogFileFrom(job.logPath, job.lastBytesSent);
    if (logChunk !== null) {
      const { error: appendErr } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "tmux",
        p_chunk: logChunk.chunk,
      });
      if (appendErr) {
        console.warn(`[executor] Final log flush failed for jobId=${jobId}: ${appendErr.message}`);
      }
    }

    // Lifecycle log flush
    const lifecycleLogPath5 = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
    const lifecycleChunk5 = readLogFileFrom(lifecycleLogPath5, job.lastLifecycleBytesSent);
    if (lifecycleChunk5 !== null) {
      const { error } = await this.supabase.rpc("append_job_log", {
        p_job_id: jobId,
        p_type: "lifecycle",
        p_chunk: lifecycleChunk5.chunk,
      });
      if (!error) {
        job.lastLifecycleBytesSent = lifecycleChunk5.newOffset;
      } else {
        console.warn(`[executor] Lifecycle log flush failed for jobId=${jobId}: ${error.message}`);
      }
    }

    // deleteLogFile(job.logPath); // Disabled — keeping logs for debugging

    // Push job branch before sending JobComplete.
    let pr: string | undefined;
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
      try {
        await this.repoManager.removeJobWorktree(job.repoDir!, job.worktreePath);
      } catch (worktreeErr) {
        jobLog(jobId, `Worktree cleanup failed (non-fatal): ${String(worktreeErr)}`);
        console.warn(`[executor] Worktree cleanup failed for jobId=${jobId}: ${String(worktreeErr)}`);
      }

      // Create GitHub PR for combine jobs (after branch push succeeds)
      if (job.cardType === "combine" && job.repoUrl && job.featureBranch) {
        // Guard: if the feature branch has no commits ahead of master the combiner
        // merged nothing (e.g. all job branches were empty). Fail rather than let
        // PR creation blow up with "No commits between master and feature branch."
        let featureBranchCommitCount = 1; // optimistic default
        try {
          const { stdout: countOut } = await execFileAsync(
            "git", ["rev-list", "--count", `master..${job.featureBranch}`],
            { cwd: job.repoDir! },
          );
          featureBranchCommitCount = parseInt(countOut.trim(), 10) || 0;
        } catch (countErr) {
          jobLog(jobId, `Could not count commits on feature branch (non-fatal): ${String(countErr)}`);
        }

        if (featureBranchCommitCount === 0) {
          jobLog(jobId, `Combine job produced no commits on ${job.featureBranch} — overriding result to FAILED`);
          console.warn(`[executor] Combine job ${jobId} has 0 commits ahead of master on ${job.featureBranch} — failing`);
          result = "FAILED: No commits to combine — feature branch has no commits ahead of master";
        } else {
          // If the agent already created the PR and reported the URL in its result,
          // extract it and skip the redundant gh pr create call (which would fail with
          // "PR already exists"). Still pass to createPRForCombineJob for DB persistence.
          const prUrlInResult = result.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/)?.[0];
          if (prUrlInResult) {
            jobLog(jobId, `PR already created by agent — using URL from report: ${prUrlInResult}`);
            pr = await this.createPRForCombineJob(jobId, job, prUrlInResult);
          } else {
            pr = await this.createPRForCombineJob(jobId, job);
          }
        }
      }
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
    }

    if (result === "PASSED" || result.startsWith("PASSED:")) {
      jobLog(jobId, `Sending JobComplete — result="${result}", hasReport=${!!report}`);
      try {
        await this.sendJobComplete(jobId, result, report, job.jobBranch, pr);
        jobLog(jobId, `JobComplete sent successfully`);
      } catch (sendErr) {
        jobLog(jobId, `sendJobComplete FAILED: ${String(sendErr)}`);
        console.error(`[executor] sendJobComplete failed for jobId=${jobId}:`, sendErr);
      }
    } else {
      jobLog(jobId, `Sending JobFailed — result="${result}"`);
      try {
        await this.sendJobFailed(jobId, result, "unknown", report);
        jobLog(jobId, `JobFailed sent successfully`);
      } catch (sendErr) {
        jobLog(jobId, `sendJobFailed FAILED: ${String(sendErr)}`);
        console.error(`[executor] sendJobFailed failed for jobId=${jobId}:`, sendErr);
      }
    }

    // Final lifecycle flush — captures log entries written during branch push,
    // PR creation, and inside sendJobComplete/sendJobFailed (after the earlier flush).
    const postSendLifecycleLogPath = join(JOB_LOG_DIR, `${jobId}-pre-post.log`);
    const postSendLifecycleChunk = readLogFileFrom(postSendLifecycleLogPath, job.lastLifecycleBytesSent);
    if (postSendLifecycleChunk !== null) {
      try {
        const { error: postSendFlushErr } = await this.supabase.rpc("append_job_log", {
          p_job_id: jobId,
          p_type: "lifecycle",
          p_chunk: postSendLifecycleChunk.chunk,
        });
        if (postSendFlushErr) {
          console.warn(`[executor] Post-send lifecycle flush failed for jobId=${jobId}: ${postSendFlushErr.message}`);
        }
      } catch (postSendFlushCrash) {
        console.warn(`[executor] Post-send lifecycle flush crashed for jobId=${jobId}: ${String(postSendFlushCrash)}`);
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

  private async createPRForCombineJob(jobId: string, job: ActiveJob, existingPrUrl?: string): Promise<string | undefined> {
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

    // If the agent already created the PR, just persist the URL to the DB and return.
    if (existingPrUrl && featureId) {
      await this.supabase.from("features")
        .update({ pr_url: existingPrUrl })
        .eq("id", featureId);
      jobLog(jobId, `PR URL persisted for feature ${featureId}: ${existingPrUrl}`);
      return existingPrUrl;
    }

    const match = repoUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (!match) {
      jobLog(jobId, `PR skipped — cannot parse owner/repo from "${repoUrl}"`);
      return undefined;
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
      return prUrl || undefined;
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
          return prs[0].url;
        }
      } catch { /* best-effort */ }
      return undefined;
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
  private clearPersistentAgent(role?: string, options?: { updateDbStatus?: boolean }): void {
    const agentsToClear = role
      ? (this.persistentAgents.has(role) ? [this.persistentAgents.get(role)!] : [])
      : [...this.persistentAgents.values()];
    const updateDbStatus = options?.updateDbStatus ?? true;

    for (const agent of agentsToClear) {
      if (agent.heartbeatTimer) {
        clearInterval(agent.heartbeatTimer);
        agent.heartbeatTimer = null;
      }

      if (updateDbStatus && agent.companyId && this.machineUuid) {
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

  private async settleJob(jobId: string): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.settled = true;
    this.clearJobTimers(job);
    this.activeJobs.delete(jobId);

    const persistentRole = [...this.persistentAgents.values()].find((agent) => agent.jobId === jobId)?.role;
    if (persistentRole) {
      this.clearPersistentAgent(persistentRole);
    } else if (job.slotAcquired) {
      this.slots.release(job.slotType);
    }

    if (job.worktreePath && job.repoDir) {
      try {
        await this.repoManager.removeJobWorktree(job.repoDir, job.worktreePath);
      } catch (err) {
        console.warn(`[executor] Failed to clean worktree for jobId=${jobId}: ${String(err)}`);
      }
    } else {
      cleanupJobWorkspace(jobId, job.workspaceDir);
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
    report?: string,
    branch?: string,
    pr?: string,
  ): Promise<void> {
    // Broadcast via Realtime (single writer pattern: orchestrator persists terminal state).
    await this.send({
      type: "job_complete",
      protocolVersion: PROTOCOL_VERSION,
      jobId,
      machineId: this.machineId,
      result,
      branch: branch ?? undefined,
      pr_url: pr ?? undefined,
      ...(pr !== undefined ? { pr } : {}),
      ...(report !== undefined ? { report } : {}),
    });
  }

  /**
   * Attempt to merge conflicting dependency branches one at a time, using
   * a short-lived `claude -p` agent to resolve each conflict inline.
   * Returns true if all conflicts were resolved, false otherwise.
   */
  private async resolveDepMergeConflicts(
    jobId: string,
    worktreePath: string,
    baseBranch: string,
    conflictBranches: string[],
  ): Promise<boolean> {
    for (const branch of conflictBranches) {
      jobLog(jobId, `Attempting merge + conflict resolution for branch: ${branch}`);

      // Start the merge (will leave conflict markers in working tree)
      try {
        await execFileAsync("git", ["-C", worktreePath, "merge", "--no-edit", branch], { encoding: "utf8" });
        // Merged cleanly on retry (shouldn't happen but handle gracefully)
        jobLog(jobId, `Branch "${branch}" merged cleanly on retry`);
        continue;
      } catch {
        // Expected — conflicts exist. Check if it's actually a conflict vs other error.
        try {
          const { stdout: status } = await execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"], { encoding: "utf8" });
          const hasConflicts = status.split("\n").some(line => line.startsWith("UU ") || line.startsWith("AA ") || line.startsWith("DD "));
          if (!hasConflicts) {
            jobLog(jobId, `Merge of "${branch}" failed but no conflict markers found — aborting`);
            try { await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" }); } catch {}
            return false;
          }
        } catch {
          try { await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" }); } catch {}
          return false;
        }
      }

      // List conflicted files for the agent prompt
      let conflictedFiles: string;
      try {
        const { stdout } = await execFileAsync("git", ["-C", worktreePath, "diff", "--name-only", "--diff-filter=U"], { encoding: "utf8" });
        conflictedFiles = stdout.trim();
      } catch {
        conflictedFiles = "(could not list conflicted files)";
      }

      const prompt = [
        `You are resolving git merge conflicts in a worktree.`,
        `The current branch was created from dependency branch "${baseBranch}".`,
        `A merge of branch "${branch}" has produced conflicts in these files:`,
        ``,
        conflictedFiles,
        ``,
        `Your job:`,
        `1. Read each conflicted file`,
        `2. Resolve the conflict markers (<<<<<<< / ======= / >>>>>>>) by keeping the combined intent of both sides`,
        `3. Stage the resolved files with git add`,
        `4. Complete the merge with: git commit --no-edit`,
        ``,
        `Do NOT modify any files beyond resolving the conflict markers.`,
        `Do NOT create new branches or push.`,
      ].join("\n");

      // Write prompt to temp file to avoid ARG_MAX
      const promptPath = join(worktreePath, ".merge-resolve-prompt.tmp");
      writeFileSync(promptPath, prompt);

      // Run conflict resolution in a tmux session (same path as main jobs)
      // so output is visible and pipe-pane captures everything.
      const branchSlug = branch.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 16);
      const resolveSession = `resolve-${jobId.slice(0, 8)}-${branchSlug}`;
      const logPath = jobLogPath(jobId);

      try {
        // Kill any leftover session from a previous failed attempt
        await killTmuxSession(resolveSession);

        // Log context to pipe-pane before spawning
        appendFileSync(logPath, `[conflict-resolution] Resolving conflicts for branch: ${branch}\n`);
        appendFileSync(logPath, `[conflict-resolution] Conflicted files:\n${conflictedFiles}\n`);

        // Spawn tmux session running claude -p, with a wrapper that:
        // 1. Logs the exit code so we can see if claude crashed vs completed
        // 2. Keeps the session alive for 5s after exit so pipe-pane can flush
        const claudeCmd = shellEscape(["claude", "--model", "claude-sonnet-4-6", "-p"]);
        const wrappedCmd = [
          `unset CLAUDECODE`,
          `echo "[conflict-resolution] Starting claude -p at $(date -u +%Y-%m-%dT%H:%M:%SZ)"`,
          `cat ${shellEscape([promptPath])} | ${claudeCmd} 2>&1`,
          `RC=$?`,
          `echo ""`,
          `echo "[conflict-resolution] claude -p exited with code $RC at $(date -u +%Y-%m-%dT%H:%M:%SZ)"`,
          `sleep 5`,
        ].join("; ");

        await execFileAsync("tmux", [
          "new-session", "-d",
          "-s", resolveSession,
          ...(worktreePath ? ["-c", worktreePath] : []),
          wrappedCmd,
        ]);

        // Pipe-pane the session output to the job log
        await startPipePane(resolveSession, logPath);

        jobLog(jobId, `Conflict resolution tmux session started: ${resolveSession}`);

        // Poll until the session ends (max 10 minutes)
        const RESOLVE_TIMEOUT_MS = 600_000;
        const POLL_INTERVAL_MS = 3_000;
        const deadline = Date.now() + RESOLVE_TIMEOUT_MS;

        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
          if (!(await isTmuxSessionAlive(resolveSession))) break;
        }

        // If still alive after timeout, kill it
        if (await isTmuxSessionAlive(resolveSession)) {
          jobLog(jobId, `Conflict resolution timed out for "${branch}" — killing session`);
          appendFileSync(logPath, `[conflict-resolution] TIMEOUT for "${branch}" after ${RESOLVE_TIMEOUT_MS / 1000}s\n`);
          await killTmuxSession(resolveSession);
          try { await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" }); } catch {}
          return false;
        }

        jobLog(jobId, `Conflict resolution session ended for "${branch}"`);

        // Verify merge completed (no more conflict markers)
        const { stdout: status } = await execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"], { encoding: "utf8" });
        const stillConflicted = status.split("\n").some(line => line.startsWith("UU ") || line.startsWith("AA ") || line.startsWith("DD "));
        if (stillConflicted) {
          jobLog(jobId, `Conflict resolution agent did not resolve all conflicts for "${branch}"`);
          appendFileSync(logPath, `[conflict-resolution] Still has unresolved conflicts after agent ran for "${branch}"\n`);
          try { await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" }); } catch {}
          return false;
        }
      } catch (err) {
        const errMsg = String(err);
        jobLog(jobId, `Conflict resolution failed for "${branch}": ${errMsg}`);
        try { appendFileSync(logPath, `[conflict-resolution] FAILED for "${branch}": ${errMsg}\n`); } catch {}
        try { await killTmuxSession(resolveSession); } catch {}
        try { await execFileAsync("git", ["-C", worktreePath, "merge", "--abort"], { encoding: "utf8" }); } catch {}
        return false;
      } finally {
        try { unlinkSync(promptPath); } catch {}
      }
    }

    return true;
  }

  private async sendJobFailed(
    jobId: string,
    result: string,
    failureReason: FailureReason,
    report?: string,
  ): Promise<void> {
    jobLog(jobId, `FAILED — reason=${failureReason}, error="${result.slice(0, 200)}"`);
    // Broadcast via Realtime (single writer pattern: orchestrator persists terminal state).
    try {
      await this.send({
        type: "job_failed",
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        machineId: this.machineId,
        error: result,
        failureReason,
        ...(report !== undefined ? { report } : {}),
      });
      jobLog(jobId, "job_failed event sent to orchestrator");
    } catch (sendErr) {
      jobLog(jobId, `send() FAILED in sendJobFailed: ${String(sendErr)}`);
      console.error(`[executor] this.send() failed in sendJobFailed jobId=${jobId}:`, sendErr);
    }
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
 *   1. Stage and commit codex changes while excluding workspace overlay files
 *   2. Review only the committed diff (HEAD~1..HEAD)
 *   3. Writes the review prompt to a temp file to avoid ARG_MAX issues
 *   4. Pipes the prompt into `claude --model claude-haiku-4-5-20251001 -p` via cat
 *   5. Parses "PASS" or "FAIL: reason" from the output
 *   6. On any error, returns FAIL with the error message
 */
async function runCodexReview(
  job: ActiveJob,
  jobSpec: string,
  acceptanceCriteria: string,
): Promise<{
  pass: boolean;
  reason: string;
  committed: boolean;
  codexSelfCommitted?: boolean;
  startingCommit?: string;
}> {
  const worktreePath = job.worktreePath!;
  const overlayPaths = [
    "CLAUDE.md",
    ".mcp.json",
    ".claude/",
    ".gitignore",
    ".zazig-prompt.txt",
    ".zazig-review-prompt.txt",
    ".zazig-fix-prompt-*.txt",
    ".zazig-fix-prompt-1.txt",
    ".zazig-fix-prompt-2.txt",
    ".zazig-fix-prompt-3.txt",
  ];

  // Use pre-recorded starting commit (captured before Codex spawned) if available.
  // Falls back to current HEAD for non-codex paths or if pre-recording failed.
  let startingCommit: string;
  if (job.startingCommit) {
    startingCommit = job.startingCommit;
  } else {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
      startingCommit = stdout.trim();
    } catch (err) {
      return { pass: false, reason: `git rev-parse failed: ${String(err)}`, committed: false };
    }
  }

  // 1. Stage and commit codex output (excluding overlay files)
  let committed = false;
  try {
    await execFileAsync("git", ["add", "--all"], { cwd: worktreePath });
    await execFileAsync("git", [
      "reset", "HEAD", "--",
      ...overlayPaths,
    ], { cwd: worktreePath }).catch(() => {});
    await execFileAsync("git", ["commit", "-m", `codex: ${job.jobId}`], { cwd: worktreePath });
    committed = true;
  } catch {
    // Nothing to commit — Codex may have committed on its own.
  }

  // Get current HEAD after commit attempt.
  let currentCommit: string;
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: worktreePath });
    currentCommit = stdout.trim();
  } catch (err) {
    return { pass: false, reason: `git rev-parse failed: ${String(err)}`, committed, startingCommit };
  }

  // Detect Codex self-commit: our commit failed but HEAD moved.
  const codexSelfCommitted = !committed && currentCommit !== startingCommit;

  if (!committed && !codexSelfCommitted) {
    // No commit from us AND no commit from Codex — check for uncommitted changes.
    let uncommittedDiff = "";
    try {
      const { stdout } = await execFileAsync("git", [
        "diff", "HEAD", "--", ".",
        ...overlayPaths.map((path) => `:!${path}`),
      ], { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 });
      uncommittedDiff = stdout;
    } catch (err) {
      return { pass: false, reason: `git diff failed: ${String(err)}`, committed: false };
    }
    if (!uncommittedDiff.trim()) {
      // Codex made no code changes — check if it wrote a passing report
      // (indicates the code already meets the spec, e.g. re-queued job).
      const rpPath = join(worktreePath, reportRelativePath(job.role));
      try {
        const report = readFileSync(rpPath, "utf-8");
        const statusMatch = report.match(/^status:\s*(pass|success)\s*$/m);
        if (statusMatch) {
          jobLog(job.jobId, `No code diff but report confirms spec already met — passing`);
          return { pass: true, reason: "No changes needed — report confirms spec already met", committed: false, startingCommit };
        }
      } catch { /* report not found — fall through to failure */ }
      return { pass: false, reason: "Codex produced no changes", committed: false, startingCommit };
    }
    return { pass: false, reason: "Codex changes could not be committed", committed: false, startingCommit };
  }

  // 2. Review all changes from the starting commit to HEAD.
  let diff: string;
  try {
    const { stdout } = await execFileAsync("git", ["diff", `${startingCommit}..HEAD`], { cwd: worktreePath, maxBuffer: 10 * 1024 * 1024 });
    diff = stdout;
  } catch (err) {
    return {
      pass: false,
      reason: `git diff failed: ${String(err)}`,
      committed,
      codexSelfCommitted,
      startingCommit,
    };
  }

  if (!diff.trim()) {
    return { pass: false, reason: "Codex produced no changes", committed, codexSelfCommitted, startingCommit };
  }

  // 3. Build and write review prompt
  const reviewPrompt = [
    "You are reviewing a code diff produced by an automated coding agent.",
    "## Original Spec",
    jobSpec,
    "## Acceptance Criteria",
    acceptanceCriteria,
    "## Diff",
    diff,
    "## Review Rules",
    "1. Review against spec and acceptance criteria — not diff size or file count.",
    "2. Do NOT fail because files mentioned in the spec are absent from the diff. Those files may already have been correct before the job started and needed no changes.",
    "3. Do NOT fail because the agent added reasonable supplementary changes (e.g. extra CSS classes, minor refactors) beyond what the spec literally states, as long as the spec requirements are MET.",
    "4. Adjacent files (tests, types, helpers) are acceptable if they support the spec.",
    "PASS if: the diff addresses the spec requirements and acceptance criteria are met. Minor additions beyond spec are acceptable.",
    "FAIL only if: the diff introduces obvious bugs, contains placeholder code, or clearly contradicts a stated requirement.",
    "Respond with exactly: PASS or FAIL: reason",
  ].join("\n");

  const reviewPromptPath = join(worktreePath, ".zazig-review-prompt.txt");
  writeFileSync(reviewPromptPath, reviewPrompt, "utf-8");

  // 4. Run Haiku via cat pipe to avoid ARG_MAX
  let reviewOutput: string;
  try {
    const shellCmd = `cat ${shellEscape([reviewPromptPath])} | claude --model claude-haiku-4-5-20251001 -p`;
    const { stdout } = await execFileAsync("bash", ["-c", shellCmd], {
      cwd: worktreePath,
      maxBuffer: 1024 * 1024,
    } as object);
    reviewOutput = stdout.trim();
  } catch (err) {
    return { pass: false, reason: `Haiku review failed: ${String(err)}`, committed, codexSelfCommitted, startingCommit };
  }

  // 5. Parse PASS / FAIL
  if (reviewOutput.startsWith("PASS")) {
    return { pass: true, reason: "PASS", committed, codexSelfCommitted, startingCommit };
  }
  const failMatch = reviewOutput.match(/^FAIL:\s*(.+)/s);
  return {
    pass: false,
    reason: failMatch ? failMatch[1].trim() : reviewOutput || "Haiku returned no output",
    committed,
    codexSelfCommitted,
    startingCommit,
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
 * Assembles the final agent context from a pre-built promptStackMinusSkills.
 *
 * The orchestrator builds the full prompt stack with a <!-- SKILLS --> marker
 * where skill content belongs. This function:
 *   1. Inserts skill file content at the marker position
 *   2. Appends sub-agent personality instructions (writes to local disk)
 *
 * Missing skill files are warned and skipped — they do not fail the job.
 */
function assembleContext(msg: StartJob, repoRoot?: string): string {
  let assembled = msg.promptStackMinusSkills ?? msg.context ?? "";

  // Skills are loaded natively by Claude Code from .claude/skills/ — no need
  // to inline them into CLAUDE.md. Just strip the marker placeholder.
  assembled = assembled.replace(`\n\n---\n\n${SKILLS_MARKER}\n\n---\n\n`, "\n\n---\n\n");
  assembled = assembled.replace(SKILLS_MARKER, "");

  // On staging, replace backtick-wrapped `zazig ` with `zazig-staging `
  if (process.env["ZAZIG_ENV"] === "staging") {
    assembled = assembled.replace(/`zazig /g, "`zazig-staging ");
    assembled = assembled.replace(/^zazig /gm, "zazig-staging ");
  }

  // Sub-agent personality (writes to local disk — must stay local)
  if (msg.subAgentPrompt) {
    const workspaceDir = join(homedir(), ".zazigv2", `job-${msg.jobId}`);
    mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
    const personalityFile = join(workspaceDir, "subagent-personality.md");
    writeFileSync(personalityFile, msg.subAgentPrompt, { encoding: "utf8", mode: 0o600 });
    assembled += `\n\n---\n\n# Sub-Agent Instructions\nWhen spawning sub-agents, begin their prompt with the content of:\n${personalityFile}`;
  }

  return assembled;
}

function buildFixPrompt(job: ActiveJob): string {
  if (!job.worktreePath) {
    throw new Error("buildFixPrompt requires a worktreePath");
  }

  let originalSpec = job.spec;
  try {
    originalSpec = readFileSync(join(job.worktreePath, ".zazig-prompt.txt"), "utf-8");
  } catch { /* fall back to job.spec */ }

  const reasons = job.fixReasons.length > 0
    ? job.fixReasons.map((reason, idx) => `${idx + 1}. ${reason}`).join("\n")
    : "1. No review reason recorded.";

  const fixPrompt = [
    `Codex review failed for job ${job.jobId}.`,
    `Attempt ${job.attempt} of ${job.maxAttempts}.`,
    "",
    "## Original Spec",
    originalSpec?.trim().length ? originalSpec : "No spec provided.",
    "",
    "## Acceptance Criteria",
    job.acceptanceCriteria?.trim().length ? job.acceptanceCriteria : "No acceptance criteria provided.",
    "",
    "## Review Failure Reasons",
    reasons,
    "",
    "Update the implementation to fix every failure reason while staying within the original scope.",
    "Do not leave placeholder code.",
  ].join("\n");

  const fixPromptPath = join(job.worktreePath, `.zazig-fix-prompt-${job.attempt}.txt`);
  writeFileSync(fixPromptPath, fixPrompt, "utf-8");
  return fixPromptPath;
}

function buildCommand(
  slotType: SlotType,
  complexity: string,
  model: string,
  worktreePath?: string,
  promptFilePath?: string,
  repoDir?: string,
): { cmd: string; args: string[] } {
  const resolvedModel =
    model && model !== "codex"
      ? model
      : slotType === "codex"
        ? "gpt-5.3-codex"
        : complexity === "complex"
          ? "claude-opus-4-6"
          : "claude-sonnet-4-6";

  if (slotType === "codex") {
    // Native Codex execution — prompt is piped via stdin (same as Claude).
    const args = ["exec", "-m", resolvedModel, "--full-auto", "-c", "sandbox_workspace_write.network_access=true", "-C", worktreePath ?? process.cwd(), "--skip-git-repo-check"];
    // Worktrees store their git index inside the parent clone dir.
    // The sandbox must be able to write there for git add/commit to work.
    if (repoDir) {
      console.log(`[buildCommand] codex: adding --add-dir repoDir=${repoDir} for worktreePath=${worktreePath}`);
      args.push("--add-dir", repoDir);
      // Git operations (commit, add, etc.) need write access to the full
      // .git directory — objects, refs, packed-refs, COMMIT_EDITMSG, and
      // worktrees/<name>/index.lock all live under <repoDir>/.git/.
      const gitDir = join(repoDir, ".git");
      args.push("--add-dir", gitDir);
    } else {
      console.warn(`[buildCommand] codex: repoDir is undefined — sandbox may block git commit in worktree`);
    }
    if (complexity === "medium") {
      args.push("-c", "model_reasoning_effort=xhigh");
    }
    // Prompt is piped via stdin (same as Claude) — do NOT pass as positional arg.
    // Passing the file path as a positional arg makes Codex treat the path string
    // as the task description, causing non-deterministic behaviour (the model
    // sometimes reads and executes, sometimes just displays the file contents).
    return {
      cmd: "codex",
      args,
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
  // Auth: Claude Code sessions use the local user's OAuth login.
  // No API key injection needed.
  const claudeCmd = shellEscape([cmd, ...args]);
  // Merge stderr into stdout so pipe-pane captures error output too.
  const shellCmd = promptFile
    ? `unset CLAUDECODE; cat ${shellEscape([promptFile])} | ${claudeCmd} 2>&1`
    : `unset CLAUDECODE; ${claudeCmd} 2>&1`;

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

async function capturePane(sessionName: string): Promise<string> {
  const { stdout } = await execFileAsync("tmux", ["capture-pane", "-t", sessionName, "-p"]);
  return stdout;
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
