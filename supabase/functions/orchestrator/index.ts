/**
 * zazigv2 — Orchestrator Edge Function
 *
 * Runs on a schedule (every 10 s via Supabase Cron) or via HTTP trigger.
 *
 * Responsibilities:
 *   1. Poll `jobs` for queued work and enrich rows for poll-based claiming.
 *   2. Detect dead machines (no heartbeat for 2 min) and re-queue their jobs.
 *
 * Runtime: Deno / Supabase Edge Functions
 * Auth: service_role key — never exposed to the client.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { MACHINE_DEAD_THRESHOLD_MS, PROTOCOL_VERSION } from "@zazigv2/shared";
import type {
  DeployComplete,
  FeatureApproved,
  FeatureRejected,
  Heartbeat,
  JobBlocked,
  JobComplete,
  JobFailed,
  JobStatusMessage,
  JobUnblocked,
  SlotType,
  TeardownTest,
  VerifyJob,
  VerifyResult,
} from "@zazigv2/shared";

import {
  agentChannelName,
  generateTitle,
  notifyCPO,
  TERMINAL_FEATURE_STATUSES_FOR_DEPLOY,
  triggerCICheck,
  triggerCombining,
  triggerMerging,
  triggerTestWriting,
} from "../_shared/pipeline-utils.ts";
import { parseGitHubRepoUrl } from "../_shared/github.ts";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ---------------------------------------------------------------------------
// Prompt assembly constants (shared with local-agent)
// ---------------------------------------------------------------------------

const SKILLS_MARKER = "<!-- SKILLS -->";

function completionInstructions(): string {
  return `## On Completion

Commit all work to the current branch. Do NOT commit .mcp.json, .claude/, or CLAUDE.md.
Then exit.`;
}

// ---------------------------------------------------------------------------
// Supabase DB row shapes (subset of columns we actually read/write)
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  company_id: string;
  project_id: string | null;
  feature_id: string | null;
  role: string;
  job_type: string;
  complexity: string | null;
  slot_type: SlotType | null;
  model: string | null;
  machine_id: string | null;
  status: string;
  context: string | null;
  acceptance_tests: string | null;
  verify_context: string | null;
  branch: string | null;
  result: string | null;
  created_at: string;
  depends_on: string[] | null;
  source: string | null;
}

interface DecisionResolved {
  type: "DecisionResolved";
  decisionId: string;
  companyId: string;
  fromRole: string;
  action: string;
  selectedOption: string | null;
  note: string | null;
}

function isDecisionResolved(msg: unknown): msg is DecisionResolved {
  if (!msg || typeof msg !== "object") return false;
  const row = msg as Record<string, unknown>;
  return row.type === "DecisionResolved" &&
    typeof row.decisionId === "string" &&
    typeof row.companyId === "string" &&
    typeof row.fromRole === "string" &&
    typeof row.action === "string" &&
    (typeof row.selectedOption === "string" || row.selectedOption === null) &&
    (typeof row.note === "string" || row.note === null);
}

type JobLogSeverity = "critical" | "warning" | "info";

interface JobLogErrorMatch {
  category: string;
  severity: JobLogSeverity;
  pattern: string;
  snippet: string;
}

interface JobLogAnalysisResult {
  errors: JobLogErrorMatch[];
  scanned_at: string;
}

interface JobLogPattern {
  category: string;
  severity: JobLogSeverity;
  pattern: string;
  regex: RegExp;
}

const JOB_LOG_SNIPPET_RADIUS = 140;
const JOB_LOG_PATTERNS: JobLogPattern[] = [
  // build_error (critical)
  {
    category: "build_error",
    severity: "critical",
    pattern: "error TS\\d+",
    regex: /error TS\d+/i,
  },
  {
    category: "build_error",
    severity: "critical",
    pattern: "Cannot find module",
    regex: /Cannot find module/i,
  },
  {
    category: "build_error",
    severity: "critical",
    pattern: "Type '.*' is not assignable",
    regex: /Type '.*' is not assignable/i,
  },
  // test_failure (critical)
  {
    category: "test_failure",
    severity: "critical",
    pattern: "\\d+ (failing|failed)",
    regex: /\d+ (failing|failed)/i,
  },
  {
    category: "test_failure",
    severity: "critical",
    pattern: "AssertionError",
    regex: /AssertionError/i,
  },
  {
    category: "test_failure",
    severity: "critical",
    pattern: "Test.*FAIL",
    regex: /Test.*FAIL/i,
  },
  // runtime_error (critical)
  {
    category: "runtime_error",
    severity: "critical",
    pattern: "UnhandledPromiseRejection",
    regex: /UnhandledPromiseRejection/i,
  },
  {
    category: "runtime_error",
    severity: "critical",
    pattern: "Uncaught Error:",
    regex: /Uncaught Error:/i,
  },
  {
    category: "runtime_error",
    severity: "critical",
    pattern: "Segmentation fault",
    regex: /Segmentation fault/i,
  },
  {
    category: "runtime_error",
    severity: "critical",
    pattern: "Out of memory",
    regex: /Out of memory/i,
  },
  // permission_error (warning)
  {
    category: "permission_error",
    severity: "warning",
    pattern: "401",
    regex: /\b401\b/,
  },
  {
    category: "permission_error",
    severity: "warning",
    pattern: "403",
    regex: /\b403\b/,
  },
  {
    category: "permission_error",
    severity: "warning",
    pattern: "EACCES",
    regex: /EACCES/i,
  },
  {
    category: "permission_error",
    severity: "warning",
    pattern: "Permission denied",
    regex: /Permission denied/i,
  },
  // pipeline_error (warning)
  {
    category: "pipeline_error",
    severity: "warning",
    pattern: "sandbox violation",
    regex: /sandbox violation/i,
  },
  {
    category: "pipeline_error",
    severity: "warning",
    pattern: "git conflict",
    regex: /git conflict/i,
  },
  {
    category: "pipeline_error",
    severity: "warning",
    pattern: "slot exhausted",
    regex: /slot exhausted/i,
  },
  {
    category: "pipeline_error",
    severity: "warning",
    pattern: "CONFLICT (content)",
    regex: /CONFLICT \(content\)/i,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Supabase client authenticated with the service_role key.
 * This bypasses RLS — only used server-side inside Edge Functions.
 */
function makeAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function extractLogSnippet(
  content: string,
  startIndex: number,
  matchLength: number,
): string {
  if (startIndex < 0) return "";

  const snippetStart = Math.max(0, startIndex - JOB_LOG_SNIPPET_RADIUS);
  const snippetEnd = Math.min(
    content.length,
    startIndex + Math.max(matchLength, 1) + JOB_LOG_SNIPPET_RADIUS,
  );
  return content
    .slice(snippetStart, snippetEnd)
    .replace(/\s+/g, " ")
    .trim();
}

export async function analyzeJobLogs(jobId: string): Promise<JobLogAnalysisResult> {
  const scannedAt = new Date().toISOString();
  const supabaseAdmin = makeAdminClient();

  const { data: tmuxLogs, error: logsError } = await supabaseAdmin
    .from("job_logs")
    .select("content")
    .eq("job_id", jobId)
    .eq("type", "tmux")
    .order("created_at", { ascending: true });

  if (logsError) {
    console.error(
      `[orchestrator] analyzeJobLogs: failed to fetch tmux logs for job ${jobId}:`,
      logsError.message,
    );
    return { errors: [], scanned_at: scannedAt };
  }

  const concatenatedLogs = (tmuxLogs ?? [])
    .map((row) => {
      const logRow = row as { content?: unknown };
      return typeof logRow.content === "string" ? logRow.content : "";
    })
    .filter((chunk) => chunk.length > 0)
    .join("\n");

  if (!concatenatedLogs) {
    return { errors: [], scanned_at: scannedAt };
  }

  const errors: JobLogErrorMatch[] = [];
  const seenCategories = new Set<string>();

  for (const logPattern of JOB_LOG_PATTERNS) {
    const match = logPattern.regex.exec(concatenatedLogs);
    if (
      !match ||
      typeof match.index !== "number" ||
      seenCategories.has(logPattern.category)
    ) continue;

    seenCategories.add(logPattern.category);
    errors.push({
      category: logPattern.category,
      severity: logPattern.severity,
      pattern: logPattern.pattern,
      snippet: extractLogSnippet(
        concatenatedLogs,
        match.index,
        match[0]?.length ?? 0,
      ),
    });
  }

  return { errors, scanned_at: scannedAt };
}

// ---------------------------------------------------------------------------
// Model + slot routing — DB-backed via complexity_routing + roles tables
// ---------------------------------------------------------------------------

interface RoutingEntry {
  complexity: string;
  role: string;
  model: string;
  slotType: SlotType;
}

/** Cached routing table, loaded once per orchestrator invocation. */
let routingCache: Map<string, RoutingEntry> | null = null;

/**
 * Loads the complexity → (model, slot_type) routing from the DB.
 * Uses complexity_routing joined to roles. Company-specific rows override globals.
 * Cached for the lifetime of a single orchestrator invocation.
 */
