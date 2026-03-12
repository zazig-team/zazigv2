/**
 * zazigv2 — Agent-event handler functions
 *
 * The 6 handler functions called by the agent-event Edge Function.
 * Extracted from orchestrator/index.ts for log separation.
 * Log prefix: [agent-event job=xxx] or [agent-event machine=xxx] for heartbeat.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Heartbeat,
  JobComplete,
  JobFailed,
  JobStatusMessage,
  VerifyResult,
} from "@zazigv2/shared";

import {
  checkUnblockedJobs,
  notifyCPO,
  releaseSlot,
  triggerFeatureVerification,
  triggerMerging,
} from "../_shared/pipeline-utils.ts";

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleHeartbeat(
  supabase: SupabaseClient,
  msg: Heartbeat,
): Promise<void> {
  const { machineName, slotsAvailable } = msg;

  // Fetch all rows for this machine name (one per company).
  const { data: machines, error: fetchErr } = await supabase
    .from("machines")
    .select("id, company_id, status")
    .eq("name", machineName);

  if (fetchErr || !machines || machines.length === 0) {
    console.error(
      `[agent-event machine=${machineName}] Failed to fetch machine for heartbeat:`,
      fetchErr?.message ?? "no rows found",
    );
    return;
  }

  const wasOffline = machines.some((m) => m.status === "offline");

  const { error } = await supabase
    .from("machines")
    .update({
      last_heartbeat: new Date().toISOString(),
      status: "online",
      slots_claude_code: slotsAvailable.claude_code,
      slots_codex: slotsAvailable.codex,
    })
    .eq("name", machineName);

  if (error) {
    console.error(
      `[agent-event machine=${machineName}] Failed to record heartbeat:`,
      error.message,
    );
    return;
  }

  console.log(
    `[agent-event machine=${machineName}] Heartbeat — claude_code:${slotsAvailable.claude_code} codex:${slotsAvailable.codex}`,
  );

  // Machine came back online — log an event per company.
  // NOTE: recoveryTimestamps tracking lives in orchestrator isolate (in-memory).
  // The set() call was removed during extraction since it was already broken
  // across isolates (agent-event and orchestrator run in separate Deno isolates).
  if (wasOffline) {
    console.log(
      `[agent-event machine=${machineName}] Machine recovered from offline`,
    );

    for (const machine of machines.filter((m) => m.status === "offline")) {
      const { error: eventErr } = await supabase
        .from("events")
        .insert({
          company_id: machine.company_id,
          machine_id: machine.id,
          event_type: "machine_online",
          detail: { recovered: true },
        });

      if (eventErr) {
        console.error(
          `[agent-event machine=${machineName}] Failed to log machine_online event:`,
          eventErr.message,
        );
      }
    }
  }
}

export function handleJobAck(
  _supabase: SupabaseClient,
  msg: { jobId: string; machineId: string },
): void {
  // Delivery confirmation: log only, no DB change needed.
  console.log(
    `[agent-event job=${msg.jobId}] JobAck received — confirmed by machine ${msg.machineId}`,
  );
}

export async function handleJobStatus(
  supabase: SupabaseClient,
  msg: JobStatusMessage,
): Promise<void> {
  const { data, error } = await supabase
    .from("jobs")
    .update({ status: msg.status })
    .eq("id", msg.jobId)
    .in("status", ["executing", "blocked"]) // only update non-terminal jobs
    .select("id");

  if (error) {
    console.error(
      `[agent-event job=${msg.jobId}] Failed to update status to ${msg.status}:`,
      error.message,
    );
  } else if (!data?.length) {
    console.warn(
      `[agent-event job=${msg.jobId}] Status update to ${msg.status} matched 0 rows (already terminal or missing)`,
    );
  } else {
    console.log(`[agent-event job=${msg.jobId}] Status → ${msg.status}`);
  }
}

export async function handleJobComplete(
  supabase: SupabaseClient,
  msg: JobComplete,
): Promise<void> {
  const { jobId, machineId, result, pr, report, branch } = msg;

  // Fetch the job to check type, feature_id, context, etc.
  const { data: jobRow, error: fetchErr } = await supabase
    .from("jobs")
    .select(
      "job_type, context, feature_id, company_id, project_id, branch, acceptance_tests, result, role, source, machine_id",
    )
    .eq("id", jobId)
    .single();

  if (fetchErr || !jobRow) {
    console.error(
      `[agent-event job=${jobId}] Could not fetch job for completion:`,
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
      result: report ?? result,
      branch: branch ?? null,
      pr_url: pr ?? null,
      completed_at: new Date().toISOString(),
      progress: 100,
    })
    .eq("id", jobId);

  if (jobErr) {
    console.error(
      `[agent-event job=${jobId}] Failed to mark job complete:`,
      jobErr.message,
    );
    await releaseSlot(supabase, jobId, machineId);
    return;
  }

  console.log(`[agent-event job=${jobId}] Job complete (machine ${machineId})`);

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
      console.log(
        `[agent-event job=${jobId}] Active verification PASSED for feature ${jobRow.feature_id} — triggering merge`,
      );
      await triggerMerging(supabase, jobRow.feature_id);
    } else {
      console.log(
        `[agent-event job=${jobId}] Active verification FAILED for feature ${jobRow.feature_id} — notifying CPO`,
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

  // Passive verification (reviewer): trigger merge on success
  if (ctx.type === "feature_verification" && jobRow?.feature_id) {
    await triggerMerging(supabase, jobRow.feature_id);
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
      console.log(
        `[agent-event job=${jobId}] Breakdown complete — feature ${jobRow.feature_id} → building`,
      );
    } else {
      console.warn(
        `[agent-event job=${jobId}] Breakdown complete but feature ${jobRow.feature_id} was not in breaking_down (may have already transitioned)`,
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
      console.log(
        `[agent-event job=${jobId}] Auto-generated branch for feature ${jobRow.feature_id}: ${branch}`,
      );
    }

    // Notify CPO about breakdown completion with job stats
    const { data: featureJobs } = await supabase
      .from("jobs")
      .select("id, depends_on")
      .eq("feature_id", jobRow.feature_id)
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
    console.log(
      `[agent-event job=${jobId}] Combine complete — triggering verification for ${jobRow.feature_id}`,
    );
    await triggerFeatureVerification(supabase, jobRow.feature_id);
  }

  // Handle reviewer verify job completion: job_complete means verification passed.
  // (Failed verification arrives via job_failed broadcast → handleJobFailed)
  if (
    jobRow?.job_type === "verify" && jobRow?.role === "reviewer" &&
    jobRow?.feature_id
  ) {
    console.log(
      `[agent-event job=${jobId}] Verification PASSED for feature ${jobRow.feature_id} — triggering merge`,
    );
    await triggerMerging(supabase, jobRow.feature_id);
  }

  // Handle merge job completion: job_complete means merge succeeded.
  // (Failed merge arrives via job_failed broadcast → handleJobFailed)
  if (jobRow?.job_type === "merge" && jobRow?.feature_id) {
    console.log(
      `[agent-event job=${jobId}] Merge PASSED for feature ${jobRow.feature_id} — advancing to complete`,
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
  }
}

export async function handleJobFailed(
  supabase: SupabaseClient,
  msg: JobFailed,
): Promise<void> {
  const { jobId, machineId, error: errMsg, failureReason } = msg;

  const { data: job, error: jobFetchErr } = await supabase
    .from("jobs")
    .select("source, feature_id, role, job_type, title")
    .eq("id", jobId)
    .single();

  if (jobFetchErr) {
    console.error(
      `[agent-event job=${jobId}] handleJobFailed: failed to fetch job:`,
      jobFetchErr.message,
    );
  }

  if (failureReason === "agent_crash") {
    const { error: requeueErr } = await supabase
      .from("jobs")
      .update({ status: "queued", machine_id: null })
      .eq("id", jobId);

    if (requeueErr) {
      console.error(
        `[agent-event job=${jobId}] handleJobFailed: failed to re-queue crashed job:`,
        requeueErr.message,
      );
    }

    await releaseSlot(supabase, jobId, machineId);
    console.log(`[agent-event job=${jobId}] agent_crash → re-queued`);
    return;
  }

  const { error: failErr } = await supabase
    .from("jobs")
    .update({
      status: "failed",
      result: errMsg,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (failErr) {
    console.error(
      `[agent-event job=${jobId}] handleJobFailed: failed to mark job failed:`,
      failErr.message,
    );
  }

  await releaseSlot(supabase, jobId, machineId);
  console.warn(
    `[agent-event job=${jobId}] Job failed (reason: ${failureReason}, error: ${errMsg})`,
  );

  if (!job?.feature_id) return;

  console.log(
    `[agent-event job=${jobId}] Feature ${job.feature_id} stays at current status — job failure is the signal`,
  );
}

export async function handleVerifyResult(
  supabase: SupabaseClient,
  msg: VerifyResult,
): Promise<void> {
  const { jobId, passed, testOutput, reviewSummary } = msg;

  const { data: job, error: fetchErr } = await supabase
    .from("jobs")
    .select("id, feature_id")
    .eq("id", jobId)
    .single();

  if (fetchErr || !job) {
    console.error(
      `[agent-event job=${jobId}] handleVerifyResult: failed to fetch job:`,
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
      })
      .eq("id", jobId);

    if (failErr) {
      console.error(
        `[agent-event job=${jobId}] handleVerifyResult: failed to set verify_failed:`,
        failErr.message,
      );
    } else {
      console.warn(
        `[agent-event job=${jobId}] Verification failed — moved to verify_failed for retry`,
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
    })
    .eq("id", jobId);

  if (passErr) {
    console.error(
      `[agent-event job=${jobId}] handleVerifyResult: failed to mark complete after verification:`,
      passErr.message,
    );
    return;
  }

  if (!job.feature_id) return;

  const { data: allDone, error: allDoneErr } = await supabase
    .rpc("all_feature_jobs_complete", { p_feature_id: job.feature_id });

  if (allDoneErr) {
    console.error(
      `[agent-event job=${jobId}] handleVerifyResult: all_feature_jobs_complete failed for ${job.feature_id}:`,
      allDoneErr.message,
    );
    return;
  }

  if (allDone) {
    console.log(
      `[agent-event job=${jobId}] All jobs complete for feature ${job.feature_id} — triggering feature verification`,
    );
    await triggerFeatureVerification(supabase, job.feature_id);
  }
}
