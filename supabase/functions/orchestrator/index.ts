/**
 * zazigv2 — Orchestrator Edge Function
 *
 * Runs on a schedule (every 10 s via Supabase Cron) or via HTTP trigger.
 *
 * Responsibilities:
 *   1. Poll `jobs` for queued work and dispatch to machines with capacity.
 *   2. Detect dead machines (no heartbeat for 2 min) and re-queue their jobs.
 *   3. Listen on Realtime channel `orchestrator:commands` for agent messages
 *      (Heartbeat, JobAck, JobStatusMessage, JobComplete, JobFailed) and
 *      apply the appropriate DB updates / slot adjustments.
 *
 * Runtime: Deno / Supabase Edge Functions
 * Auth: service_role key — never exposed to the client.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  isDeployComplete,
  isFeatureApproved,
  isFeatureRejected,
  isHeartbeat,
  isJobAck,
  isJobBlocked,
  isJobComplete,
  isJobFailed,
  isJobStatusMessage,
  isStopAck,
  isVerifyResult,
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

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ---------------------------------------------------------------------------
// Channel naming — scoped by company to support multiple instances per machine
// ---------------------------------------------------------------------------

function agentChannelName(machineName: string, companyId: string): string {
  return `agent:${machineName}:${companyId}`;
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

interface LogContext {
  caller: string;
  jobId?: string;
}

function makeLogger(caller: string, jobId?: string) {
  const shortJobId = jobId?.slice(0, 8);
  const prefix = shortJobId ? `[${caller}][job:${shortJobId}]` : `[${caller}]`;
  return {
    info: (...args: unknown[]) => console.log(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  };
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
function resolveModelAndSlot(
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
    return { role: entry.role, model: entry.model, slotType: entry.slotType };
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
]);

const TERMINAL_FEATURE_STATUSES_FOR_DEPLOY = new Set([
  "failed",
  "complete",
  "cancelled",
]);

console.log(
  "[orchestrator] Cold start — in-memory recoveryTimestamps reset (anti-flap cooldown not durable across restarts)",
);

// ---------------------------------------------------------------------------
// Title generation — short human-readable labels for jobs via Claude Haiku
// ---------------------------------------------------------------------------

/**
 * Generates a short (3-8 word) human-readable title for a job from its context.
 * Uses Claude Haiku for speed and cost efficiency. Returns empty string on failure.
 */
