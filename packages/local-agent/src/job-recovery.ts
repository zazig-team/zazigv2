import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Find jobs assigned to this machine that are stuck in `dispatched` status
 * (the Realtime broadcast was missed or dropped). Reset them to `queued`
 * so the orchestrator re-dispatches on its next tick.
 *
 * Safe to call repeatedly — uses CAS guard on status.
 *
 * @param gracePeriodMs - Only recover jobs dispatched longer than this ago.
 *   Default 5 minutes. Pass 0 at startup to recover all (previous-run jobs).
 * @param companyIds - Scope the machine lookup by company for multi-tenant safety.
 * @returns Number of jobs recovered
 */
export async function recoverDispatchedJobs(
  dbClient: SupabaseClient,
  machineName: string,
  options?: { gracePeriodMs?: number; companyIds?: string[] },
): Promise<number> {
  const gracePeriodMs = options?.gracePeriodMs ?? 5 * 60 * 1000; // default 5 min

  try {
    // Look up our machine row ID(s) by name, scoped to our companies
    let machineQuery = dbClient
      .from("machines")
      .select("id")
      .eq("name", machineName);

    if (options?.companyIds && options.companyIds.length > 0) {
      machineQuery = machineQuery.in("company_id", options.companyIds);
    }

    const { data: machines, error: machErr } = await machineQuery;

    if (machErr || !machines || machines.length === 0) {
      return 0;
    }

    const machineIds = machines.map((m: { id: string }) => m.id);

    // Find stuck jobs: dispatched means the Realtime broadcast was missed.
    // Only reset 'dispatched' — not 'executing'. Executing jobs have an
    // active tmux session; resetting them would fight the running executor.
    let jobQuery = dbClient
      .from("jobs")
      .select("id, status, job_type, role")
      .in("machine_id", machineIds)
      .eq("status", "dispatched");

    // Grace period: skip recently-dispatched jobs that may still be mid-delivery.
    // The executor sets status to 'executing' late in the startup flow (after
    // context resolution, worktree creation, and tmux spawn — executor.ts:415),
    // so large repos can take several minutes. 5 minutes covers p99 startup.
    if (gracePeriodMs > 0) {
      const graceCutoff = new Date(Date.now() - gracePeriodMs).toISOString();
      jobQuery = jobQuery.lt("updated_at", graceCutoff);
    }

    const { data: stuckJobs, error: jobErr } = await jobQuery;

    if (jobErr) {
      console.error("[local-agent] Error querying dispatched jobs:", jobErr.message);
      return 0;
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      return 0;
    }

    console.log(`[local-agent] Found ${stuckJobs.length} dispatched job(s) — resetting to queued`);

    let recovered = 0;
    for (const job of stuckJobs) {
      const { error: updateErr } = await dbClient
        .from("jobs")
        .update({
          status: "queued",
          machine_id: null,
          started_at: null,
        })
        .eq("id", job.id)
        .eq("status", "dispatched"); // CAS guard

      if (updateErr) {
        console.error(`[local-agent] Failed to reset job ${job.id}: ${updateErr.message}`);
      } else {
        console.log(
          `[local-agent] Reset job ${job.id} (dispatched → queued, role=${job.role ?? "none"})`,
        );
        recovered++;
      }
    }

    return recovered;
  } catch (err) {
    console.error("[local-agent] Job recovery failed:", err);
    return 0;
  }
}
