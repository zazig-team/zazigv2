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
} from "@zazigv2/shared";
import type {
  StartJob,
  SlotType,
  AgentMessage,
  Heartbeat,
  JobStatusMessage,
  JobComplete,
  JobFailed,
  VerifyResult,
  DeployToTest,
} from "@zazigv2/shared";

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
// Supabase DB row shapes (subset of columns we actually read/write)
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  company_id: string;
  feature_id: string | null;
  role: string;
  job_type: string;
  complexity: string | null;
  slot_type: SlotType | null;
  model: string | null;
  machine_id: string | null;
  status: string;
  context: string | null;
  branch: string | null;
  created_at: string;
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
      .in("status", ["dispatched", "executing"]);

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
      "id, company_id, role, job_type, complexity, slot_type, model, machine_id, status, context, branch, created_at",
    )
    .in("status", ["queued", "verify_failed"])
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
    // Load routing table (cached after first call within this invocation).
    const routing = await loadRouting(supabase, job.company_id);

    // Derive model + slot type from complexity (with optional model override).
    let { model, slotType } = resolveModelAndSlot(routing, job.complexity, job.model, job.id);

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
      .in("status", ["queued", "verify_failed"]); // optimistic lock

    if (updateJobErr) {
      console.error(`[orchestrator] Failed to dispatch job ${job.id}:`, updateJobErr.message);
      // The slot was already decremented above; it will self-correct on next heartbeat.
      continue;
    }

    // Update in-memory cache so subsequent jobs in this pass see the reduced capacity.
    const slotUpdate = { [slotColumn]: currentSlots - 1 };
    Object.assign(candidate, slotUpdate);

    // Build the StartJob message.
    const startJobMsg: StartJob = {
      type: "start_job",
      protocolVersion: PROTOCOL_VERSION,
      jobId: job.id,
      cardId: job.id,
      cardType: (job.job_type as StartJob["cardType"]) ?? "code",
      complexity: (job.complexity as StartJob["complexity"]) ?? "medium",
      slotType,
      model,
      context: job.context ?? undefined,
      // Include role for role-based jobs (persistent agents, specialized reviewers)
      ...(job.role ? { role: job.role } : {}),
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
    .in("status", ["dispatched", "executing", "reviewing"]) // only update non-terminal jobs
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

  // Fetch the job to check if it's a persistent agent (auto-requeue on completion)
  // and whether it's a feature_verification job (triggers promoteToTesting).
  const { data: jobRow, error: fetchErr } = await supabase
    .from("jobs")
    .select("job_type, context, feature_id")
    .eq("id", jobId)
    .single();

  if (fetchErr || !jobRow) {
    console.error(`[orchestrator] Could not fetch job ${jobId} for completion:`, fetchErr?.message);
    await releaseSlot(supabase, jobId, machineId);
    return;
  }

  const isPersistent = jobRow.job_type === "persistent_agent";

  if (isPersistent) {
    // Persistent jobs auto-requeue: reset to queued, clear machine assignment,
    // store last result for observability but don't set completed_at.
    const { error: requeueErr } = await supabase
      .from("jobs")
      .update({
        status: "queued",
        result,
        pr_url: pr ?? null,
        machine_id: null,
        started_at: null,
      })
      .eq("id", jobId);

    if (requeueErr) {
      console.error(`[orchestrator] Failed to re-queue persistent job ${jobId}:`, requeueErr.message);
      return;
    }

    console.log(`[orchestrator] Persistent job ${jobId} re-queued (was on machine ${machineId})`);
  } else {
    // Normal jobs: mark complete.
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
      return;
    }

    console.log(`[orchestrator] Job ${jobId} complete (machine ${machineId})`);
  }

  // Release the slot on the machine (both persistent and normal jobs).
  await releaseSlot(supabase, jobId, machineId);

  // Check if this is a feature_verification job that completed successfully.
  // If so, promote the feature to the test environment.
  const contextStr = jobRow?.context ?? "{}";
  let ctx: { type?: string } = {};
  try { ctx = JSON.parse(contextStr); } catch { /* ignore */ }
  if (ctx.type === "feature_verification" && jobRow?.feature_id) {
    await promoteToTesting(supabase, jobRow.feature_id);
  }
}