async function loadRouting(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Map<string, RoutingEntry>> {
  if (routingCache) return routingCache;

  // Fetch global defaults (company_id IS NULL) and company-specific overrides.
  const { data, error } = await supabase
    .from("complexity_routing")
    .select(
      "complexity, company_id, roles:role_id(name, default_model, slot_type)",
    )
    .or(`company_id.is.null,company_id.eq.${companyId}`);

  const map = new Map<string, RoutingEntry>();

  if (error || !data) {
    console.warn(
      "[orchestrator] Failed to load complexity_routing, using hardcoded fallbacks:",
      error?.message,
    );
    // Hardcoded fallback if DB is empty or query fails
    map.set("simple", {
      complexity: "simple",
      role: "junior-engineer",
      model: "codex",
      slotType: "codex",
    });
    map.set("medium", {
      complexity: "medium",
      role: "senior-engineer",
      model: "claude-sonnet-4-6",
      slotType: "claude_code",
    });
    map.set("complex", {
      complexity: "complex",
      role: "senior-engineer",
      model: "claude-opus-4-6",
      slotType: "claude_code",
    });
    routingCache = map;
    return map;
  }

  // Global defaults first, then company overrides (which replace globals)
  const globals = data.filter((r: Record<string, unknown>) =>
    r.company_id === null
  );
  const overrides = data.filter((r: Record<string, unknown>) =>
    r.company_id !== null
  );

  for (const row of [...globals, ...overrides]) {
    const role = row.roles as unknown as {
      name: string;
      default_model: string;
      slot_type: string;
    } | null;
    if (!role) continue;
    map.set(row.complexity as string, {
      complexity: row.complexity as string,
      role: role.name,
      model: role.default_model,
      slotType: role.slot_type as SlotType,
    });
  }

  routingCache = map;
  console.log(
    `[orchestrator] Loaded routing: ${
      [...map.entries()].map(([k, v]) => `${k}→${v.model}(${v.slotType})`).join(
        ", ",
      )
    }`,
  );
  return map;
}

/**
 * Resolves the model and slot type for a job.
 *
 * Priority:
 *   1. Explicit model override on the job row → use that model, derive slot from routing
 *   2. complexity_routing table → company override > global default
 *   3. Hardcoded fallback (medium/sonnet) if nothing else matches
 */
export function resolveModelAndSlot(
  routing: Map<string, RoutingEntry>,
  complexity: string | null,
  existingModel: string | null,
  jobId?: string,
): { role: string; model: string; slotType: SlotType } {
  // Explicit model override on the job takes precedence.
  if (existingModel) {
    const entry = routing.get(complexity ?? "medium");
    const slotType = entry?.slotType ?? "claude_code";
    const role = entry?.role ?? "senior-engineer";
    return { role, model: existingModel, slotType };
  }

  const entry = routing.get(complexity ?? "medium");
  if (entry) {
    return {
      role: entry.role,
      model: entry.model,
      slotType: entry.slotType,
    };
  }

  // Fallback if complexity not in routing table
  console.warn(
    `[orchestrator] No routing entry for complexity=${complexity} on job ${
      jobId ?? "?"
    }, defaulting to sonnet`,
  );
  return {
    role: "senior-engineer",
    model: "claude-sonnet-4-6",
    slotType: "claude_code",
  };
}

const NO_CODE_CONTEXT_ROLES = new Set([
  "pipeline-technician",
  "monitoring-agent",
  "project-architect",
]);

const EXECUTING_JOB_INVESTIGATION_THRESHOLD_MS = 30 * 60 * 1000;
const MACHINE_HEARTBEAT_STALE_FOR_TIMEOUT_MS = 5 * 60 * 1000;
const EXECUTING_JOB_TIMEOUT_RESULT =
  "Timeout: machine heartbeat lost after 30+ min in executing";
const EXECUTING_JOB_STARTED_AT_COLUMN_CANDIDATES = [
  "dispatched_at",
  "updated_at",
  "started_at",
  "assigned_at",
] as const;
// ---------------------------------------------------------------------------
// Core orchestrator operations
// ---------------------------------------------------------------------------

/**
 * Step 1a: Mark machines whose last_heartbeat is older than MACHINE_DEAD_THRESHOLD_MS
 * as 'offline'. This prevents the dispatcher from sending new jobs to dead machines.
 * Job requeuing is handled separately by reapStaleJobs.
 */
async function reapDeadMachines(supabase: SupabaseClient): Promise<void> {
  const deadCutoff = new Date(Date.now() - MACHINE_DEAD_THRESHOLD_MS)
    .toISOString();

  // Find online machines that haven't sent a heartbeat within the threshold.
  const { data: deadMachines, error: machineErr } = await supabase
    .from("machines")
    .select("id, name, company_id")
    .eq("status", "online")
    .or(`last_heartbeat.is.null,last_heartbeat.lt.${deadCutoff}`);

  if (machineErr) {
    console.error(
      "[orchestrator] Error querying dead machines:",
      machineErr.message,
    );
    return;
  }

  if (!deadMachines || deadMachines.length === 0) return;

  for (const machine of deadMachines) {
    console.warn(
      `[orchestrator] Machine ${machine.name} (${machine.id}) is dead — marking offline`,
    );

    const { error: offlineErr } = await supabase
      .from("machines")
      .update({ status: "offline" })
      .eq("id", machine.id);

    if (offlineErr) {
      console.error(
        `[orchestrator] Failed to mark machine ${machine.id} offline:`,
        offlineErr.message,
      );
      continue;
    }

    const { error: eventErr } = await supabase
      .from("events")
      .insert({
        company_id: machine.company_id,
        machine_id: machine.id,
        event_type: "machine_offline",
      });

    if (eventErr) {
      console.error(
        `[orchestrator] Failed to log machine_offline event for ${machine.id}:`,
        eventErr.message,
      );
    }
  }
}

/**
 * Step 1b: Re-queue jobs stuck in executing whose updated_at is stale.
 * The local agent updates updated_at every 30s for active jobs, so >2 min stale
 * means the agent is no longer working on it (crashed, restarted, lost connection).
 * This is machine-agnostic — works whether the machine died or just restarted.
 */
async function reapStaleJobs(supabase: SupabaseClient): Promise<void> {
  const staleCutoff = new Date(Date.now() - MACHINE_DEAD_THRESHOLD_MS)
    .toISOString();

  const { data: staleJobs, error } = await supabase
    .from("jobs")
    .select("id, machine_id, status")
    .in("status", ["executing"])
    .lt("updated_at", staleCutoff);

  if (error) {
    console.error("[orchestrator] Error querying stale jobs:", error.message);
    return;
  }

  if (!staleJobs || staleJobs.length === 0) return;

  const staleIds = staleJobs.map((j: { id: string }) => j.id);
  console.log(
    `[orchestrator] Re-queuing ${staleIds.length} stale job(s): ${
      staleIds.join(", ")
    }`,
  );

  const { error: requeueErr } = await supabase
    .from("jobs")
    .update({ status: "queued", machine_id: null })
    .in("id", staleIds);

  if (requeueErr) {
    console.error(
      `[orchestrator] Failed to re-queue stale jobs:`,
      requeueErr.message,
    );
  }
}

/**
 * Step 2: Poll queued jobs and enrich each row for poll-based claiming.
 */
async function dispatchQueuedJobs(supabase: SupabaseClient): Promise<void> {
  // Fetch queued jobs oldest-first.
  const { data: queuedJobs, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      "id, company_id, project_id, feature_id, role, job_type, complexity, slot_type, model, machine_id, status, context, acceptance_tests, verify_context, branch, result, created_at, depends_on, source",
    )
    .in("status", ["created", "verify_failed"])
    .order("created_at", { ascending: true });

  if (jobsErr) {
    console.error(
      "[orchestrator] Error fetching created jobs:",
      jobsErr.message,
    );
    return;
  }

  if (!queuedJobs || queuedJobs.length === 0) {
    console.log("[orchestrator] No created jobs to enrich.");
    return;
  }

  console.log(`[orchestrator] ${queuedJobs.length} created job(s) to enrich.`);

  // Build a feature status cache for code jobs so we can cheaply gate dispatch
  // while a feature is still in breaking_down.
  const codeFeatureIds = Array.from(
    new Set(
      (queuedJobs as JobRow[])
        .filter((job) => job.job_type === "code" && Boolean(job.feature_id))
        .map((job) => job.feature_id as string),
    ),
  );
  const featureStatusById = new Map<string, string>();
  if (codeFeatureIds.length > 0) {
    const { data: featureRows, error: featureRowsErr } = await supabase
      .from("features")
      .select("id, status")
      .in("id", codeFeatureIds);
    if (featureRowsErr) {
      console.error(
        "[orchestrator] Failed to preload feature statuses for code-job gate:",
        featureRowsErr.message,
      );
      return;
    }
    for (const row of featureRows ?? []) {
      const featureRow = row as { id: string; status: string };
      featureStatusById.set(featureRow.id, featureRow.status);
    }
  }

  // Reset routing cache at the start of each dispatch pass.
  routingCache = null;

  for (const job of queuedJobs as JobRow[]) {
    // Auto-create a wrapper feature for featureless jobs (legacy safety net;
    // standalone jobs now get features from request_standalone_work).
    if (!job.feature_id && job.source !== "standalone") {
      const { data: wrapperFeature, error: wfErr } = await supabase
        .from("features")
        .insert({
          company_id: job.company_id,
          project_id: job.project_id ?? null,
          title: `One-off: ${
            (() => {
              try {
                return JSON.parse(job.context ?? "{}").title;
              } catch {
                return null;
              }
            })() ?? job.id
          }`,
          status: "building",
        })
        .select("id")
        .single();
      if (wfErr || !wrapperFeature) {
        console.error(
          `[orchestrator] Failed to create wrapper feature for job ${job.id}:`,
          wfErr?.message,
        );
        continue;
      }
      // Generate a branch name for the wrapper feature so the executor has a target branch.
      const wrapperBranch = `feature/standalone-${job.id.substring(0, 8)}`;
      await supabase.from("features").update({ branch: wrapperBranch }).eq(
        "id",
        wrapperFeature.id,
      );
      await supabase.from("jobs").update({ feature_id: wrapperFeature.id }).eq(
        "id",
        job.id,
      );
      job.feature_id = wrapperFeature.id;
      console.log(
        `[orchestrator] Auto-created wrapper feature ${wrapperFeature.id} (branch: ${wrapperBranch}) for standalone job ${job.id}`,
      );
    }

    // Never dispatch deploy_to_test jobs for terminal features.
    if (job.job_type === "deploy_to_test" && job.feature_id) {
      const { data: deployFeature, error: deployFeatureErr } = await supabase
        .from("features")
        .select("status")
        .eq("id", job.feature_id)
        .single();

      if (deployFeatureErr || !deployFeature) {
        console.error(
          `[orchestrator] Job ${job.id} deploy_to_test guard: failed to fetch feature ${job.feature_id}:`,
          deployFeatureErr?.message,
        );
        continue;
      }

      const featureStatus = deployFeature.status as string;
      if (TERMINAL_FEATURE_STATUSES_FOR_DEPLOY.has(featureStatus)) {
        const { data: failedRows, error: failErr } = await supabase
          .from("jobs")
          .update({
            status: "failed",
            result:
              `Auto-failed: deploy_to_test job not allowed because parent feature is ${featureStatus}`,
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id)
          .in("status", ["created", "queued", "verify_failed", "executing"])
          .select("id");

        if (failErr) {
          console.error(
            `[orchestrator] Job ${job.id} deploy_to_test guard: failed to mark job failed for terminal feature ${job.feature_id}:`,
            failErr.message,
          );
        } else if (failedRows && failedRows.length > 0) {
          console.warn(
            `[orchestrator] Job ${job.id} auto-failed: deploy_to_test not allowed for feature ${job.feature_id} in ${featureStatus}`,
          );
        }
        continue;
      }
    }

    // Do not dispatch code jobs while the parent feature is still breaking_down or writing_tests.
    // Code jobs must wait until the feature reaches 'building' status.
    if (job.job_type === "code" && job.feature_id) {
      const featureStatus = featureStatusById.get(job.feature_id);
      if (featureStatus === "breaking_down" || featureStatus === "writing_tests") {
        console.log(
          `[orchestrator] Skipping job ${job.id} — feature ${job.feature_id} still in ${featureStatus}`,
        );
        continue;
      }
    }

    // DAG check: if this job has dependencies, verify they are all complete before dispatch.
    let depBranches: string[] = [];
    if (job.depends_on && job.depends_on.length > 0) {
      const { data: depJobs, error: depErr } = await supabase
        .from("jobs")
        .select("id, status, branch")
        .in("id", job.depends_on);

      if (depErr) {
        console.error(
          `[orchestrator] Failed to check depends_on for job ${job.id}:`,
          depErr.message,
        );
        continue;
      }

      const allComplete = depJobs && depJobs.length === job.depends_on.length &&
        depJobs.every((d: { status: string }) => d.status === "complete");

      if (!allComplete) {
        console.log(
          `[orchestrator] Job ${job.id} blocked by unfinished dependencies — skipping`,
        );
        continue;
      }

      // Extract non-null branches from completed dependencies for branch chaining
      depBranches = (depJobs ?? [])
        .map((d: { branch?: string | null }) => d.branch)
        .filter((b): b is string => typeof b === "string" && b.length > 0);
    }

    // Resolve model + slot type.
    // Non-engineer roles use their role's default_model & slot_type from the DB.
    // Engineer roles (senior-engineer, junior-engineer) use complexity routing.
    const ENGINEER_ROLES = new Set(["senior-engineer", "junior-engineer"]);
    let resolvedRole: string;
    let model: string;
    let slotType: SlotType;
    // Loaded once per company per dispatch pass (cached inside loadRouting).
    // Hoisted here so the codex→claude_code fallback below can always access it.
    const routing = await loadRouting(supabase, job.company_id);
    if (job.model && job.slot_type) {
      // Job is fully pre-configured (e.g. retry jobs from request-feature-fix).
      // Respect the explicit model and slot_type — do not override via routing.
      resolvedRole = job.role ?? "senior-engineer";
      model = job.model;
      slotType = job.slot_type as SlotType;
      console.log(
        `[orchestrator] Job ${job.id} is pre-configured — using job's own role=${resolvedRole}, model=${model}, slot=${slotType}`,
      );
    } else if (job.role && !ENGINEER_ROLES.has(job.role)) {
      // Role-based routing: look up the role's defaults from the roles table.
      const { data: roleDefaults } = await supabase
        .from("roles")
        .select("default_model, slot_type")
        .eq("name", job.role)
        .single();

      if (roleDefaults?.default_model && roleDefaults?.slot_type) {
        resolvedRole = job.role;
        model = roleDefaults.default_model as string;
        slotType = roleDefaults.slot_type as SlotType;
        console.log(
          `[orchestrator] Job ${job.id} role=${job.role} → role-based routing: model=${model}, slot=${slotType}`,
        );
      } else {
        // Role not found in DB — fall back to complexity routing.
        console.warn(
          `[orchestrator] Role '${job.role}' not found in roles table — falling back to complexity routing for job ${job.id}`,
        );
        ({ role: resolvedRole, model, slotType } = resolveModelAndSlot(
          routing,
          job.complexity,
          job.model,
          job.id,
        ));
      }
    } else {
      // Engineer roles or no role: use complexity routing.
      ({ role: resolvedRole, model, slotType } = resolveModelAndSlot(
        routing,
        job.complexity,
        job.model,
        job.id,
      ));
    }

    // Look up git context (repo_url from projects, branch from features) for code-context roles.
    let repoUrl: string | null = null;
    let featureBranch: string | null = null;
    const requiresCodeContext = !NO_CODE_CONTEXT_ROLES.has(resolvedRole);

    let projectName: string | null = null;

    if (requiresCodeContext) {
      if (job.project_id) {
        const { data: projectRow } = await supabase
          .from("projects")
          .select("name, repo_url")
          .eq("id", job.project_id)
          .single();
        repoUrl = (projectRow as { repo_url?: string } | null)?.repo_url ??
          null;
        projectName = (projectRow as { name?: string } | null)?.name ?? null;
      }

      if (job.feature_id) {
        const { data: featureRow } = await supabase
          .from("features")
          .select("branch")
          .eq("id", job.feature_id)
          .single();
        featureBranch = (featureRow as { branch?: string } | null)?.branch ??
          null;
      }
    }

    if (
      !job.project_id || (requiresCodeContext && (!repoUrl || !featureBranch))
    ) {
      console.warn(
        `[orchestrator] Job ${job.id} missing enrichment context (projectId=${job.project_id}, repoUrl=${repoUrl}, featureBranch=${featureBranch}, requiresCodeContext=${requiresCodeContext}) — skipping enrichment`,
      );
      continue;
    }

    // Verify-failed jobs are retried with failure context attached.
    let dispatchContext = job.context;
    if (job.status === "verify_failed" && job.verify_context) {
      try {
        const parsed = JSON.parse(job.context ?? "{}") as Record<
          string,
          unknown
        >;
        dispatchContext = JSON.stringify({
          ...parsed,
          verify_failure: job.verify_context,
        });
      } catch {
        dispatchContext = `${
          job.context ?? ""
        }\n\nVerification failure context:\n${job.verify_context}`;
      }
    }

    // Prepend repo grounding so the agent knows which repo it's working on.
    // This is the single source of truth for agent workspace identity.
    if (repoUrl) {
      const repoShortName = projectName ??
        repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? "unknown";
      const grounding = [
        `## Repository Context (CRITICAL)`,
        ``,
        `You are working on the **${repoShortName}** repository.`,
        `- Remote: ${repoUrl}`,
        ...(featureBranch ? [`- Feature branch: ${featureBranch}`] : []),
        ``,
        `**ALL file reads, writes, and edits MUST be within your working directory.**`,
        `Do NOT use absolute paths to other repositories or user home directories.`,
        `If a file doesn't exist in your working directory, CREATE it — do not look for it elsewhere.`,
      ].join("\n");
      dispatchContext = grounding + "\n\n---\n\n" + (dispatchContext ?? "");
    }

    // Validate context — jobs with null/empty context cannot be executed by agents.
    if (!dispatchContext || dispatchContext.trim().length === 0) {
      console.error(
        `[orchestrator] Job ${job.id} has null/empty context — failing during enrichment`,
      );
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          result:
            "null_context: job created without context/spec — cannot dispatch to agent",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      continue;
    }

    // Fetch role prompt for jobs that have a named role.
    // These populate the 4-layer context stack: personality → role → skills marker → task.
    let rolePrompt: string | undefined;
    let personalityPrompt: string | undefined;
    if (resolvedRole) {
      const { data: roleRow } = await supabase
        .from("roles")
        .select("id, prompt")
        .eq("name", resolvedRole)
        .single();
      if (roleRow) {
        const typed = roleRow as {
          id: string;
          prompt: string | null;
        };
        rolePrompt = typed.prompt ?? undefined;

        // Fetch compiled personality prompt for this company + role.
        const { data: personality } = await supabase
          .from("exec_personalities")
          .select("compiled_prompt")
          .eq("company_id", job.company_id)
          .eq("role_id", typed.id)
          .single();
        if (personality?.compiled_prompt) {
          personalityPrompt = personality.compiled_prompt as string;
        }
      }
    }

    // Assemble the full prompt stack minus skills for observability and polling dispatch.
    // Order: personality → role → SKILLS_MARKER → task context → completion.
    // The local agent inserts skill file content at SKILLS_MARKER when it claims the job.
    const promptParts: string[] = [];
    if (personalityPrompt) promptParts.push(personalityPrompt);
    if (rolePrompt) promptParts.push(rolePrompt);
    promptParts.push(SKILLS_MARKER);
    if (dispatchContext) promptParts.push(dispatchContext);
    promptParts.push(completionInstructions());
    const promptStackMinusSkills = promptParts.join("\n\n---\n\n");

    // Enrich created jobs and transition to queued for poll-based dispatch.
    const { data: enrichedRows, error: updateJobErr } = await supabase
      .from("jobs")
      .update({
        status: "queued",
        role: resolvedRole,
        model,
        slot_type: slotType,
        prompt_stack: promptStackMinusSkills || null,
      })
      .eq("id", job.id)
      .in("status", ["created", "verify_failed"]) // optimistic lock
      .select("id");

    if (updateJobErr) {
      console.error(
        `[orchestrator] Failed to enrich job ${job.id}:`,
        updateJobErr.message,
      );
      continue;
    }
    if (!enrichedRows || enrichedRows.length === 0) {
      console.warn(
        `[orchestrator] Duplicate enrichment claim ignored for job ${job.id} (CAS matched zero rows)`,
      );
      continue;
    }
    console.log(
      `[orchestrator] Enriched and queued job ${job.id} with role=${resolvedRole}, slot=${slotType}, model=${model}`,
    );
  }
}

async function dispatchVerifyJobToMachine(
  supabase: SupabaseClient,
  machineId: string,
  companyId: string,
  verifyMsg: VerifyJob,
): Promise<boolean> {
  const channel = supabase.channel(agentChannelName(machineId, companyId));

  return await new Promise<boolean>((resolve) => {
    channel.subscribe(async (status) => {
      if (status !== "SUBSCRIBED") return;

      const result = await channel.send({
        type: "broadcast",
        event: "verify_job",
        payload: verifyMsg,
      });

      await new Promise((r) => setTimeout(r, 250));
      await channel.unsubscribe();
      resolve(result === "ok");
    });
  });
}

// ---------------------------------------------------------------------------
// Blocked job flow — agent needs human input
// ---------------------------------------------------------------------------

async function handleJobBlocked(
  supabase: SupabaseClient,
  msg: JobBlocked,
): Promise<void> {
  const { jobId, reason } = msg;

  // 1. Set job to blocked, store reason
  await supabase.from("jobs")
    .update({ status: "blocked", blocked_reason: reason })
    .eq("id", jobId);

  // 2. Fetch job context to find the Slack channel (via feature)
  const { data: job } = await supabase.from("jobs")
    .select("feature_id, company_id")
    .eq("id", jobId).single();

  if (!job?.feature_id) {
    console.log(
      `[orchestrator] Job ${jobId} blocked (no feature — no Slack post): ${reason}`,
    );
    return;
  }

  const { data: feature } = await supabase.from("features")
    .select("slack_channel, slack_thread_ts")
    .eq("id", job.feature_id).single();

  if (!feature?.slack_channel || !feature?.slack_thread_ts) {
    console.log(
      `[orchestrator] Job ${jobId} blocked (no Slack thread): ${reason}`,
    );
    return;
  }

  // 3. Post the question as a reply in the feature's Slack thread
  const slackToken = await getSlackBotToken(supabase, job.company_id);
  if (!slackToken) {
    console.log(
      `[orchestrator] Job ${jobId} blocked (no Slack bot token): ${reason}`,
    );
    return;
  }

  const questionText = `*Agent needs input* (job \`${
    jobId.slice(0, 8)
  }\`)\n\n${reason}\n\nReply with your answer in this thread to unblock.`;
  const resultTs = await postSlackMessage(
    slackToken,
    feature.slack_channel,
    questionText,
    feature.slack_thread_ts,
  );

  // 4. Store the thread_ts of our question post so slack-events can find it
  if (resultTs) {
    await supabase.from("jobs")
      .update({ blocked_slack_thread_ts: resultTs })
      .eq("id", jobId);
  }

  console.log(
    `[orchestrator] Job ${jobId} blocked — question posted to Slack: ${reason}`,
  );
}

async function handleJobUnblocked(
  supabase: SupabaseClient,
  jobId: string,
  answer: string,
): Promise<void> {
  // Append the answer to the job context and set back to executing
  const { data: job } = await supabase.from("jobs")
    .select("context").eq("id", jobId).single();

  let ctx: Record<string, unknown> = {};
  try {
    ctx = JSON.parse(job?.context ?? "{}");
  } catch { /**/ }
  const updatedCtx = JSON.stringify({ ...ctx, unblocked_answer: answer });

  await supabase.from("jobs")
    .update({
      status: "executing",
      blocked_reason: null,
      blocked_slack_thread_ts: null,
      context: updatedCtx,
    })
    .eq("id", jobId).eq("status", "blocked");

  // Send JobUnblocked message to the machine running this job
  const { data: jobRow } = await supabase.from("jobs")
    .select("machine_id, company_id, machines(name)").eq("id", jobId).single();

  if (jobRow?.machine_id) {
    const machineName = (jobRow.machines as unknown as { name: string })?.name;
    if (machineName) {
      const unblockedMsg: JobUnblocked = {
        type: "job_unblocked",
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        answer,
      };
      const replyChannel = supabase.channel(
        agentChannelName(machineName, jobRow.company_id),
      );
      await new Promise<void>((resolve) => {
        replyChannel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await replyChannel.send({
              type: "broadcast",
              event: "job_unblocked",
              payload: unblockedMsg,
            });
            await replyChannel.unsubscribe();
            resolve();
          }
        });
      });
    }
  }

  console.log(`[orchestrator] Job ${jobId} unblocked — answer routed to agent`);
}

