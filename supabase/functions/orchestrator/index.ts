/**
 * zazigv2 — Orchestrator Edge Function
 *
 * Runs on a schedule (every 10 s via Supabase Cron) or via HTTP trigger.
 *
 * Responsibilities:
 *   1. Poll `jobs` for queued work and dispatch to machines with capacity.
 *   2. Detect dead machines (no heartbeat for 2 min) and re-queue their jobs.
 *
 * Runtime: Deno / Supabase Edge Functions
 * Auth: service_role key — never exposed to the client.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  MACHINE_DEAD_THRESHOLD_MS,
  PROTOCOL_VERSION,
  RECOVERY_COOLDOWN_MS,
} from "@zazigv2/shared";
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
  StartJob,
  TeardownTest,
  VerifyJob,
  VerifyResult,
} from "@zazigv2/shared";

import {
  agentChannelName,
  generateTitle,
  notifyCPO,
  TERMINAL_FEATURE_STATUSES_FOR_DEPLOY,
  triggerCombining,
  triggerFeatureVerification,
  triggerMerging,
} from "../_shared/pipeline-utils.ts";

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

function completionInstructions(role?: string): string {
  const reportFile = role ? `${role}-report.md` : "cpo-report.md";
  return `## On Completion

Commit all work to the current branch. Do NOT commit .mcp.json, .claude/, or CLAUDE.md.
Write your results to .claude/${reportFile} including what was done and any issues.
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

interface MachineRow {
  id: string;
  company_id: string;
  name: string;
  slots_claude_code: number;
  slots_codex: number;
  last_heartbeat: string | null;
  status: string;
  agent_version: string | null;
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

/**
 * Selects available_slots for the requested slot_type from a machine row.
 */
function availableSlots(machine: MachineRow, slotType: SlotType): number {
  return slotType === "claude_code"
    ? machine.slots_claude_code
    : machine.slots_codex;
}

/**
 * Decrements the appropriate slot column by 1.
 * Returns the update payload object suitable for supabase .update().
 */
function decrementSlotPayload(
  machine: MachineRow,
  slotType: SlotType,
): Record<string, number> {
  if (slotType === "claude_code") {
    return { slots_claude_code: Math.max(0, machine.slots_claude_code - 1) };
  }
  return { slots_codex: Math.max(0, machine.slots_codex - 1) };
}

/**
 * Increments the appropriate slot column by 1.
 */
function incrementSlotPayload(
  machine: MachineRow,
  slotType: SlotType,
): Record<string, number> {
  if (slotType === "claude_code") {
    return { slots_claude_code: machine.slots_claude_code + 1 };
  }
  return { slots_codex: machine.slots_codex + 1 };
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

const RETRY_ESCALATION_ROUTE: Omit<RoutingEntry, "complexity"> = {
  role: "junior-engineer-cc",
  model: "claude-sonnet-4-6",
  slotType: "claude_code",
};

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
  retryCount = 0,
  jobId?: string,
): { role: string; model: string; slotType: SlotType } {
  const maybeEscalateRetry = (
    resolved: { role: string; model: string; slotType: SlotType },
  ) => {
    if (retryCount > 0 && resolved.role === "junior-engineer") {
      console.log(
        `[orchestrator] Retry escalation: routing job to junior-engineer-cc (feature retry_count=${retryCount}, was junior-engineer/codex)`,
      );
      return { ...RETRY_ESCALATION_ROUTE };
    }
    return resolved;
  };

  // Explicit model override on the job takes precedence.
  if (existingModel) {
    const entry = routing.get(complexity ?? "medium");
    const slotType = entry?.slotType ?? "claude_code";
    const role = entry?.role ?? "senior-engineer";
    return maybeEscalateRetry({ role, model: existingModel, slotType });
  }

  const entry = routing.get(complexity ?? "medium");
  if (entry) {
    return maybeEscalateRetry({
      role: entry.role,
      model: entry.model,
      slotType: entry.slotType,
    });
  }

  // Fallback if complexity not in routing table
  console.warn(
    `[orchestrator] No routing entry for complexity=${complexity} on job ${
      jobId ?? "?"
    }, defaulting to sonnet`,
  );
  return maybeEscalateRetry({
    role: "senior-engineer",
    model: "claude-sonnet-4-6",
    slotType: "claude_code",
  });
}

// ---------------------------------------------------------------------------
// Machine recovery cooldown tracking (in-memory)
// ---------------------------------------------------------------------------