async function handleJobFailed(supabase: SupabaseClient, msg: JobFailed): Promise<void> {
  const { jobId, machineId, error: errMsg, failureReason } = msg;

  // Fetch job to check if persistent (persistent jobs always re-queue on failure).
  const { data: failedJobRow, error: fetchErr } = await supabase
    .from("jobs")
    .select("job_type")
    .eq("id", jobId)
    .single();

  if (fetchErr) {
    console.error(`[orchestrator] Could not fetch job ${jobId} type:`, fetchErr.message);
  }
  const isPersistent = fetchErr ? true : failedJobRow?.job_type === "persistent_agent";

  // Decide recovery strategy based on failure reason.
  //   persistent_agent → always re-queue (must stay alive)
  //   agent_crash      → re-queue immediately on a healthy machine
  //   ci_failure       → waiting_on_human (needs triage)
  //   timeout          → waiting_on_human (needs triage or extended timeout)
  //   unknown          → waiting_on_human (log and review)
  const newStatus =
    isPersistent || failureReason === "agent_crash" ? "queued" : "failed";

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    machine_id: null,
  };

  if (newStatus !== "queued") {
    updatePayload.completed_at = new Date().toISOString();
  } else if (isPersistent) {
    updatePayload.started_at = null;
  }

  const { error: jobErr } = await supabase
    .from("jobs")
    .update(updatePayload)
    .eq("id", jobId);

  if (jobErr) {
    console.error(`[orchestrator] Failed to update failed job ${jobId}:`, jobErr.message);
  } else {
    const suffix = isPersistent ? " (persistent — auto-requeued)" : "";
    console.warn(
      `[orchestrator] Job ${jobId} failed (reason: ${failureReason}, error: ${errMsg}) → ${newStatus}${suffix}`,
    );
  }

  // Release the slot regardless of re-queue decision.
  await releaseSlot(supabase, jobId, machineId);
}

export async function handleVerifyResult(supabase: SupabaseClient, msg: VerifyResult): Promise<void> {
  const { jobId, passed, testOutput } = msg;

  if (!passed) {
    // Job failed verification — mark as verify_failed for requeue
    const { error } = await supabase
      .from("jobs")
      .update({
        status: "verify_failed",
        verify_context: testOutput,
        machine_id: null,
      })
      .eq("id", jobId);
    if (error) {
      console.error(`[orchestrator] Failed to mark job ${jobId} verify_failed:`, error.message);
    } else {
      console.warn(`[orchestrator] Job ${jobId} failed verification — marked verify_failed`);
    }
    return;
  }

  // Job passed — mark as done
  const { error: doneErr } = await supabase
    .from("jobs")
    .update({ status: "done" })
    .eq("id", jobId);
  if (doneErr) {
    console.error(`[orchestrator] Failed to mark job ${jobId} done:`, doneErr.message);
    return;
  }
  console.log(`[orchestrator] Job ${jobId} verified and done`);

  // Look up the feature_id for this job
  const { data: jobRow, error: jobErr } = await supabase
    .from("jobs")
    .select("feature_id")
    .eq("id", jobId)
    .single();
  if (jobErr || !jobRow?.feature_id) {
    console.log(`[orchestrator] Job ${jobId} has no feature_id — skipping feature check`);
    return;
  }

  // Check if all jobs for this feature are now done
  const { data: allDone, error: rpcErr } = await supabase
    .rpc("all_feature_jobs_complete", { p_feature_id: jobRow.feature_id });
  if (rpcErr) {
    console.error(`[orchestrator] all_feature_jobs_complete RPC failed:`, rpcErr.message);
    return;
  }

  if (allDone) {
    console.log(`[orchestrator] All jobs done for feature ${jobRow.feature_id} — triggering feature verification`);
    await triggerFeatureVerification(supabase, jobRow.feature_id);
  }
}