/**
 * Creates a GitHub Pull Request from the feature branch to master.
 * Returns the PR URL on success, or null on failure / missing config.
 * If the PR already exists (422), fetches the existing PR URL.
 */
async function createGitHubPR(
  repoUrl: string,
  featureBranch: string,
  featureTitle: string,
  featureId: string,
): Promise<string | null> {
  const githubToken = Deno.env.get("GITHUB_TOKEN");
  if (!githubToken) {
    console.warn(
      `[orchestrator] GITHUB_TOKEN not set — skipping PR creation for feature ${featureId}`,
    );
    return null;
  }

  let owner: string;
  let repo: string;
  try {
    ({ owner, repo } = parseGitHubRepoUrl(repoUrl));
  } catch {
    console.warn(
      `[orchestrator] Cannot parse GitHub owner/repo from URL "${repoUrl}" — skipping PR creation for feature ${featureId}`,
    );
    return null;
  }

  const prTitle = `feat: ${featureTitle}`;
  const prBody = [
    "## Auto-generated PR",
    "",
    `Feature: ${featureTitle}`,
    `Feature ID: ${featureId}`,
    "",
    "This PR was automatically created by the zazig pipeline.",
  ].join("\n");

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${githubToken}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: prTitle,
          head: featureBranch,
          base: "master",
          body: prBody,
        }),
      },
    );

    if (response.status === 201) {
      const pr = await response.json() as { html_url?: string };
      console.log(
        `[orchestrator] GitHub PR created for feature ${featureId}: ${
          pr.html_url ?? "(no URL)"
        }`,
      );
      return pr.html_url ?? null;
    } else if (response.status === 422) {
      // PR already exists for this branch — fetch the existing PR URL
      console.log(
        `[orchestrator] GitHub PR already exists for feature ${featureId} branch ${featureBranch} — fetching existing`,
      );
      try {
        const listResp = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/pulls?head=${owner}:${featureBranch}&state=open`,
          {
            headers: {
              "Authorization": `Bearer ${githubToken}`,
              "Accept": "application/vnd.github+json",
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
        if (listResp.ok) {
          const prs = await listResp.json() as Array<{ html_url?: string }>;
          if (prs.length > 0) {
            console.log(
              `[orchestrator] Found existing PR for feature ${featureId}: ${
                prs[0].html_url
              }`,
            );
            return prs[0].html_url ?? null;
          }
        }
      } catch {
        // Fall through — return null
      }
      return null;
    } else {
      const text = await response.text();
      console.error(
        `[orchestrator] GitHub PR creation failed for feature ${featureId} (HTTP ${response.status}): ${text}`,
      );
      return null;
    }
  } catch (err) {
    console.error(
      `[orchestrator] GitHub PR creation threw for feature ${featureId}:`,
      err,
    );
    return null;
  }
}

/**
 * Sends a teardown command to the machine that deployed the test environment.
 * Fire-and-forget — callers should .catch() and not await.
 */
async function runTeardown(
  supabase: SupabaseClient,
  featureId: string,
  machineId: string,
  companyId: string,
): Promise<void> {
  if (!machineId) {
    console.warn(
      `[orchestrator] No machineId for feature ${featureId} — skipping teardown`,
    );
    return;
  }

  // Fetch feature's project_id to look up repo_url
  const { data: feat } = await supabase
    .from("features")
    .select("project_id")
    .eq("id", featureId)
    .single();

  let repoPath = "";
  if (feat?.project_id) {
    const { data: project } = await supabase
      .from("projects")
      .select("repo_url")
      .eq("id", feat.project_id)
      .single();
    repoPath = project?.repo_url ?? "";
  }

  // Clear testing_machine_id on the feature
  await supabase
    .from("features")
    .update({ testing_machine_id: null })
    .eq("id", featureId);

  // Broadcast teardown command to the machine's agent channel
  const teardownMsg: TeardownTest = {
    type: "teardown_test",
    protocolVersion: PROTOCOL_VERSION,
    featureId,
    repoPath,
  };
  const channel = supabase.channel(agentChannelName(machineId, companyId));
  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "teardown_test",
          payload: teardownMsg,
        });
        await channel.unsubscribe();
        resolve();
      }
    });
  });

  console.log(
    `[orchestrator] Teardown sent to machine ${machineId} for feature ${featureId}`,
  );
}

export async function handleFeatureApproved(
  supabase: SupabaseClient,
  msg: FeatureApproved,
): Promise<void> {
  // Feature-level deploy is no longer part of the pipeline.
  // Deployment is now handled at the project level via `zazig promote`.
  // This handler is kept for backwards compatibility but is a no-op.
  console.log(
    `[orchestrator] handleFeatureApproved: feature ${msg.featureId} — deploy handled at project level via zazig promote, no-op`,
  );
}

export async function handleFeatureRejected(
  supabase: SupabaseClient,
  msg: FeatureRejected,
): Promise<void> {
  const { featureId, feedback, severity, machineId } = msg;

  if (severity === "small") {
    // Small fix — fix agent handles it in-thread.
    // The fix agent is already running (spawned when feature entered testing).
    // Just log the feedback so it appears in the event log.
    console.log(
      `[orchestrator] Feature ${featureId} — small rejection, fix agent handles in-thread`,
    );

    // Fetch company_id for the event log
    const { data: feature } = await supabase
      .from("features")
      .select("company_id")
      .eq("id", featureId)
      .single();

    if (feature) {
      await supabase.from("events").insert({
        company_id: feature.company_id,
        event_type: "human_reply",
        detail: {
          featureId,
          feedback,
          severity,
          action: "fix_agent_in_thread",
        },
      });
    }
    return;
  }

  // severity === "big" — feature goes back to building
  console.log(
    `[orchestrator] Feature ${featureId} — big rejection, returning to building`,
  );

  // 1. Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id, status, branch, spec")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(
      `[orchestrator] Failed to fetch feature ${featureId}:`,
      fetchErr?.message,
    );
    return;
  }

  // 2. Reset feature to building (CAS: only if currently in combining_and_pr, ci_checking, merging, or complete)
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "building" })
    .eq("id", featureId)
    .in("status", ["combining_and_pr", "ci_checking", "merging", "complete"])
    .select("id");

  if (updateErr) {
    console.error(
      `[orchestrator] Failed to reset feature ${featureId} to building:`,
      updateErr.message,
    );
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(
      `[orchestrator] Feature ${featureId} not in combining_and_pr/ci_checking/merging/complete — skipping rejection`,
    );
    return;
  }

  // 3. Log rejection event
  await supabase.from("events").insert({
    company_id: feature.company_id,
    event_type: "feature_status_changed",
    detail: {
      featureId,
      from: (feature as { status?: string }).status ?? "unknown",
      to: "building",
      reason: "human_rejected",
      feedback,
      severity,
    },
  });

  // 4. Queue a fix job with the rejection feedback
  const fixContext = JSON.stringify({
    type: "rejection_fix",
    feedback,
    featureBranch: feature.branch,
    originalSpec: feature.spec ?? "",
  });
  const { data: insertedRows, error: insertErr } = await supabase.from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      role: "engineer",
      job_type: "code",
      complexity: "medium",
      slot_type: "claude_code",
      status: "created",
      context: fixContext,
      branch: feature.branch,
      rejection_feedback: feedback,
    }).select("id");

  if (insertErr) {
    console.error(
      `[orchestrator] Failed to queue fix job for feature ${featureId}:`,
      insertErr.message,
    );
  } else {
    console.log(
      `[orchestrator] Queued fix job for rejected feature ${featureId}`,
    );
    const jobId = insertedRows?.[0]?.id;
    if (jobId) {
      generateTitle(fixContext).then((title) => {
        if (title) {
          supabase.from("jobs").update({ title }).eq("id", jobId).then(
            () => {},
          );
        }
      }).catch(() => {});
    }
  }
}

async function handleDecisionResolved(
  supabase: SupabaseClient,
  msg: DecisionResolved,
): Promise<void> {
  const { decisionId, companyId, fromRole, action, selectedOption, note } = msg;

  console.log(
    `[orchestrator] Decision ${decisionId} resolved: action=${action}, option=${selectedOption}`,
  );

  const { data: persistentJob, error: persistentJobErr } = await supabase
    .from("jobs")
    .select("id, machine_id, machines(name)")
    .eq("company_id", companyId)
    .eq("role", fromRole)
    .eq("status", "executing")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (persistentJobErr) {
    console.error(
      `[orchestrator] Failed to locate active persistent job for role ${fromRole}:`,
      persistentJobErr.message,
    );
    return;
  }

  const machineName = (persistentJob?.machines as { name?: string } | null)
    ?.name;

  if (!persistentJob?.id || !machineName) {
    console.warn(
      `[orchestrator] No active persistent job for role ${fromRole} in company ${companyId} — decision resolution not forwarded`,
    );
    return;
  }

  const agentChannel = supabase.channel(
    agentChannelName(machineName, companyId),
  );
  await new Promise<void>((resolve) => {
    agentChannel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const result = await agentChannel.send({
          type: "broadcast",
          event: "decision_resolved",
          payload: {
            type: "DecisionResolved",
            decisionId,
            action,
            selectedOption,
            note,
            jobId: persistentJob.id,
          },
        });

        if (result !== "ok") {
          console.error(
            `[orchestrator] Failed to forward decision resolution to ${fromRole} on machine ${machineName}: ${result}`,
          );
        } else {
          console.log(
            `[orchestrator] Forwarded decision resolution to ${fromRole} on machine ${machineName}`,
          );
        }

        await agentChannel.unsubscribe();
        resolve();
      } else if (
        status === "CHANNEL_ERROR" || status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        console.error(
          `[orchestrator] Realtime channel error while forwarding decision ${decisionId} to ${fromRole} on machine ${machineName}`,
        );
        resolve();
      }
    });
  });
}


// ---------------------------------------------------------------------------
// Feature → Breakdown pipeline (Tech Lead)
// ---------------------------------------------------------------------------

/**
 * Creates a breakdown job for a breaking_down feature.
 *
 * "breaking_down" means CPO pre-approval (feature spec agreed for development).
 *
 * Idempotent: skips if a non-terminal breakdown job already exists for this feature.
 * Feature stays in 'breaking_down' while the breakdown job executes.
 */
export async function triggerBreakdown(
  supabase: SupabaseClient,
  featureId: string,
): Promise<void> {
  // 1. Fetch feature for company/project context
  const { data: feature, error } = await supabase
    .from("features")
    .select(
      "company_id, project_id, title, spec, acceptance_tests, branch, fast_track",
    )
    .eq("id", featureId)
    .single();

  if (error || !feature) {
    console.error(
      `[orchestrator] triggerBreakdown: feature ${featureId} not found`,
    );
    return;
  }

  // 1b. Auto-generate branch name if not already set.
  // Must happen before breakdown job is created so dispatch has a featureBranch.
  if (!feature.branch) {
    const title = feature.title ?? "";
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 40);
    const branch = `feature/${slug}-${featureId.substring(0, 8)}`;
    await supabase.from("features").update({ branch }).eq("id", featureId);
    console.log(
      `[orchestrator] triggerBreakdown: auto-generated branch for feature ${featureId}: ${branch}`,
    );
  }

  // 2. Check no active or completed breakdown job already exists (idempotency).
  // Block if a breakdown is in progress OR already completed — a complete breakdown
  // means processFeatureLifecycle should advance the feature to building, not re-trigger.
  // Only failed/cancelled jobs allow re-triggering (intentional reset).
  const { data: existing } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("feature_id", featureId)
    .eq("job_type", "breakdown")
    .in("status", ["created", "queued", "executing", "blocked", "complete"])
    .maybeSingle();

  if (existing) {
    console.log(
      `[orchestrator] triggerBreakdown: breakdown job ${existing.id} (${existing.status}) already exists for feature ${featureId}, skipping`,
    );
    return;
  }

  // 2b. Clean slate: cancel stale jobs from previous breakdown attempts.
  // When a feature is reset to breaking_down after a failed first attempt,
  // old failed breakdown, combine, verify, and implementation jobs linger.
  // The combiner and all_feature_jobs_complete RPC will pick up these stale jobs,
  // causing incorrect behaviour. Cancel them so downstream logic starts fresh.
  // NOTE: We do NOT cancel "complete" jobs here — those are needed by
  // processFeatureLifecycle to detect that breakdown succeeded and advance to building.
  const { data: staleJobs, error: staleErr } = await supabase
    .from("jobs")
    .select("id")
    .eq("feature_id", featureId)
    .in("status", ["failed", "cancelled", "failed_retrying"]);

  if (!staleErr && staleJobs && staleJobs.length > 0) {
    const staleIds = staleJobs.map((j: { id: string }) => j.id);
    const { error: cancelErr } = await supabase
      .from("jobs")
      .update({ status: "cancelled", result: "superseded_by_re_breakdown" })
      .eq("feature_id", featureId)
      .in("id", staleIds);

    if (cancelErr) {
      console.error(
        `[orchestrator] triggerBreakdown: failed to cancel stale jobs for feature ${featureId}:`,
        cancelErr.message,
      );
    } else {
      console.log(
        `[orchestrator] triggerBreakdown: cancelled ${staleIds.length} stale job(s) for feature ${featureId}`,
      );
    }
  }

  // Fast-track: skip breakdown-specialist and create one direct engineering job.
  if (feature.fast_track) {
    const routing = await loadRouting(supabase, feature.company_id);
    const {
      role: fastTrackRole,
      model: fastTrackModel,
      slotType: fastTrackSlotType,
    } = resolveModelAndSlot(
      routing,
      "simple",
      null,
    );

    const fastTrackSpec = (feature.spec ?? "").trim();
    const fastTrackContext = fastTrackSpec.length > 0
      ? fastTrackSpec
      : `Implement feature "${feature.title ?? featureId}".`;

    const { data: fastTrackJob, error: fastTrackErr } = await supabase
      .from("jobs")
      .insert({
        company_id: feature.company_id,
        project_id: feature.project_id,
        feature_id: featureId,
        title: feature.title ?? "Fast-track implementation",
        role: fastTrackRole,
        job_type: "code",
        complexity: "simple",
        model: fastTrackModel,
        slot_type: fastTrackSlotType,
        status: "created",
        context: fastTrackContext,
        acceptance_tests: feature.acceptance_tests ?? null,
      })
      .select("id")
      .single();

    if (fastTrackErr || !fastTrackJob) {
      console.error(
        `[orchestrator] triggerBreakdown: failed to insert fast-track job for feature ${featureId}:`,
        fastTrackErr?.message,
      );
      return;
    }

    const { data: updated, error: updateErr } = await supabase
      .from("features")
      .update({ status: "building" })
      .eq("id", featureId)
      .eq("status", "breaking_down")
      .select("id");

    if (updateErr || !updated || updated.length === 0) {
      if (updateErr) {
        console.error(
          `[orchestrator] triggerBreakdown: failed to set fast-track feature ${featureId} to building:`,
          updateErr.message,
        );
      } else {
        console.warn(
          `[orchestrator] triggerBreakdown: feature ${featureId} status changed before fast-track transition, cancelling job ${fastTrackJob.id}`,
        );
      }

      await supabase
        .from("jobs")
        .update({
          status: "cancelled",
          result: "fast_track_not_started_feature_status_changed",
        })
        .eq("id", fastTrackJob.id)
        .in("status", ["created", "queued"]);
      return;
    }

    console.log(
      `[orchestrator] triggerBreakdown: fast-track enabled for feature ${featureId} — queued job ${fastTrackJob.id}`,
    );
    return;
  }

  // 3. Insert breakdown job
  const { data: job, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      title: "Breaking down feature",
      role: "breakdown-specialist",
      job_type: "breakdown",
      complexity: "simple",
      slot_type: "claude_code",
      status: "created",
      context: JSON.stringify({
        type: "breakdown",
        featureId,
        title: feature.title,
        spec: feature.spec,
        acceptance_tests: feature.acceptance_tests,
      }),
    })
    .select("id")
    .single();

  if (insertErr || !job) {
    console.error(
      `[orchestrator] Failed to insert breakdown job for feature ${featureId}:`,
      insertErr?.message,
    );
    return;
  }

  // 4. Feature stays in 'breaking_down' (breakdown job is in progress).
  // CAS guard ensures feature hasn't changed status since we started.
  // No status update needed — feature is already in 'breaking_down'.
  // All pre-build statuses are now just 'breaking_down'.

  console.log(
    `[orchestrator] Created breakdown job ${job.id} for feature ${featureId}`,
  );
}

// processReadyForBreakdown: polls for features in 'breaking_down' that need a breakdown job created.
// Features enter 'breaking_down' when the CPO approves them for development.
async function processReadyForBreakdown(
  supabase: SupabaseClient,
): Promise<void> {
  const { data: features, error } = await supabase
    .from("features")
    .select("id, depends_on, company_id")
    .eq("status", "breaking_down")
    .limit(50);

  if (error) {
    console.error(
      "[orchestrator] Error querying breaking_down features:",
      error.message,
    );
    return;
  }

  if (!features || features.length === 0) return;

  console.log(
    `[orchestrator] ${features.length} breaking_down feature(s) to process.`,
  );

  for (
    const feature of features as {
      id: string;
      depends_on: string[] | null;
      company_id: string;
    }[]
  ) {
    if (feature.depends_on && feature.depends_on.length > 0) {
      const { data: depFeatures, error: depErr } = await supabase
        .from("features")
        .select("id, status")
        .in("id", feature.depends_on);

      if (depErr) {
        console.error(
          `[orchestrator] Failed to query dependencies for feature ${feature.id}:`,
          depErr.message,
        );
        continue;
      }

      const allSatisfied = Boolean(depFeatures) &&
        depFeatures.length === feature.depends_on.length &&
        depFeatures.every((d: { status: string }) =>
          d.status === "complete" || d.status === "deployed"
        );
      if (!allSatisfied) {
        console.log(
          `[orchestrator] Feature ${feature.id} waiting on dependencies: ${feature.depends_on.join(", ")}`,
        );

        const { data: transitioned, error: transitionErr } = await supabase
          .from("features")
          .update({ status: "waiting_on_deps" })
          .eq("id", feature.id)
          .eq("status", "breaking_down")
          .select("id");

        if (transitionErr) {
          console.error(
            `[orchestrator] Failed to transition feature ${feature.id} to waiting_on_deps:`,
            transitionErr.message,
          );
          continue;
        }

        if (transitioned && transitioned.length > 0) {
          const { error: eventErr } = await supabase.from("events").insert({
            company_id: feature.company_id,
            feature_id: feature.id,
            event_type: "feature_status_changed",
            detail: { from: "breaking_down", to: "waiting_on_deps" },
          });
          if (eventErr) {
            console.error(
              `[orchestrator] Failed to insert status event for feature ${feature.id}:`,
              eventErr.message,
            );
          }
        }

        continue;
      }
    }

    await triggerBreakdown(supabase, feature.id);
  }
}

async function processWaitingOnDeps(supabase: SupabaseClient): Promise<void> {
  const { data: waiting, error: waitingErr } = await supabase
    .from("features")
    .select("id, depends_on, company_id")
    .eq("status", "waiting_on_deps")
    .limit(200);

  if (waitingErr) {
    console.error(
      "[orchestrator] Error querying waiting_on_deps features:",
      waitingErr.message,
    );
    return;
  }

  if (!waiting || waiting.length === 0) return;

  for (
    const feature of waiting as {
      id: string;
      depends_on: string[] | null;
      company_id: string;
    }[]
  ) {
    if (!feature.depends_on || feature.depends_on.length === 0) {
      const { data: updated, error: updateErr } = await supabase
        .from("features")
        .update({ status: "breaking_down" })
        .eq("id", feature.id)
        .eq("status", "waiting_on_deps")
        .select("id");

      if (updateErr) {
        console.error(
          `[orchestrator] Failed to advance dependency-free waiting feature ${feature.id}:`,
          updateErr.message,
        );
        continue;
      }

      if (updated && updated.length > 0) {
        const { error: eventErr } = await supabase.from("events").insert({
          company_id: feature.company_id,
          feature_id: feature.id,
          event_type: "feature_status_changed",
          detail: { from: "waiting_on_deps", to: "breaking_down" },
        });
        if (eventErr) {
          console.error(
            `[orchestrator] Failed to insert status event for feature ${feature.id}:`,
            eventErr.message,
          );
        }
      }
      continue;
    }

    const { data: depFeatures, error: depErr } = await supabase
      .from("features")
      .select("id, status")
      .in("id", feature.depends_on);

    if (depErr) {
      console.error(
        `[orchestrator] Failed to query dependencies for waiting feature ${feature.id}:`,
        depErr.message,
      );
      continue;
    }

    const allSatisfied = Boolean(depFeatures) &&
      depFeatures.length === feature.depends_on.length &&
      depFeatures.every((d: { status: string }) =>
        d.status === "complete" || d.status === "deployed"
      );

    if (allSatisfied) {
      console.log(
        `[orchestrator] Feature ${feature.id} dependencies satisfied, advancing to breakdown`,
      );
      const { data: updated, error: updateErr } = await supabase
        .from("features")
        .update({ status: "breaking_down" })
        .eq("id", feature.id)
        .eq("status", "waiting_on_deps")
        .select("id");

      if (updateErr) {
        console.error(
          `[orchestrator] Failed to advance feature ${feature.id} to breaking_down:`,
          updateErr.message,
        );
        continue;
      }

      if (updated && updated.length > 0) {
        const { error: eventErr } = await supabase.from("events").insert({
          company_id: feature.company_id,
          feature_id: feature.id,
          event_type: "feature_status_changed",
          detail: { from: "waiting_on_deps", to: "breaking_down" },
        });
        if (eventErr) {
          console.error(
            `[orchestrator] Failed to insert status event for feature ${feature.id}:`,
            eventErr.message,
          );
        }
      }
    } else {
      console.log(
        `[orchestrator] Feature ${feature.id} waiting on dependencies: ${feature.depends_on.join(", ")}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Feature lifecycle polling — catch transitions missed by Realtime
// ---------------------------------------------------------------------------

function extractMachineLastHeartbeat(machineRelation: unknown): string | null {
  if (!machineRelation) return null;

  if (Array.isArray(machineRelation)) {
    const firstMachine = machineRelation[0] as
      | { last_heartbeat?: unknown }
      | undefined;
    return typeof firstMachine?.last_heartbeat === "string"
      ? firstMachine.last_heartbeat
      : null;
  }

  const machine = machineRelation as { last_heartbeat?: unknown };
  return typeof machine.last_heartbeat === "string"
    ? machine.last_heartbeat
    : null;
}

async function jobsColumnExists(
  supabase: SupabaseClient,
  columnName: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("jobs")
    .select(`id, ${columnName}`)
    .limit(1);

  if (!error) return true;

  const message = error.message.toLowerCase();
  if (
    message.includes("column") &&
    message.includes(columnName.toLowerCase()) &&
    message.includes("does not exist")
  ) {
    return false;
  }

  console.error(
    `[orchestrator] processFeatureLifecycle: unexpected error probing jobs.${columnName}:`,
    error.message,
  );
  return false;
}

async function getExecutingStartColumn(
  supabase: SupabaseClient,
): Promise<string | null> {
  for (const columnName of EXECUTING_JOB_STARTED_AT_COLUMN_CANDIDATES) {
    if (await jobsColumnExists(supabase, columnName)) {
      if (columnName !== "dispatched_at") {
        console.warn(
          `[orchestrator] processFeatureLifecycle: jobs.dispatched_at not found, using jobs.${columnName} as executing start time`,
        );
      }
      return columnName;
    }
  }

  console.error(
    "[orchestrator] processFeatureLifecycle: no suitable executing start timestamp column found on jobs (checked dispatched_at, updated_at, started_at, assigned_at)",
  );
  return null;
}

async function checkExecutingJobsForHeartbeatTimeout(
  supabase: SupabaseClient,
): Promise<void> {
  const executingStartColumn = await getExecutingStartColumn(supabase);
  if (!executingStartColumn) return;

  const hasStuckAtColumn = await jobsColumnExists(supabase, "stuck_at");
  const selectClause = hasStuckAtColumn
    ? `id, machine_id, ${executingStartColumn}, stuck_at, machines(last_heartbeat)`
    : `id, machine_id, ${executingStartColumn}, machines(last_heartbeat)`;

  const pageSize = 200;
  const nowMs = Date.now();
  let lastSeenId: string | null = null;

  while (true) {
    let query = supabase
      .from("jobs")
      .select(selectClause)
      .eq("status", "executing")
      .order("id", { ascending: true })
      .limit(pageSize);

    if (lastSeenId) {
      query = query.gt("id", lastSeenId);
    }

    const { data: executingJobs, error: executingErr } = await query;

    if (executingErr) {
      console.error(
        "[orchestrator] processFeatureLifecycle: error querying executing jobs for heartbeat timeout check:",
        executingErr.message,
      );
      return;
    }

    if (!executingJobs || executingJobs.length === 0) break;

    for (const rawJob of executingJobs as Record<string, unknown>[]) {
      const jobId = typeof rawJob.id === "string" ? rawJob.id : null;
      if (!jobId) continue;

      const executingStartRaw = rawJob[executingStartColumn];
      if (typeof executingStartRaw !== "string") continue;

      const executingStartMs = Date.parse(executingStartRaw);
      if (Number.isNaN(executingStartMs)) continue;

      if (
        nowMs - executingStartMs <= EXECUTING_JOB_INVESTIGATION_THRESHOLD_MS
      ) {
        continue;
      }

      if (hasStuckAtColumn && rawJob.stuck_at) {
        console.warn(
          `[orchestrator] processFeatureLifecycle: job ${jobId} already has stuck_at marker — skipping duplicate timeout handling`,
        );
        continue;
      }

      const machineHeartbeat = extractMachineLastHeartbeat(rawJob.machines);
      const machineHeartbeatMs = machineHeartbeat
        ? Date.parse(machineHeartbeat)
        : Number.NaN;
      const machineLooksDead = !machineHeartbeat ||
        Number.isNaN(machineHeartbeatMs) ||
        nowMs - machineHeartbeatMs > MACHINE_HEARTBEAT_STALE_FOR_TIMEOUT_MS;

      if (machineLooksDead) {
        const nowIso = new Date().toISOString();
        const { data: updated, error: updateErr } = await supabase
          .from("jobs")
          .update({
            status: "failed",
            result: EXECUTING_JOB_TIMEOUT_RESULT,
            machine_id: null,
            completed_at: nowIso,
            updated_at: nowIso,
          })
          .eq("id", jobId)
          .eq("status", "executing")
          .select("id");

        if (updateErr) {
          console.error(
            `[orchestrator] processFeatureLifecycle: failed to auto-fail timed-out executing job ${jobId}:`,
            updateErr.message,
          );
        } else if (updated && updated.length > 0) {
          console.warn(
            `[orchestrator] processFeatureLifecycle: auto-failed job ${jobId} after >30 min in executing because machine heartbeat is stale or missing`,
          );
        }
      } else {
        console.warn(
          `[orchestrator] processFeatureLifecycle: Job ${jobId} has been executing for >30 min on live machine — investigate`,
        );
      }
    }

    if (executingJobs.length < pageSize) break;
    const tailId = executingJobs[executingJobs.length - 1]?.id;
    if (typeof tailId !== "string") break;
    lastSeenId = tailId;
  }
}

/**
 * Polls for features whose lifecycle transitions were missed because the
 * executor writes job status directly to the DB and the orchestrator's 4s
 * Realtime window may not catch the broadcast.
 *
 * Handles:
 *   0. Executing-job heartbeat timeout check for long-running jobs
 *   1. (removed — failed job retry handled inline by handleJobFailed via request-feature-fix)
 *   1b. deploy_to_test guard: fails queued/executing deploy jobs for terminal features
 *   2. breaking_down → writing_tests: all breakdown jobs for the feature are complete
 *   2b. writing_tests → building: the test job for the feature is complete
 *   3. building → combining_and_pr: all implementation jobs are complete
 *   4. ci_checking catch-up: re-create ci_check job if none is active (Realtime miss recovery)
 *   5. merging → complete: the latest merge job is complete and passed
 */
async function processFeatureLifecycle(
  supabase: SupabaseClient,
): Promise<void> {
  // --- 0. Long-running executing jobs heartbeat timeout check ---
  await checkExecutingJobsForHeartbeatTimeout(supabase);

  // Failed job retry is handled inline by handleJobFailed in agent-event/handlers.ts
  // via request-feature-fix. No catch-up loop needed here.

  // --- 1b. deploy_to_test cleanup for terminal features ---
  // If a feature is terminal, deploy_to_test must never be queued/executing.
  const { data: terminalFeatures, error: terminalErr } = await supabase
    .from("features")
    .select("id, status")
    .in("status", ["failed", "complete", "cancelled"])
    .limit(100);

  if (terminalErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying terminal features for deploy_to_test cleanup:",
      terminalErr.message,
    );
  }

  if (terminalFeatures && terminalFeatures.length > 0) {
    const terminalStatusByFeatureId = new Map(
      terminalFeatures.map((f) => [f.id as string, f.status as string]),
    );

    const { data: invalidDeployJobs, error: invalidDeployErr } = await supabase
      .from("jobs")
      .select("id, feature_id")
      .eq("job_type", "deploy_to_test")
      .in("feature_id", [...terminalStatusByFeatureId.keys()])
      .in("status", ["created", "queued", "executing"])
      .limit(100);

    if (invalidDeployErr) {
      console.error(
        "[orchestrator] processFeatureLifecycle: error querying deploy_to_test jobs for terminal features:",
        invalidDeployErr.message,
      );
    }

    for (
      const job of (invalidDeployJobs ?? []) as {
        id: string;
        feature_id: string;
      }[]
    ) {
      const terminalStatus = terminalStatusByFeatureId.get(job.feature_id) ??
        "terminal";
      const { data: updated } = await supabase
        .from("jobs")
        .update({
          status: "failed",
          result:
            `Auto-failed: deploy_to_test job not allowed because parent feature is ${terminalStatus}`,
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .in("status", ["created", "queued", "executing"])
        .select("id");

      if (updated && updated.length > 0) {
        console.warn(
          `[orchestrator] processFeatureLifecycle: auto-failed deploy_to_test job ${job.id} for terminal feature ${job.feature_id} (${terminalStatus})`,
        );
      }
    }
  }

  // --- 2. breaking_down → writing_tests ---
  // Features stuck in 'breaking_down' where the breakdown job is complete
  const { data: breakdownFeatures, error: bErr } = await supabase
    .from("features")
    .select("id, company_id")
    .eq("status", "breaking_down")
    .limit(50);

  if (bErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying breakdown features:",
      bErr.message,
    );
  }

  for (const feature of breakdownFeatures ?? []) {
    // Check if breakdown job(s) for this feature are all complete or failed
    const { data: pendingBreakdown } = await supabase
      .from("jobs")
      .select("id")
      .eq("feature_id", feature.id)
      .eq("job_type", "breakdown")
      .not("status", "in", '("complete","failed","cancelled","failed_retrying")')
      .limit(1);

    if (!pendingBreakdown || pendingBreakdown.length === 0) {
      // Check if any breakdown jobs failed — if so, don't advance
      const { data: failedBreakdown } = await supabase
        .from("jobs")
        .select("id")
        .eq("feature_id", feature.id)
        .eq("job_type", "breakdown")
        .eq("status", "failed")
        .limit(1);
      if (failedBreakdown && failedBreakdown.length > 0) {
        continue; // Breakdown job failed — feature stays at breaking_down until manually retried
      }
      // Require at least one complete breakdown job — zero jobs means breakdown
      // hasn't run yet (or records were lost), not that it succeeded.
      const { data: completeBreakdown } = await supabase
        .from("jobs")
        .select("id")
        .eq("feature_id", feature.id)
        .eq("job_type", "breakdown")
        .eq("status", "complete")
        .limit(1);
      if (!completeBreakdown || completeBreakdown.length === 0) {
        continue; // No complete breakdown — wait for one to finish
      }
      // All breakdown jobs done — transition to writing_tests and queue test job
      await triggerTestWriting(supabase, feature.id);

      const { data: transitionedFeature } = await supabase
        .from("features")
        .select("status")
        .eq("id", feature.id)
        .maybeSingle();

      if (transitionedFeature?.status === "writing_tests") {
        console.log(
          `[orchestrator] processFeatureLifecycle: feature ${feature.id} breaking_down → writing_tests`,
        );

        // Auto-generate branch name if not already set.
        const { data: featBranch } = await supabase
          .from("features")
          .select("title, branch")
          .eq("id", feature.id)
          .single();
        if (featBranch && !(featBranch as { branch?: string }).branch) {
          const title = (featBranch as { title?: string }).title ?? "";
          const slug = title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .substring(0, 40);
          const branch = `feature/${slug}-${feature.id.substring(0, 8)}`;
          await supabase.from("features").update({ branch }).eq(
            "id",
            feature.id,
          );
          console.log(
            `[orchestrator] Auto-generated branch for feature ${feature.id}: ${branch}`,
          );
        }

        // Notify CPO
        const { data: featureJobs } = await supabase
          .from("jobs")
          .select("id, depends_on")
          .eq("feature_id", feature.id)
          .in("status", ["created", "queued"])
          .neq("job_type", "breakdown");
        const totalJobs = featureJobs?.length ?? 0;
        const dispatchable = featureJobs?.filter(
          (j: { depends_on: string[] | null }) =>
            !j.depends_on || j.depends_on.length === 0,
        ).length ?? 0;
        const { data: feat } = await supabase
          .from("features")
          .select("title")
          .eq("id", feature.id)
          .single();
        await notifyCPO(
          supabase,
          feature.company_id,
          `Feature "${
            feat?.title ?? feature.id
          }" broken into ${totalJobs} jobs. ${dispatchable} immediately dispatchable.`,
        );
      }
    }
  }

  // --- 2b. writing_tests → building ---
  // Features in writing_tests where test job is complete
  const { data: writingTestsFeatures, error: writingTestsErr } = await supabase
    .from("features")
    .select("id, company_id")
    .eq("status", "writing_tests")
    .limit(50);

  if (writingTestsErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying writing_tests features:",
      writingTestsErr.message,
    );
  }

  for (const feature of writingTestsFeatures ?? []) {
    const { data: testJob } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("feature_id", feature.id)
      .eq("job_type", "test")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!testJob || testJob.length === 0) {
      continue;
    }

    const latestTestJob = testJob[0] as { id: string; status: string };
    if (latestTestJob.status === "failed") {
      continue; // Retry/escalation is handled elsewhere
    }
    if (latestTestJob.status !== "complete") {
      continue; // Test job still running/in progress
    }

    const { data: updated } = await supabase
      .from("features")
      .update({ status: "building" })
      .eq("id", feature.id)
      .eq("status", "writing_tests")
      .select("id");

    if (updated && updated.length > 0) {
      console.log(
        `[orchestrator] processFeatureLifecycle: feature ${feature.id} writing_tests → building`,
      );

      // Notify CPO
      const { data: featureJobs } = await supabase
        .from("jobs")
        .select("id, depends_on")
        .eq("feature_id", feature.id)
        .in("status", ["created", "queued"])
        .neq("job_type", "breakdown");
      const totalJobs = featureJobs?.length ?? 0;
      const dispatchable = featureJobs?.filter(
        (j: { depends_on: string[] | null }) =>
          !j.depends_on || j.depends_on.length === 0,
      ).length ?? 0;
      const { data: feat } = await supabase
        .from("features")
        .select("title")
        .eq("id", feature.id)
        .single();
      await notifyCPO(
        supabase,
        feature.company_id,
        `Feature "${
          feat?.title ?? feature.id
        }" broken into ${totalJobs} jobs. ${dispatchable} immediately dispatchable.`,
      );
    }
  }

  // --- 3. building → combining ---
  // Features stuck in 'building' where all implementation jobs are complete
  const { data: buildingFeatures, error: buildErr } = await supabase
    .from("features")
    .select("id")
    .eq("status", "building")
    .limit(50);

  if (buildErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying building features:",
      buildErr.message,
    );
  }

  for (const feature of (buildingFeatures ?? []) as { id: string }[]) {
    // Don't advance if any implementation jobs failed
    const { data: failedJobs } = await supabase
      .from("jobs")
      .select("id")
      .eq("feature_id", feature.id)
      .eq("status", "failed")
      .limit(1);
    if (failedJobs && failedJobs.length > 0) {
      continue; // Feature has failed job(s) — stays at building until retried
    }

    const { data: allDone } = await supabase
      .rpc("all_feature_jobs_complete", { p_feature_id: feature.id });

    if (allDone) {
      console.log(
        `[orchestrator] processFeatureLifecycle: all jobs done for feature ${feature.id} — triggering combining`,
      );
      await triggerCombining(supabase, feature.id);
    }
  }

  // --- 3b. combining_and_pr catch-up: transition to ci_checking if combine is done and PR exists ---
  // Catches features that missed the event-driven triggerCICheck (e.g. Realtime miss or race).
  const { data: combiningFeatures, error: combiningErr } = await supabase
    .from("features")
    .select("id, branch, pr_url, project_id, company_id")
    .eq("status", "combining_and_pr")
    .not("pr_url", "is", null)
    .limit(50);

  if (combiningErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying combining_and_pr features:",
      combiningErr.message,
    );
  }

  for (
    const feature of (combiningFeatures ?? []) as Array<{
      id: string;
      branch: string | null;
      pr_url: string | null;
      project_id: string | null;
      company_id: string;
    }>
  ) {
    // Check if the combine job is complete
    const { data: combineJob } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("feature_id", feature.id)
      .eq("job_type", "combine")
      .eq("status", "complete")
      .limit(1);

    if (!combineJob || combineJob.length === 0) {
      continue; // Combine job not yet complete — not ready to advance
    }

    const prUrl = feature.pr_url ?? null;
    const branch = feature.branch ?? null;
    if (!prUrl || !branch || !feature.project_id) {
      console.warn(
        `[orchestrator] combining_and_pr feature ${feature.id} missing pr_url/branch/project_id — cannot trigger CI check`,
      );
      continue;
    }

    const { data: project } = await supabase
      .from("projects")
      .select("repo_url")
      .eq("id", feature.project_id)
      .maybeSingle();

    const repoUrl = (project as { repo_url?: string | null } | null)?.repo_url ?? null;
    if (!repoUrl) {
      console.warn(
        `[orchestrator] combining_and_pr feature ${feature.id} project has no repo_url — cannot trigger CI check`,
      );
      continue;
    }

    let owner: string;
    let repo: string;
    try {
      ({ owner, repo } = parseGitHubRepoUrl(repoUrl));
    } catch {
      console.warn(
        `[orchestrator] combining_and_pr feature ${feature.id}: invalid repo_url "${repoUrl}"`,
      );
      continue;
    }

    const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : null;

    console.log(
      `[orchestrator] combining_and_pr feature ${feature.id} has completed combine job and PR — triggering CI check (catch-up)`,
    );

    await triggerCICheck(supabase, feature.id, prUrl, prNumber, owner, repo, branch);
  }

  // --- 4. ci_checking catch-up: re-create ci_check job if none is active ---
  // If a ci_check job was lost (e.g. Realtime miss), the orchestrator re-creates it.
  const { data: ciCheckingFeatures, error: ciCheckErr } = await supabase
    .from("features")
    .select("id, branch, pr_url, project_id, company_id")
    .eq("status", "ci_checking")
    .limit(50);

  if (ciCheckErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying ci_checking features:",
      ciCheckErr.message,
    );
  }

  for (
    const feature of (ciCheckingFeatures ?? []) as Array<{
      id: string;
      branch: string | null;
      pr_url: string | null;
      project_id: string | null;
      company_id: string;
    }>
  ) {
    // Check if a ci_check job already exists (any non-failed terminal state counts)
    const { data: existingCIJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("feature_id", feature.id)
      .eq("job_type", "ci_check")
      .in("status", ["created", "queued", "executing", "complete", "cancelled"])
      .limit(1);

    if (existingCIJob && existingCIJob.length > 0) {
      continue; // Already has an active or completed ci_check job
    }

    // Also skip if a fix job is active (fix completes → ci_check will be created via depends_on)
    const { data: activeFixJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("feature_id", feature.id)
      .eq("source", "ci_failure")
      .in("status", ["created", "queued", "executing"])
      .limit(1);

    if (activeFixJob && activeFixJob.length > 0) {
      continue; // Fix job is active — ci_check will follow it
    }

    // No active ci_check or fix job — re-create a ci_check job (catch-up)
    const prUrl = feature.pr_url ?? null;
    const branch = feature.branch ?? null;
    if (!prUrl || !branch || !feature.project_id) {
      console.warn(
        `[orchestrator] ci_checking feature ${feature.id} missing pr_url/branch/project_id — cannot re-create ci_check`,
      );
      continue;
    }

    const { data: project } = await supabase
      .from("projects")
      .select("repo_url")
      .eq("id", feature.project_id)
      .maybeSingle();

    const repoUrl = (project as { repo_url?: string | null } | null)?.repo_url ?? null;
    if (!repoUrl) {
      console.warn(
        `[orchestrator] ci_checking feature ${feature.id} project has no repo_url — cannot re-create ci_check`,
      );
      continue;
    }

    let owner: string;
    let repo: string;
    try {
      ({ owner, repo } = parseGitHubRepoUrl(repoUrl));
    } catch {
      console.warn(
        `[orchestrator] ci_checking feature ${feature.id}: invalid repo_url "${repoUrl}"`,
      );
      continue;
    }

    const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : null;

    console.log(
      `[orchestrator] ci_checking feature ${feature.id} has no active ci_check job — re-creating (catch-up)`,
    );

    await supabase.from("jobs").insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: feature.id,
      title: `CI check: ${branch} (catch-up)`,
      role: "ci-checker",
      job_type: "ci_check",
      complexity: "simple",
      slot_type: "claude_code",
      status: "created",
      context: JSON.stringify({
        type: "ci_check",
        featureId: feature.id,
        prUrl,
        prNumber,
        owner,
        repo,
        branch,
      }),
      branch,
    });
  }

  // --- 5. merging → complete (catch-up) ---
  // Features stuck in 'merging' where the latest merge job is already complete.
  const { data: mergingFeatures, error: mergeErr } = await supabase
    .from("features")
    .select("id, company_id")
    .eq("status", "merging")
    .limit(50);

  if (mergeErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying merging features:",
      mergeErr.message,
    );
  }

  for (
    const feature of (mergingFeatures ?? []) as {
      id: string;
      company_id: string;
    }[]
  ) {
    const { data: latestMerge } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("feature_id", feature.id)
      .eq("job_type", "merge")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!latestMerge || latestMerge.length === 0) continue;
    const job = latestMerge[0] as {
      id: string;
      status: string;
    };

    if (job.status === "complete") {
      console.log(
        `[orchestrator] processFeatureLifecycle: merge PASSED for feature ${feature.id} — advancing to complete (catch-up)`,
      );
      const { data: updated } = await supabase
        .from("features")
        .update({
          status: "complete",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", feature.id)
        .eq("status", "merging")
        .select("id, pr_url, title");

      if (updated?.length) {
        const prUrl = (updated[0] as { pr_url?: string }).pr_url ?? null;
        const featureTitle = (updated[0] as { title?: string }).title ??
          feature.id;
        await notifyCPO(
          supabase,
          feature.company_id,
          prUrl
            ? `Feature "${featureTitle}" merged and complete: ${prUrl}`
            : `Feature "${featureTitle}" merged and complete.`,
        );
      }
    } else if (job.status === "failed") {
      console.warn(
        `[orchestrator] processFeatureLifecycle: merge FAILED for feature ${feature.id} — staying at merging, needs attention`,
      );
    }
    // if still 'executing' or 'queued', do nothing — let it run
  }

  // Feature pipeline ends at 'complete'.
}

