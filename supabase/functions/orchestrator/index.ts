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
  PROTOCOL_VERSION,
  MACHINE_DEAD_THRESHOLD_MS,
  RECOVERY_COOLDOWN_MS,
  isHeartbeat,
  isJobAck,
  isJobStatusMessage,
  isJobComplete,
  isJobFailed,
  isStopAck,
  isVerifyResult,
  isFeatureApproved,
  isFeatureRejected,
  isDeployComplete,
  isDeployFailed,
  isDeployNeedsConfig,
  isJobBlocked,
} from "@zazigv2/shared";
import type {
  StartJob,
  VerifyJob,
  SlotType,
  AgentMessage,
  Heartbeat,
  JobStatusMessage,
  JobComplete,
  JobFailed,
  JobBlocked,
  JobUnblocked,
  VerifyResult,
  DeployToTest,
  TeardownTest,
  FeatureApproved,
  FeatureRejected,
  DeployComplete,
  DeployFailed,
  DeployNeedsConfig,
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
// Supabase DB row shapes (subset of columns we actually read/write)
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  company_id: string;
  project_id: string | null;
  feature_id: string;
  role: string;
  job_type: string;
  complexity: string | null;
  slot_type: SlotType | null;
  model: string | null;
  machine_id: string | null;
  status: string;
  context: string | null;
  branch: string | null;
  result: string | null;
  created_at: string;
  depends_on: string[] | null;
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
function decrementSlotPayload(machine: MachineRow, slotType: SlotType): Record<string, number> {
  if (slotType === "claude_code") {
    return { slots_claude_code: Math.max(0, machine.slots_claude_code - 1) };
  }
  return { slots_codex: Math.max(0, machine.slots_codex - 1) };
}

/**
 * Increments the appropriate slot column by 1.
 */
function incrementSlotPayload(machine: MachineRow, slotType: SlotType): Record<string, number> {
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
    .select("complexity, company_id, roles:role_id(default_model, slot_type)")
    .or(`company_id.is.null,company_id.eq.${companyId}`);

  const map = new Map<string, RoutingEntry>();

  if (error || !data) {
    console.warn("[orchestrator] Failed to load complexity_routing, using hardcoded fallbacks:", error?.message);
    // Hardcoded fallback if DB is empty or query fails
    map.set("simple", { complexity: "simple", model: "codex", slotType: "codex" });
    map.set("medium", { complexity: "medium", model: "claude-sonnet-4-6", slotType: "claude_code" });
    map.set("complex", { complexity: "complex", model: "claude-opus-4-6", slotType: "claude_code" });
    routingCache = map;
    return map;
  }

  // Global defaults first, then company overrides (which replace globals)
  const globals = data.filter((r: Record<string, unknown>) => r.company_id === null);
  const overrides = data.filter((r: Record<string, unknown>) => r.company_id !== null);

  for (const row of [...globals, ...overrides]) {
    const role = row.roles as unknown as { default_model: string; slot_type: string } | null;
    if (!role) continue;
    map.set(row.complexity as string, {
      complexity: row.complexity as string,
      model: role.default_model,
      slotType: role.slot_type as SlotType,
    });
  }

  routingCache = map;
  console.log(`[orchestrator] Loaded routing: ${[...map.entries()].map(([k, v]) => `${k}→${v.model}(${v.slotType})`).join(", ")}`);
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
): { model: string; slotType: SlotType } {
  // Explicit model override on the job takes precedence.
  if (existingModel) {
    const entry = routing.get(complexity ?? "medium");
    const slotType = entry?.slotType ?? "claude_code";
    return { model: existingModel, slotType };
  }

  const entry = routing.get(complexity ?? "medium");
  if (entry) {
    return { model: entry.model, slotType: entry.slotType };
  }

  // Fallback if complexity not in routing table
  console.warn(`[orchestrator] No routing entry for complexity=${complexity} on job ${jobId ?? "?"}, defaulting to sonnet`);
  return { model: "claude-sonnet-4-6", slotType: "claude_code" };
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
    console.warn("[orchestrator] ANTHROPIC_API_KEY not set — skipping title generation");
    return "";
  }

  // Strip UUIDs and trim to avoid sending large payloads
  const cleaned = context
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[id]")
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
          content: `Generate a 3-8 word human-readable title for this software engineering job. Return ONLY the title, nothing else.\n\nContext: ${cleaned}`,
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
    console.error("[orchestrator] Title generation failed:", err instanceof Error ? err.message : String(err));
    return "";
  }
}

// ---------------------------------------------------------------------------
// Core orchestrator operations
// ---------------------------------------------------------------------------

/**
 * Step 1: Mark machines whose last_heartbeat is older than MACHINE_DEAD_THRESHOLD_MS
 * as 'offline', and re-queue any dispatched/executing jobs assigned to them.
 */