/**
 * Tracks when machines transitioned from offline → online (epoch ms).
 * Used to enforce RECOVERY_COOLDOWN_MS before dispatching new jobs to a
 * machine that just recovered, preventing flapping machines from grabbing
 * work they'll immediately drop again.
 *
 * LIMITATION: This Map lives in process memory and is lost on Edge Function
 * cold starts. A fresh instance will have an empty map and may dispatch jobs
 * to machines still within their cooldown window. Worst case: a flapping
 * machine receives one extra job before being reaped again on the next cycle.
 *
 * TODO: For durable anti-flap, persist recovery_started_at in the machines
 * table and check it in dispatchQueuedJobs instead of this Map.
 */
const recoveryTimestamps = new Map<string, number>();

const NO_CODE_CONTEXT_ROLES = new Set([
  "pipeline-technician",
  "monitoring-agent",
  "project-architect",
  "triage-analyst",
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

console.log(
  "[orchestrator] Cold start — in-memory recoveryTimestamps reset (anti-flap cooldown not durable across restarts)",
);

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
 * Step 1b: Re-queue jobs stuck in dispatched/executing whose updated_at is stale.
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
    .in("status", ["dispatched", "executing"])
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
 * Step 2: Poll queued jobs and dispatch each one to an available machine.
 */
async function dispatchQueuedJobs(supabase: SupabaseClient): Promise<void> {
  // Fetch queued jobs oldest-first.
  const { data: queuedJobs, error: jobsErr } = await supabase
    .from("jobs")
    .select(
      "id, company_id, project_id, feature_id, role, job_type, complexity, slot_type, model, machine_id, status, context, acceptance_tests, verify_context, branch, result, created_at, depends_on, source",
    )
    .in("status", ["queued", "verify_failed"])
    .order("created_at", { ascending: true });

  if (jobsErr) {
    console.error(
      "[orchestrator] Error fetching queued jobs:",
      jobsErr.message,
    );
    return;
  }

  if (!queuedJobs || queuedJobs.length === 0) {
    console.log("[orchestrator] No queued jobs.");
    return;
  }

  console.log(`[orchestrator] ${queuedJobs.length} queued job(s) to process.`);

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
      console.error("[orchestrator] Failed to preload feature statuses for code-job gate:", featureRowsErr.message);
      return;
    }
    for (const row of featureRows ?? []) {
      const featureRow = row as { id: string; status: string };
      featureStatusById.set(featureRow.id, featureRow.status);
    }
  }

  // Cache machines fetched in this pass (keyed by company_id) to avoid redundant queries.
  const machineCache = new Map<string, MachineRow[]>();

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
          .in("status", ["queued", "verify_failed", "dispatched", "executing"])
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

    // Do not dispatch code jobs while the parent feature is still breaking_down.
    if (job.job_type === "code" && job.feature_id) {
      const featureStatus = featureStatusById.get(job.feature_id);
      if (featureStatus === "breaking_down") {
        console.log(
          `[orchestrator] Skipping job ${job.id} — feature ${job.feature_id} still breaking_down`,
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
    let featureRetryCount = 0;

    if (job.feature_id) {
      const { data: featureRoutingRow, error: featureRoutingErr } =
        await supabase
          .from("features")
          .select("retry_count")
          .eq("id", job.feature_id)
          .single();

      if (featureRoutingErr) {
        console.warn(
          `[orchestrator] Failed to fetch retry_count for feature ${job.feature_id} while routing job ${job.id}: ${featureRoutingErr.message}`,
        );
      } else {
        featureRetryCount =
          (featureRoutingRow as { retry_count?: number | null } | null)
            ?.retry_count ?? 0;
      }
    }

    if (job.role && !ENGINEER_ROLES.has(job.role)) {
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
          featureRetryCount,
          job.id,
        ));
      }
    } else {
      // Engineer roles or no role: use complexity routing.
      ({ role: resolvedRole, model, slotType } = resolveModelAndSlot(
        routing,
        job.complexity,
        job.model,
        featureRetryCount,
        job.id,
      ));
    }

    // Fetch available machines for this company (with capacity for the slot type).
    let machines = machineCache.get(job.company_id);
    if (!machines) {
      const { data: m, error: mErr } = await supabase
        .from("machines")
        .select(
          "id, company_id, name, slots_claude_code, slots_codex, last_heartbeat, status, enabled, agent_version",
        )
        .eq("company_id", job.company_id)
        .eq("status", "online")
        .neq("enabled", false);

      if (mErr) {
        console.error("[orchestrator] Error fetching machines:", mErr.message);
        continue;
      }
      // Exclude machines still within recovery cooldown after coming back online.
      const now = Date.now();
      machines = ((m ?? []) as MachineRow[]).filter((machine) => {
        const recoveredAt = recoveryTimestamps.get(machine.id);
        if (recoveredAt && now - recoveredAt < RECOVERY_COOLDOWN_MS) {
          console.log(
            `[orchestrator] Machine ${machine.name} in recovery cooldown — skipping for dispatch`,
          );
          return false;
        }
        // Clear expired cooldown entries.
        if (recoveredAt) recoveryTimestamps.delete(machine.id);
        return true;
      });
      machineCache.set(job.company_id, machines);
    }

    const env = Deno.env.get("ZAZIG_ENV") ?? "production";
    const { data: latestVersion } = await supabase
      .from("agent_versions")
      .select("version")
      .eq("env", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const eligibleMachines = machines.filter(
      (m) => !latestVersion || m.agent_version === latestVersion.version,
    );

    // Find a machine with an available slot of the required type.
    let candidate = eligibleMachines.find((m) =>
      availableSlots(m, slotType) > 0
    );

    // For jobs preferring codex, fall back to claude_code if no codex slots available.
    if (!candidate && slotType === "codex") {
      slotType = "claude_code";
      // Only change model if it was complexity-derived (not an explicit override).
      if (!job.model) {
        const mediumEntry = routing.get("medium");
        model = mediumEntry?.model ?? "claude-sonnet-4-6";
      }
      candidate = eligibleMachines.find((m) => availableSlots(m, slotType) > 0);
    }

    if (!candidate) {
      console.log(
        `[orchestrator] No machine with available ${slotType} slot for job ${job.id} — skipping.`,
      );
      continue;
    }

    // Look up git context (repo_url from projects, branch from features) for code-context roles.
    // Must be resolved before slot decrement so we can skip without side effects.
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
        `[orchestrator] Job ${job.id} missing dispatch context (projectId=${job.project_id}, repoUrl=${repoUrl}, featureBranch=${featureBranch}, requiresCodeContext=${requiresCodeContext}) — skipping dispatch`,
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

    // Validate context — the local agent's isStartJob validator requires either
    // context (inline string) or contextRef. Jobs with null/empty context will be
    // silently rejected by the agent, creating a zombie that consumes a slot forever.
    // Fail these jobs immediately with a clear error instead of dispatching.
    if (!dispatchContext || dispatchContext.trim().length === 0) {
      console.error(
        `[orchestrator] Job ${job.id} has null/empty context — failing instead of dispatching (would be rejected by agent validator)`,
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

    // Atomically decrement the slot BEFORE marking the job dispatched.
    // Using .gt(slotColumn, 0) as a CAS guard: if two concurrent invocations both
    // see slots=2, only one will win the conditional UPDATE and get a rowCount > 0.
    // The loser gets an empty result set and skips dispatch, preventing double-booking.
    const slotColumn = slotType === "claude_code"
      ? "slots_claude_code"
      : "slots_codex";
    const currentSlots = slotType === "claude_code"
      ? candidate.slots_claude_code
      : candidate.slots_codex;
    const { data: decrementResult, error: decrementErr } = await supabase
      .from("machines")
      .update({ [slotColumn]: currentSlots - 1 })
      .eq("id", candidate.id)
      .gt(slotColumn, 0) // CAS guard — only update if slot is still > 0
      .select("id");

    if (decrementErr || !decrementResult?.length) {
      // Another concurrent invocation already claimed this slot — skip.
      console.warn(
        `[orchestrator] Slot contention on machine ${candidate.id} for job ${job.id} — skipping (no rows updated).`,
      );
      continue;
    }

    // Fetch role prompt + skills for non-codex jobs that have a named role.
    // These populate the 4-layer context stack: personality → role → skills → task.
    // Fetched BEFORE dispatch so we can assemble the full prompt_stack for observability.
    let rolePrompt: string | undefined;
    let roleSkills: string[] | undefined;
    let roleMcpTools: string[] | undefined;
    let isInteractive = false;
    let personalityPrompt: string | undefined;
    let subAgentPrompt: string | undefined;
    if (resolvedRole) {
      const { data: roleRow } = await supabase
        .from("roles")
        .select("id, prompt, skills, mcp_tools, interactive")
        .eq("name", resolvedRole)
        .single();
      if (roleRow) {
        const typed = roleRow as {
          id: string;
          prompt: string | null;
          skills: string[] | null;
          mcp_tools: string[] | null;
          interactive: boolean | null;
        };
        rolePrompt = typed.prompt ?? undefined;
        roleSkills = typed.skills ?? undefined;
        roleMcpTools = typed.mcp_tools ?? undefined;
        isInteractive = typed.interactive ?? false;

        // Fetch compiled personality prompt + sub-agent prompt for this company + role
        const { data: personality } = await supabase
          .from("exec_personalities")
          .select("compiled_prompt, compiled_sub_agent_prompt")
          .eq("company_id", job.company_id)
          .eq("role_id", typed.id)
          .single();
        if (personality?.compiled_prompt) {
          personalityPrompt = personality.compiled_prompt as string;
        }
        if (
          (personality as Record<string, unknown>)?.compiled_sub_agent_prompt
        ) {
          subAgentPrompt = (personality as Record<string, unknown>)
            .compiled_sub_agent_prompt as string;
        }
      }
    }

    // Assemble the full prompt stack minus skills for observability and dispatch.
    // Order: personality → role → SKILLS_MARKER → task context → completion.
    // The local agent inserts skill file content at the SKILLS_MARKER position.
    const promptParts: string[] = [];
    if (personalityPrompt) promptParts.push(personalityPrompt);
    if (rolePrompt) promptParts.push(rolePrompt);
    promptParts.push(SKILLS_MARKER);
    if (dispatchContext) promptParts.push(dispatchContext);
    promptParts.push(completionInstructions(resolvedRole));
    const promptStackMinusSkills = promptParts.join("\n\n---\n\n");

    // Dispatch: update job status → dispatched, assign machine_id.
    // Record the resolved model and slot_type on the job for observability.
    const { data: claimedJobRows, error: updateJobErr } = await supabase
      .from("jobs")
      .update({
        status: "dispatched",
        machine_id: candidate.id,
        role: resolvedRole,
        model,
        slot_type: slotType,
        started_at: new Date().toISOString(),
        prompt_stack: promptStackMinusSkills || null,
      })
      .eq("id", job.id)
      .in("status", ["queued", "verify_failed"]) // optimistic lock
      .select("id");

    if (updateJobErr) {
      console.error(
        `[orchestrator] Failed to dispatch job ${job.id}:`,
        updateJobErr.message,
      );
      // The slot was already decremented above; it will self-correct on next heartbeat.
      continue;
    }
    if (!claimedJobRows || claimedJobRows.length === 0) {
      console.warn(
        `[orchestrator] Duplicate dispatch claim ignored for job ${job.id} on machine ${candidate.id} (CAS matched zero rows)`,
      );
      const { error: releaseErr } = await supabase.rpc("release_machine_slot", {
        p_machine_id: candidate.id,
        p_slot_type: slotType,
      });
      if (releaseErr) {
        console.error(
          `[orchestrator] Failed to roll back slot claim on machine ${candidate.id} after duplicate dispatch for job ${job.id}:`,
          releaseErr.message,
        );
      }
      continue;
    }

    // Update in-memory cache so subsequent jobs in this pass see the reduced capacity.
    const slotUpdate = { [slotColumn]: currentSlots - 1 };
    Object.assign(candidate, slotUpdate);

    // Build the StartJob message.
    // project_id is always required; git fields are only required for code-context roles.
    const startJobMsg: StartJob = {
      type: "start_job",
      protocolVersion: PROTOCOL_VERSION,
      jobId: job.id,
      cardId: job.id,
      cardType: (job.job_type as StartJob["cardType"]) ?? "code",
      complexity: (job.complexity as StartJob["complexity"]) ?? "medium",
      slotType,
      model,
      projectId: job.project_id!,
      ...(repoUrl ? { repoUrl } : {}),
      ...(featureBranch ? { featureBranch } : {}),
      promptStackMinusSkills,
      // Include role for role-based jobs (specialized reviewers, etc.)
      ...(resolvedRole ? { role: resolvedRole } : {}),
      ...(subAgentPrompt ? { subAgentPrompt } : {}),
      ...(roleSkills && roleSkills.length > 0 ? { roleSkills } : {}),
      ...(roleMcpTools !== undefined ? { roleMcpTools } : {}),
      ...(depBranches.length > 0 ? { dependencyBranches: depBranches } : {}),
      ...(isInteractive ? { interactive: true } : {}),
    };

    // Broadcast StartJob via Supabase Realtime on the machine's command channel.
    // Channel naming convention: `agent:{machine.name}:{company_id}`
    const channel = supabase.channel(
      agentChannelName(candidate.name, job.company_id),
    );

    // Supabase Realtime broadcast is fire-and-forget; errors are surfaced via the
    // subscribe callback but not awaited in polling loops (the agent will re-ack or fail).
    await new Promise<void>((resolve) => {
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const result = await channel.send({
            type: "broadcast",
            event: "start_job",
            payload: startJobMsg,
          });
          if (result !== "ok") {
            console.error(
              `[orchestrator] Realtime broadcast failed for job ${job.id} on channel agent:${candidate.name}: ${result}`,
            );
          } else {
            console.log(
              `[orchestrator] Dispatched job ${job.id} → machine ${candidate.name} (${slotType}, model: ${model})`,
            );
          }
          // Allow time for the message to be delivered before tearing down the channel.
          // Without this delay, unsubscribe() can race with message delivery.
          await new Promise((r) => setTimeout(r, 500));
          await channel.unsubscribe();
          resolve();
        }
      });
    });
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

  // Parse owner/repo from the repo URL.
  // Handles: https://github.com/owner/repo, https://github.com/owner/repo.git, git@github.com:owner/repo.git
  const match = repoUrl.match(
    /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
  );
  if (!match) {
    console.warn(
      `[orchestrator] Cannot parse GitHub owner/repo from URL "${repoUrl}" — skipping PR creation for feature ${featureId}`,
    );
    return null;
  }
  const [, owner, repo] = match;

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
    .select("company_id, project_id, branch, spec")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(
      `[orchestrator] Failed to fetch feature ${featureId}:`,
      fetchErr?.message,
    );
    return;
  }

  // 2. Reset feature to building (CAS: only if currently in verifying, merging, or complete)
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "building" })
    .eq("id", featureId)
    .in("status", ["verifying", "merging", "complete"])
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
      `[orchestrator] Feature ${featureId} not in verifying/merging/complete — skipping rejection`,
    );
    return;
  }

  // 3. Log rejection event
  await supabase.from("events").insert({
    company_id: feature.company_id,
    event_type: "feature_status_changed",
    detail: {
      featureId,
      from: "verifying",
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
      status: "queued",
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

/**
 * Handles a verification failure by delegating to the request-feature-fix
 * edge function (single source of truth for cancel → reset → re-queue logic).
 */
async function handleVerificationFailed(
  supabase: SupabaseClient,
  featureId: string,
  companyId: string,
  failureResult: string,
): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${url}/functions/v1/request-feature-fix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      company_id: companyId,
      feature_id: featureId,
      reason: failureResult,
    }),
  });
  if (!res.ok) {
    console.error(
      `[orchestrator] handleVerificationFailed: edge function returned ${res.status}: ${await res
        .text()}`,
    );
  }
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
    .in("status", ["queued", "dispatched", "executing", "blocked", "complete"])
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
    .in("status", ["failed", "cancelled"]);

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
        status: "queued",
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
        .eq("status", "queued");
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
      status: "queued",
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
    .select("id")
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

  for (const feature of features as { id: string }[]) {
    await triggerBreakdown(supabase, feature.id);
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
 *   1. Failed job catch-up: logs features with failed jobs for attention
 *   1b. deploy_to_test guard: fails queued/dispatched/executing deploy jobs for terminal features
 *   2. breaking_down → building: all breakdown jobs for the feature are complete
 *   3. building → combining_and_pr: all implementation jobs are complete
 *   4. combining_and_pr → verifying: the latest combine job is complete
 *   5. verifying → merging: the latest verify job is complete and passed
 *   6. merging → complete: the latest merge job is complete and passed
 */
async function processFeatureLifecycle(
  supabase: SupabaseClient,
): Promise<void> {
  // --- 0. Long-running executing jobs heartbeat timeout check ---
  await checkExecutingJobsForHeartbeatTimeout(supabase);

  // --- 1. Failed job catch-up (all stages) ---
  // If a failed-job event was missed, surface it here for manual attention.
  const { data: activeFeatures, error: activeErr } = await supabase
    .from("features")
    .select("id")
    .not("status", "in", '("complete","failed","cancelled")')
    .limit(100);

  if (activeErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying active features for failed catch-up:",
      activeErr.message,
    );
  }

  for (const feature of (activeFeatures ?? []) as { id: string }[]) {
    const { data: failedJob } = await supabase
      .from("jobs")
      .select("id")
      .eq("feature_id", feature.id)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (failedJob && failedJob.length > 0) {
      const job = failedJob[0] as {
        id: string;
      };
      console.warn(
        `[orchestrator] Feature ${feature.id} has failed job ${job.id} — needs attention (not changing feature status)`,
      );
    }
  }

  // --- 1b. deploy_to_test cleanup for terminal features ---
  // If a feature is terminal, deploy_to_test must never be queued/dispatched/executing.
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
      .in("status", ["queued", "dispatched", "executing"])
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
        .in("status", ["queued", "dispatched", "executing"])
        .select("id");

      if (updated && updated.length > 0) {
        console.warn(
          `[orchestrator] processFeatureLifecycle: auto-failed deploy_to_test job ${job.id} for terminal feature ${job.feature_id} (${terminalStatus})`,
        );
      }
    }
  }

  // --- 2. breaking_down → building ---
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
      .not("status", "in", '("complete","failed","cancelled")')
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
      // All breakdown jobs done — transition to building
      const { data: updated } = await supabase
        .from("features")
        .update({ status: "building" })
        .eq("id", feature.id)
        .eq("status", "breaking_down")
        .select("id");

      if (updated && updated.length > 0) {
        console.log(
          `[orchestrator] processFeatureLifecycle: feature ${feature.id} breaking_down → building`,
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
          .eq("status", "queued")
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

  // --- 4. combining_and_pr → verifying ---
  // Features stuck in 'combining_and_pr' where the latest combine job is already complete.
  // Uses latest job by created_at to avoid advancing on stale jobs from prior rejection cycles.
  const { data: combiningFeatures, error: combineErr } = await supabase
    .from("features")
    .select("id")
    .eq("status", "combining_and_pr")
    .limit(50);

  if (combineErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying combining features:",
      combineErr.message,
    );
  }

  for (const feature of (combiningFeatures ?? []) as { id: string }[]) {
    const { data: latestCombine } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("feature_id", feature.id)
      .eq("job_type", "combine")
      .order("created_at", { ascending: false })
      .limit(1);

    if (
      latestCombine && latestCombine.length > 0 &&
      latestCombine[0].status === "complete"
    ) {
      console.log(
        `[orchestrator] processFeatureLifecycle: combine done for feature ${feature.id} — triggering verification`,
      );
      await triggerFeatureVerification(supabase, feature.id);
    }
    // Failed combine jobs are handled by Task 0's central catch-up — no action needed here.
  }

  // --- 5. verifying → merging (catch-up) ---
  // Features stuck in 'verifying' where the latest verify job is already complete and passed.
  // The live path (handleJobComplete) triggers merging on receipt of the job_complete message.
  // This catch-up handles cases where that message was missed.
  const { data: verifyingFeatures, error: verifyErr } = await supabase
    .from("features")
    .select("id")
    .eq("status", "verifying")
    .limit(50);

  if (verifyErr) {
    console.error(
      "[orchestrator] processFeatureLifecycle: error querying verifying features:",
      verifyErr.message,
    );
  }

  for (
    const feature of (verifyingFeatures ?? []) as {
      id: string;
    }[]
  ) {
    const { data: latestVerify } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("feature_id", feature.id)
      .eq("job_type", "verify")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!latestVerify || latestVerify.length === 0) continue;
    const job = latestVerify[0] as {
      id: string;
      status: string;
    };

    if (job.status === "complete") {
      console.log(
        `[orchestrator] processFeatureLifecycle: verify PASSED for feature ${feature.id} — triggering merge (catch-up)`,
      );
      await triggerMerging(supabase, feature.id);
    } else if (job.status === "failed") {
      console.warn(
        `[orchestrator] processFeatureLifecycle: verify FAILED for feature ${feature.id} — staying at verifying, needs attention`,
      );
    }
    // if still 'executing', 'queued', or 'dispatched', do nothing — let it run
  }

  // --- 6. merging → complete (catch-up) ---
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
    // if still 'executing', 'queued', or 'dispatched', do nothing — let it run
  }

  // Feature pipeline ends at 'complete'.
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
async function recoverStaleTriagingIdeas(supabase: SupabaseClient): Promise<void> {
  const staleCutoff = new Date(Date.now() - AUTO_TRIAGE_STALE_THRESHOLD_MS).toISOString();

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
      .in("status", ["queued", "dispatched", "executing"])
      .limit(1);

    if (activeJobs && activeJobs.length > 0) continue;

    // No active job — revert to 'new' so it can be re-triaged.
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
        `[orchestrator] stale-triage-recovery: reverted idea ${idea.id} from triaging → new (no active triage job after ${AUTO_TRIAGE_STALE_THRESHOLD_MS / 60000} min)`,
      );
    }
  }
}