async function generateTitle(context: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    console.warn(
      "[orchestrator] ANTHROPIC_API_KEY not set — skipping title generation",
    );
    return "";
  }

  // Strip UUIDs and trim to avoid sending large payloads
  const cleaned = context
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "[id]",
    )
    .slice(0, 500);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 30,
        messages: [{
          role: "user",
          content:
            `Generate a 3-8 word human-readable title for this software engineering job. Return ONLY the title, nothing else.\n\nContext: ${cleaned}`,
        }],
      }),
    });

    if (!response.ok) {
      console.error(`[orchestrator] Title generation HTTP ${response.status}`);
      return "";
    }

    const data = await response.json();
    const title = data.content?.[0]?.text?.trim() || "";
    return title.slice(0, 120);
  } catch (err) {
    console.error(
      "[orchestrator] Title generation failed:",
      err instanceof Error ? err.message : String(err),
    );
    return "";
  }
}

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
    let model: string;
    let slotType: SlotType;
    // Loaded once per company per dispatch pass (cached inside loadRouting).
    // Hoisted here so the codex→claude_code fallback below can always access it.
    const routing = await loadRouting(supabase, job.company_id);

    if (job.role && !ENGINEER_ROLES.has(job.role)) {
      // Role-based routing: look up the role's defaults from the roles table.
      const { data: roleDefaults } = await supabase
        .from("roles")
        .select("default_model, slot_type")
        .eq("name", job.role)
        .single();

      if (roleDefaults?.default_model && roleDefaults?.slot_type) {
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
        ({ model, slotType } = resolveModelAndSlot(
          routing,
          job.complexity,
          job.model,
          job.id,
        ));
      }
    } else {
      // Engineer roles or no role: use complexity routing.
      ({ model, slotType } = resolveModelAndSlot(
        routing,
        job.complexity,
        job.model,
        job.id,
      ));
    }

    // Fetch available machines for this company (with capacity for the slot type).
    let machines = machineCache.get(job.company_id);
    if (!machines) {
      const { data: m, error: mErr } = await supabase
        .from("machines")
        .select(
          "id, company_id, name, slots_claude_code, slots_codex, last_heartbeat, status, enabled",
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

    // Find a machine with an available slot of the required type.
    let candidate = machines.find((m) => availableSlots(m, slotType) > 0);

    // For jobs preferring codex, fall back to claude_code if no codex slots available.
    if (!candidate && slotType === "codex") {
      slotType = "claude_code";
      // Only change model if it was complexity-derived (not an explicit override).
      if (!job.model) {
        const mediumEntry = routing.get("medium");
        model = mediumEntry?.model ?? "claude-sonnet-4-6";
      }
      candidate = machines.find((m) => availableSlots(m, slotType) > 0);
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
    const requiresCodeContext = !NO_CODE_CONTEXT_ROLES.has(job.role);

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

      // Fail the parent feature if applicable (mirrors handleJobFailed logic).
      if (job.feature_id) {
        const errorDetail = `${
          job.role ?? job.job_type
        } job failed: null context — job was created without a context/spec`;
        await supabase
          .from("features")
          .update({ status: "failed", error: errorDetail })
          .eq("id", job.feature_id);
        console.warn(
          `[orchestrator] Feature ${job.feature_id} marked as failed: ${errorDetail}`,
        );
      }
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
    if (job.role) {
      const { data: roleRow } = await supabase
        .from("roles")
        .select("id, prompt, skills, mcp_tools, interactive")
        .eq("name", job.role)
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
    promptParts.push(completionInstructions(job.role));
    const promptStackMinusSkills = promptParts.join("\n\n---\n\n");

    // Dispatch: update job status → dispatched, assign machine_id.
    // Record the resolved model and slot_type on the job for observability.
    const { data: claimedJobRows, error: updateJobErr } = await supabase
      .from("jobs")
      .update({
        status: "dispatched",
        machine_id: candidate.id,
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
      ...(job.role ? { role: job.role } : {}),
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

// ---------------------------------------------------------------------------
// Agent message handlers (called from the Realtime subscription)
// ---------------------------------------------------------------------------

async function handleHeartbeat(
  supabase: SupabaseClient,
  msg: Heartbeat,
  logContext: LogContext = { caller: "orchestrator" },
): Promise<void> {
  const { machineId, slotsAvailable } = msg;
  const logger = makeLogger(logContext.caller, logContext.jobId);

  // Check if the machine was offline before this heartbeat.
  const { data: machine, error: fetchErr } = await supabase
    .from("machines")
    .select("id, company_id, status")
    .eq("id", machineId)
    .single();

  if (fetchErr || !machine) {
    logger.error(
      `Failed to fetch machine ${machineId} for heartbeat:`,
      fetchErr?.message,
    );
    return;
  }

  const wasOffline = machine.status === "offline";

  const { error } = await supabase
    .from("machines")
    .update({
      last_heartbeat: new Date().toISOString(),
      status: "online",
      slots_claude_code: slotsAvailable.claude_code,
      slots_codex: slotsAvailable.codex,
    })
    .eq("name", machineId);

  if (error) {
    logger.error(
      `Failed to record heartbeat for machine ${machineId}:`,
      error.message,
    );
    return;
  }

  logger.info(
    `Heartbeat from machine ${machineId} — claude_code:${slotsAvailable.claude_code} codex:${slotsAvailable.codex}`,
  );

  // Machine came back online — record recovery timestamp and log event.
  if (wasOffline) {
    logger.info(
      `Machine ${machineId} recovered from offline — cooldown ${RECOVERY_COOLDOWN_MS}ms`,
    );
    recoveryTimestamps.set(machineId, Date.now());

    const { error: eventErr } = await supabase
      .from("events")
      .insert({
        company_id: machine.company_id,
        machine_id: machineId,
        event_type: "machine_online",
        detail: { recovered: true },
      });

    if (eventErr) {
      logger.error(
        `Failed to log machine_online event for ${machineId}:`,
        eventErr.message,
      );
    }
  }
}

function handleJobAck(
  _supabase: SupabaseClient,
  msg: { jobId: string; machineId: string },
  logContext: LogContext = { caller: "orchestrator", jobId: msg.jobId },
): void {
  const logger = makeLogger(logContext.caller, logContext.jobId ?? msg.jobId);
  // Delivery confirmation: log only, no DB change needed.
  logger.info(
    `JobAck received — job ${msg.jobId} confirmed by machine ${msg.machineId}`,
  );
}

async function handleJobStatus(
  supabase: SupabaseClient,
  msg: JobStatusMessage,
  logContext: LogContext = { caller: "orchestrator", jobId: msg.jobId },
): Promise<void> {
  const logger = makeLogger(logContext.caller, logContext.jobId ?? msg.jobId);
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: msg.status })
    .eq("id", msg.jobId)
    .in("status", ["dispatched", "executing", "blocked"]) // only update non-terminal jobs
    .select("id");

  if (error) {
    logger.error(
      `Failed to update job ${msg.jobId} status to ${msg.status}:`,
      error.message,
    );
  } else if (!data?.length) {
    logger.warn(
      `Job ${msg.jobId} status update to ${msg.status} matched 0 rows (already terminal or missing)`,
    );
  } else {
    logger.info(`Job ${msg.jobId} status → ${msg.status}`);
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

export async function handleJobComplete(
  supabase: SupabaseClient,
  msg: JobComplete,
  logContext: LogContext = { caller: "orchestrator", jobId: msg.jobId },
): Promise<void> {
  const { jobId, machineId, result, pr } = msg;
  const logger = makeLogger(logContext.caller, logContext.jobId ?? jobId);

  // Fetch the job to check type, feature_id, context, etc.
  const { data: jobRow, error: fetchErr } = await supabase
    .from("jobs")
    .select(
      "job_type, context, feature_id, company_id, project_id, branch, acceptance_tests, result, role, source, machine_id",
    )
    .eq("id", jobId)
    .single();

  if (fetchErr || !jobRow) {
    logger.error(
      `Could not fetch job ${jobId} for completion:`,
      fetchErr?.message,
    );
    await releaseSlot(supabase, jobId, machineId);
    return;
  }

  // --- Normal (non-review, non-persistent) job completion ---

  // Mark job as complete
  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      status: "complete",
      result,
      pr_url: pr ?? null,
      completed_at: new Date().toISOString(),
      machine_id: null,
    })
    .eq("id", jobId);

  if (jobErr) {
    logger.error(`Failed to mark job ${jobId} complete:`, jobErr.message);
    await releaseSlot(supabase, jobId, machineId);
    return;
  }

  logger.info(`Job ${jobId} complete (machine ${machineId})`);

  // Release the slot on the machine.
  await releaseSlot(supabase, jobId, machineId);

  // DAG: check if this completion unblocks other queued jobs in the same feature.
  if (jobRow.feature_id) {
    await checkUnblockedJobs(supabase, jobRow.feature_id, jobId);
  }

  // Check if this is a verification job that completed.
  const contextStr = jobRow?.context ?? "{}";
  let ctx: { type?: string; target?: string } = {};
  try {
    ctx = JSON.parse(contextStr);
  } catch { /* ignore */ }

  // Active verification (verification-specialist): check result for pass/fail
  if (ctx.type === "active_feature_verification" && jobRow?.feature_id) {
    const passed = result?.toUpperCase().startsWith("PASSED");
    if (passed) {
      logger.info(
        `Active verification PASSED for feature ${jobRow.feature_id} — initiating test deploy`,
      );
      await initiateTestDeploy(supabase, jobRow.feature_id);
    } else {
      logger.info(
        `Active verification FAILED for feature ${jobRow.feature_id} — notifying CPO`,
      );
      await notifyCPO(
        supabase,
        jobRow.company_id,
        `Active verification failed for feature ${jobRow.feature_id}: result=${
          result ?? "unknown"
        }. Needs triage.`,
      );
    }
  }

  // Passive verification (reviewer): initiate test deploy on success
  if (ctx.type === "feature_verification" && jobRow?.feature_id) {
    await initiateTestDeploy(supabase, jobRow.feature_id);
  }

  // Handle breakdown job completion: feature transitions breakdown → building
  if (jobRow?.job_type === "breakdown" && jobRow?.feature_id) {
    const { data: transitioned } = await supabase
      .from("features")
      .update({ status: "building" })
      .eq("id", jobRow.feature_id)
      .eq("status", "breaking_down")
      .select("id");
    if (transitioned && transitioned.length > 0) {
      logger.info(
        `Breakdown complete — feature ${jobRow.feature_id} → building`,
      );
    } else {
      logger.warn(
        `Breakdown complete but feature ${jobRow.feature_id} was not in breaking_down (may have already transitioned)`,
      );
    }

    // Auto-generate branch name if not already set (matches processFeatureLifecycle logic).
    // This prevents a race where this Realtime handler transitions the feature before the
    // polling lifecycle handler gets a chance to generate the branch.
    const { data: featBranch } = await supabase
      .from("features")
      .select("title, branch")
      .eq("id", jobRow.feature_id)
      .single();
    if (featBranch && !featBranch.branch) {
      const title = (featBranch as { title?: string }).title ?? "";
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .substring(0, 40);
      const branch = `feature/${slug}-${jobRow.feature_id.substring(0, 8)}`;
      await supabase.from("features").update({ branch }).eq(
        "id",
        jobRow.feature_id,
      );
      logger.info(
        `Auto-generated branch for feature ${jobRow.feature_id}: ${branch}`,
      );
    }

    // Notify CPO about breakdown completion with job stats
    const { data: featureJobs } = await supabase
      .from("jobs")
      .select("id, depends_on")
      .eq("feature_id", jobRow.feature_id)
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
      .eq("id", jobRow.feature_id)
      .single();
    const featureTitle = feat?.title ?? jobRow.feature_id;
    await notifyCPO(
      supabase,
      jobRow.company_id,
      `Feature "${featureTitle}" broken into ${totalJobs} jobs. ${dispatchable} immediately dispatchable (no dependencies).`,
    );
  }

  // Handle project-architect job completion: notify CPO about new project structure
  if (jobRow?.role === "project-architect" && jobRow?.company_id) {
    // Count features created for the project
    const projCtx: { projectId?: string; projectName?: string } = (() => {
      try {
        return JSON.parse(jobRow.context ?? "{}");
      } catch {
        return {};
      }
    })();
    if (projCtx.projectId) {
      const { count: featureCount } = await supabase
        .from("features")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projCtx.projectId);
      const projectName = projCtx.projectName ?? projCtx.projectId;
      await notifyCPO(
        supabase,
        jobRow.company_id,
        `Project "${projectName}" created with ${
          featureCount ?? 0
        } feature outlines. Ready for your review.`,
      );
    }
  }

  // Handle combine job completion: trigger verification
  // (PR creation is now handled by the local agent in executor.ts after branch push)
  if (jobRow?.job_type === "combine" && jobRow?.feature_id) {
    logger.info(
      `Combine complete — triggering verification for ${jobRow.feature_id}`,
    );
    await triggerFeatureVerification(supabase, jobRow.feature_id);
  }

  // Handle reviewer verify job completion: check pass/fail and advance or notify CPO
  if (
    jobRow?.job_type === "verify" && jobRow?.role === "reviewer" &&
    jobRow?.feature_id
  ) {
    const normalizedResult = result?.toUpperCase() ?? "";
    const passed = normalizedResult.startsWith("PASSED");
    const failed = normalizedResult.startsWith("FAILED") ||
      normalizedResult.startsWith("NO_REPORT") ||
      normalizedResult.startsWith("VERDICT_MISSING");
    if (passed) {
      logger.info(
        `Verification PASSED for feature ${jobRow.feature_id} — triggering merge`,
      );
      await triggerMerging(supabase, jobRow.feature_id);
    } else if (failed) {
      const failureResult = normalizedResult.startsWith("NO_REPORT")
        ? "FAILED: NO_REPORT (reviewer report file missing)"
        : normalizedResult.startsWith("VERDICT_MISSING")
        ? "FAILED: VERDICT_MISSING (reviewer report has no machine-parseable verdict)"
        : (result ?? "FAILED");
      logger.info(
        `Verification FAILED for feature ${jobRow.feature_id} — triggering retry (result=${failureResult})`,
      );
      await handleVerificationFailed(
        supabase,
        jobRow.feature_id,
        jobRow.company_id,
        failureResult,
      );
    } else {
      // INCONCLUSIVE or unexpected result — notify CPO for manual triage
      logger.info(
        `Verification INCONCLUSIVE for feature ${jobRow.feature_id}: result=${
          result ?? "unknown"
        }`,
      );
      await notifyCPO(
        supabase,
        jobRow.company_id,
        `Verification inconclusive for feature ${jobRow.feature_id}: result=${
          result ?? "unknown"
        }. Needs manual triage.`,
      );
    }
  }

  // Handle test deploy job completion: extract URL and advance feature
  if (jobRow?.job_type === "deploy_to_test" && jobRow?.feature_id) {
    const urlMatch = result?.match(/https?:\/\/\S+/);
    if (urlMatch) {
      await handleDeployComplete(supabase, {
        type: "deploy_complete",
        protocolVersion: PROTOCOL_VERSION,
        featureId: jobRow.feature_id,
        machineId: jobRow.machine_id ?? "",
        testUrl: urlMatch[0],
        ephemeral: true,
      }, { caller: logContext.caller, jobId });
    } else {
      // No URL found — roll back feature so it can retry
      await supabase
        .from("features")
        .update({ status: "verifying" })
        .eq("id", jobRow.feature_id)
        .eq("status", "deploying_to_test");
      await notifyCPO(
        supabase,
        jobRow.company_id,
        `Test deploy failed for feature ${jobRow.feature_id}: ${
          (result ?? "").slice(0, 200)
        }`,
      );
    }
  }

  // Handle prod deploy job completion: feature transitions deploying_to_prod → complete
  if (jobRow?.job_type === "deploy_to_prod" && jobRow?.feature_id) {
    await handleProdDeployComplete(supabase, jobRow.feature_id, {
      caller: logContext.caller,
      jobId,
    });
  }

  // Handle merge job completion: advance feature to complete or failed
  if (jobRow?.job_type === "merge" && jobRow?.feature_id) {
    const normalizedResult = result?.toUpperCase() ?? "";
    const passed = normalizedResult.startsWith("PASSED");
    if (passed) {
      logger.info(
        `Merge PASSED for feature ${jobRow.feature_id} — advancing to complete`,
      );
      const { data: completedUpdated } = await supabase
        .from("features")
        .update({
          status: "complete",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobRow.feature_id)
        .eq("status", "merging")
        .select("id, pr_url, title");
      if (completedUpdated?.length) {
        const prUrl = (completedUpdated[0] as { pr_url?: string }).pr_url ??
          null;
        const featureTitle =
          (completedUpdated[0] as { title?: string }).title ??
            jobRow.feature_id;
        await notifyCPO(
          supabase,
          jobRow.company_id,
          prUrl
            ? `Feature "${featureTitle}" merged and complete: ${prUrl}`
            : `Feature "${featureTitle}" merged and complete.`,
        );
      }
    } else {
      logger.info(
        `Merge FAILED for feature ${jobRow.feature_id} — marking failed`,
      );
      await supabase
        .from("features")
        .update({
          status: "failed",
          error: `Merge failed: ${(result ?? "unknown").slice(0, 200)}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobRow.feature_id)
        .eq("status", "merging");
      await notifyCPO(
        supabase,
        jobRow.company_id,
        `Merge failed for feature ${jobRow.feature_id}: ${
          (result ?? "unknown").slice(0, 200)
        }`,
      );
    }
  }
}

async function handleJobFailed(
  supabase: SupabaseClient,
  msg: JobFailed,
  logContext: LogContext = { caller: "orchestrator", jobId: msg.jobId },
): Promise<void> {
  const { jobId, machineId, error: errMsg, failureReason } = msg;
  const logger = makeLogger(logContext.caller, logContext.jobId ?? jobId);

  const { data: job, error: jobFetchErr } = await supabase
    .from("jobs")
    .select("source, feature_id, role, job_type, title")
    .eq("id", jobId)
    .single();

  if (jobFetchErr) {
    logger.error(
      `handleJobFailed: failed to fetch job ${jobId}:`,
      jobFetchErr.message,
    );
  }

  if (failureReason === "agent_crash") {
    const { error: requeueErr } = await supabase
      .from("jobs")
      .update({ status: "queued", machine_id: null })
      .eq("id", jobId);

    if (requeueErr) {
      logger.error(
        `handleJobFailed: failed to re-queue crashed job ${jobId}:`,
        requeueErr.message,
      );
    }

    await releaseSlot(supabase, jobId, machineId);
    logger.info(`Job ${jobId} agent_crash → re-queued`);
    return;
  }

  const { error: failErr } = await supabase
    .from("jobs")
    .update({
      status: "failed",
      machine_id: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (failErr) {
    logger.error(
      `handleJobFailed: failed to mark job ${jobId} failed:`,
      failErr.message,
    );
  }

  await releaseSlot(supabase, jobId, machineId);
  logger.warn(
    `Job ${jobId} failed (reason: ${failureReason}, error: ${errMsg})`,
  );

  if (!job?.feature_id) return;

  if (job.job_type === "deploy_to_test") {
    await supabase
      .from("features")
      .update({ status: "verifying" })
      .eq("id", job.feature_id)
      .eq("status", "deploying_to_test");
    logger.info(
      `Rolled back feature ${job.feature_id} to verifying after deploy failure`,
    );
    return;
  }

  const { data: feature, error: featureErr } = await supabase
    .from("features")
    .select(
      "id, status, retry_count, failure_history, spec, branch, acceptance_tests, company_id, project_id",
    )
    .eq("id", job.feature_id)
    .single();

  if (featureErr || !feature) {
    logger.error(
      `handleJobFailed: failed to fetch feature ${job.feature_id}:`,
      featureErr?.message,
    );
    return;
  }

  if ((feature.retry_count ?? 0) >= 3) {
    const errorDetail = `${job.role ?? job.job_type} job failed: ${
      errMsg ?? "unknown error"
    }`;
    await supabase
      .from("features")
      .update({ status: "failed", error: errorDetail })
      .eq("id", feature.id);
    logger.warn(
      `Feature retry budget exhausted (3/3) — hard-failing feature ${feature.id}`,
    );
    return;
  }

  const nextAttempt = (feature.retry_count ?? 0) + 1;
  const timestamp = new Date().toISOString();
  const newEntry = {
    attempt: nextAttempt,
    phase: feature.status,
    job_id: jobId,
    job_title: job.title ?? null,
    reason: errMsg ?? failureReason,
    timestamp,
  };
  const currentHistory = Array.isArray(feature.failure_history)
    ? feature.failure_history as Record<string, unknown>[]
    : [];
  const updatedHistory = [...currentHistory, newEntry];

  if (feature.status === "building") {
    const failureSuffix =
      `\n\n## Previous Attempt Failure (retry ${nextAttempt} of 3)\nPhase: building\nFailed job: "${job.title}"\nReason: ${
        errMsg ?? failureReason
      }`;
    const { error: featureUpdateErr } = await supabase
      .from("features")
      .update({
        retry_count: nextAttempt,
        failure_history: updatedHistory,
        spec: (feature.spec ?? "") + failureSuffix,
        status: "breaking_down",
      })
      .eq("id", feature.id);

    if (featureUpdateErr) {
      logger.error(
        `handleJobFailed: failed to reset feature ${feature.id} to breaking_down:`,
        featureUpdateErr.message,
      );
      return;
    }

    const { error: cancelErr } = await supabase
      .from("jobs")
      .update({ status: "cancelled", result: "superseded_by_feature_retry" })
      .eq("feature_id", feature.id)
      .in("status", ["queued", "dispatched", "executing", "complete"]);

    if (cancelErr) {
      logger.error(
        `handleJobFailed: failed to cancel old jobs for feature ${feature.id}:`,
        cancelErr.message,
      );
    }

    logger.info(
      `Building phase failure — re-breakdown (retry ${nextAttempt}/3): ${errMsg}`,
    );
    return;
  }

  const { error: featureUpdateErr } = await supabase
    .from("features")
    .update({
      retry_count: nextAttempt,
      failure_history: updatedHistory,
      status: "building",
    })
    .eq("id", feature.id);

  if (featureUpdateErr) {
    logger.error(
      `handleJobFailed: failed to move feature ${feature.id} back to building:`,
      featureUpdateErr.message,
    );
    return;
  }

  const { error: cancelErr } = await supabase
    .from("jobs")
    .update({ status: "cancelled", result: "superseded_by_feature_retry" })
    .eq("feature_id", feature.id)
    .in("status", ["queued", "dispatched", "executing"])
    .in("job_type", ["merge", "verify", "combine"]);

  if (cancelErr) {
    logger.error(
      `handleJobFailed: failed to cancel post-build jobs for feature ${feature.id}:`,
      cancelErr.message,
    );
  }

  const featureBranch = (feature as { branch?: string | null }).branch ?? null;

  const { error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: feature.id,
      title: `Fix: ${job.title ?? job.job_type}`,
      spec: feature.spec ?? "",
      acceptance_tests:
        (feature as { acceptance_tests?: string | null }).acceptance_tests ??
          "",
      context: JSON.stringify({
        type: "feature_fix",
        failureDetails: errMsg ?? failureReason,
        featureBranch,
      }),
      role: "senior-engineer",
      job_type: "code",
      complexity: "medium",
      slot_type: "claude_code",
      status: "queued",
      branch: featureBranch,
    });

  if (insertErr) {
    logger.error(
      `handleJobFailed: failed to queue fix job for feature ${feature.id}:`,
      insertErr.message,
    );
    return;
  }

  logger.info(
    `Post-building failure — fix job created (retry ${nextAttempt}/3): ${errMsg}`,
  );
}

export async function handleVerifyResult(
  supabase: SupabaseClient,
  msg: VerifyResult,
  logContext: LogContext = { caller: "orchestrator", jobId: msg.jobId },
): Promise<void> {
  const { jobId, passed, testOutput, reviewSummary } = msg;
  const logger = makeLogger(logContext.caller, logContext.jobId ?? jobId);

  const { data: job, error: fetchErr } = await supabase
    .from("jobs")
    .select("id, feature_id")
    .eq("id", jobId)
    .single();

  if (fetchErr || !job) {
    logger.error(
      `handleVerifyResult: failed to fetch job ${jobId}:`,
      fetchErr?.message,
    );
    return;
  }

  if (!passed) {
    const { error: failErr } = await supabase
      .from("jobs")
      .update({
        status: "verify_failed",
        verify_context: [reviewSummary, testOutput].filter((part) => !!part)
          .join("\n\n"),
        machine_id: null,
      })
      .eq("id", jobId);

    if (failErr) {
      logger.error(
        `handleVerifyResult: failed to set verify_failed on ${jobId}:`,
        failErr.message,
      );
    } else {
      logger.warn(
        `Job ${jobId} verification failed — moved to verify_failed for retry`,
      );
    }
    return;
  }

  const { error: passErr } = await supabase
    .from("jobs")
    .update({
      status: "complete",
      verify_context: null,
      completed_at: new Date().toISOString(),
      machine_id: null,
    })
    .eq("id", jobId);

  if (passErr) {
    logger.error(
      `handleVerifyResult: failed to mark ${jobId} complete after verification:`,
      passErr.message,
    );
    return;
  }

  if (!job.feature_id) return;

  const { data: allDone, error: allDoneErr } = await supabase
    .rpc("all_feature_jobs_complete", { p_feature_id: job.feature_id });

  if (allDoneErr) {
    logger.error(
      `handleVerifyResult: all_feature_jobs_complete failed for ${job.feature_id}:`,
      allDoneErr.message,
    );
    return;
  }

  if (allDone) {
    logger.info(
      `All jobs complete for feature ${job.feature_id} — triggering feature verification`,
    );
    await triggerFeatureVerification(supabase, job.feature_id);
  }
}

// ---------------------------------------------------------------------------
// Blocked job flow — agent needs human input
// ---------------------------------------------------------------------------

async function handleJobBlocked(
  supabase: SupabaseClient,
  msg: JobBlocked,
  logContext: LogContext = { caller: "orchestrator", jobId: msg.jobId },
): Promise<void> {
  const { jobId, reason } = msg;
  const logger = makeLogger(logContext.caller, logContext.jobId ?? jobId);

  // 1. Set job to blocked, store reason
  await supabase.from("jobs")
    .update({ status: "blocked", blocked_reason: reason })
    .eq("id", jobId);

  // 2. Fetch job context to find the Slack channel (via feature)
  const { data: job } = await supabase.from("jobs")
    .select("feature_id, company_id")
    .eq("id", jobId).single();

  if (!job?.feature_id) {
    logger.info(`Job ${jobId} blocked (no feature — no Slack post): ${reason}`);
    return;
  }

  const { data: feature } = await supabase.from("features")
    .select("slack_channel, slack_thread_ts")
    .eq("id", job.feature_id).single();

  if (!feature?.slack_channel || !feature?.slack_thread_ts) {
    logger.info(`Job ${jobId} blocked (no Slack thread): ${reason}`);
    return;
  }

  // 3. Post the question as a reply in the feature's Slack thread
  const slackToken = await getSlackBotToken(supabase, job.company_id);
  if (!slackToken) {
    logger.info(`Job ${jobId} blocked (no Slack bot token): ${reason}`);
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

  logger.info(`Job ${jobId} blocked — question posted to Slack: ${reason}`);
}

async function handleJobUnblocked(
  supabase: SupabaseClient,
  jobId: string,
  answer: string,
  logContext: LogContext = { caller: "orchestrator", jobId },
): Promise<void> {
  const logger = makeLogger(logContext.caller, logContext.jobId ?? jobId);
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

  logger.info(`Job ${jobId} unblocked — answer routed to agent`);
}

// ---------------------------------------------------------------------------
// DAG: check if completing a job unblocks other queued jobs in the same feature
// ---------------------------------------------------------------------------

/**
 * After a job completes, checks if any queued jobs in the same feature had it
 * in their depends_on array and are now fully unblocked. Logs which jobs became
 * dispatchable — the next dispatchQueuedJobs cycle will pick them up.
 */
export async function checkUnblockedJobs(
  supabase: SupabaseClient,
  featureId: string,
  completedJobId: string,
): Promise<void> {
  // Find queued jobs in this feature that reference the completed job in depends_on
  const { data: candidates, error: candErr } = await supabase
    .from("jobs")
    .select("id, depends_on")
    .eq("feature_id", featureId)
    .eq("status", "queued")
    .contains("depends_on", [completedJobId]);

  if (candErr) {
    console.error(
      `[orchestrator] checkUnblockedJobs: failed to query candidates for feature ${featureId}:`,
      candErr.message,
    );
    return;
  }

  if (!candidates || candidates.length === 0) return;

  for (const candidate of candidates) {
    const deps = (candidate.depends_on as string[]) ?? [];
    if (deps.length === 0) continue;

    // Check if ALL dependencies are now complete
    const { data: depJobs, error: depErr } = await supabase
      .from("jobs")
      .select("id, status")
      .in("id", deps);

    if (depErr) {
      console.error(
        `[orchestrator] checkUnblockedJobs: failed to check deps for job ${candidate.id}:`,
        depErr.message,
      );
      continue;
    }

    const allComplete = depJobs && depJobs.length === deps.length &&
      depJobs.every((d: { status: string }) => d.status === "complete");

    if (allComplete) {
      console.log(
        `[orchestrator] Job ${candidate.id} is now unblocked (all ${deps.length} dependencies complete)`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// CPO notification helper — send messages to the active CPO agent
// ---------------------------------------------------------------------------

/**
 * Sends a notification message to the active CPO agent via Realtime.
 * If no CPO is active, logs a warning and returns (message lost — CPO will catch up on next wakeup).
 */
export async function notifyCPO(
  supabase: SupabaseClient,
  companyId: string,
  text: string,
): Promise<void> {
  // Find the active CPO job
  const { data: cpoJob, error: cpoErr } = await supabase
    .from("jobs")
    .select("id, machine_id")
    .eq("role", "cpo")
    .in("status", ["dispatched", "executing"])
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  if (cpoErr) {
    console.error(
      `[orchestrator] notifyCPO: failed to find CPO job for company ${companyId}:`,
      cpoErr.message,
    );
    return;
  }

  if (!cpoJob || !cpoJob.machine_id) {
    console.warn(
      `[orchestrator] notifyCPO: no active CPO for company ${companyId} — notification lost: ${text}`,
    );
    return;
  }

  // Get machine name for the Realtime channel
  const { data: machine, error: machErr } = await supabase
    .from("machines")
    .select("name")
    .eq("id", cpoJob.machine_id)
    .single();

  if (machErr || !machine) {
    console.error(
      `[orchestrator] notifyCPO: failed to fetch machine ${cpoJob.machine_id}:`,
      machErr?.message,
    );
    return;
  }

  // Send MessageInbound via Realtime
  const messagePayload = {
    type: "message_inbound",
    protocolVersion: PROTOCOL_VERSION,
    conversationId: `internal:notification:${crypto.randomUUID()}`,
    from: "orchestrator",
    text,
  };

  const channel = supabase.channel(agentChannelName(machine.name, companyId));
  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "message_inbound",
          payload: messagePayload,
        });
        await channel.unsubscribe();
        resolve();
      }
    });
  });

  console.log(
    `[orchestrator] Notified CPO on machine ${machine.name}: ${
      text.slice(0, 100)
    }`,
  );
}

/**
 * Triggers the combining step: merges all completed job branches into the feature branch.
 * Called when all building jobs for a feature are done (verified individually).
 * Transitions feature from 'building' → 'combining' and creates a combine job.
 */
export async function triggerCombining(
  supabase: SupabaseClient,
  featureId: string,
): Promise<void> {
  // 1. Fetch all completed pipeline jobs for this feature.
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("id, branch, depends_on, job_type, source")
    .eq("feature_id", featureId)
    .eq("status", "complete");

  if (jobsErr) {
    console.error(
      `[orchestrator] triggerCombining: failed to fetch job branches for feature ${featureId}:`,
      jobsErr.message,
    );
    return;
  }

  const completedJobs = (jobs ?? []) as Array<{
    id: string;
    branch: string | null;
    depends_on: string[] | null;
    job_type: string;
    source: string | null;
  }>;

  const NON_IMPLEMENTATION_TYPES = new Set([
    "breakdown",
    "combine",
    "merge",
    "verify",
    "review",
    "deploy_to_test",
    "deploy_to_prod",
    "feature_test",
  ]);

  const implementationJobs = completedJobs.filter(
    (job) => !NON_IMPLEMENTATION_TYPES.has(job.job_type),
  );

  // 2. Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id, branch")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(
      `[orchestrator] triggerCombining: feature ${featureId} not found`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[orchestrator] triggerCombining: feature ${featureId} has no branch — cannot combine`,
    );
    return;
  }

  // 3. Prepare combine context — only merge leaf branches (jobs not superseded by a dependent).
  // A job is a "leaf" if no other completed job in this feature lists it in depends_on.
  // Chain A→B→C: only C is a leaf (C already contains A+B). Fan-out A→[B,C]: both B and C are leaves.
  const allJobs = implementationJobs;
  const supersededIds = new Set<string>();
  for (const j of allJobs) {
    for (const depId of (j.depends_on ?? [])) {
      supersededIds.add(depId);
    }
  }
  const jobBranches = allJobs
    .filter((j) => !supersededIds.has(j.id))
    .map((j) => j.branch)
    .filter((b): b is string => b !== null && b.length > 0);
  const combineContext = JSON.stringify({
    type: "combine",
    featureId,
    featureBranch: feature.branch,
    jobBranches,
  });

  // 4. Insert combine job first. If this fails, feature remains in building and will retry.
  const { data: combineJob, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      title: "Combine feature branches",
      role: "job-combiner",
      job_type: "combine",
      complexity: "simple",
      slot_type: "claude_code",
      status: "queued",
      context: combineContext,
      branch: feature.branch,
    })
    .select("id")
    .single();

  if (insertErr || !combineJob) {
    console.error(
      `[orchestrator] triggerCombining: failed to insert combine job for feature ${featureId}:`,
      insertErr?.message,
    );
    return;
  }

  // 5. Transition feature to combining (CAS: from building).
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "combining_and_pr" })
    .eq("id", featureId)
    .eq("status", "building")
    .select("id");

  if (updateErr || !updated || updated.length === 0) {
    if (updateErr) {
      console.error(
        `[orchestrator] triggerCombining: failed to set feature ${featureId} to combining_and_pr:`,
        updateErr.message,
      );
    } else {
      console.log(
        `[orchestrator] triggerCombining: feature ${featureId} not in building — rolling back queued combine job`,
      );
    }

    const { error: rollbackErr } = await supabase
      .from("jobs")
      .update({
        status: "cancelled",
        result: "combine_not_started_feature_not_building",
      })
      .eq("id", combineJob.id)
      .eq("status", "queued");
    if (rollbackErr) {
      console.error(
        `[orchestrator] triggerCombining: failed to cancel queued combine job ${combineJob.id} after CAS miss:`,
        rollbackErr.message,
      );
    }
    return;
  }

  console.log(
    `[orchestrator] Created combine job ${combineJob.id} for feature ${featureId} with ${jobBranches.length} branches`,
  );

  // Generate title asynchronously
  generateTitle(combineContext).then((title) => {
    if (title) {
      supabase.from("jobs").update({ title }).eq("id", combineJob.id).then(
        () => {},
      );
    }
  }).catch(() => {});
}

export async function triggerFeatureVerification(
  supabase: SupabaseClient,
  featureId: string,
): Promise<void> {
  // Fetch current feature state and details before creating a verify job.
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select(
      "status, branch, project_id, company_id, acceptance_tests, verification_type",
    )
    .eq("id", featureId)
    .single();
  if (fetchErr || !feature) {
    console.error(
      `[orchestrator] Failed to fetch feature ${featureId}:`,
      fetchErr?.message,
    );
    return;
  }

  const lateStageStatuses = new Set([
    "verifying",
    "merging",
    "complete",
    "cancelled",
  ]);

  if (lateStageStatuses.has(feature.status as string)) {
    console.log(
      `[orchestrator] Feature ${featureId} already in late-stage status (${feature.status}) — skipping verification trigger`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[orchestrator] triggerFeatureVerification: feature ${featureId} has no branch — cannot verify`,
    );
    return;
  }

  const isActive = feature.verification_type === "active";
  const verifyContext = isActive
    ? JSON.stringify({
      type: "active_feature_verification",
      feature_id: featureId,
      acceptanceTests: feature.acceptance_tests ?? "",
    })
    : JSON.stringify({
      type: "feature_verification",
      featureBranch: feature.branch,
      acceptanceTests: feature.acceptance_tests ?? "",
    });

  const insertPayload = isActive
    ? {
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      role: "verification-specialist",
      job_type: "verify",
      complexity: "medium",
      slot_type: "claude_code",
      status: "queued",
      context: verifyContext,
    }
    : {
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      title: "Review combined code",
      role: "reviewer",
      job_type: "verify",
      complexity: "simple",
      slot_type: "claude_code",
      status: "queued",
      context: verifyContext,
      branch: feature.branch,
    };

  // Insert verify job first so a failed insert never leaves the feature stuck in "verifying".
  const { data: insertedRows, error: insertErr } = await supabase
    .from("jobs")
    .insert(insertPayload)
    .select("id");

  if (insertErr || !insertedRows || insertedRows.length === 0) {
    console.error(
      `[orchestrator] Failed to insert verification job for ${featureId}:`,
      insertErr?.message,
    );
    return;
  }

  const insertedJobId = insertedRows[0].id as string;

  // CAS transition to verifying only after the verify job exists.
  const { data: updated, error: featureErr } = await supabase
    .from("features")
    .update({ status: "verifying" })
    .eq("id", featureId)
    .eq("status", feature.status as string)
    .select("id");

  if (featureErr || !updated || updated.length === 0) {
    if (featureErr) {
      console.error(
        `[orchestrator] Failed to set feature ${featureId} to verifying:`,
        featureErr.message,
      );
    } else {
      console.log(
        `[orchestrator] Feature ${featureId} status changed before verify transition — cancelling queued verify job ${insertedJobId}`,
      );
    }

    const { error: rollbackErr } = await supabase
      .from("jobs")
      .update({
        status: "cancelled",
        result: "verification_not_started_feature_status_changed",
      })
      .eq("id", insertedJobId)
      .eq("status", "queued");
    if (rollbackErr) {
      console.error(
        `[orchestrator] Failed to cancel queued verify job ${insertedJobId} after status CAS miss:`,
        rollbackErr.message,
      );
    }
    return;
  }

  if (isActive) {
    console.log(
      `[orchestrator] Queued active verification (verification-specialist) for feature ${featureId}`,
    );
  } else {
    console.log(
      `[orchestrator] Queued passive verification (reviewer) for feature ${featureId} branch ${feature.branch}`,
    );
  }

  generateTitle(verifyContext).then((title) => {
    if (title) {
      supabase.from("jobs").update({ title }).eq("id", insertedJobId).then(
        () => {},
      );
    }
  }).catch(() => {});
}

/**
 * Triggers the merge step for a verified feature.
 * Inserts a merge job and transitions the feature from verifying → merging.
 */
export async function triggerMerging(
  supabase: SupabaseClient,
  featureId: string,
): Promise<void> {
  // Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id, branch, pr_url, title")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(
      `[orchestrator] triggerMerging: feature ${featureId} not found`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[orchestrator] triggerMerging: feature ${featureId} has no branch — cannot merge`,
    );
    return;
  }

  // Idempotency: check no active/complete merge job exists
  const { data: existingMerge } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("feature_id", featureId)
    .eq("job_type", "merge")
    .in("status", ["queued", "dispatched", "executing", "complete"])
    .limit(1);

  if (existingMerge && existingMerge.length > 0) {
    console.log(
      `[orchestrator] triggerMerging: merge job already exists for feature ${featureId} (${
        existingMerge[0].id
      }) — skipping`,
    );
    return;
  }

  const mergeContext = JSON.stringify({
    type: "merge",
    featureId,
    featureBranch: feature.branch,
    prUrl: feature.pr_url ?? null,
  });

  // Insert merge job first
  const { data: mergeJob, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      title: `Merge feature: ${feature.title ?? featureId}`,
      role: "job-merger",
      job_type: "merge",
      complexity: "simple",
      slot_type: "claude_code",
      status: "queued",
      context: mergeContext,
      branch: feature.branch,
    })
    .select("id")
    .single();

  if (insertErr || !mergeJob) {
    console.error(
      `[orchestrator] triggerMerging: failed to insert merge job for feature ${featureId}:`,
      insertErr?.message,
    );
    return;
  }

  // CAS transition: verifying → merging
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "merging", updated_at: new Date().toISOString() })
    .eq("id", featureId)
    .eq("status", "verifying")
    .select("id");

  if (updateErr || !updated || updated.length === 0) {
    if (updateErr) {
      console.error(
        `[orchestrator] triggerMerging: failed to set feature ${featureId} to merging:`,
        updateErr.message,
      );
    } else {
      console.log(
        `[orchestrator] triggerMerging: feature ${featureId} not in verifying — rolling back queued merge job`,
      );
    }

    const { error: rollbackErr } = await supabase
      .from("jobs")
      .update({
        status: "cancelled",
        result: "merge_not_started_feature_not_verifying",
      })
      .eq("id", mergeJob.id)
      .eq("status", "queued");
    if (rollbackErr) {
      console.error(
        `[orchestrator] triggerMerging: failed to cancel queued merge job ${mergeJob.id} after CAS miss:`,
        rollbackErr.message,
      );
    }
    return;
  }

  console.log(
    `[orchestrator] Created merge job ${mergeJob.id} for feature ${featureId}`,
  );
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
 * Initiates test deployment for a verified feature.
 *
 * Queue logic: only one feature at a time can occupy the test env per project.
 * If another feature is already in "deploying_to_test" or "ready_to_test" status
 * for the same project, this feature stays in "verifying" and will be promoted
 * when the env is free.
 */