async function reapDeadMachines(supabase: SupabaseClient): Promise<void> {
  const deadCutoff = new Date(Date.now() - MACHINE_DEAD_THRESHOLD_MS).toISOString();

  // Find online machines that haven't sent a heartbeat within the threshold.
  const { data: deadMachines, error: machineErr } = await supabase
    .from("machines")
    .select("id, name, company_id")
    .eq("status", "online")
    .or(`last_heartbeat.is.null,last_heartbeat.lt.${deadCutoff}`);

  if (machineErr) {
    console.error("[orchestrator] Error querying dead machines:", machineErr.message);
    return;
  }

  if (!deadMachines || deadMachines.length === 0) return;

  for (const machine of deadMachines) {
    console.warn(`[orchestrator] Machine ${machine.name} (${machine.id}) is dead — marking offline`);

    // Mark machine offline.
    const { error: offlineErr } = await supabase
      .from("machines")
      .update({ status: "offline" })
      .eq("id", machine.id);

    if (offlineErr) {
      console.error(`[orchestrator] Failed to mark machine ${machine.id} offline:`, offlineErr.message);
      continue;
    }

    // Re-queue dispatched or executing jobs on the dead machine.
    const { data: stuckJobs, error: jobsErr } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("machine_id", machine.id)
      .in("status", ["dispatched", "executing", "blocked"]);

    if (jobsErr) {
      console.error(`[orchestrator] Failed to query jobs for dead machine ${machine.id}:`, jobsErr.message);
      continue;
    }

    let requeuedCount = 0;

    if (stuckJobs && stuckJobs.length > 0) {
      const stuckIds = stuckJobs.map((j: { id: string }) => j.id);
      console.log(`[orchestrator] Re-queuing ${stuckIds.length} job(s) from dead machine ${machine.name}`);

      const { error: requeueErr } = await supabase
        .from("jobs")
        .update({ status: "queued", machine_id: null })
        .in("id", stuckIds);

      if (requeueErr) {
        console.error(`[orchestrator] Failed to re-queue jobs from dead machine ${machine.id}:`, requeueErr.message);
      } else {
        requeuedCount = stuckIds.length;
      }
    }

    // Log machine-offline event.
    const { error: eventErr } = await supabase
      .from("events")
      .insert({
        company_id: machine.company_id,
        machine_id: machine.id,
        event_type: "machine_offline",
        detail: { jobs_requeued: requeuedCount },
      });

    if (eventErr) {
      console.error(`[orchestrator] Failed to log machine_offline event for ${machine.id}:`, eventErr.message);
    }
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
      "id, company_id, project_id, feature_id, role, job_type, complexity, slot_type, model, machine_id, status, context, branch, result, created_at, depends_on",
    )
    .eq("status", "queued")
    .order("created_at", { ascending: true });

  if (jobsErr) {
    console.error("[orchestrator] Error fetching queued jobs:", jobsErr.message);
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
    // Auto-create a wrapper feature for jobs with no feature_id.
    if (!job.feature_id) {
      const { data: wrapperFeature, error: wfErr } = await supabase
        .from("features")
        .insert({
          company_id: job.company_id,
          project_id: job.project_id ?? null,
          title: `One-off: ${(() => { try { return JSON.parse(job.context ?? "{}").title; } catch { return null; } })() ?? job.id}`,
          status: "building",
        })
        .select("id")
        .single();
      if (wfErr || !wrapperFeature) {
        console.error(`[orchestrator] Failed to create wrapper feature for job ${job.id}:`, wfErr?.message);
        continue;
      }
      // Generate a branch name for the wrapper feature so the executor has a target branch.
      const wrapperBranch = `feature/standalone-${job.id.substring(0, 8)}`;
      await supabase.from("features").update({ branch: wrapperBranch }).eq("id", wrapperFeature.id);
      await supabase.from("jobs").update({ feature_id: wrapperFeature.id }).eq("id", job.id);
      job.feature_id = wrapperFeature.id;
      console.log(`[orchestrator] Auto-created wrapper feature ${wrapperFeature.id} (branch: ${wrapperBranch}) for standalone job ${job.id}`);
    }

    // DAG check: if this job has dependencies, verify they are all complete before dispatch.
    if (job.depends_on && job.depends_on.length > 0) {
      const { data: depJobs, error: depErr } = await supabase
        .from("jobs")
        .select("id, status")
        .in("id", job.depends_on);

      if (depErr) {
        console.error(`[orchestrator] Failed to check depends_on for job ${job.id}:`, depErr.message);
        continue;
      }

      const allComplete = depJobs && depJobs.length === job.depends_on.length &&
        depJobs.every((d: { status: string }) => d.status === "complete" || d.status === "done");

      if (!allComplete) {
        console.log(`[orchestrator] Job ${job.id} blocked by unfinished dependencies — skipping`);
        continue;
      }
    }

    // Resolve model + slot type.
    // Non-engineer roles use their role's default_model & slot_type from the DB.
    // Engineer roles (senior-engineer, junior-engineer) use complexity routing.
    const ENGINEER_ROLES = new Set(["senior-engineer", "junior-engineer"]);
    let model: string;
    let slotType: SlotType;

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
        const routing = await loadRouting(supabase, job.company_id);
        ({ model, slotType } = resolveModelAndSlot(routing, job.complexity, job.model, job.id));
      }
    } else {
      // Engineer roles or no role: use complexity routing.
      const routing = await loadRouting(supabase, job.company_id);
      ({ model, slotType } = resolveModelAndSlot(routing, job.complexity, job.model, job.id));
    }

    // Fetch available machines for this company (with capacity for the slot type).
    let machines = machineCache.get(job.company_id);
    if (!machines) {
      const { data: m, error: mErr } = await supabase
        .from("machines")
        .select("id, company_id, name, slots_claude_code, slots_codex, last_heartbeat, status")
        .eq("company_id", job.company_id)
        .eq("status", "online");

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

    // Look up git context (repo_url from projects, branch from features) required by executor.
    // Must be resolved before slot decrement so we can skip without side effects.
    let repoUrl: string | null = null;
    let featureBranch: string | null = null;

    if (job.project_id) {
      const { data: projectRow } = await supabase
        .from("projects")
        .select("repo_url")
        .eq("id", job.project_id)
        .single();
      repoUrl = (projectRow as { repo_url?: string } | null)?.repo_url ?? null;
    }

    if (job.feature_id) {
      const { data: featureRow } = await supabase
        .from("features")
        .select("branch")
        .eq("id", job.feature_id)
        .single();
      featureBranch = (featureRow as { branch?: string } | null)?.branch ?? null;
    }

    if (!job.project_id || !repoUrl || !featureBranch) {
      console.warn(
        `[orchestrator] Job ${job.id} missing git context (projectId=${job.project_id}, repoUrl=${repoUrl}, featureBranch=${featureBranch}) — skipping dispatch`,
      );
      continue;
    }

    // Atomically decrement the slot BEFORE marking the job dispatched.
    // Using .gt(slotColumn, 0) as a CAS guard: if two concurrent invocations both
    // see slots=2, only one will win the conditional UPDATE and get a rowCount > 0.
    // The loser gets an empty result set and skips dispatch, preventing double-booking.
    const slotColumn = slotType === "claude_code" ? "slots_claude_code" : "slots_codex";
    const currentSlots = slotType === "claude_code" ? candidate.slots_claude_code : candidate.slots_codex;
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

    // Dispatch: update job status → dispatched, assign machine_id.
    // Record the resolved model and slot_type on the job for observability.
    const { error: updateJobErr } = await supabase
      .from("jobs")
      .update({
        status: "dispatched",
        machine_id: candidate.id,
        model,
        slot_type: slotType,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "queued"); // optimistic lock

    if (updateJobErr) {
      console.error(`[orchestrator] Failed to dispatch job ${job.id}:`, updateJobErr.message);
      // The slot was already decremented above; it will self-correct on next heartbeat.
      continue;
    }

    // Update in-memory cache so subsequent jobs in this pass see the reduced capacity.
    const slotUpdate = { [slotColumn]: currentSlots - 1 };
    Object.assign(candidate, slotUpdate);

    // Check if this is a passive verification job — route to VerifyJob instead of StartJob.
    // Active verification (verification-specialist) gets a normal StartJob with full workspace.
    if (job.job_type === "verify" && job.role !== "verification-specialist") {
      let ctx: { featureBranch?: string; acceptanceTests?: string } = {};
      try { ctx = JSON.parse(job.context ?? "{}"); } catch { /* ignore */ }

      const verifyJobMsg: VerifyJob = {
        type: "verify_job",
        protocolVersion: PROTOCOL_VERSION,
        jobId: job.id,
        featureBranch: ctx.featureBranch ?? "",
        jobBranch: job.branch ?? ctx.featureBranch ?? "",
        acceptanceTests: ctx.acceptanceTests ?? "",
      };

      const channel = supabase.channel(`agent:${candidate.name}`);
      await new Promise<void>((resolve) => {
        channel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel.send({ type: "broadcast", event: "verify_job", payload: verifyJobMsg });
            await channel.unsubscribe();
            resolve();
          }
        });
      });

      console.log(`[orchestrator] Dispatched VerifyJob ${job.id} to ${candidate.name}`);
      continue;
    }

    // Fetch role prompt + skills for non-codex jobs that have a named role.
    // These populate the 4-layer context stack: personality → role → skills → task.
    let rolePrompt: string | undefined;
    let roleSkills: string[] | undefined;
    let personalityPrompt: string | undefined;
    let subAgentPrompt: string | undefined;
    if (job.role && slotType !== "codex") {
      const { data: roleRow } = await supabase
        .from("roles")
        .select("id, prompt, skills")
        .eq("name", job.role)
        .single();
      if (roleRow) {
        const typed = roleRow as { id: string; prompt: string | null; skills: string[] | null };
        rolePrompt = typed.prompt ?? undefined;
        roleSkills = typed.skills ?? undefined;

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
        if ((personality as Record<string, unknown>)?.compiled_sub_agent_prompt) {
          subAgentPrompt = (personality as Record<string, unknown>).compiled_sub_agent_prompt as string;
        }
      }
    }

    // Build the StartJob message.
    // repoUrl, featureBranch, and job.project_id are verified non-null above.
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
      repoUrl: repoUrl!,
      featureBranch: featureBranch!,
      context: job.context ?? undefined,
      // Include role for role-based jobs (specialized reviewers, etc.)
      ...(job.role ? { role: job.role } : {}),
      ...(personalityPrompt ? { personalityPrompt } : {}),
      ...(subAgentPrompt ? { subAgentPrompt } : {}),
      ...(rolePrompt ? { rolePrompt } : {}),
      ...(roleSkills && roleSkills.length > 0 ? { roleSkills } : {}),
    };

    // Broadcast StartJob via Supabase Realtime on the machine's command channel.
    // Channel naming convention: `agent:{machine.name}`
    const channel = supabase.channel(`agent:${candidate.name}`);

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
          await new Promise(r => setTimeout(r, 500));
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

