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
  parseGitHubRepoUrl,
  releaseSlot,
  triggerCICheck,
  triggerMerging,
  triggerTestWriting,
} from "../_shared/pipeline-utils.ts";

const MAX_RETRIES = 5;

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

  // Handle breakdown job completion: feature transitions breakdown → writing_tests (→ building)
  if (jobRow?.job_type === "breakdown" && jobRow?.feature_id) {
    await triggerTestWriting(supabase, jobRow.feature_id);
    console.log(
      `[agent-event job=${jobId}] Breakdown complete — triggered writing_tests for feature ${jobRow.feature_id}`,
    );

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

  // Handle combine job completion: if PR was created, trigger CI checking.
  if (jobRow?.job_type === "combine" && jobRow?.feature_id) {
    const prUrl = msg.pr ?? null;
    if (!prUrl) {
      console.warn(
        `[agent-event job=${jobId}] Combine complete for feature ${jobRow.feature_id} but no PR URL — leaving in combining_and_pr`,
      );
    } else {
      // Look up project repo_url for owner/repo
      const { data: feat } = await supabase
        .from("features")
        .select("project_id, branch")
        .eq("id", jobRow.feature_id)
        .single();

      const projectId = feat?.project_id ?? null;
      const branch = feat?.branch ?? jobRow.branch ?? null;

      if (!projectId || !branch) {
        console.warn(
          `[agent-event job=${jobId}] Combine complete: feature ${jobRow.feature_id} missing project_id or branch — skipping CI check`,
        );
      } else {
        const { data: project } = await supabase
          .from("projects")
          .select("repo_url")
          .eq("id", projectId)
          .maybeSingle();

        const repoUrl = (project as { repo_url?: string | null } | null)?.repo_url ?? null;
        if (!repoUrl) {
          console.warn(
            `[agent-event job=${jobId}] Combine complete: project ${projectId} has no repo_url — skipping CI check`,
          );
        } else {
          let owner: string;
          let repo: string;
          try {
            ({ owner, repo } = parseGitHubRepoUrl(repoUrl));
          } catch {
            console.warn(
              `[agent-event job=${jobId}] Combine complete: invalid repo_url "${repoUrl}" for feature ${jobRow.feature_id}`,
            );
            return;
          }

          // Parse PR number from URL (e.g. https://github.com/owner/repo/pull/42)
          const prNumberMatch = prUrl.match(/\/pull\/(\d+)/);
          const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : null;

          await triggerCICheck(supabase, jobRow.feature_id, prUrl, prNumber, owner, repo, branch);
        }
      }
    }
  }

  // Handle ci_check job completion: job_complete means CI passed — trigger merge.
  if (jobRow?.job_type === "ci_check" && jobRow?.feature_id) {
    console.log(
      `[agent-event job=${jobId}] CI check complete (passed) for feature ${jobRow.feature_id} — triggering merge`,
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

  // Trigger request-feature-fix for all job types with a feature.
  // That edge function handles retry_count increment, model escalation,
  // and creating the appropriate fix job.
  const { data: feature } = await supabase
    .from("features")
    .select("retry_count")
    .eq("id", job.feature_id)
    .single();

  const retryCount = (feature as { retry_count?: number } | null)?.retry_count ?? 0;
  if (retryCount >= MAX_RETRIES) {
    console.warn(
      `[agent-event job=${jobId}] retry_count=${retryCount} at limit for feature ${job.feature_id} — needs human attention`,
    );
    return;
  }

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const fixResp = await fetch(`${url}/functions/v1/request-feature-fix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      job_id: jobId,
      reason: `Job failed: ${failureReason} — ${errMsg}`,
    }),
  });

  if (!fixResp.ok) {
    console.error(
      `[agent-event job=${jobId}] request-feature-fix failed: ${fixResp.status}`,
    );
  } else {
    console.log(
      `[agent-event job=${jobId}] request-feature-fix triggered for feature ${job.feature_id}`,
    );
  }
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

  console.log(
    `[agent-event job=${jobId}] Verification passed for feature ${job.feature_id}; no follow-up verification trigger required`,
  );
}