async function initiateTestDeploy(
  supabase: SupabaseClient,
  featureId: string,
): Promise<void> {
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("status, project_id, company_id, branch")
    .eq("id", featureId)
    .single();
  if (fetchErr || !feature) {
    console.error(
      `[orchestrator] Failed to fetch feature ${featureId}:`,
      fetchErr?.message,
    );
    return;
  }

  if (TERMINAL_FEATURE_STATUSES_FOR_DEPLOY.has(feature.status as string)) {
    console.log(
      `[orchestrator] initiateTestDeploy: feature ${featureId} is terminal (${feature.status}) — skipping deploy_to_test job creation`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[orchestrator] initiateTestDeploy: feature ${featureId} has no branch — cannot deploy`,
    );
    return;
  }
  if (!feature.project_id) {
    console.error(
      `[orchestrator] initiateTestDeploy: feature ${featureId} has no project_id — cannot deploy`,
    );
    return;
  }

  // CAS: atomically move verifying → deploying_to_test
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({
      status: "deploying_to_test",
      updated_at: new Date().toISOString(),
    })
    .eq("id", featureId)
    .eq("status", "verifying")
    .select("id");

  if (updateErr) {
    console.error(
      `[orchestrator] initiateTestDeploy: failed to update feature ${featureId}:`,
      updateErr.message,
    );
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(
      `[orchestrator] initiateTestDeploy: feature ${featureId} no longer in verifying — skipping`,
    );
    return;
  }

  // PR is now created at combine time — no longer needed here.

  // Guard: skip if there's already an active deploy_to_test job for this feature
  const { data: existingJobs } = await supabase
    .from("jobs")
    .select("id")
    .eq("feature_id", featureId)
    .eq("job_type", "deploy_to_test")
    .in("status", ["queued", "dispatched", "executing"])
    .limit(1);
  if (existingJobs && existingJobs.length > 0) {
    console.log(
      `[orchestrator] initiateTestDeploy: active deploy_to_test job already exists for feature ${featureId} — skipping`,
    );
    return;
  }

  // Queue a test-deployer job — the dispatcher will pick a machine with capacity.
  const { error: insertErr } = await supabase.from("jobs").insert({
    company_id: feature.company_id,
    project_id: feature.project_id,
    feature_id: featureId,
    title: "Deploy to test",
    role: "test-deployer",
    job_type: "deploy_to_test",
    complexity: "simple",
    slot_type: "claude_code",
    status: "queued",
    context: JSON.stringify({
      type: "deploy_to_test",
      featureId,
      featureBranch: feature.branch,
      projectId: feature.project_id,
    }),
    branch: feature.branch,
  });

  if (insertErr) {
    console.error(
      `[orchestrator] Failed to queue test deploy job for feature ${featureId}:`,
      insertErr.message,
    );
    // Roll back so the lifecycle poller can retry
    await supabase
      .from("features")
      .update({ status: "verifying" })
      .eq("id", featureId)
      .eq("status", "deploying_to_test");
    return;
  }

  console.log(`[orchestrator] Test deploy job queued for feature ${featureId}`);
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
  logContext: LogContext = { caller: "orchestrator" },
): Promise<void> {
  const logger = makeLogger(logContext.caller, logContext.jobId);
  // Feature-level deploy is no longer part of the pipeline.
  // Deployment is now handled at the project level via `zazig promote`.
  // This handler is kept for backwards compatibility but is a no-op.
  logger.info(
    `handleFeatureApproved: feature ${msg.featureId} — deploy handled at project level via zazig promote, no-op`,
  );
}

/**
 * Handles completion of a production deploy job.
 * No longer transitions feature status — deploy is now at the project level.
 * Kept for backwards compatibility with any in-flight deploy_to_prod jobs.
 */
async function handleProdDeployComplete(
  supabase: SupabaseClient,
  featureId: string,
  logContext: LogContext = { caller: "orchestrator" },
): Promise<void> {
  const logger = makeLogger(logContext.caller, logContext.jobId);
  logger.info(
    `handleProdDeployComplete: feature ${featureId} — deploy handled at project level, no-op`,
  );
}

export async function handleFeatureRejected(
  supabase: SupabaseClient,
  msg: FeatureRejected,
  logContext: LogContext = { caller: "orchestrator" },
): Promise<void> {
  const { featureId, feedback, severity } = msg;
  const logger = makeLogger(logContext.caller, logContext.jobId);

  if (severity === "small") {
    // Small fix — fix agent handles it in-thread.
    // The fix agent is already running (spawned when feature entered testing).
    // Just log the feedback so it appears in the event log.
    logger.info(
      `Feature ${featureId} — small rejection, fix agent handles in-thread`,
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
  logger.info(`Feature ${featureId} — big rejection, returning to building`);

  // 1. Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id, branch, spec")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    logger.error(`Failed to fetch feature ${featureId}:`, fetchErr?.message);
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
    logger.error(
      `Failed to reset feature ${featureId} to building:`,
      updateErr.message,
    );
    return;
  }
  if (!updated || updated.length === 0) {
    logger.info(
      `Feature ${featureId} not in verifying/merging/complete — skipping rejection`,
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
    logger.error(
      `Failed to queue fix job for feature ${featureId}:`,
      insertErr.message,
    );
  } else {
    logger.info(`Queued fix job for rejected feature ${featureId}`);
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
  logContext: LogContext = { caller: "orchestrator" },
): Promise<void> {
  const { decisionId, companyId, fromRole, action, selectedOption, note } = msg;
  const logger = makeLogger(logContext.caller, logContext.jobId);

  logger.info(
    `Decision ${decisionId} resolved: action=${action}, option=${selectedOption}`,
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
    logger.error(
      `Failed to locate active persistent job for role ${fromRole}:`,
      persistentJobErr.message,
    );
    return;
  }

  const machineName = (persistentJob?.machines as { name?: string } | null)
    ?.name;

  if (!persistentJob?.id || !machineName) {
    logger.warn(
      `No active persistent job for role ${fromRole} in company ${companyId} — decision resolution not forwarded`,
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
          logger.error(
            `Failed to forward decision resolution to ${fromRole} on machine ${machineName}: ${result}`,
          );
        } else {
          logger.info(
            `Forwarded decision resolution to ${fromRole} on machine ${machineName}`,
          );
        }

        await agentChannel.unsubscribe();
        resolve();
      } else if (
        status === "CHANNEL_ERROR" || status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        logger.error(
          `Realtime channel error while forwarding decision ${decisionId} to ${fromRole} on machine ${machineName}`,
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

/**
 * Polls for features whose lifecycle transitions were missed because the
 * executor writes job status directly to the DB and the orchestrator's 4s
 * Realtime window may not catch the broadcast.
 *
 * Handles:
 *   0. Failed job catch-up: marks features failed when JobFailed broadcast was missed
 *   0b. deploy_to_test guard: fails queued/dispatched/executing deploy jobs for terminal features
 *   1. breaking_down → building: all breakdown jobs for the feature are complete
 *   2. building → combining_and_pr: all implementation jobs are complete
 *   3. combining_and_pr → verifying: the latest combine job is complete
 *   4. verifying → merging: the latest verify job is complete and passed
 *   5. merging → complete: the latest merge job is complete and passed
 */
async function processFeatureLifecycle(
  supabase: SupabaseClient,
): Promise<void> {
  // --- 0. Failed job catch-up (all stages) ---
  // If the JobFailed broadcast was missed, the feature is stuck forever because
  // handleJobFailed (line 1085) is the only path that marks features as failed.
  // This catch-up finds features with failed jobs that weren't marked failed.
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
      .select("id, role, job_type, result")
      .eq("feature_id", feature.id)
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1);

    if (failedJob && failedJob.length > 0) {
      const job = failedJob[0] as {
        id: string;
        role: string | null;
        job_type: string;
        result: string | null;
      };
      const errorDetail = `${job.role ?? job.job_type} job failed (catch-up): ${
        (job.result ?? "unknown error").slice(0, 200)
      }`;

      const { data: updated } = await supabase
        .from("features")
        .update({ status: "failed", error: errorDetail })
        .eq("id", feature.id)
        .not("status", "in", '("failed","complete","cancelled")') // CAS guard
        .select("id");

      if (updated && updated.length > 0) {
        console.warn(
          `[orchestrator] processFeatureLifecycle: feature ${feature.id} has failed job ${job.id} — marked feature failed (catch-up)`,
        );
      }
    }
  }

  // --- 0b. deploy_to_test cleanup for terminal features ---
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

  // --- 1. breaking_down → building ---
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
        continue; // handleJobFailed will mark the feature as failed
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

  // --- 2. building → combining ---
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
      continue; // handleJobFailed will mark the feature as failed
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

  // --- 3. combining_and_pr → verifying ---
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

  // --- 4. verifying → merging (catch-up) ---
  // Features stuck in 'verifying' where the latest verify job is already complete and passed.
  // The live path (handleJobComplete) triggers merging on receipt of the job_complete message.
  // This catch-up handles cases where that message was missed.
  const { data: verifyingFeatures, error: verifyErr } = await supabase
    .from("features")
    .select("id, company_id")
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
      company_id: string;
    }[]
  ) {
    const { data: latestVerify } = await supabase
      .from("jobs")
      .select("id, status, context, result")
      .eq("feature_id", feature.id)
      .eq("job_type", "verify")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!latestVerify || latestVerify.length === 0) continue;
    const job = latestVerify[0] as {
      id: string;
      status: string;
      context: string;
      result: string | null;
    };
    if (job.status !== "complete") continue;

    const normalizedResult = job.result?.toUpperCase() ?? "";
    const passed = normalizedResult.startsWith("PASSED");
    const failed = normalizedResult.startsWith("FAILED") ||
      normalizedResult.startsWith("NO_REPORT") ||
      normalizedResult.startsWith("VERDICT_MISSING");

    if (passed) {
      console.log(
        `[orchestrator] processFeatureLifecycle: verify PASSED for feature ${feature.id} — triggering merge (catch-up)`,
      );
      await triggerMerging(supabase, feature.id);
    } else if (failed) {
      const failureResult = normalizedResult.startsWith("NO_REPORT")
        ? "FAILED: NO_REPORT (reviewer report file missing)"
        : normalizedResult.startsWith("VERDICT_MISSING")
        ? "FAILED: VERDICT_MISSING (reviewer report has no machine-parseable verdict)"
        : (job.result ?? "FAILED");
      console.log(
        `[orchestrator] processFeatureLifecycle: verify FAILED for feature ${feature.id} — triggering retry (catch-up, result=${failureResult})`,
      );
      await handleVerificationFailed(
        supabase,
        feature.id,
        feature.company_id,
        failureResult,
      );
    } else {
      // INCONCLUSIVE — notify CPO but don't retry (catch-up)
      console.log(
        `[orchestrator] processFeatureLifecycle: verify INCONCLUSIVE for feature ${feature.id} (catch-up): result=${
          job.result ?? "unknown"
        }`,
      );
      await notifyCPO(
        supabase,
        feature.company_id,
        `Verification inconclusive for feature ${feature.id}: result=${
          job.result ?? "unknown"
        }. Needs manual triage.`,
      );
    }
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
      .select("id, status, result")
      .eq("feature_id", feature.id)
      .eq("job_type", "merge")
      .order("created_at", { ascending: false })
      .limit(1);

    if (!latestMerge || latestMerge.length === 0) continue;
    const job = latestMerge[0] as {
      id: string;
      status: string;
      result: string | null;
    };
    if (job.status !== "complete") continue;

    const normalizedResult = job.result?.toUpperCase() ?? "";
    const passed = normalizedResult.startsWith("PASSED");

    if (passed) {
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
    } else {
      // Merge failed — mark feature as failed (catch-up)
      console.log(
        `[orchestrator] processFeatureLifecycle: merge FAILED for feature ${feature.id} — marking failed (catch-up)`,
      );
      await supabase
        .from("features")
        .update({
          status: "failed",
          error: `Merge failed: ${(job.result ?? "unknown").slice(0, 200)}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", feature.id)
        .eq("status", "merging");
    }
  }

  // Feature pipeline ends at 'complete'.
}