export async function analyzeRecentlyCompletedJobs(
  supabase: SupabaseClient,
  analyzeLogsFn: (jobId: string) => Promise<JobLogAnalysisResult> =
    analyzeJobLogs,
): Promise<void> {
  const completedCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: recentJobs, error: recentJobsErr } = await supabase
    .from("jobs")
    .select("id, feature_id, company_id")
    .in("status", ["complete", "failed"])
    .filter("error_analysis", "is", null)
    .gt("completed_at", completedCutoff)
    .order("completed_at", { ascending: true })
    .limit(100);

  if (recentJobsErr) {
    console.error(
      "[orchestrator] analyzeRecentlyCompletedJobs: error querying recently completed jobs:",
      recentJobsErr.message,
    );
    return;
  }

  for (const row of recentJobs ?? []) {
    const job = row as {
      id: string;
      feature_id: string | null;
      company_id: string;
    };

    let analysis: JobLogAnalysisResult;
    try {
      analysis = await analyzeLogsFn(job.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[orchestrator] analyzeRecentlyCompletedJobs: failed to analyze logs for job ${job.id}:`,
        message,
      );
      continue;
    }

    const { error: updateErr } = await supabase
      .from("jobs")
      .update({ error_analysis: analysis })
      .eq("id", job.id);

    if (updateErr) {
      console.error(
        `[orchestrator] analyzeRecentlyCompletedJobs: failed to write error_analysis for job ${job.id}:`,
        updateErr.message,
      );
      continue;
    }

    const criticalCategories = Array.from(
      new Set(
        analysis.errors
          .filter((entry) => entry.severity === "critical")
          .map((entry) => entry.category),
      ),
    );

    if (criticalCategories.length === 0) {
      continue;
    }

    const summary = criticalCategories.join(", ");
    console.warn(
      `[orchestrator] Job ${job.id} completed with critical errors: ${summary}`,
    );

    if (!job.feature_id) {
      continue;
    }

    const { error: featureNoteErr } = await supabase
      .from("events")
      .insert({
        company_id: job.company_id,
        feature_id: job.feature_id,
        event_type: "escalation",
        detail: {
          type: "job_error_analysis",
          jobId: job.id,
          severity: "critical",
          summary,
          categories: criticalCategories,
        },
      });

    if (featureNoteErr) {
      console.error(
        `[orchestrator] analyzeRecentlyCompletedJobs: failed to append feature note for feature ${job.feature_id}:`,
        featureNoteErr.message,
      );
    }

    await notifyCPO(
      supabase,
      job.company_id,
      `Feature ${job.feature_id}: job ${job.id} completed with critical errors (${summary}).`,
    );
  }
}

// ---------------------------------------------------------------------------
// Slack helpers (orchestrator-side)
// ---------------------------------------------------------------------------

/**
 * Posts a Slack message to the company's default channel when a PR is ready for review.
 */
async function notifyPRReady(
  supabase: SupabaseClient,
  companyId: string,
  featureTitle: string,
  prUrl: string | null,
): Promise<void> {
  const slackChannel = await getDefaultSlackChannel(supabase, companyId);
  if (!slackChannel) return;
  const botToken = await getSlackBotToken(supabase, companyId);
  if (!botToken) return;

  const text = prUrl
    ? [
      `:rocket: *PR ready for review: "${featureTitle}"*`,
      "",
      `${prUrl}`,
      "",
      "Please review this PR with the CPO before merging.",
    ].join("\n")
    : [
      `:rocket: *Feature ready for review: "${featureTitle}"*`,
      "",
      "PR URL is not yet available — check with the CPO.",
    ].join("\n");

  await postSlackMessage(botToken, slackChannel, text);
}

async function getDefaultSlackChannel(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("companies")
    .select("slack_channels")
    .eq("id", companyId)
    .single();

  if (!data?.slack_channels) return null;
  const channels = data.slack_channels as string[];
  return channels.length > 0 ? channels[0] : null;
}

async function getSlackBotToken(
  supabase: SupabaseClient,
  companyId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("slack_installations")
    .select("bot_token")
    .eq("company_id", companyId)
    .limit(1)
    .single();

  return data?.bot_token ?? null;
}

async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string,
  threadTs?: string,
): Promise<string | null> {
  const payload: Record<string, string> = { channel, text };
  if (threadTs) payload.thread_ts = threadTs;

  try {
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error(`[orchestrator] Slack API error: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json() as {
      ok?: boolean;
      ts?: string;
      error?: string;
    };
    if (!data.ok) {
      console.error(`[orchestrator] Slack API error: ${data.error}`);
      return null;
    }

    return data.ts ?? null;
  } catch (err) {
    console.error("[orchestrator] Slack postMessage failed:", err);
    return null;
  }
}

function parseChecklist(raw: string | null): string[] {
  if (!raw) return [];
  return raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

/**
 * Refreshes the pipeline snapshot cache for each company.
 *
 * Best-effort only: snapshot data is a cache for fast reads, not part of the
 * critical dispatch/lifecycle path. Any errors are logged as warnings and do
 * not fail the heartbeat invocation.
 */
async function refreshPipelineSnapshotCache(
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const { data: companies, error: companiesErr } = await supabase
      .from("companies")
      .select("id");

    if (companiesErr) {
      console.warn(
        "[orchestrator] Snapshot cache refresh skipped: failed to fetch companies:",
        companiesErr.message,
      );
      return;
    }

    for (const { id: companyId } of (companies ?? []) as { id: string }[]) {
      const { error: refreshErr } = await supabase.rpc(
        "refresh_pipeline_snapshot",
        {
          p_company_id: companyId,
        },
      );

      if (refreshErr) {
        console.warn(
          `[orchestrator] Snapshot cache refresh failed for company ${companyId}: ${refreshErr.message}`,
        );
        continue;
      }

      // Keep waiting_on_deps explicit in cached features_by_status even if the
      // DB function is deployed without this status in its active-status filter.
      const { data: waitingFeatures, error: waitingErr } = await supabase
        .from("features")
        .select("id, title, priority, created_at, updated_at")
        .eq("company_id", companyId)
        .eq("status", "waiting_on_deps")
        .order("updated_at", { ascending: false });
      if (waitingErr) {
        console.warn(
          `[orchestrator] Snapshot waiting_on_deps enrich skipped for company ${companyId}: ${waitingErr.message}`,
        );
        continue;
      }
      if (!waitingFeatures || waitingFeatures.length === 0) continue;

      const waitingFeatureIds = waitingFeatures.map((f: { id: string }) => f.id);
      const { data: failedJobs, error: failedErr } = await supabase
        .from("jobs")
        .select("feature_id")
        .eq("company_id", companyId)
        .eq("status", "failed")
        .in("feature_id", waitingFeatureIds);
      if (failedErr) {
        console.warn(
          `[orchestrator] Snapshot waiting_on_deps failed-job enrich skipped for company ${companyId}: ${failedErr.message}`,
        );
        continue;
      }

      const failedFeatureIds = new Set(
        (failedJobs ?? [])
          .map((row: { feature_id: string | null }) => row.feature_id)
          .filter((id): id is string => typeof id === "string"),
      );

      const waitingList = waitingFeatures.map(
        (f: {
          id: string;
          title: string | null;
          priority: string | null;
          created_at: string;
          updated_at: string;
        }) => ({
          id: f.id,
          title: f.title,
          priority: f.priority,
          created_at: f.created_at,
          updated_at: f.updated_at,
          has_failed_jobs: failedFeatureIds.has(f.id),
        }),
      );

      const { data: snapshotRow, error: snapshotErr } = await supabase
        .from("pipeline_snapshots")
        .select("snapshot")
        .eq("company_id", companyId)
        .maybeSingle();
      if (snapshotErr || !snapshotRow) {
        console.warn(
          `[orchestrator] Snapshot waiting_on_deps merge skipped for company ${companyId}: ${snapshotErr?.message ?? "snapshot row missing"}`,
        );
        continue;
      }

      const baseSnapshot = (snapshotRow.snapshot ?? {}) as Record<string, unknown>;
      const baseByStatus = (baseSnapshot.features_by_status ?? {}) as Record<
        string,
        unknown
      >;
      const mergedSnapshot = {
        ...baseSnapshot,
        features_by_status: {
          ...baseByStatus,
          waiting_on_deps: waitingList,
        },
      };

      const { error: patchErr } = await supabase
        .from("pipeline_snapshots")
        .update({
          snapshot: mergedSnapshot,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);
      if (patchErr) {
        console.warn(
          `[orchestrator] Snapshot waiting_on_deps merge failed for company ${companyId}: ${patchErr.message}`,
        );
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[orchestrator] Snapshot cache refresh failed:", message);
  }
}

// ---------------------------------------------------------------------------
// Auto-triage: dispatch triage jobs for new ideas in auto_triage companies
// ---------------------------------------------------------------------------

const AUTO_TRIAGE_COOLDOWN_MS = 60 * 1000; // 1 min between dispatches per company
const AUTO_TRIAGE_STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 min before reverting orphaned triaging ideas
const autoTriageLastRun = new Map<string, number>();

/**
 * Recover ideas stuck at 'triaging' with no active triage-analyst job.
 * This handles: batch-orphaning, agent crashes, tool failures, prompt non-compliance.
 */
async function recoverStaleTriagingIdeas(
  supabase: SupabaseClient,
): Promise<void> {
  const staleCutoff = new Date(Date.now() - AUTO_TRIAGE_STALE_THRESHOLD_MS)
    .toISOString();

  // Find ideas stuck at 'triaging' for longer than the threshold.
  const { data: staleIdeas, error: staleErr } = await supabase
    .from("ideas")
    .select("id, company_id")
    .eq("status", "triaging")
    .lt("updated_at", staleCutoff);

  if (staleErr || !staleIdeas?.length) return;

  for (const idea of staleIdeas as { id: string; company_id: string }[]) {
    // Check if there's still an active triage job for this specific idea.
    const { data: activeJobs } = await supabase
      .from("jobs")
      .select("id")
      .eq("role", "triage-analyst")
      .eq("context", idea.id)
      .in("status", ["created", "queued", "executing"])
      .limit(1);

    if (activeJobs && activeJobs.length > 0) continue;

    // Also check headless expert sessions that are still running and mention this idea.
    // Join through expert_session_items (preferred) with a fallback to brief text search
    // for sessions that haven't yet inserted item rows.
    const { data: activeSessionItems } = await supabase
      .from("expert_session_items")
      .select("id, session:session_id!inner(status)")
      .eq("idea_id", idea.id)
      .is("completed_at", null)
      .limit(1);

    const hasActiveItem = activeSessionItems?.some(
      (item: Record<string, unknown>) => {
        const session = item.session as Record<string, unknown> | null;
        return session?.status === "running";
      },
    );
    if (hasActiveItem) continue;

    // Fallback: check running headless sessions whose brief mentions this idea ID
    const { data: runningSessions } = await supabase
      .from("expert_sessions")
      .select("id, brief")
      .eq("headless", true)
      .eq("status", "running");

    const briefMentionsIdea = runningSessions?.some(
      (s: { brief: string | null }) => s.brief && s.brief.includes(idea.id),
    );
    if (briefMentionsIdea) continue;

    // No active job or session — revert to 'new' so it can be re-triaged.
    const { error: revertErr } = await supabase
      .from("ideas")
      .update({ status: "new" })
      .eq("id", idea.id)
      .eq("status", "triaging"); // guard against race

    if (revertErr) {
      console.error(
        `[orchestrator] stale-triage-recovery: failed to revert idea ${idea.id}: ${revertErr.message}`,
      );
    } else {
      console.warn(
        `[orchestrator] stale-triage-recovery: reverted idea ${idea.id} from triaging → new (no active triage job after ${
          AUTO_TRIAGE_STALE_THRESHOLD_MS / 60000
        } min)`,
      );
    }
  }
}

interface DevelopingIdeaRow {
  id: string;
  company_id: string;
  project_id: string | null;
  complexity: string | null;
  spec: string | null;
  spec_retry_count: number | null;
  triage_notes: string | null;
  updated_at: string;
}

interface ExpertSessionChainRow {
  id: string;
  status: string;
  createdAt: string;
  batchId: string | null;
  brief: string;
  roleName: string | null;
  route: string | null;
}

function parseSessionChainRow(
  row: Record<string, unknown>,
  route: string | null,
): ExpertSessionChainRow | null {
  const id = typeof row.id === "string" ? row.id : null;
  const status = typeof row.status === "string" ? row.status : null;
  const createdAt = typeof row.created_at === "string" ? row.created_at : null;
  if (!id || !status || !createdAt) return null;

  const expertRole = row.expert_role as Record<string, unknown> | null;
  return {
    id,
    status,
    createdAt,
    batchId: typeof row.batch_id === "string" ? row.batch_id : null,
    brief: typeof row.brief === "string" ? row.brief : "",
    roleName: typeof expertRole?.name === "string" ? expertRole.name : null,
    route,
  };
}

function defaultAutoSpecBrief(roleName: string, ideaId: string): string {
  const ideaIdsJson = JSON.stringify([ideaId]);
  if (roleName === "spec-reviewer" || roleName === "reviewer") {
    return `Auto-spec review continuation. Review these ideas: ${ideaIdsJson}. Validate the spec against the codebase and call record_session_item with route=approve|revise|workshop|hardening.`;
  }
  return `Auto-spec continuation. Write or revise specs for these ideas: ${ideaIdsJson}. Read prior review notes if present, update spec fields via update_idea, and record completion route.`;
}

async function dispatchHeadlessExpert(
  companyId: string,
  roleName: string,
  brief: string,
  projectId: string,
  batchId: string,
): Promise<boolean> {
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/start-expert-session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-company-id": companyId,
      },
      body: JSON.stringify({
        role_name: roleName,
        brief,
        machine_name: "auto",
        project_id: projectId,
        headless: true,
        batch_id: batchId,
      }),
    },
  );

  return response.ok;
}

async function setDevelopingIdeaStatus(
  supabase: SupabaseClient,
  ideaId: string,
  targetStatus: "specced" | "workshop" | "hardening" | "triaged",
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ideas")
    .update({ status: targetStatus })
    .eq("id", ideaId)
    .eq("status", "developing")
    .select("id");

  if (error) {
    console.error(
      `[orchestrator] stale-developing-recovery: failed setting idea ${ideaId} to ${targetStatus}: ${error.message}`,
    );
    return false;
  }

  return Boolean(data && data.length > 0);
}

const ACTIVE_SPEC_SESSION_STATUSES = [
  "requested",
  "executing",
  "claimed",
  "starting",
  "running",
];

interface CompanySpecConfig {
  specTimeoutMinutes: number;
  maxSpecRetries: number;
}

async function hasActiveSpecSessionForIdea(
  supabase: SupabaseClient,
  ideaId: string,
  companyId: string,
): Promise<boolean> {
  const batchIds = new Set<string>();

  const { data: itemRows } = await supabase
    .from("expert_session_items")
    .select("session:session_id!inner(batch_id)")
    .eq("idea_id", ideaId)
    .limit(25);

  for (const row of (itemRows ?? []) as {
    session: { batch_id: string | null } | null;
  }[]) {
    const batchId = row.session?.batch_id;
    if (batchId) batchIds.add(batchId);
  }

  if (batchIds.size > 0) {
    const { data: byBatch } = await supabase
      .from("expert_sessions")
      .select("id")
      .eq("company_id", companyId)
      .in("status", ACTIVE_SPEC_SESSION_STATUSES)
      .in("batch_id", [...batchIds])
      .limit(1);
    if (byBatch && byBatch.length > 0) return true;
  }

  const { data: byBrief } = await supabase
    .from("expert_sessions")
    .select("id")
    .eq("company_id", companyId)
    .in("status", ACTIVE_SPEC_SESSION_STATUSES)
    .ilike("brief", `%${ideaId}%`)
    .limit(1);

  return Boolean(byBrief && byBrief.length > 0);
}

async function recoverMissingSpecDevelopingIdeas(
  supabase: SupabaseClient,
): Promise<void> {
  const { data: companyRows, error: companyErr } = await supabase
    .from("companies")
    .select("id, spec_timeout_minutes, max_spec_retries")
    .eq("status", "active");

  if (companyErr) {
    console.error(
      `[orchestrator] stale-developing-recovery: failed to load company spec config: ${companyErr.message}`,
    );
    return;
  }

  const companyConfig = new Map<string, CompanySpecConfig>();
  for (
    const row of (companyRows ?? []) as {
      id: string;
      spec_timeout_minutes: number | null;
      max_spec_retries: number | null;
    }[]
  ) {
    companyConfig.set(row.id, {
      specTimeoutMinutes: row.spec_timeout_minutes ?? 30,
      maxSpecRetries: row.max_spec_retries ?? 3,
    });
  }

  const { data: developingIdeas, error: ideasErr } = await supabase
    .from("ideas")
    .select(
      "id, company_id, project_id, complexity, spec, spec_retry_count, triage_notes, updated_at",
    )
    .eq("status", "developing")
    .is("spec", null);

  if (ideasErr || !developingIdeas?.length) return;

  const nowMs = Date.now();
  for (const idea of developingIdeas as DevelopingIdeaRow[]) {
    const cfg = companyConfig.get(idea.company_id) ?? {
      specTimeoutMinutes: 30,
      maxSpecRetries: 3,
    };
    const updatedAtMs = Date.parse(idea.updated_at);
    if (
      !Number.isFinite(updatedAtMs) ||
      nowMs - updatedAtMs < cfg.specTimeoutMinutes * 60 * 1000
    ) {
      continue;
    }

    const hasActiveSession = await hasActiveSpecSessionForIdea(
      supabase,
      idea.id,
      idea.company_id,
    );
    if (hasActiveSession) continue;

    const currentRetryCount = idea.spec_retry_count ?? 0;
    const nextRetryCount = currentRetryCount + 1;
    let incrementQuery = supabase
      .from("ideas")
      .update({ spec_retry_count: nextRetryCount })
      .eq("id", idea.id)
      .eq("status", "developing")
      .is("spec", null);
    incrementQuery = idea.spec_retry_count === null
      ? incrementQuery.is("spec_retry_count", null)
      : incrementQuery.eq("spec_retry_count", currentRetryCount);

    const { data: incremented, error: retryErr } = await incrementQuery.select(
      "id",
    );

    if (retryErr || !incremented?.length) {
      if (retryErr) {
        console.error(
          `[orchestrator] stale-developing-recovery: failed incrementing spec_retry_count for idea ${idea.id}: ${retryErr.message}`,
        );
      }
      continue;
    }

    if (nextRetryCount < cfg.maxSpecRetries) {
      if (!idea.project_id) {
        console.log(
          `[orchestrator] stale-developing-recovery: cannot retry spec-writer for idea ${idea.id} (missing project_id)`,
        );
        continue;
      }

      const dispatched = await dispatchHeadlessExpert(
        idea.company_id,
        "spec-writer",
        `Auto-spec retry. Process this idea: ${JSON.stringify([idea.id])}`,
        idea.project_id,
        crypto.randomUUID(),
      );

      if (dispatched) {
        console.log(
          `[orchestrator] Retrying spec-writer for idea ${idea.id} (attempt ${nextRetryCount})`,
        );
      } else {
        console.log(
          `[orchestrator] stale-developing-recovery: failed dispatching spec-writer retry for idea ${idea.id} (attempt ${nextRetryCount})`,
        );
      }
      continue;
    }

    const escalationNote =
      `ESCALATED: spec-writer failed ${nextRetryCount} times — needs human review`;
    const mergedNotes = idea.triage_notes?.trim()
      ? `${idea.triage_notes}\n${escalationNote}`
      : escalationNote;

    const { data: escalated, error: escalateErr } = await supabase
      .from("ideas")
      .update({ status: "workshop", triage_notes: mergedNotes })
      .eq("id", idea.id)
      .eq("status", "developing")
      .is("spec", null)
      .select("id");

    if (escalateErr || !escalated?.length) {
      if (escalateErr) {
        console.error(
          `[orchestrator] stale-developing-recovery: failed escalating idea ${idea.id}: ${escalateErr.message}`,
        );
      }
      continue;
    }

    console.log(
      `[orchestrator] Escalating idea ${idea.id} to workshop after ${nextRetryCount} spec-writer failures`,
    );
  }
}

async function continueAutoSpecChain(
  supabase: SupabaseClient,
  idea: DevelopingIdeaRow,
  latestSession: ExpertSessionChainRow,
  roundCount: number,
): Promise<void> {
  if (roundCount >= 5) {
    const updated = await setDevelopingIdeaStatus(supabase, idea.id, "workshop");
    if (updated) {
      console.log(
        `[orchestrator] stale-developing-recovery: escalated idea ${idea.id} to workshop (round cap reached: ${roundCount})`,
      );
    }
    return;
  }

  const roleName = latestSession.roleName;
  if (roleName === "spec-writer") {
    if (idea.complexity === "simple") {
      const updated = await setDevelopingIdeaStatus(supabase, idea.id, "specced");
      if (updated) {
        console.log(
          `[orchestrator] stale-developing-recovery: completed idea ${idea.id} developing → specced after spec-writer`,
        );
      }
      return;
    }

    if (!idea.project_id || !latestSession.batchId) {
      console.log(
        `[orchestrator] stale-developing-recovery: cannot dispatch reviewer for idea ${idea.id} (missing project_id or batch_id)`,
      );
      return;
    }

    const dispatched = await dispatchHeadlessExpert(
      idea.company_id,
      "spec-reviewer",
      defaultAutoSpecBrief("spec-reviewer", idea.id),
      idea.project_id,
      latestSession.batchId,
    );

    if (dispatched) {
      console.log(
        `[orchestrator] stale-developing-recovery: dispatched spec-reviewer for idea ${idea.id} (batch ${latestSession.batchId})`,
      );
    } else {
      console.log(
        `[orchestrator] stale-developing-recovery: failed to dispatch spec-reviewer for idea ${idea.id} (batch ${latestSession.batchId})`,
      );
    }
    return;
  }

  if (roleName === "spec-reviewer" || roleName === "reviewer") {
    let route = latestSession.route;
    if (!route) {
      const { data: itemRow } = await supabase
        .from("expert_session_items")
        .select("route")
        .eq("session_id", latestSession.id)
        .eq("idea_id", idea.id)
        .maybeSingle();
      route = typeof itemRow?.route === "string" ? itemRow.route : null;
    }

    if (route === "approve") {
      const updated = await setDevelopingIdeaStatus(supabase, idea.id, "specced");
      if (updated) {
        console.log(
          `[orchestrator] stale-developing-recovery: reviewer approved idea ${idea.id}; set developing → specced`,
        );
      }
      return;
    }

    if (route === "workshop" || route === "hardening") {
      const updated = await setDevelopingIdeaStatus(supabase, idea.id, route);
      if (updated) {
        console.log(
          `[orchestrator] stale-developing-recovery: reviewer routed idea ${idea.id} to ${route}`,
        );
      }
      return;
    }

    if (route === "revise") {
      if (!idea.project_id || !latestSession.batchId) {
        console.log(
          `[orchestrator] stale-developing-recovery: cannot re-dispatch spec-writer for idea ${idea.id} (missing project_id or batch_id)`,
        );
        return;
      }

      const dispatched = await dispatchHeadlessExpert(
        idea.company_id,
        "spec-writer",
        defaultAutoSpecBrief("spec-writer", idea.id),
        idea.project_id,
        latestSession.batchId,
      );

      if (dispatched) {
        console.log(
          `[orchestrator] stale-developing-recovery: reviewer requested revision; dispatched spec-writer for idea ${idea.id} (batch ${latestSession.batchId})`,
        );
      } else {
        console.log(
          `[orchestrator] stale-developing-recovery: failed to dispatch spec-writer revision for idea ${idea.id} (batch ${latestSession.batchId})`,
        );
      }
      return;
    }

    console.log(
      `[orchestrator] stale-developing-recovery: reviewer route missing/unknown for idea ${idea.id} (session ${latestSession.id})`,
    );
    return;
  }

  console.log(
    `[orchestrator] stale-developing-recovery: no continuation rule for idea ${idea.id} after role ${roleName ?? "unknown"}`,
  );
}

/**
 * Recover ideas stuck at 'developing' by resuming or repairing spec/review chains.
 */
async function recoverStaleDevelopingIdeas(supabase: SupabaseClient): Promise<void> {
  await recoverMissingSpecDevelopingIdeas(supabase);

  const staleCutoffIso = new Date(Date.now() - AUTO_TRIAGE_STALE_THRESHOLD_MS).toISOString();
  const staleCutoffMs = Date.now() - AUTO_TRIAGE_STALE_THRESHOLD_MS;

  const { data: staleIdeas, error: staleErr } = await supabase
    .from("ideas")
    .select(
      "id, company_id, project_id, complexity, spec, spec_retry_count, triage_notes, updated_at",
    )
    .eq("status", "developing")
    .lt("updated_at", staleCutoffIso);

  if (staleErr || !staleIdeas?.length) return;

  for (const idea of staleIdeas as DevelopingIdeaRow[]) {
    const sessionMap = new Map<string, ExpertSessionChainRow>();

    const { data: itemRows } = await supabase
      .from("expert_session_items")
      .select(
        "route, session:session_id!inner(id, status, created_at, batch_id, brief, expert_role:expert_role_id!inner(name))",
      )
      .eq("idea_id", idea.id);

    for (const row of itemRows ?? []) {
      const item = row as Record<string, unknown>;
      const sessionRaw = item.session as Record<string, unknown> | null;
      if (!sessionRaw) continue;
      const route = typeof item.route === "string" ? item.route : null;
      const parsed = parseSessionChainRow(sessionRaw, route);
      if (parsed && (parsed.roleName === "spec-writer" || parsed.roleName === "spec-reviewer" || parsed.roleName === "reviewer")) {
        sessionMap.set(parsed.id, parsed);
      }
    }

    const { data: hintedSessions } = await supabase
      .from("expert_sessions")
      .select("id, status, created_at, batch_id, brief, expert_role:expert_role_id!inner(name)")
      .eq("company_id", idea.company_id)
      .eq("headless", true)
      .ilike("brief", `%${idea.id}%`)
      .in("expert_role.name", ["spec-writer", "spec-reviewer", "reviewer"])
      .order("created_at", { ascending: false })
      .limit(10);

    for (const row of hintedSessions ?? []) {
      const parsed = parseSessionChainRow(row as Record<string, unknown>, null);
      if (parsed) {
        const existing = sessionMap.get(parsed.id);
        if (!existing) sessionMap.set(parsed.id, parsed);
      }
    }

    const ideaSessions = [...sessionMap.values()].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    const hintedLatest = ideaSessions[0];
    if (!hintedLatest?.batchId) {
      const reverted = await setDevelopingIdeaStatus(supabase, idea.id, "triaged");
      if (reverted) {
        console.log(
          `[orchestrator] stale-developing-recovery: reverted idea ${idea.id} developing → triaged (no spec-session chain found)`,
        );
      }
      continue;
    }

    const { data: batchRows } = await supabase
      .from("expert_sessions")
      .select("id, status, created_at, batch_id, brief, expert_role:expert_role_id!inner(name)")
      .eq("company_id", idea.company_id)
      .eq("batch_id", hintedLatest.batchId)
      .in("expert_role.name", ["spec-writer", "spec-reviewer", "reviewer"])
      .order("created_at", { ascending: false });

    const batchSessions = ((batchRows ?? []) as Record<string, unknown>[])
      .map((row: Record<string, unknown>) => {
        const existing = sessionMap.get((row as { id: string }).id);
        if (existing) return existing;
        return parseSessionChainRow(row as Record<string, unknown>, null);
      })
      .filter(
        (row: ExpertSessionChainRow | null): row is ExpertSessionChainRow =>
          row !== null,
      );

    if (batchSessions.length === 0) {
      const reverted = await setDevelopingIdeaStatus(supabase, idea.id, "triaged");
      if (reverted) {
        console.log(
          `[orchestrator] stale-developing-recovery: reverted idea ${idea.id} developing → triaged (orphaned batch ${hintedLatest.batchId})`,
        );
      }
      continue;
    }

    const latestSession = batchSessions[0];
    if (latestSession.status === "completed") {
      await continueAutoSpecChain(
        supabase,
        idea,
        latestSession,
        batchSessions.length,
      );
      continue;
    }

    const createdAtMs = new Date(latestSession.createdAt).getTime();
    if (
      latestSession.status === "requested" &&
      Number.isFinite(createdAtMs) &&
      createdAtMs < staleCutoffMs
    ) {
      const { data: cancelledRows, error: cancelErr } = await supabase
        .from("expert_sessions")
        .update({ status: "cancelled" })
        .eq("id", latestSession.id)
        .eq("status", "requested")
        .select("id");

      if (cancelErr || !cancelledRows?.length) {
        console.log(
          `[orchestrator] stale-developing-recovery: failed to cancel stuck requested session ${latestSession.id} for idea ${idea.id}: ${cancelErr?.message ?? "race/lost update"}`,
        );
        continue;
      }

      if (!idea.project_id || !latestSession.batchId || !latestSession.roleName) {
        console.log(
          `[orchestrator] stale-developing-recovery: cancelled session ${latestSession.id} for idea ${idea.id} but cannot re-dispatch (missing project_id, batch_id, or role)`,
        );
        continue;
      }

      const dispatched = await dispatchHeadlessExpert(
        idea.company_id,
        latestSession.roleName,
        latestSession.brief || defaultAutoSpecBrief(latestSession.roleName, idea.id),
        idea.project_id,
        latestSession.batchId,
      );

      if (dispatched) {
        console.log(
          `[orchestrator] stale-developing-recovery: cancelled stale requested session ${latestSession.id} and re-dispatched ${latestSession.roleName} for idea ${idea.id} (batch ${latestSession.batchId})`,
        );
      } else {
        console.log(
          `[orchestrator] stale-developing-recovery: cancelled stale requested session ${latestSession.id} but failed to re-dispatch ${latestSession.roleName} for idea ${idea.id}`,
        );
      }
    }
  }
}

async function autoTriageNewIdeas(supabase: SupabaseClient): Promise<void> {
  const { data: companies } = await supabase
    .from("companies")
    .select(
      "id, auto_triage, triage_batch_size, triage_max_concurrent, triage_delay_minutes",
    )
    .eq("auto_triage", true)
    .eq("status", "active");

  if (!companies?.length) return;

  for (const company of companies) {
    const companyId = company.id;
    const lastRun = autoTriageLastRun.get(companyId) ?? 0;
    if (Date.now() - lastRun < AUTO_TRIAGE_COOLDOWN_MS) continue;

    // Check active headless triage expert sessions (not all headless — only triage)
    const { count: activeSessions } = await supabase
      .from("expert_sessions")
      .select("id, expert_role:expert_role_id!inner(name)", {
        count: "exact",
        head: true,
      })
      .eq("company_id", companyId)
      .eq("headless", true)
      .in("status", ["requested", "running"])
      .eq("expert_role.name", "triage-analyst");

    const maxConcurrent = company.triage_max_concurrent ?? 3;
    const activeCount = activeSessions ?? 0;
    if (activeCount >= maxConcurrent) continue;

    // Only triage ideas older than the configured delay
    const delayMinutes = company.triage_delay_minutes ?? 5;
    const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000)
      .toISOString();
    const batchSize = company.triage_batch_size ?? 5;

    // Fetch enough ideas to fill available concurrent slots
    const slotsAvailable = maxConcurrent - activeCount;
    const maxIdeas = slotsAvailable * batchSize;

    const { data: newIdeas } = await supabase
      .from("ideas")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "new")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(maxIdeas);

    if (!newIdeas?.length) continue;

    // Resolve project for this company (same pattern as original autoTriageNewIdeas)
    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "active")
      .limit(1);

    const projectId = (projects as { id: string }[] | null)?.[0]?.id;
    if (!projectId) {
      console.log(
        `[orchestrator] auto-triage: no active project for company ${companyId}, skipping`,
      );
      continue;
    }

    // Partition into batches and dispatch up to slotsAvailable sessions
    const allIdeaIds = newIdeas.map((i: { id: string }) => i.id);
    const batches: string[][] = [];
    for (let i = 0; i < allIdeaIds.length; i += batchSize) {
      batches.push(allIdeaIds.slice(i, i + batchSize));
    }

    for (const ideaIds of batches) {
      const batchId = crypto.randomUUID();

      // Atomic claim: only mark ideas that are still 'new' (guards against concurrent orchestrator)
      const { data: claimed } = await supabase
        .from("ideas")
        .update({ status: "triaging" })
        .in("id", ideaIds)
        .eq("status", "new")
        .select("id");

      const claimedIds = (claimed as { id: string }[] | null)?.map((r) =>
        r.id
      ) ?? [];
      if (claimedIds.length === 0) continue;

      // Dispatch via headless expert session
      const response = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/start-expert-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${
              Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
            }`,
            "x-company-id": companyId,
          },
          body: JSON.stringify({
            role_name: "triage-analyst",
            brief: `Auto-triage batch. Triage these ideas: ${
              JSON.stringify(claimedIds)
            }`,
            machine_name: "auto",
            project_id: projectId,
            headless: true,
            batch_id: batchId,
          }),
        },
      );

      if (!response.ok) {
        console.error(
          `[orchestrator] auto-triage: failed to start headless session for company ${companyId}: ${response.status} ${response.statusText}`,
        );
        // Revert claimed ideas back to 'new' on failure
        await supabase
          .from("ideas")
          .update({ status: "new" })
          .in("id", claimedIds);
      } else {
        console.log(
          `[orchestrator] auto-triage: started headless triage session for ${claimedIds.length} ideas in company ${companyId}`,
        );
      }
    }

    autoTriageLastRun.set(companyId, Date.now());
  }
}

interface AutoEnrichCompanyRow {
  id: string;
  enrich_delay_minutes: number | null;
  enrich_max_concurrent: number | null;
}

interface AutoEnrichIdeaRow {
  id: string;
  title: string | null;
  description: string | null;
  project_id: string | null;
}

export async function autoEnrichIncompleteTriagedIdeas(
  supabase: SupabaseClient,
): Promise<void> {
  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, enrich_delay_minutes, enrich_max_concurrent")
    .eq("auto_triage", true)
    .eq("status", "active");

  if (companiesErr) {
    console.error(
      `[orchestrator] auto-enrich: failed to load companies: ${companiesErr.message}`,
    );
    return;
  }

  if (!companies?.length) return;

  for (const company of companies as AutoEnrichCompanyRow[]) {
    const companyId = company.id;
    const delayMinutes = company.enrich_delay_minutes ?? 10;
    const maxConcurrent = company.enrich_max_concurrent ?? 2;
    if (maxConcurrent <= 0) continue;

    const cutoff = new Date(Date.now() - delayMinutes * 60 * 1000).toISOString();
    const { data: candidates, error: candidatesErr } = await supabase
      .from("ideas")
      .select("id, title, description, project_id")
      .eq("company_id", companyId)
      .eq("status", "triaged")
      .lt("triaged_at", cutoff)
      .or("title.is.null,title.eq.,description.is.null,description.eq.")
      .order("triaged_at", { ascending: true })
      .limit(maxConcurrent);

    if (candidatesErr) {
      console.error(
        `[orchestrator] auto-enrich: failed to fetch triaged candidates for company ${companyId}: ${candidatesErr.message}`,
      );
      continue;
    }

    const ideas = (candidates as AutoEnrichIdeaRow[] | null) ?? [];
    if (ideas.length === 0) continue;

    let cachedProjectId: string | null = null;
    let projectLookupComplete = false;
    const resolveCompanyProjectId = async (): Promise<string | null> => {
      if (projectLookupComplete) return cachedProjectId;
      projectLookupComplete = true;

      const { data: projects, error: projectErr } = await supabase
        .from("projects")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "active")
        .limit(1);

      if (projectErr) {
        console.error(
          `[orchestrator] auto-enrich: failed to resolve active project for company ${companyId}: ${projectErr.message}`,
        );
        return null;
      }

      cachedProjectId = (projects as { id: string }[] | null)?.[0]?.id ?? null;
      if (!cachedProjectId) {
        console.log(
          `[orchestrator] auto-enrich: no active project for company ${companyId}, skipping`,
        );
      }
      return cachedProjectId;
    };

    let dispatched = 0;
    for (const idea of ideas) {
      if (dispatched >= maxConcurrent) break;

      const missing: string[] = [];
      if (!idea.title || idea.title.trim().length === 0) {
        missing.push("title");
      }
      if (!idea.description || idea.description.trim().length === 0) {
        missing.push("description");
      }
      if (missing.length === 0) continue;

      const { data: activeSessions, error: activeErr } = await supabase
        .from("expert_sessions")
        .select("id, expert_role:expert_role_id!inner(name)")
        .eq("company_id", companyId)
        .eq("headless", true)
        .in("status", ["requested", "running"])
        .eq("expert_role.name", "triage-analyst")
        .ilike("brief", `%${idea.id}%`)
        .limit(1);

      if (activeErr) {
        console.error(
          `[orchestrator] auto-enrich: failed to check active enrichment sessions for idea ${idea.id}: ${activeErr.message}`,
        );
        continue;
      }

      if ((activeSessions?.length ?? 0) > 0) continue;

      const projectId = idea.project_id ?? await resolveCompanyProjectId();
      if (!projectId) continue;

      console.log(`[orchestrator] Auto-enriching idea ${idea.id}`);
      const response = await fetch(
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/start-expert-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "x-company-id": companyId,
          },
          body: JSON.stringify({
            role_name: "triage-analyst",
            brief: JSON.stringify({
              idea_id: idea.id,
              action: "enrich",
              missing,
            }),
            machine_name: "auto",
            project_id: projectId,
            headless: true,
            auto_exit: true,
          }),
        },
      );

      if (!response.ok) {
        console.error(
          `[orchestrator] auto-enrich: failed to start headless session for idea ${idea.id} in company ${companyId}: ${response.status} ${response.statusText}`,
        );
        continue;
      }

      dispatched += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-spec: dispatch and continue spec-writer/spec-reviewer chains
// ---------------------------------------------------------------------------

const AUTO_SPEC_COOLDOWN_MS = 120000; // 2 min between claim passes per company
const AUTO_SPEC_MAX_ROUNDS = 5; // safety ceiling for writer/reviewer ping-pong
const autoSpecLastRun = new Map<string, number>();

interface AutoSpecIdeaRow {
  id: string;
  company_id: string;
  project_id: string | null;
  complexity: string | null;
  spec: string | null;
}

async function cancelRequestedSpecSession(
  supabase: SupabaseClient,
  sessionId: string | null,
  companyId: string,
  ideaId: string,
): Promise<void> {
  if (!sessionId) return;

  const { error } = await supabase
    .from("expert_sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId)
    .eq("status", "requested");

  if (error) {
    console.error(
      `[orchestrator] auto-spec: failed to cancel requested session ${sessionId} for idea ${ideaId} in company ${companyId}: ${error.message}`,
    );
  } else {
    console.warn(
      `[orchestrator] auto-spec: cancelled requested session ${sessionId} for idea ${ideaId} in company ${companyId} after dispatch failure`,
    );
  }
}

async function dispatchAutoSpecSession(
  supabase: SupabaseClient,
  params: {
    companyId: string;
    projectId: string;
    ideaId: string;
    batchId: string;
    roleName: "spec-writer" | "spec-reviewer";
  },
): Promise<boolean> {
  const { companyId, projectId, ideaId, batchId, roleName } = params;
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/start-expert-session`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "x-company-id": companyId,
      },
      body: JSON.stringify({
        role_name: roleName,
        brief: `Auto-spec ${roleName} pass. Process this idea: ${
          JSON.stringify([ideaId])
        }`,
        machine_name: "auto",
        project_id: projectId,
        headless: true,
        batch_id: batchId,
        idea_id: ideaId,
      }),
    },
  );

  let sessionId: string | null = null;
  let responseError: string | null = null;
  try {
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.session_id === "string") {
      sessionId = payload.session_id;
    }
    if (typeof payload.error === "string") {
      responseError = payload.error;
    }
  } catch {
    // ignore parse failures; status code is enough for fallback handling.
  }

  if (!response.ok) {
    console.error(
      `[orchestrator] auto-spec: failed to dispatch ${roleName} for idea ${ideaId} in company ${companyId}: ${response.status} ${response.statusText}${
        responseError ? ` — ${responseError}` : ""
      }`,
    );
    await cancelRequestedSpecSession(supabase, sessionId, companyId, ideaId);
    return false;
  }

  console.log(
    `[orchestrator] auto-spec: dispatched ${roleName} for idea ${ideaId} in company ${companyId} (batch ${batchId})`,
  );
  return true;
}