async function handleHeartbeat(supabase: SupabaseClient, msg: Heartbeat): Promise<void> {
  const { machineId, slotsAvailable } = msg;

  // Check if the machine was offline before this heartbeat.
  const { data: machine, error: fetchErr } = await supabase
    .from("machines")
    .select("id, company_id, status")
    .eq("id", machineId)
    .single();

  if (fetchErr || !machine) {
    console.error(`[orchestrator] Failed to fetch machine ${machineId} for heartbeat:`, fetchErr?.message);
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
    console.error(`[orchestrator] Failed to record heartbeat for machine ${machineId}:`, error.message);
    return;
  }

  console.log(
    `[orchestrator] Heartbeat from machine ${machineId} — claude_code:${slotsAvailable.claude_code} codex:${slotsAvailable.codex}`,
  );

  // Machine came back online — record recovery timestamp and log event.
  if (wasOffline) {
    console.log(`[orchestrator] Machine ${machineId} recovered from offline — cooldown ${RECOVERY_COOLDOWN_MS}ms`);
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
      console.error(`[orchestrator] Failed to log machine_online event for ${machineId}:`, eventErr.message);
    }
  }
}

function handleJobAck(_supabase: SupabaseClient, msg: { jobId: string; machineId: string }): void {
  // Delivery confirmation: log only, no DB change needed.
  console.log(`[orchestrator] JobAck received — job ${msg.jobId} confirmed by machine ${msg.machineId}`);
}

async function handleJobStatus(supabase: SupabaseClient, msg: JobStatusMessage): Promise<void> {
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: msg.status })
    .eq("id", msg.jobId)
    .in("status", ["dispatched", "executing", "blocked", "reviewing"]) // only update non-terminal jobs
    .select("id");

  if (error) {
    console.error(`[orchestrator] Failed to update job ${msg.jobId} status to ${msg.status}:`, error.message);
  } else if (!data?.length) {
    console.warn(`[orchestrator] Job ${msg.jobId} status update to ${msg.status} matched 0 rows (already terminal or missing)`);
  } else {
    console.log(`[orchestrator] Job ${msg.jobId} status → ${msg.status}`);
  }
}

async function handleJobComplete(supabase: SupabaseClient, msg: JobComplete): Promise<void> {
  const { jobId, machineId, result, pr } = msg;

  // Fetch the job to check type, feature_id, context, etc.
  const { data: jobRow, error: fetchErr } = await supabase
    .from("jobs")
    .select("job_type, context, feature_id, company_id, project_id, branch, result, role")
    .eq("id", jobId)
    .single();

  if (fetchErr || !jobRow) {
    console.error(`[orchestrator] Could not fetch job ${jobId} for completion:`, fetchErr?.message);
    await releaseSlot(supabase, jobId, machineId);
    return;
  }

  // --- Handle review job completion (code-review results) ---
  if (jobRow.job_type === "review") {
    // Mark this review job as complete first
    await supabase
      .from("jobs")
      .update({
        status: "complete",
        result,
        pr_url: pr ?? null,
        completed_at: new Date().toISOString(),
        machine_id: null,
      })
      .eq("id", jobId);

    await releaseSlot(supabase, jobId, machineId);

    const ctx = JSON.parse(jobRow?.context ?? "{}");
    const originalJobId = ctx.originalJobId;
    if (!originalJobId) return;

    const hasP0 = result?.includes("P0") || result?.includes("severity: p0") || result?.includes("p0_found");
    if (hasP0) {
      // Re-queue original job with review feedback
      await supabase.from("jobs")
        .update({ status: "queued", result: null,
                  context: JSON.stringify({ ...ctx, review_feedback: result }) })
        .eq("id", originalJobId).eq("status", "reviewing");
      console.log(`[orchestrator] Job ${originalJobId} re-queued after P0 review finding`);
    } else {
      // Clean — mark original job complete
      await supabase.from("jobs")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", originalJobId).eq("status", "reviewing");
      console.log(`[orchestrator] Job ${originalJobId} complete after clean review`);

      // Check if all feature jobs are done → trigger feature verification
      if (jobRow.feature_id) {
        const { data: allDone } = await supabase
          .rpc("all_feature_jobs_complete", { p_feature_id: jobRow.feature_id });
        if (allDone) {
          await triggerFeatureVerification(supabase, jobRow.feature_id);
        }
      }
    }
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
    console.error(`[orchestrator] Failed to mark job ${jobId} complete:`, jobErr.message);
    await releaseSlot(supabase, jobId, machineId);
    return;
  }

  console.log(`[orchestrator] Job ${jobId} complete (machine ${machineId})`);

  // Release the slot on the machine.
  await releaseSlot(supabase, jobId, machineId);

  // DAG: check if this completion unblocks other queued jobs in the same feature.
  if (jobRow.feature_id) {
    await checkUnblockedJobs(supabase, jobRow.feature_id, jobId);
  }

  // Trigger reviewing step for feature-linked code jobs
  const reviewableTypes = ["code", "infra", "bug", "docs"];
  if (jobRow.feature_id && reviewableTypes.includes(jobRow.job_type ?? "")) {
    await supabase.from("jobs")
      .update({ status: "reviewing" })
      .eq("id", jobId);

    // Dispatch a code-review job
    await supabase.from("jobs").insert({
      company_id: jobRow.company_id,
      project_id: jobRow.project_id,
      feature_id: jobRow.feature_id,
      role: "code-reviewer",
      job_type: "review",
      complexity: "simple",
      slot_type: "claude_code",
      status: "queued",
      context: JSON.stringify({
        type: "job_code_review",
        originalJobId: jobId,
        jobBranch: jobRow.branch ?? "",
      }),
      branch: jobRow.branch,
    });

    console.log(`[orchestrator] Job ${jobId} → reviewing, code-review job queued`);
    return;
  }

  // Check if this is a verification job that completed.
  const contextStr = jobRow?.context ?? "{}";
  let ctx: { type?: string; target?: string } = {};
  try { ctx = JSON.parse(contextStr); } catch { /* ignore */ }

  // Active verification (verification-specialist): check result for pass/fail
  if (ctx.type === "active_feature_verification" && jobRow?.feature_id) {
    const passed = result?.startsWith("PASSED");
    if (passed) {
      console.log(`[orchestrator] Active verification PASSED for feature ${jobRow.feature_id} — initiating test deploy`);
      await initiateTestDeploy(supabase, jobRow.feature_id);
    } else {
      console.log(`[orchestrator] Active verification FAILED for feature ${jobRow.feature_id} — notifying CPO`);
      await notifyCPO(
        supabase,
        jobRow.company_id,
        `Active verification failed for feature ${jobRow.feature_id}: ${(result ?? "").slice(0, 200)}. Needs triage.`,
      );
    }
  }

  // Passive verification (reviewer): initiate test deploy on success
  if (ctx.type === "feature_verification" && jobRow?.feature_id) {
    await initiateTestDeploy(supabase, jobRow.feature_id);
  }

  // Handle breakdown job completion: feature transitions breakdown → building
  if (jobRow?.job_type === "breakdown" && jobRow?.feature_id) {
    await supabase
      .from("features")
      .update({ status: "building" })
      .eq("id", jobRow.feature_id)
      .eq("status", "breakdown");
    console.log(`[orchestrator] Breakdown complete — feature ${jobRow.feature_id} → building`);

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
      await supabase.from("features").update({ branch }).eq("id", jobRow.feature_id);
      console.log(`[orchestrator] Auto-generated branch for feature ${jobRow.feature_id}: ${branch}`);
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
      (j: { depends_on: string[] | null }) => !j.depends_on || j.depends_on.length === 0,
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
      try { return JSON.parse(jobRow.context ?? "{}"); } catch { return {}; }
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
        `Project "${projectName}" created with ${featureCount ?? 0} feature outlines. Ready for your review.`,
      );
    }
  }

  // Handle combine job completion: feature transitions combining → verifying
  if (jobRow?.job_type === "combine" && jobRow?.feature_id) {
    console.log(`[orchestrator] Combine complete — triggering feature verification for ${jobRow.feature_id}`);
    await triggerFeatureVerification(supabase, jobRow.feature_id);
  }

  // Handle prod deploy job completion: feature transitions deploying_to_prod → complete
  if (jobRow?.job_type === "deploy" && ctx.target === "prod" && jobRow?.feature_id) {
    await handleProdDeployComplete(supabase, jobRow.feature_id);
  }

}