async function autoTriageNewIdeas(supabase: SupabaseClient): Promise<void> {
  const { data: companies } = await supabase
    .from("companies")
    .select("id")
    .eq("auto_triage", true)
    .eq("status", "active");

  if (!companies?.length) return;

  for (const company of companies as { id: string }[]) {
    const lastRun = autoTriageLastRun.get(company.id) ?? 0;
    if (Date.now() - lastRun < AUTO_TRIAGE_COOLDOWN_MS) continue;

    // Check if there's already an active triage-analyst job for this company.
    // The RPC enforces idempotency (one active triage-analyst per company/project),
    // so we skip dispatch entirely if one is already running.
    const { data: activeTriageJobs } = await supabase
      .from("jobs")
      .select("id")
      .eq("company_id", company.id)
      .eq("role", "triage-analyst")
      .in("status", ["queued", "dispatched", "executing"])
      .limit(1);

    if (activeTriageJobs && activeTriageJobs.length > 0) continue;

    // Pick the oldest new idea (one at a time — next tick picks the next one).
    const { data: newIdeas } = await supabase
      .from("ideas")
      .select("id")
      .eq("company_id", company.id)
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(1);

    if (!newIdeas?.length) continue;

    const { data: projects } = await supabase
      .from("projects")
      .select("id")
      .eq("company_id", company.id)
      .eq("status", "active")
      .limit(1);

    const projectId = (projects as { id: string }[] | null)?.[0]?.id;
    if (!projectId) {
      console.log(
        `[orchestrator] auto-triage: no active project for company ${company.id}, skipping`,
      );
      continue;
    }

    const idea = (newIdeas as { id: string }[])[0];

    await supabase
      .from("ideas")
      .update({ status: "triaging" })
      .eq("id", idea.id);

    const { data: rpcResult, error } = await supabase.rpc("request_standalone_work", {
      p_company_id: company.id,
      p_project_id: projectId,
      p_feature_id: null,
      p_role: "triage-analyst",
      p_context: idea.id,
    });

    const rejected = rpcResult && typeof rpcResult === "object" &&
      (rpcResult as Record<string, unknown>).rejected === true;

    if (error || rejected) {
      const reason = error?.message ??
        (rpcResult as Record<string, unknown>)?.reason ?? "unknown";
      console.error(
        `[orchestrator] auto-triage: failed to queue triage for idea ${idea.id}: ${reason}`,
      );
      await supabase
        .from("ideas")
        .update({ status: "new" })
        .eq("id", idea.id);
    } else {
      console.log(
        `[orchestrator] auto-triage: queued triage for idea ${idea.id}`,
      );
    }

    autoTriageLastRun.set(company.id, Date.now());
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

    // 1b. Re-queue jobs stuck in dispatched/executing with stale updated_at.
    await reapStaleJobs(supabase);

    // 2. Process breaking_down features → create breakdown jobs.
    await processReadyForBreakdown(supabase);

    // 3. Catch missed feature lifecycle transitions (breakdown→building, building→combining).
    //    The executor writes job status directly to DB — if the Realtime broadcast was
    //    missed during the 4s listen window, these transitions would never fire.
    await processFeatureLifecycle(supabase);

    // 4. Dispatch queued jobs to available machines.
    await dispatchQueuedJobs(supabase);

    // 4b. Recover ideas stuck at 'triaging' with no active triage job (orphan protection).
    await recoverStaleTriagingIdeas(supabase);

    // 4c. Auto-triage: dispatch triage jobs for new ideas in companies with auto_triage enabled.
    await autoTriageNewIdeas(supabase);

    // 5. Refresh pipeline snapshot cache after all state mutations.
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