async function autoSpecTriagedIdeas(supabase: SupabaseClient): Promise<void> {
  const { data: companies, error: companiesErr } = await supabase
    .from("companies")
    .select("id, auto_spec, spec_max_concurrent")
    .eq("auto_spec", true)
    .eq("status", "active");

  if (companiesErr) {
    console.error(
      `[orchestrator] auto-spec: failed to load auto_spec companies: ${companiesErr.message}`,
    );
    return;
  }

  if (!companies?.length) return;

  for (
    const company of companies as {
      id: string;
      spec_max_concurrent: number | null;
    }[]
  ) {
    const companyId = company.id;
    const maxConcurrent = company.spec_max_concurrent ?? 2;

    const { count: activeSessions, error: activeErr } = await supabase
      .from("expert_sessions")
      .select("id, expert_role:expert_role_id!inner(name)", {
        count: "exact",
        head: true,
      })
      .eq("company_id", companyId)
      .in("status", ["requested", "running"])
      .in("expert_role.name", ["spec-writer", "spec-reviewer"]);

    if (activeErr) {
      console.error(
        `[orchestrator] auto-spec: failed to count active sessions for company ${companyId}: ${activeErr.message}`,
      );
      continue;
    }

    const activeCount = activeSessions ?? 0;
    const slotsAvailable = maxConcurrent - activeCount;
    const inCooldown = Date.now() - (autoSpecLastRun.get(companyId) ?? 0) <
      AUTO_SPEC_COOLDOWN_MS;

    if (slotsAvailable > 0 && !inCooldown) {
      const { data: triagedIdeas, error: triagedErr } = await supabase
        .from("ideas")
        .select("id, company_id, project_id, complexity")
        .eq("company_id", companyId)
        .eq("status", "triaged")
        .eq("triage_route", "develop")
        .not("project_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(slotsAvailable);

      if (triagedErr) {
        console.error(
          `[orchestrator] auto-spec: failed to fetch triaged ideas for company ${companyId}: ${triagedErr.message}`,
        );
      }

      const pendingIdeas = (triagedIdeas as AutoSpecIdeaRow[] | null) ?? [];
      if (pendingIdeas.length > 0) {
        const idsToClaim = pendingIdeas.map((idea) => idea.id);
        const { data: claimed, error: claimErr } = await supabase
          .from("ideas")
          .update({ status: "developing" })
          .in("id", idsToClaim)
          .eq("status", "triaged")
          .select("id, company_id, project_id, complexity, spec");

        if (claimErr) {
          console.error(
            `[orchestrator] auto-spec: failed to claim ideas for company ${companyId}: ${claimErr.message}`,
          );
        } else {
          const claimedIdeas = (claimed as AutoSpecIdeaRow[] | null) ?? [];
          if (claimedIdeas.length < idsToClaim.length) {
            console.warn(
              `[orchestrator] auto-spec: claimed ${claimedIdeas.length}/${idsToClaim.length} ideas for company ${companyId} due to concurrent claims`,
            );
          }

          for (const idea of claimedIdeas) {
            if (!idea.project_id) {
              console.warn(
                `[orchestrator] auto-spec: skipping claimed idea ${idea.id} in company ${companyId} due to missing project_id`,
              );
              continue;
            }

            const batchId = crypto.randomUUID();
            const ok = await dispatchAutoSpecSession(supabase, {
              companyId,
              projectId: idea.project_id,
              ideaId: idea.id,
              batchId,
              roleName: "spec-writer",
            });

            if (!ok) {
              const { error: revertErr } = await supabase
                .from("ideas")
                .update({ status: "triaged" })
                .eq("id", idea.id)
                .eq("status", "developing");

              if (revertErr) {
                console.error(
                  `[orchestrator] auto-spec: failed to revert idea ${idea.id} to triaged after dispatch failure: ${revertErr.message}`,
                );
              } else {
                console.warn(
                  `[orchestrator] auto-spec: reverted idea ${idea.id} to triaged after failed spec-writer dispatch`,
                );
              }
            }
          }
        }
      }

      autoSpecLastRun.set(companyId, Date.now());
    }

    const { data: developingIdeas, error: developingErr } = await supabase
      .from("ideas")
      .select("id, company_id, project_id, complexity, spec")
      .eq("company_id", companyId)
      .eq("status", "developing")
      .eq("triage_route", "develop")
      .not("project_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(100);

    if (developingErr) {
      console.error(
        `[orchestrator] auto-spec: failed to fetch developing ideas for company ${companyId}: ${developingErr.message}`,
      );
      continue;
    }

    for (const idea of (developingIdeas as AutoSpecIdeaRow[] | null) ?? []) {
      const { data: ideaItems, error: itemErr } = await supabase
        .from("expert_session_items")
        .select("session:session_id!inner(batch_id)")
        .eq("idea_id", idea.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (itemErr) {
        console.error(
          `[orchestrator] auto-spec: failed to inspect session items for idea ${idea.id}: ${itemErr.message}`,
        );
        continue;
      }

      const batchId = (ideaItems as {
        session: { batch_id: string | null } | null;
      }[] | null)?.find((item) => item.session?.batch_id)?.session?.batch_id;
      if (!batchId) continue;

      const { data: latestSession, error: latestErr } = await supabase
        .from("expert_sessions")
        .select("id, status, expert_role:expert_role_id!inner(name)")
        .eq("batch_id", batchId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestErr || !latestSession) {
        if (latestErr) {
          console.error(
            `[orchestrator] auto-spec: failed to inspect latest session for idea ${idea.id} (batch ${batchId}): ${latestErr.message}`,
          );
        }
        continue;
      }

      const latestStatus = (latestSession as { status: string }).status;
      if (latestStatus !== "completed") continue;

      const latestRole = (latestSession as {
        expert_role: { name: string } | null;
      }).expert_role?.name;
      const latestSessionId = (latestSession as { id: string }).id;
      if (latestRole !== "spec-writer" && latestRole !== "spec-reviewer") {
        continue;
      }

      const { count: roundCount, error: roundErr } = await supabase
        .from("expert_sessions")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId);

      if (roundErr) {
        console.error(
          `[orchestrator] auto-spec: failed to count rounds for idea ${idea.id} (batch ${batchId}): ${roundErr.message}`,
        );
        continue;
      }

      if ((roundCount ?? 0) >= AUTO_SPEC_MAX_ROUNDS) {
        const { error: workshopErr } = await supabase
          .from("ideas")
          .update({ status: "workshop" })
          .eq("id", idea.id)
          .eq("status", "developing");

        if (workshopErr) {
          console.error(
            `[orchestrator] auto-spec: failed to escalate idea ${idea.id} to workshop after ${AUTO_SPEC_MAX_ROUNDS} rounds: ${workshopErr.message}`,
          );
        } else {
          console.warn(
            `[orchestrator] auto-spec: escalated idea ${idea.id} to workshop after ${AUTO_SPEC_MAX_ROUNDS} rounds`,
          );
        }
        continue;
      }

      if (latestRole === "spec-writer") {
        if (idea.spec === null) {
          const { data: resetRows, error: resetErr } = await supabase
            .from("ideas")
            .update({ status: "triaged" })
            .eq("id", idea.id)
            .eq("status", "developing")
            .is("spec", null)
            .select("id");

          if (resetErr) {
            console.error(
              `[orchestrator] auto-spec: failed to reset idea ${idea.id} to triaged after completed spec-writer with null spec: ${resetErr.message}`,
            );
          } else if (resetRows && resetRows.length > 0) {
            console.log(
              `[orchestrator] auto-spec: reset idea ${idea.id} to triaged after completed spec-writer with null spec`,
            );
          }
          continue;
        }

        if (idea.complexity === "simple") {
          const { error: speccedErr } = await supabase
            .from("ideas")
            .update({ status: "specced" })
            .eq("id", idea.id)
            .eq("status", "developing");

          if (speccedErr) {
            console.error(
              `[orchestrator] auto-spec: failed to mark idea ${idea.id} as specced after spec-writer completion: ${speccedErr.message}`,
            );
          } else {
            console.log(
              `[orchestrator] auto-spec: marked idea ${idea.id} as specced (simple complexity)`,
            );
          }
          continue;
        }

        if (idea.complexity === "medium" || idea.complexity === "complex") {
          if (!idea.project_id) continue;
          await dispatchAutoSpecSession(supabase, {
            companyId,
            projectId: idea.project_id,
            ideaId: idea.id,
            batchId,
            roleName: "spec-reviewer",
          });
          continue;
        }

        console.warn(
          `[orchestrator] auto-spec: skipping reviewer dispatch for idea ${idea.id}; unexpected complexity="${idea.complexity}"`,
        );
        continue;
      }

      if (latestRole === "spec-reviewer") {
        const { data: routeRows, error: routeErr } = await supabase
          .from("expert_session_items")
          .select("route")
          .eq("session_id", latestSessionId)
          .eq("idea_id", idea.id)
          .order("created_at", { ascending: false })
          .limit(1);

        if (routeErr) {
          console.error(
            `[orchestrator] auto-spec: failed to read reviewer route for idea ${idea.id}: ${routeErr.message}`,
          );
          continue;
        }

        const route =
          (routeRows as { route: string | null }[] | null)?.[0]?.route ??
            null;
        if (route === "approve") {
          const { error: approveErr } = await supabase
            .from("ideas")
            .update({ status: "specced" })
            .eq("id", idea.id)
            .eq("status", "developing");
          if (approveErr) {
            console.error(
              `[orchestrator] auto-spec: failed to mark idea ${idea.id} as specced on approve route: ${approveErr.message}`,
            );
          } else {
            console.log(
              `[orchestrator] auto-spec: marked idea ${idea.id} as specced on approve route`,
            );
          }
        } else if (route === "revise") {
          if (!idea.project_id) continue;
          await dispatchAutoSpecSession(supabase, {
            companyId,
            projectId: idea.project_id,
            ideaId: idea.id,
            batchId,
            roleName: "spec-writer",
          });
        } else if (route === "workshop") {
          const { error: workshopErr } = await supabase
            .from("ideas")
            .update({ status: "workshop" })
            .eq("id", idea.id)
            .eq("status", "developing");
          if (workshopErr) {
            console.error(
              `[orchestrator] auto-spec: failed to route idea ${idea.id} to workshop: ${workshopErr.message}`,
            );
          } else {
            console.log(
              `[orchestrator] auto-spec: routed idea ${idea.id} to workshop`,
            );
          }
        } else if (route === "hardening") {
          const { error: hardeningErr } = await supabase
            .from("ideas")
            .update({ status: "hardening" })
            .eq("id", idea.id)
            .eq("status", "developing");
          if (hardeningErr) {
            console.error(
              `[orchestrator] auto-spec: failed to route idea ${idea.id} to hardening: ${hardeningErr.message}`,
            );
          } else {
            console.log(
              `[orchestrator] auto-spec: routed idea ${idea.id} to hardening`,
            );
          }
        } else {
          console.warn(
            `[orchestrator] auto-spec: reviewer for idea ${idea.id} completed without actionable route (route=${
              route ?? "null"
            })`,
          );
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (_req: Request): Promise<Response> => {
  console.log("[orchestrator] Invoked at", new Date().toISOString());

  const supabase = makeAdminClient();

  try {
    // 1a. Mark dead machines offline (prevents dispatch to them).
    await reapDeadMachines(supabase);

    // 1b. Re-queue jobs stuck in executing with stale updated_at.
    await reapStaleJobs(supabase);

    // 2. Process breaking_down features → create breakdown jobs.
    await processReadyForBreakdown(supabase);

    // 3. Advance dependency-blocked features when their dependencies are done.
    await processWaitingOnDeps(supabase);

    // 4. Catch missed feature lifecycle transitions
    //    (breakdown→writing_tests→building, building→combining).
    //    The executor writes job status directly to DB — if the Realtime broadcast was
    //    missed during the 4s listen window, these transitions would never fire.
    await processFeatureLifecycle(supabase);

    // 4b. Analyze newly completed/failed jobs and persist log-derived error analysis.
    await analyzeRecentlyCompletedJobs(supabase);

    // 5. Dispatch queued jobs to available machines.
    await dispatchQueuedJobs(supabase);

    // 5b. Recover ideas stuck at 'triaging' with no active triage job (orphan protection).
    await recoverStaleTriagingIdeas(supabase);

    // 5c. Recover ideas stuck at 'developing' in broken spec/review chains.
    await recoverStaleDevelopingIdeas(supabase);

    // 5d. Auto-triage: dispatch triage jobs for new ideas in companies with auto_triage enabled.
    await autoTriageNewIdeas(supabase);

    // 5e. Auto-enrich: dispatch enrichment jobs for incomplete triaged ideas.
    await autoEnrichIncompleteTriagedIdeas(supabase);

    // 5f. Auto-spec: dispatch/continue spec session chains for develop-routed ideas.
    await autoSpecTriagedIdeas(supabase);

    // 6. Refresh pipeline snapshot cache after all state mutations.
    await refreshPipelineSnapshotCache(supabase);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[orchestrator] Unhandled error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