async function handleJobFailed(supabase: SupabaseClient, msg: JobFailed): Promise<void> {
  const { jobId, machineId, error: errMsg, failureReason } = msg;

  // Decide recovery strategy based on failure reason.
  //   agent_crash      → re-queue immediately on a healthy machine
  //   ci_failure       → failed (needs triage)
  //   timeout          → failed (needs triage or extended timeout)
  //   unknown          → failed (log and review)
  const newStatus =
    failureReason === "agent_crash" ? "queued" : "failed";

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    machine_id: null,
  };

  if (newStatus !== "queued") {
    updatePayload.completed_at = new Date().toISOString();
  }

  const { error: jobErr } = await supabase
    .from("jobs")
    .update(updatePayload)
    .eq("id", jobId);

  if (jobErr) {
    console.error(`[orchestrator] Failed to update failed job ${jobId}:`, jobErr.message);
  } else {
    console.warn(
      `[orchestrator] Job ${jobId} failed (reason: ${failureReason}, error: ${errMsg}) → ${newStatus}`,
    );
  }

  // Release the slot regardless of re-queue decision.
  await releaseSlot(supabase, jobId, machineId);
}

// ---------------------------------------------------------------------------
// Blocked job flow — agent needs human input
// ---------------------------------------------------------------------------

async function handleJobBlocked(supabase: SupabaseClient, msg: JobBlocked): Promise<void> {
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
    console.log(`[orchestrator] Job ${jobId} blocked (no feature — no Slack post): ${reason}`);
    return;
  }

  const { data: feature } = await supabase.from("features")
    .select("slack_channel, slack_thread_ts")
    .eq("id", job.feature_id).single();

  if (!feature?.slack_channel || !feature?.slack_thread_ts) {
    console.log(`[orchestrator] Job ${jobId} blocked (no Slack thread): ${reason}`);
    return;
  }

  // 3. Post the question as a reply in the feature's Slack thread
  const slackToken = await getSlackBotToken(supabase, job.company_id);
  if (!slackToken) {
    console.log(`[orchestrator] Job ${jobId} blocked (no Slack bot token): ${reason}`);
    return;
  }

  const questionText = `*Agent needs input* (job \`${jobId.slice(0, 8)}\`)\n\n${reason}\n\nReply with your answer in this thread to unblock.`;
  const resultTs = await postSlackMessage(
    slackToken, feature.slack_channel,
    questionText, feature.slack_thread_ts,
  );

  // 4. Store the thread_ts of our question post so slack-events can find it
  if (resultTs) {
    await supabase.from("jobs")
      .update({ blocked_slack_thread_ts: resultTs })
      .eq("id", jobId);
  }

  console.log(`[orchestrator] Job ${jobId} blocked — question posted to Slack: ${reason}`);
}

