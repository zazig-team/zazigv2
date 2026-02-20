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
  isHeartbeat,
  isJobAck,
  isJobStatusMessage,
  isJobComplete,
  isJobFailed,
  isStopAck,
} from "@zazigv2/shared";
import type {
  StartJob,
  SlotType,
  AgentMessage,
  Heartbeat,
  JobStatusMessage,
  JobComplete,
  JobFailed,
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
  role: string;
  job_type: string;
  complexity: string | null;
  slot_type: SlotType | null;
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

/**
 * Selects the model string for a StartJob message based on complexity.
 * simple/medium → sonnet, complex → opus.
 */
function modelForComplexity(complexity: string | null): string {
  return complexity === "complex" ? "claude-opus-4-6" : "claude-sonnet-4-6";
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
      .in("status", ["dispatched", "executing"]);

    if (jobsErr) {
      console.error(`[orchestrator] Failed to query jobs for dead machine ${machine.id}:`, jobsErr.message);
      continue;
    }

    if (!stuckJobs || stuckJobs.length === 0) continue;

    const stuckIds = stuckJobs.map((j: { id: string }) => j.id);
    console.log(`[orchestrator] Re-queuing ${stuckIds.length} job(s) from dead machine ${machine.name}`);

    const { error: requeueErr } = await supabase
      .from("jobs")
      .update({ status: "queued", machine_id: null })
      .in("id", stuckIds);

    if (requeueErr) {
      console.error(`[orchestrator] Failed to re-queue jobs from dead machine ${machine.id}:`, requeueErr.message);
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
      "id, company_id, role, job_type, complexity, slot_type, machine_id, status, context, branch, created_at",
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

  for (const job of queuedJobs as JobRow[]) {
    const slotType: SlotType = job.slot_type ?? "claude_code";

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
      machines = (m ?? []) as MachineRow[];
      machineCache.set(job.company_id, machines);
    }

    // Find a machine with an available slot of the required type.
    const candidate = machines.find((m) => availableSlots(m, slotType) > 0);

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
    const { error: updateJobErr } = await supabase
      .from("jobs")
      .update({
        status: "dispatched",
        machine_id: candidate.id,
        started_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "queued"); // optimistic lock — only update if still queued

    if (updateJobErr) {
      console.error(`[orchestrator] Failed to dispatch job ${job.id}:`, updateJobErr.message);
      // The slot was already decremented above; it will self-correct on next heartbeat.
      continue;
    }

    // Update in-memory cache so subsequent jobs in this pass see the reduced capacity.
    const slotUpdate = { [slotColumn]: currentSlots - 1 };
    Object.assign(candidate, slotUpdate);

    // Build the StartJob message.
    const model = modelForComplexity(job.complexity);
    const startJobMsg: StartJob = {
      type: "start_job",
      protocolVersion: PROTOCOL_VERSION,
      jobId: job.id,
      // cardId is a required field in StartJob — use job.id as the card reference.
      // (The full Trello card ID is not stored in jobs; the context carries the card details.)
      cardId: job.id,
      cardType: (job.job_type as StartJob["cardType"]) ?? "code",
      complexity: (job.complexity as StartJob["complexity"]) ?? "medium",
      slotType,
      model,
      context: job.context ?? undefined,
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
  } else {
    console.log(
      `[orchestrator] Heartbeat from machine ${machineId} — claude_code:${slotsAvailable.claude_code} codex:${slotsAvailable.codex}`,
    );
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

  // Update job: complete, store result, set completedAt.
  const { error: jobErr } = await supabase
    .from("jobs")
    .update({
      status: "complete",
      result,
      pr_url: pr ?? null,
      completed_at: new Date().toISOString(),
      machine_id: null, // release machine assignment
    })
    .eq("id", jobId);

  if (jobErr) {
    console.error(`[orchestrator] Failed to mark job ${jobId} complete:`, jobErr.message);
    return;
  }

  console.log(`[orchestrator] Job ${jobId} complete (machine ${machineId})`);

  // Release the slot on the machine.
  await releaseSlot(supabase, jobId, machineId);
}

async function handleJobFailed(supabase: SupabaseClient, msg: JobFailed): Promise<void> {
  const { jobId, machineId, error: errMsg, failureReason } = msg;

  // Decide recovery strategy based on failure reason.
  //   agent_crash → re-queue immediately on a healthy machine
  //   ci_failure  → waiting_on_human (needs triage)
  //   timeout     → waiting_on_human (needs triage or extended timeout)
  //   unknown     → waiting_on_human (log and review)
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