// ---------------------------------------------------------------------------
// Deploy result handlers
// ---------------------------------------------------------------------------

/**
 * Handles a successful test environment deployment from a local agent.
 * Feature-level deploy is no longer part of the pipeline — deployment is at the project level.
 * Kept for backwards compatibility with any in-flight deploy messages.
 */
export async function handleDeployComplete(
  supabase: SupabaseClient,
  msg: DeployComplete,
  logContext: LogContext = { caller: "orchestrator" },
): Promise<void> {
  const logger = makeLogger(logContext.caller, logContext.jobId);
  logger.info(
    `handleDeployComplete: feature ${msg.featureId} — deploy handled at project level, no-op`,
  );
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
 * Releases one slot of the appropriate type on a machine.
 * Fetches the current job record to determine slot_type, then increments the machine counter.
 */
async function releaseSlot(
  supabase: SupabaseClient,
  jobId: string,
  machineId: string,
): Promise<void> {
  if (!machineId) {
    console.warn(
      `[orchestrator] releaseSlot called without machineId for job ${jobId} — skipping`,
    );
    return;
  }

  // Look up the job's slot_type.
  const { data: jobRow, error: jobErr } = await supabase
    .from("jobs")
    .select("slot_type")
    .eq("id", jobId)
    .single();

  if (jobErr || !jobRow) {
    console.error(
      `[orchestrator] Could not fetch slot_type for job ${jobId}:`,
      jobErr?.message,
    );
    return;
  }

  const slotType: SlotType = (jobRow.slot_type as SlotType) ?? "claude_code";
  const { error: releaseErr } = await supabase.rpc("release_machine_slot", {
    p_machine_id: machineId,
    p_slot_type: slotType,
  });

  if (releaseErr) {
    console.error(
      `[orchestrator] Failed to release slot on machine ${machineId}:`,
      releaseErr.message,
    );
  } else {
    console.log(
      `[orchestrator] Released ${slotType} slot on machine ${machineId}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Realtime listener — subscribe to agent messages
// ---------------------------------------------------------------------------

/**
 * Subscribes to `orchestrator:commands` channel and processes one batch of
 * messages for up to `listenDurationMs` before returning.
 *
 * In a scheduled invocation (10 s window) we listen briefly to drain any
 * pending messages, then let the function exit.
 */
async function listenForAgentMessages(
  supabase: SupabaseClient,
  listenDurationMs = 5_000,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const channel = supabase.channel("orchestrator:commands");

    const timer = setTimeout(async () => {
      await channel.unsubscribe();
      resolve();
    }, listenDurationMs);

    channel
      .on(
        "broadcast",
        { event: "*" },
        async ({ payload }: { payload: unknown }) => {
          const msg = payload;
          const caller = "agent-event";

          if (isHeartbeat(msg)) {
            const typedMsg = msg as Heartbeat;
            await handleHeartbeat(supabase, typedMsg, { caller });
          } else if (isJobAck(msg)) {
            const typedMsg = msg as { jobId: string; machineId: string };
            handleJobAck(supabase, typedMsg, { caller, jobId: typedMsg.jobId });
          } else if (isJobStatusMessage(msg)) {
            const typedMsg = msg as JobStatusMessage;
            await handleJobStatus(supabase, typedMsg, {
              caller,
              jobId: typedMsg.jobId,
            });
          } else if (isJobComplete(msg)) {
            const typedMsg = msg as JobComplete;
            await handleJobComplete(supabase, typedMsg, {
              caller,
              jobId: typedMsg.jobId,
            });
          } else if (isJobFailed(msg)) {
            const typedMsg = msg as JobFailed;
            await handleJobFailed(supabase, typedMsg, {
              caller,
              jobId: typedMsg.jobId,
            });
          } else if (isVerifyResult(msg)) {
            const typedMsg = msg as VerifyResult;
            await handleVerifyResult(supabase, typedMsg, {
              caller,
              jobId: typedMsg.jobId,
            });
          } else if (isFeatureApproved(msg)) {
            const typedMsg = msg as FeatureApproved;
            await handleFeatureApproved(supabase, typedMsg, { caller });
          } else if (isFeatureRejected(msg)) {
            const typedMsg = msg as FeatureRejected;
            await handleFeatureRejected(supabase, typedMsg, { caller });
          } else if (isDeployComplete(msg)) {
            const typedMsg = msg as DeployComplete;
            await handleDeployComplete(supabase, typedMsg, { caller });
          } else if (isJobBlocked(msg)) {
            const typedMsg = msg as JobBlocked;
            await handleJobBlocked(supabase, typedMsg, {
              caller,
              jobId: typedMsg.jobId,
            });
          } else if (isDecisionResolved(msg)) {
            const typedMsg = msg as DecisionResolved;
            await handleDecisionResolved(supabase, typedMsg, { caller });
          } else if (isStopAck(msg)) {
            makeLogger(caller, (msg as { jobId: string }).jobId)
              .info(
                `StopAck received — job ${(msg as { jobId: string }).jobId}`,
              );
          } else {
            makeLogger(caller).warn(
              "Unknown or invalid agent message received:",
              JSON.stringify(payload),
            );
          }
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          makeLogger("agent-event").error(
            "Realtime channel error on orchestrator:commands",
          );
          clearTimeout(timer);
          resolve();
        }
      });
  });
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
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (_req: Request): Promise<Response> => {
  console.log("[orchestrator] Invoked at", new Date().toISOString());

  const supabase = makeAdminClient();

  try {
    // 1. Drain any pending agent messages from the Realtime channel.
    //    Listen for 4 s to collect messages (heartbeats, job updates).
    //    Must run BEFORE reap so freshly-received heartbeats prevent
    //    machines from being incorrectly marked dead.
    await listenForAgentMessages(supabase, 4_000);

    // 2a. Mark dead machines offline (prevents dispatch to them).
    await reapDeadMachines(supabase);

    // 2b. Re-queue jobs stuck in dispatched/executing with stale updated_at.
    await reapStaleJobs(supabase);

    // 3. Process breaking_down features → create breakdown jobs.
    await processReadyForBreakdown(supabase);

    // 4. Catch missed feature lifecycle transitions (breakdown→building, building→combining).
    //    The executor writes job status directly to DB — if the Realtime broadcast was
    //    missed during the 4s listen window, these transitions would never fire.
    await processFeatureLifecycle(supabase);

    // 5. Dispatch queued jobs to available machines.
    await dispatchQueuedJobs(supabase);

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