async function handleJobUnblocked(supabase: SupabaseClient, jobId: string, answer: string): Promise<void> {
  // Append the answer to the job context and set back to executing
  const { data: job } = await supabase.from("jobs")
    .select("context").eq("id", jobId).single();

  let ctx: Record<string, unknown> = {};
  try { ctx = JSON.parse(job?.context ?? "{}"); } catch { /**/ }
  const updatedCtx = JSON.stringify({ ...ctx, unblocked_answer: answer });

  await supabase.from("jobs")
    .update({ status: "executing", blocked_reason: null, blocked_slack_thread_ts: null, context: updatedCtx })
    .eq("id", jobId).eq("status", "blocked");

  // Send JobUnblocked message to the machine running this job
  const { data: jobRow } = await supabase.from("jobs")
    .select("machine_id, machines(name)").eq("id", jobId).single();

  if (jobRow?.machine_id) {
    const machineName = (jobRow.machines as unknown as { name: string })?.name;
    if (machineName) {
      const unblockedMsg: JobUnblocked = {
        type: "job_unblocked",
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        answer,
      };
      const replyChannel = supabase.channel(`agent:${machineName}`);
      await new Promise<void>((resolve) => {
        replyChannel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await replyChannel.send({
              type: "broadcast", event: "job_unblocked",
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
    console.error(`[orchestrator] checkUnblockedJobs: failed to query candidates for feature ${featureId}:`, candErr.message);
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
      console.error(`[orchestrator] checkUnblockedJobs: failed to check deps for job ${candidate.id}:`, depErr.message);
      continue;
    }

    const allComplete = depJobs && depJobs.length === deps.length &&
      depJobs.every((d: { status: string }) => d.status === "complete" || d.status === "done");

    if (allComplete) {
      console.log(`[orchestrator] Job ${candidate.id} is now unblocked (all ${deps.length} dependencies complete)`);
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
    console.error(`[orchestrator] notifyCPO: failed to find CPO job for company ${companyId}:`, cpoErr.message);
    return;
  }

  if (!cpoJob || !cpoJob.machine_id) {
    console.warn(`[orchestrator] notifyCPO: no active CPO for company ${companyId} — notification lost: ${text}`);
    return;
  }

  // Get machine name for the Realtime channel
  const { data: machine, error: machErr } = await supabase
    .from("machines")
    .select("name")
    .eq("id", cpoJob.machine_id)
    .single();

  if (machErr || !machine) {
    console.error(`[orchestrator] notifyCPO: failed to fetch machine ${cpoJob.machine_id}:`, machErr?.message);
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

  const channel = supabase.channel(`agent:${machine.name}`);
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

  console.log(`[orchestrator] Notified CPO on machine ${machine.name}: ${text.slice(0, 100)}`);
}

export async function handleVerifyResult(supabase: SupabaseClient, msg: VerifyResult): Promise<void> {
  const { jobId, passed, testOutput } = msg;

  if (!passed) {
    // Job failed verification — re-queue for retry with verify context
    const { error } = await supabase
      .from("jobs")
      .update({
        status: "queued",
        verify_context: testOutput,
        machine_id: null,
      })
      .eq("id", jobId);
    if (error) {
      console.error(`[orchestrator] Failed to re-queue job ${jobId} after verify failure:`, error.message);
    } else {
      console.warn(`[orchestrator] Job ${jobId} failed verification — re-queued`);
    }

    // Notify CPO about verification failure
    const { data: failedJob } = await supabase
      .from("jobs")
      .select("feature_id, company_id")
      .eq("id", jobId)
      .single();
    if (failedJob?.feature_id && failedJob?.company_id) {
      const { data: feat } = await supabase
        .from("features")
        .select("title")
        .eq("id", failedJob.feature_id)
        .single();
      const title = feat?.title ?? failedJob.feature_id;
      await notifyCPO(
        supabase,
        failedJob.company_id,
        `Feature "${title}" failed verification: ${(testOutput ?? "").slice(0, 200)}. Needs triage.`,
      );
    }

    return;
  }

  // Job passed — mark as complete
  const { error: doneErr } = await supabase
    .from("jobs")
    .update({ status: "complete" })
    .eq("id", jobId);
  if (doneErr) {
    console.error(`[orchestrator] Failed to mark job ${jobId} complete:`, doneErr.message);
    return;
  }
  console.log(`[orchestrator] Job ${jobId} verified and complete`);

  // Look up the feature_id, context, and company_id for this job
  const { data: jobRow, error: jobErr } = await supabase
    .from("jobs")
    .select("feature_id, context, company_id")
    .eq("id", jobId)
    .single();
  if (jobErr) {
    console.error(`[orchestrator] Failed to fetch job ${jobId} after verify:`, jobErr.message);
    return;
  }

  if (!jobRow?.feature_id) {
    console.log(`[orchestrator] Job ${jobId} has no feature_id — skipping feature check`);
    return;
  }

  // DAG: check if this verified completion unblocks other queued jobs.
  await checkUnblockedJobs(supabase, jobRow.feature_id, jobId);

  // Check if all jobs for this feature are now done
  const { data: allDone, error: rpcErr } = await supabase
    .rpc("all_feature_jobs_complete", { p_feature_id: jobRow.feature_id });
  if (rpcErr) {
    console.error(`[orchestrator] all_feature_jobs_complete RPC failed:`, rpcErr.message);
    return;
  }

  if (allDone) {
    console.log(`[orchestrator] All jobs done for feature ${jobRow.feature_id} — triggering combining`);
    await triggerCombining(supabase, jobRow.feature_id);
  }
}

/**
 * Triggers the combining step: merges all completed job branches into the feature branch.
 * Called when all building jobs for a feature are done (verified individually).
 * Transitions feature from 'building' → 'combining' and creates a combine job.
 */
export async function triggerCombining(supabase: SupabaseClient, featureId: string): Promise<void> {
  // 1. Fetch all completed job branches for this feature (exclude breakdown, combine, verify jobs)
  const { data: jobs, error: jobsErr } = await supabase
    .from("jobs")
    .select("branch")
    .eq("feature_id", featureId)
    .eq("status", "complete")
    .neq("job_type", "breakdown")
    .neq("job_type", "combine")
    .neq("job_type", "verify");

  if (jobsErr) {
    console.error(`[orchestrator] triggerCombining: failed to fetch job branches for feature ${featureId}:`, jobsErr.message);
    return;
  }

  // 2. Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id, branch")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(`[orchestrator] triggerCombining: feature ${featureId} not found`);
    return;
  }

  // 3. Transition feature to combining (CAS: from building)
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "combining" })
    .eq("id", featureId)
    .eq("status", "building")
    .select("id");

  if (updateErr) {
    console.error(`[orchestrator] triggerCombining: failed to set feature ${featureId} to combining:`, updateErr.message);
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(`[orchestrator] triggerCombining: feature ${featureId} not in building — skipping`);
    return;
  }

  // 4. Insert combine job
  const jobBranches = (jobs ?? []).map((j: { branch: string | null }) => j.branch).filter(Boolean);
  const combineContext = JSON.stringify({
    type: "combine",
    featureId,
    featureBranch: feature.branch,
    jobBranches,
  });

  const { data: combineJob, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
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
    console.error(`[orchestrator] triggerCombining: failed to insert combine job for feature ${featureId}:`, insertErr?.message);
    return;
  }

  console.log(`[orchestrator] Created combine job ${combineJob.id} for feature ${featureId} with ${jobBranches.length} branches`);

  // Generate title asynchronously
  generateTitle(combineContext).then((title) => {
    if (title) {
      supabase.from("jobs").update({ title }).eq("id", combineJob.id).then(() => {});
    }
  }).catch(() => {});
}

export async function triggerFeatureVerification(supabase: SupabaseClient, featureId: string): Promise<void> {
  // Mark feature as verifying — CAS guard: only if not already in a late-stage status.
  // This prevents duplicate verification jobs from concurrent VerifyResult messages
  // and blocks regression of features already past the verifying stage.
  const { data: updated, error: featureErr } = await supabase
    .from("features")
    .update({ status: "verifying" })
    .eq("id", featureId)
    .not("status", "in", '("verifying","deploying_to_test","ready_to_test","deploying_to_prod","complete","cancelled")')
    .select("id");

  if (featureErr) {
    console.error(`[orchestrator] Failed to set feature ${featureId} to verifying:`, featureErr.message);
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(`[orchestrator] Feature ${featureId} already in late-stage status — skipping verification trigger`);
    return;
  }

  // Fetch feature details for the verification job
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("branch, project_id, company_id, acceptance_tests, verification_type")
    .eq("id", featureId)
    .single();
  if (fetchErr || !feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId}:`, fetchErr?.message);
    return;
  }

  const isActive = feature.verification_type === "active";

  if (isActive) {
    // Active verification: dispatch a verification-specialist contractor.
    // Gets a normal StartJob (full workspace with MCP tools + verify-feature skill).
    const verifyContext = JSON.stringify({
      type: "active_feature_verification",
      feature_id: featureId,
      acceptanceTests: feature.acceptance_tests ?? "",
    });
    const { data: insertedRows, error: insertErr } = await supabase
      .from("jobs")
      .insert({
        company_id: feature.company_id,
        project_id: feature.project_id,
        feature_id: featureId,
        role: "verification-specialist",
        job_type: "verify",
        complexity: "medium",
        slot_type: "claude_code",
        status: "queued",
        context: verifyContext,
      })
      .select("id");

    if (insertErr) {
      console.error(`[orchestrator] Failed to insert active verification job for ${featureId}:`, insertErr.message);
    } else {
      console.log(`[orchestrator] Queued active verification (verification-specialist) for feature ${featureId}`);
      const jobId = insertedRows?.[0]?.id;
      if (jobId) {
        generateTitle(verifyContext).then((title) => {
          if (title) {
            supabase.from("jobs").update({ title }).eq("id", jobId).then(() => {});
          }
        }).catch(() => {});
      }
    }
  } else {
    // Passive verification: existing VerifyJob path (code review + rebase + tests).
    const verifyContext = JSON.stringify({
      type: "feature_verification",
      featureBranch: feature.branch,
      acceptanceTests: feature.acceptance_tests ?? "",
    });
    const { data: insertedRows, error: insertErr } = await supabase
      .from("jobs")
      .insert({
        company_id: feature.company_id,
        project_id: feature.project_id,
        feature_id: featureId,
        role: "reviewer",
        job_type: "verify",
        complexity: "simple",
        slot_type: "claude_code",
        status: "queued",
        context: verifyContext,
        branch: feature.branch,
      })
      .select("id");

    if (insertErr) {
      console.error(`[orchestrator] Failed to insert feature verification job for ${featureId}:`, insertErr.message);
    } else {
      console.log(`[orchestrator] Queued passive verification (reviewer) for feature ${featureId} branch ${feature.branch}`);
      const jobId = insertedRows?.[0]?.id;
      if (jobId) {
        generateTitle(verifyContext).then((title) => {
          if (title) {
            supabase.from("jobs").update({ title }).eq("id", jobId).then(() => {});
          }
        }).catch(() => {});
      }
    }
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
async function initiateTestDeploy(supabase: SupabaseClient, featureId: string): Promise<void> {
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("project_id, company_id, branch, human_checklist")
    .eq("id", featureId)
    .single();
  if (fetchErr || !feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId}:`, fetchErr?.message);
    return;
  }

  // Check if another feature is already deploying or in test for this project
  const { data: deploying, error: deployingErr } = await supabase
    .from("features")
    .select("id")
    .eq("project_id", feature.project_id)
    .in("status", ["deploying_to_test", "ready_to_test"])
    .limit(1);

  if (deployingErr) {
    console.error(`[orchestrator] Failed to check deploy queue:`, deployingErr.message);
    return;
  }

  if (deploying && deploying.length > 0) {
    // Another feature occupies the test env — this feature waits in "verifying"
    console.log(`[orchestrator] Test env busy — feature ${featureId} queued (stays in verifying)`);
    return;
  }

  // Test env is free — set feature to deploying_to_test
  const { error: updateErr } = await supabase
    .from("features")
    .update({ status: "deploying_to_test" })
    .eq("id", featureId);

  if (updateErr) {
    console.error(`[orchestrator] Failed to set feature ${featureId} to deploying_to_test:`, updateErr.message);
    return;
  }

  console.log(`[orchestrator] Feature ${featureId} → deploying_to_test — sending DeployToTest`);

  // Pick an online machine to handle the deploy
  const { data: machines, error: machErr } = await supabase
    .from("machines")
    .select("id, name")
    .eq("company_id", feature.company_id)
    .eq("status", "online")
    .limit(1);

  if (machErr || !machines || machines.length === 0) {
    console.error(`[orchestrator] No online machine to handle DeployToTest for feature ${featureId}`);
    return;
  }

  const targetMachine = machines[0];

  const { data: project } = await supabase
    .from("projects")
    .select("repo_url")
    .eq("id", feature.project_id)
    .single();

  const deployMsg: DeployToTest = {
    type: "deploy_to_test",
    protocolVersion: PROTOCOL_VERSION,
    featureId,
    jobType: "feature",
    featureBranch: feature.branch,
    projectId: feature.project_id,
    repoPath: project?.repo_url ?? undefined,
  };

  const channel = supabase.channel(`agent:${targetMachine.name}`);
  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({ type: "broadcast", event: "deploy_to_test", payload: deployMsg });
        await channel.unsubscribe();
        resolve();
      }
    });
  });

  console.log(`[orchestrator] DeployToTest sent to machine ${targetMachine.name} for feature ${featureId}`);
}