export async function triggerFeatureVerification(supabase: SupabaseClient, featureId: string): Promise<void> {
  // Mark feature as verifying
  const { error: featureErr } = await supabase
    .from("features")
    .update({ status: "verifying" })
    .eq("id", featureId);
  if (featureErr) {
    console.error(`[orchestrator] Failed to set feature ${featureId} to verifying:`, featureErr.message);
    return;
  }

  // Fetch feature details for the verification job
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("feature_branch, project_id, company_id, acceptance_tests")
    .eq("id", featureId)
    .single();
  if (fetchErr || !feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId}:`, fetchErr?.message);
    return;
  }

  // Insert a feature-verification job. It uses the normal dispatch path
  // (StartJob → executor → Claude session), with context that instructs
  // the agent to run feature-level tests.
  const { error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      role: "reviewer",
      job_type: "code",
      complexity: "simple",
      slot_type: "claude_code",
      status: "queued",
      context: JSON.stringify({
        type: "feature_verification",
        featureBranch: feature.feature_branch,
        acceptanceTests: feature.acceptance_tests ?? "",
      }),
      branch: feature.feature_branch,
    });

  if (insertErr) {
    console.error(`[orchestrator] Failed to insert feature verification job for ${featureId}:`, insertErr.message);
  } else {
    console.log(`[orchestrator] Queued feature verification job for feature ${featureId} branch ${feature.feature_branch}`);
  }
}

/**
 * Promotes a verified feature to the test environment.
 *
 * Queue logic: only one feature at a time can occupy the test env per project.
 * If another feature is already in "testing" status for the same project,
 * this feature stays in "verifying" and will be promoted when the env is free.
 */
async function promoteToTesting(supabase: SupabaseClient, featureId: string): Promise<void> {
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("project_id, company_id, feature_branch, human_checklist")
    .eq("id", featureId)
    .single();
  if (fetchErr || !feature) {
    console.error(`[orchestrator] Failed to fetch feature ${featureId}:`, fetchErr?.message);
    return;
  }

  // Check if another feature is already in testing for this project
  const { data: testing, error: testingErr } = await supabase
    .from("features")
    .select("id")
    .eq("project_id", feature.project_id)
    .eq("status", "testing")
    .limit(1);

  if (testingErr) {
    console.error(`[orchestrator] Failed to check testing queue:`, testingErr.message);
    return;
  }

  if (testing && testing.length > 0) {
    // Another feature occupies the test env — this feature waits in "verifying"
    console.log(`[orchestrator] Test env busy — feature ${featureId} queued (stays in verifying)`);
    return;
  }

  // Test env is free — promote this feature to testing
  const { error: updateErr } = await supabase
    .from("features")
    .update({ status: "testing" })
    .eq("id", featureId);

  if (updateErr) {
    console.error(`[orchestrator] Failed to set feature ${featureId} to testing:`, updateErr.message);
    return;
  }

  console.log(`[orchestrator] Feature ${featureId} promoted to testing — sending DeployToTest`);

  // Broadcast DeployToTest to all machines (the machine with this feature's job will handle it)
  const deployMsg: DeployToTest = {
    type: "deploy_to_test",
    protocolVersion: PROTOCOL_VERSION,
    featureId,
    featureBranch: feature.feature_branch,
    projectId: feature.project_id,
  };

  const channel = supabase.channel(`company:${feature.company_id}`);
  await new Promise<void>((resolve) => {
    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({ type: "broadcast", event: "deploy_to_test", payload: deployMsg });
        await channel.unsubscribe();
        resolve();
      }
    });
  });
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

    // 3. Dispatch queued jobs to available machines.
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