/**
 * Sends a teardown command to the machine that deployed the test environment.
 * Fire-and-forget — callers should .catch() and not await.
 */
async function runTeardown(
  supabase: SupabaseClient,
  featureId: string,
  machineId: string,
): Promise<void> {
  if (!machineId) {
    console.warn(`[orchestrator] No machineId for feature ${featureId} — skipping teardown`);
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
  const channel = supabase.channel(`agent:${machineId}`);
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

  console.log(`[orchestrator] Teardown sent to machine ${machineId} for feature ${featureId}`);
}

export async function handleFeatureApproved(
  supabase: SupabaseClient,
  msg: FeatureApproved,
): Promise<void> {
  const { featureId } = msg;

  // 1. Fetch feature for project/company context
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("project_id, company_id, branch")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId}:`, fetchErr?.message);
    return;
  }

  // 2. Mark feature as deploying_to_prod (CAS: only if currently in ready_to_test)
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "deploying_to_prod" })
    .eq("id", featureId)
    .eq("status", "ready_to_test")
    .select("id");

  if (updateErr) {
    console.error(`[orchestrator] Failed to mark feature ${featureId} deploying_to_prod:`, updateErr.message);
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(`[orchestrator] Feature ${featureId} not in ready_to_test — skipping approval`);
    return;
  }

  // 3. Mark all non-cancelled jobs for this feature as complete
  const { error: jobsErr } = await supabase
    .from("jobs")
    .update({ status: "complete" })
    .eq("feature_id", featureId)
    .not("status", "eq", "cancelled");

  if (jobsErr) {
    console.error(`[orchestrator] Failed to mark jobs complete for feature ${featureId}:`, jobsErr.message);
  }

  // 4. Log approval event
  await supabase.from("events").insert({
    company_id: feature.company_id,
    event_type: "feature_status_changed",
    detail: { featureId, from: "ready_to_test", to: "deploying_to_prod", reason: "human_approved" },
  });

  console.log(`[orchestrator] Feature ${featureId} approved — deploying to prod`);

  // 5. Dispatch deployer job for production
  await supabase.from("jobs").insert({
    company_id: feature.company_id,
    project_id: feature.project_id,
    feature_id: featureId,
    role: "deployer",
    job_type: "deploy",
    complexity: "simple",
    slot_type: "claude_code",
    status: "queued",
    context: JSON.stringify({
      type: "deploy",
      target: "prod",
      featureId,
      featureBranch: feature.branch,
      projectId: feature.project_id,
      approved: true,
    }),
    branch: feature.branch,
  });

  console.log(`[orchestrator] Queued prod deploy job for feature ${featureId}`);
}

/**
 * Handles completion of a production deploy job.
 * Transitions feature from deploying_to_prod → complete.
 */
async function handleProdDeployComplete(supabase: SupabaseClient, featureId: string): Promise<void> {
  // 1. Fetch feature for project/company context
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("project_id, company_id, testing_machine_id")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(`[orchestrator] handleProdDeployComplete: feature ${featureId} not found`);
    return;
  }

  // 2. Set feature to complete (CAS: from deploying_to_prod)
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "complete" })
    .eq("id", featureId)
    .eq("status", "deploying_to_prod")
    .select("id");

  if (updateErr) {
    console.error(`[orchestrator] Failed to mark feature ${featureId} complete:`, updateErr.message);
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(`[orchestrator] Feature ${featureId} not in deploying_to_prod — skipping`);
    return;
  }

  // 3. Log event
  await supabase.from("events").insert({
    company_id: feature.company_id,
    event_type: "feature_status_changed",
    detail: { featureId, from: "deploying_to_prod", to: "complete" },
  });

  console.log(`[orchestrator] Feature ${featureId} → complete (prod deploy done)`);

  // 4. Drain the testing queue — promote next verifying feature
  const { data: nextFeature, error: nextErr } = await supabase
    .from("features")
    .select("id")
    .eq("project_id", feature.project_id)
    .eq("status", "verifying")
    .order("updated_at", { ascending: true })
    .limit(1);

  if (nextErr) {
    console.error(`[orchestrator] Failed to check queue after prod deploy:`, nextErr.message);
    return;
  }

  if (nextFeature && nextFeature.length > 0) {
    console.log(`[orchestrator] Promoting queued feature ${nextFeature[0].id} to deploying_to_test`);
    await initiateTestDeploy(supabase, nextFeature[0].id);
  }

  // 5. Fire-and-forget teardown of the test environment
  if (feature.testing_machine_id) {
    runTeardown(supabase, featureId, feature.testing_machine_id).catch(err => {
      console.error(`[orchestrator] teardown failed after prod deploy, feature ${featureId}:`, err);
    });
  }
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
    console.log(`[orchestrator] Feature ${featureId} — small rejection, fix agent handles in-thread`);

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
        detail: { featureId, feedback, severity, action: "fix_agent_in_thread" },
      });
    }
    return;
  }

  // severity === "big" — feature goes back to building
  console.log(`[orchestrator] Feature ${featureId} — big rejection, returning to building`);

  // 1. Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id, branch, spec")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId}:`, fetchErr?.message);
    return;
  }

  // 2. Reset feature to building (CAS: only if currently in ready_to_test)
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "building" })
    .eq("id", featureId)
    .eq("status", "ready_to_test")
    .select("id");

  if (updateErr) {
    console.error(`[orchestrator] Failed to reset feature ${featureId} to building:`, updateErr.message);
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(`[orchestrator] Feature ${featureId} not in ready_to_test — skipping rejection`);
    return;
  }

  // 3. Log rejection event
  await supabase.from("events").insert({
    company_id: feature.company_id,
    event_type: "feature_status_changed",
    detail: { featureId, from: "ready_to_test", to: "building", reason: "human_rejected", feedback, severity },
  });

  // 4. Queue a fix job with the rejection feedback
  const fixContext = JSON.stringify({
    type: "rejection_fix",
    feedback,
    featureBranch: feature.branch,
    originalSpec: feature.spec ?? "",
  });
  const { data: insertedRows, error: insertErr } = await supabase.from("jobs").insert({
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
    console.error(`[orchestrator] Failed to queue fix job for feature ${featureId}:`, insertErr.message);
  } else {
    console.log(`[orchestrator] Queued fix job for rejected feature ${featureId}`);
    const jobId = insertedRows?.[0]?.id;
    if (jobId) {
      generateTitle(fixContext).then((title) => {
        if (title) {
          supabase.from("jobs").update({ title }).eq("id", jobId).then(() => {});
        }
      }).catch(() => {});
    }
  }

  // 5. Free up the test env — check queue and promote next feature
  const { data: nextFeature, error: nextErr } = await supabase
    .from("features")
    .select("id")
    .eq("project_id", feature.project_id)
    .eq("status", "verifying")
    .order("updated_at", { ascending: true })
    .limit(1);

  if (!nextErr && nextFeature && nextFeature.length > 0) {
    await initiateTestDeploy(supabase, nextFeature[0].id);
  }

  // 6. Fire-and-forget teardown of the test environment
  runTeardown(supabase, featureId, machineId).catch(err => {
    console.error(`[orchestrator] teardown failed after rejection, feature ${featureId}:`, err);
  });
}

// ---------------------------------------------------------------------------
// Feature → Breakdown pipeline (Tech Lead)
// ---------------------------------------------------------------------------

/**
 * Creates a breakdown job for a ready_for_breakdown feature.
 *
 * "ready_for_breakdown" means CPO pre-approval (feature spec agreed for development),
 * NOT human post-testing approval (that's handleFeatureApproved: ready_to_test→deploying_to_prod).
 *
 * Idempotent: skips if a non-terminal breakdown job already exists for this feature.
 * On success, transitions the feature from 'ready_for_breakdown' → 'breakdown'.
 */
export async function triggerBreakdown(supabase: SupabaseClient, featureId: string): Promise<void> {
  // 1. Fetch feature for company/project context
  const { data: feature, error } = await supabase
    .from("features")
    .select("company_id, project_id, title, spec, acceptance_tests, branch")
    .eq("id", featureId)
    .single();

  if (error || !feature) {
    console.error(`[orchestrator] triggerBreakdown: feature ${featureId} not found`);
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
    console.log(`[orchestrator] triggerBreakdown: auto-generated branch for feature ${featureId}: ${branch}`);
  }

  // 2. Check no active breakdown job already exists (idempotency)
  const { data: existing } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("feature_id", featureId)
    .eq("job_type", "breakdown")
    .not("status", "in", '("done","failed","cancelled")')
    .maybeSingle();

  if (existing) {
    console.log(`[orchestrator] triggerBreakdown: breakdown job ${existing.id} already exists for feature ${featureId}, skipping`);
    return;
  }

  // 3. Insert breakdown job
  const { data: job, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
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
    console.error(`[orchestrator] Failed to insert breakdown job for feature ${featureId}:`, insertErr?.message);
    return;
  }

  // 4. Update feature status to 'breakdown' (breakdown job is in progress)
  await supabase
    .from("features")
    .update({ status: "breakdown" })
    .eq("id", featureId)
    .eq("status", "ready_for_breakdown"); // CAS guard

  console.log(`[orchestrator] Created breakdown job ${job.id} for feature ${featureId}`);
}

// processReadyForBreakdown: polls for features that the CPO has approved for development.
// status='ready_for_breakdown' = "CPO agreed to build this feature — breakdown expert should break it into jobs".
// DISTINCT from handleFeatureApproved which handles human testing approval (ready_to_test→deploying_to_prod).
async function processReadyForBreakdown(supabase: SupabaseClient): Promise<void> {
  const { data: features, error } = await supabase
    .from("features")
    .select("id")
    .eq("status", "ready_for_breakdown")
    .limit(50);

  if (error) {
    console.error("[orchestrator] Error querying ready_for_breakdown features:", error.message);
    return;
  }

  if (!features || features.length === 0) return;

  console.log(`[orchestrator] ${features.length} ready_for_breakdown feature(s) to process.`);

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
 * Realtime window may not catch the job_complete broadcast.
 *
 * Handles two transitions:
 *   breakdown → building: all breakdown jobs for the feature are complete
 *   building → combining: all implementation jobs are complete
 */
async function processFeatureLifecycle(supabase: SupabaseClient): Promise<void> {
  // --- 1. breakdown → building ---
  // Features stuck in 'breakdown' where the breakdown job is complete
  const { data: breakdownFeatures, error: bErr } = await supabase
    .from("features")
    .select("id, company_id")
    .eq("status", "breakdown")
    .limit(50);

  if (bErr) {
    console.error("[orchestrator] processFeatureLifecycle: error querying breakdown features:", bErr.message);
  }

  for (const feature of breakdownFeatures ?? []) {
    // Check if breakdown job(s) for this feature are all complete or failed
    const { data: pendingBreakdown } = await supabase
      .from("jobs")
      .select("id")
      .eq("feature_id", feature.id)
      .eq("job_type", "breakdown")
      .not("status", "in", '("complete","failed")')
      .limit(1);

    if (!pendingBreakdown || pendingBreakdown.length === 0) {
      // All breakdown jobs done — transition to building
      const { data: updated } = await supabase
        .from("features")
        .update({ status: "building" })
        .eq("id", feature.id)
        .eq("status", "breakdown")
        .select("id");

      if (updated && updated.length > 0) {
        console.log(`[orchestrator] processFeatureLifecycle: feature ${feature.id} breakdown → building`);

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
          await supabase.from("features").update({ branch }).eq("id", feature.id);
          console.log(`[orchestrator] Auto-generated branch for feature ${feature.id}: ${branch}`);
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
          (j: { depends_on: string[] | null }) => !j.depends_on || j.depends_on.length === 0,
        ).length ?? 0;
        const { data: feat } = await supabase
          .from("features")
          .select("title")
          .eq("id", feature.id)
          .single();
        await notifyCPO(
          supabase,
          feature.company_id,
          `Feature "${feat?.title ?? feature.id}" broken into ${totalJobs} jobs. ${dispatchable} immediately dispatchable.`,
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
    console.error("[orchestrator] processFeatureLifecycle: error querying building features:", buildErr.message);
  }

  for (const feature of (buildingFeatures ?? []) as { id: string }[]) {
    const { data: allDone } = await supabase
      .rpc("all_feature_jobs_complete", { p_feature_id: feature.id });

    if (allDone) {
      console.log(`[orchestrator] processFeatureLifecycle: all jobs done for feature ${feature.id} — triggering combining`);
      await triggerCombining(supabase, feature.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Deploy result handlers
// ---------------------------------------------------------------------------

/**
 * Handles a successful test environment deployment from a local agent.
 * Stores the test URL on the feature, opens a Slack thread with the URL.
 */
export async function handleDeployComplete(
  supabase: SupabaseClient,
  msg: DeployComplete,
): Promise<void> {
  const { featureId, testUrl, ephemeral } = msg;

  // 1. Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id, title, human_checklist, spec")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId} for deploy_complete:`, fetchErr?.message);
    return;
  }

  // 2. Store test URL, timestamp, machine affinity, and transition to ready_to_test
  const { error: updateErr } = await supabase
    .from("features")
    .update({
      test_url: testUrl,
      test_started_at: new Date().toISOString(),
      testing_machine_id: msg.machineId,
      status: "ready_to_test",
    })
    .eq("id", featureId)
    .eq("status", "deploying_to_test"); // CAS guard

  if (updateErr) {
    console.error(`[orchestrator] Failed to update feature ${featureId} with test URL:`, updateErr.message);
  }

  // 3. Send Slack notification with test URL
  const slackChannel = await getDefaultSlackChannel(supabase, feature.company_id);
  if (slackChannel) {
    const botToken = await getSlackBotToken(supabase, feature.company_id);
    if (botToken) {
      const checklist = parseChecklist(feature.human_checklist);
      const checklistText = checklist.length > 0
        ? "\n\n*Checklist:*\n" + checklist.map((item: string) => `- [ ] ${item}`).join("\n")
        : "";
      const envType = ephemeral ? " (ephemeral)" : " (persistent)";

      const text = [
        `*Feature ready for testing: "${feature.title ?? featureId}"*`,
        `Deployed to: ${testUrl}${envType}`,
        checklistText,
        "",
        'Reply *"approve"* or *"ship it"* to merge, or *"reject"* with feedback to fix.',
      ].join("\n");

      const threadTs = await postSlackMessage(botToken, slackChannel, text);

      // Store the Slack channel and thread TS on the feature for the testing loop
      if (threadTs) {
        await supabase
          .from("features")
          .update({ slack_channel: slackChannel, slack_thread_ts: threadTs })
          .eq("id", featureId);
      }
    }
  }

  // 4. Log event
  await supabase.from("events").insert({
    company_id: feature.company_id,
    event_type: "feature_status_changed",
    detail: { featureId, from: "deploying_to_test", to: "ready_to_test", testUrl, ephemeral },
  });

  console.log(`[orchestrator] Deploy complete for feature ${featureId}: ${testUrl}`);
}

/**
 * Handles a failed test environment deployment from a local agent.
 * Reverts the feature to verifying status and logs the error.
 */
export async function handleDeployFailed(
  supabase: SupabaseClient,
  msg: DeployFailed,
): Promise<void> {
  const { featureId, error: errMsg } = msg;

  const { data: feature } = await supabase
    .from("features")
    .select("company_id")
    .eq("id", featureId)
    .single();

  // Revert feature from deploying_to_test → verifying so it can be retried
  const { error: updateErr } = await supabase
    .from("features")
    .update({ status: "verifying" })
    .eq("id", featureId)
    .eq("status", "deploying_to_test");

  if (updateErr) {
    console.error(`[orchestrator] Failed to revert feature ${featureId} to verifying:`, updateErr.message);
  }

  // Notify via Slack
  if (feature) {
    const slackChannel = await getDefaultSlackChannel(supabase, feature.company_id);
    const botToken = await getSlackBotToken(supabase, feature.company_id);
    if (slackChannel && botToken) {
      await postSlackMessage(
        botToken,
        slackChannel,
        `Deploy failed for feature ${featureId}: ${errMsg}`,
      );
    }
  }

  console.warn(`[orchestrator] Deploy failed for feature ${featureId}: ${errMsg}`);
}

/**
 * Handles a missing zazig.test.yaml in the repository.
 * Posts a Slack message explaining how to configure test deploys.
 */
export async function handleDeployNeedsConfig(
  supabase: SupabaseClient,
  msg: DeployNeedsConfig,
): Promise<void> {
  const { featureId } = msg;

  const { data: feature } = await supabase
    .from("features")
    .select("company_id")
    .eq("id", featureId)
    .single();

  if (!feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId} for deploy_needs_config`);
    return;
  }

  // Revert feature from deploying_to_test → verifying
  await supabase
    .from("features")
    .update({ status: "verifying" })
    .eq("id", featureId)
    .eq("status", "deploying_to_test");

  const slackChannel = await getDefaultSlackChannel(supabase, feature.company_id);
  const botToken = await getSlackBotToken(supabase, feature.company_id);
  if (slackChannel && botToken) {
    const text = [
      `Feature ${featureId} is ready for testing but no \`zazig.test.yaml\` was found in the repo root.`,
      "",
      "Create one with this structure:",
      "```",
      "name: my-project",
      "type: ephemeral",
      "deploy:",
      "  provider: vercel  # or 'custom'",
      "  project_id: prj_xxx  # vercel project ID",
      "healthcheck:",
      "  path: /api/health",
      "  timeout: 120",
      "```",
      "",
      "Then re-trigger verification to retry.",
    ].join("\n");

    await postSlackMessage(botToken, slackChannel, text);
  }

  console.log(`[orchestrator] Deploy needs config for feature ${featureId} — notified via Slack`);
}

// ---------------------------------------------------------------------------
// Slack helpers (orchestrator-side)
// ---------------------------------------------------------------------------

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

    const data = await response.json() as { ok?: boolean; ts?: string; error?: string };
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
async function releaseSlot(supabase: SupabaseClient, jobId: string, machineId: string): Promise<void> {
  // Look up the job's slot_type.
  const { data: jobRow, error: jobErr } = await supabase
    .from("jobs")
    .select("slot_type")
    .eq("id", jobId)
    .single();

  if (jobErr || !jobRow) {
    console.error(`[orchestrator] Could not fetch slot_type for job ${jobId}:`, jobErr?.message);
    return;
  }

  const slotType: SlotType = (jobRow.slot_type as SlotType) ?? "claude_code";
  const slotColumn = slotType === "claude_code" ? "slots_claude_code" : "slots_codex";

  // TODO P0: This increment is a non-atomic read-modify-write. Under concurrent
  // releases for the same machine (e.g. two jobs finishing simultaneously), both
  // invocations read the same current value and each write N+1 instead of N+2.
  // Fix with a stored procedure:
  //   UPDATE machines SET slots_X = slots_X + 1 WHERE id = $1
  // The correction path until then: the machine's next heartbeat overwrites the
  // slot counts with ground-truth values (every ~30 s), bounding the error window.
  //
  // Fetch current counts so we can compute the absolute new value.
  const { data: machine, error: machineErr } = await supabase
    .from("machines")
    .select("id, slots_claude_code, slots_codex")
    .eq("id", machineId)
    .single();

  if (machineErr || !machine) {
    console.error(`[orchestrator] Could not fetch machine ${machineId} to release slot:`, machineErr?.message);
    return;
  }

  const currentSlots = slotType === "claude_code"
    ? (machine as MachineRow).slots_claude_code
    : (machine as MachineRow).slots_codex;

  const { error: updateErr } = await supabase
    .from("machines")
    .update({ [slotColumn]: currentSlots + 1 })
    .eq("id", machineId);

  if (updateErr) {
    console.error(`[orchestrator] Failed to release slot on machine ${machineId}:`, updateErr.message);
  } else {
    console.log(`[orchestrator] Released ${slotType} slot on machine ${machineId}`);
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
      .on("broadcast", { event: "*" }, async ({ payload }: { payload: unknown }) => {
        const msg = payload as AgentMessage;

        if (isHeartbeat(msg)) {
          await handleHeartbeat(supabase, msg);
        } else if (isJobAck(msg)) {
          handleJobAck(supabase, msg);
        } else if (isJobStatusMessage(msg)) {
          await handleJobStatus(supabase, msg);
        } else if (isJobComplete(msg)) {
          await handleJobComplete(supabase, msg);
        } else if (isJobFailed(msg)) {
          await handleJobFailed(supabase, msg);
        } else if (isVerifyResult(msg)) {
          await handleVerifyResult(supabase, msg);
        } else if (isFeatureApproved(msg)) {
          await handleFeatureApproved(supabase, msg);
        } else if (isFeatureRejected(msg)) {
          await handleFeatureRejected(supabase, msg);
        } else if (isDeployComplete(msg)) {
          await handleDeployComplete(supabase, msg);
        } else if (isDeployFailed(msg)) {
          await handleDeployFailed(supabase, msg);
        } else if (isDeployNeedsConfig(msg)) {
          await handleDeployNeedsConfig(supabase, msg);
        } else if (isJobBlocked(msg)) {
          await handleJobBlocked(supabase, msg);
        } else if (isStopAck(msg)) {
          console.log(`[orchestrator] StopAck received — job ${(msg as { jobId: string }).jobId}`);
        } else {
          console.warn("[orchestrator] Unknown or invalid agent message received:", JSON.stringify(payload));
        }
      })
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[orchestrator] Realtime channel error on orchestrator:commands");
          clearTimeout(timer);
          resolve();
        }
      });
  });
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

    // 2. Reap dead machines and re-queue their jobs.
    await reapDeadMachines(supabase);

    // 3. Process ready_for_breakdown features → create breakdown jobs.
    await processReadyForBreakdown(supabase);

    // 4. Catch missed feature lifecycle transitions (breakdown→building, building→combining).
    //    The executor writes job status directly to DB — if the Realtime broadcast was
    //    missed during the 4s listen window, these transitions would never fire.
    await processFeatureLifecycle(supabase);

    // 5. Dispatch queued jobs to available machines.
    await dispatchQueuedJobs(supabase);
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
