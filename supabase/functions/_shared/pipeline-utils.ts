/**
 * zazigv2 — Shared pipeline utilities
 *
 * Functions used by both the orchestrator (cron) and agent-event (handlers).
 * Log prefix: [pipeline]
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { DeployComplete, SlotType } from "@zazigv2/shared";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// ---------------------------------------------------------------------------
// Channel naming — scoped by company to support multiple instances per machine
// ---------------------------------------------------------------------------

export function agentChannelName(
  machineName: string,
  companyId: string,
): string {
  return `agent:${machineName}:${companyId}`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TERMINAL_FEATURE_STATUSES_FOR_DEPLOY = new Set([
  "failed",
  "complete",
  "cancelled",
]);

// ---------------------------------------------------------------------------
// Title generation — short human-readable labels for jobs via Claude Haiku
// ---------------------------------------------------------------------------

/**
 * Generates a short (3-8 word) human-readable title for a job from its context.
 * Uses Claude Haiku for speed and cost efficiency. Returns empty string on failure.
 */
export async function generateTitle(context: string): Promise<string> {
  if (!ANTHROPIC_API_KEY) {
    console.warn(
      "[pipeline] ANTHROPIC_API_KEY not set — skipping title generation",
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
      console.error(`[pipeline] Title generation HTTP ${response.status}`);
      return "";
    }

    const data = await response.json();
    const title = data.content?.[0]?.text?.trim() || "";
    return title.slice(0, 120);
  } catch (err) {
    console.error(
      "[pipeline] Title generation failed:",
      err instanceof Error ? err.message : String(err),
    );
    return "";
  }
}

// ---------------------------------------------------------------------------
// Slot management
// ---------------------------------------------------------------------------

/**
 * Releases one slot of the appropriate type on a machine.
 * Fetches the current job record to determine slot_type, then increments the machine counter.
 */
export async function releaseSlot(
  supabase: SupabaseClient,
  jobId: string,
  machineId: string,
): Promise<void> {
  if (!machineId) {
    console.warn(
      `[pipeline] releaseSlot called without machineId for job ${jobId} — skipping`,
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
      `[pipeline] Could not fetch slot_type for job ${jobId}:`,
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
      `[pipeline] Failed to release slot on machine ${machineId}:`,
      releaseErr.message,
    );
  } else {
    console.log(
      `[pipeline] Released ${slotType} slot on machine ${machineId}`,
    );
  }
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
      `[pipeline] checkUnblockedJobs: failed to query candidates for feature ${featureId}:`,
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
        `[pipeline] checkUnblockedJobs: failed to check deps for job ${candidate.id}:`,
        depErr.message,
      );
      continue;
    }

    const allComplete = depJobs && depJobs.length === deps.length &&
      depJobs.every((d: { status: string }) => d.status === "complete");

    if (allComplete) {
      console.log(
        `[pipeline] Job ${candidate.id} is now unblocked (all ${deps.length} dependencies complete)`,
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
      `[pipeline] notifyCPO: failed to find CPO job for company ${companyId}:`,
      cpoErr.message,
    );
    return;
  }

  if (!cpoJob || !cpoJob.machine_id) {
    console.warn(
      `[pipeline] notifyCPO: no active CPO for company ${companyId} — notification lost: ${text}`,
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
      `[pipeline] notifyCPO: failed to fetch machine ${cpoJob.machine_id}:`,
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
    `[pipeline] Notified CPO on machine ${machine.name}: ${
      text.slice(0, 100)
    }`,
  );
}

// ---------------------------------------------------------------------------
// Pipeline stage triggers
// ---------------------------------------------------------------------------

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
      `[pipeline] triggerCombining: failed to fetch job branches for feature ${featureId}:`,
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
      `[pipeline] triggerCombining: feature ${featureId} not found`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[pipeline] triggerCombining: feature ${featureId} has no branch — cannot combine`,
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
      `[pipeline] triggerCombining: failed to insert combine job for feature ${featureId}:`,
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
        `[pipeline] triggerCombining: failed to set feature ${featureId} to combining_and_pr:`,
        updateErr.message,
      );
    } else {
      console.log(
        `[pipeline] triggerCombining: feature ${featureId} not in building — rolling back queued combine job`,
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
        `[pipeline] triggerCombining: failed to cancel queued combine job ${combineJob.id} after CAS miss:`,
        rollbackErr.message,
      );
    }
    return;
  }

  console.log(
    `[pipeline] Created combine job ${combineJob.id} for feature ${featureId} with ${jobBranches.length} branches`,
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
      `[pipeline] Failed to fetch feature ${featureId}:`,
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
      `[pipeline] Feature ${featureId} already in late-stage status (${feature.status}) — skipping verification trigger`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[pipeline] triggerFeatureVerification: feature ${featureId} has no branch — cannot verify`,
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
      `[pipeline] Failed to insert verification job for ${featureId}:`,
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
        `[pipeline] Failed to set feature ${featureId} to verifying:`,
        featureErr.message,
      );
    } else {
      console.log(
        `[pipeline] Feature ${featureId} status changed before verify transition — cancelling queued verify job ${insertedJobId}`,
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
        `[pipeline] Failed to cancel queued verify job ${insertedJobId} after status CAS miss:`,
        rollbackErr.message,
      );
    }
    return;
  }

  if (isActive) {
    console.log(
      `[pipeline] Queued active verification (verification-specialist) for feature ${featureId}`,
    );
  } else {
    console.log(
      `[pipeline] Queued passive verification (reviewer) for feature ${featureId} branch ${feature.branch}`,
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
      `[pipeline] triggerMerging: feature ${featureId} not found`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[pipeline] triggerMerging: feature ${featureId} has no branch — cannot merge`,
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
      `[pipeline] triggerMerging: merge job already exists for feature ${featureId} (${
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
      `[pipeline] triggerMerging: failed to insert merge job for feature ${featureId}:`,
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
        `[pipeline] triggerMerging: failed to set feature ${featureId} to merging:`,
        updateErr.message,
      );
    } else {
      console.log(
        `[pipeline] triggerMerging: feature ${featureId} not in verifying — rolling back queued merge job`,
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
        `[pipeline] triggerMerging: failed to cancel queued merge job ${mergeJob.id} after CAS miss:`,
        rollbackErr.message,
      );
    }
    return;
  }

  console.log(
    `[pipeline] Created merge job ${mergeJob.id} for feature ${featureId}`,
  );
}

/**
 * Initiates test deployment for a verified feature.
 *
 * Queue logic: only one feature at a time can occupy the test env per project.
 * If another feature is already in "deploying_to_test" or "ready_to_test" status
 * for the same project, this feature stays in "verifying" and will be promoted
 * when the env is free.
 */
export async function initiateTestDeploy(
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
      `[pipeline] Failed to fetch feature ${featureId}:`,
      fetchErr?.message,
    );
    return;
  }

  if (TERMINAL_FEATURE_STATUSES_FOR_DEPLOY.has(feature.status as string)) {
    console.log(
      `[pipeline] initiateTestDeploy: feature ${featureId} is terminal (${feature.status}) — skipping deploy_to_test job creation`,
    );
    return;
  }

  if (!feature.branch) {
    console.error(
      `[pipeline] initiateTestDeploy: feature ${featureId} has no branch — cannot deploy`,
    );
    return;
  }
  if (!feature.project_id) {
    console.error(
      `[pipeline] initiateTestDeploy: feature ${featureId} has no project_id — cannot deploy`,
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
      `[pipeline] initiateTestDeploy: failed to update feature ${featureId}:`,
      updateErr.message,
    );
    return;
  }
  if (!updated || updated.length === 0) {
    console.log(
      `[pipeline] initiateTestDeploy: feature ${featureId} no longer in verifying — skipping`,
    );
    return;
  }

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
      `[pipeline] initiateTestDeploy: active deploy_to_test job already exists for feature ${featureId} — skipping`,
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
      `[pipeline] Failed to queue test deploy job for feature ${featureId}:`,
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

  console.log(`[pipeline] Test deploy job queued for feature ${featureId}`);
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
  _supabase: SupabaseClient,
  msg: DeployComplete,
): Promise<void> {
  console.log(
    `[pipeline] handleDeployComplete: feature ${msg.featureId} — deploy handled at project level, no-op`,
  );
}

/**
 * Handles completion of a production deploy job.
 * No longer transitions feature status — deploy is now at the project level.
 * Kept for backwards compatibility with any in-flight deploy_to_prod jobs.
 */
export async function handleProdDeployComplete(
  _supabase: SupabaseClient,
  featureId: string,
): Promise<void> {
  console.log(
    `[pipeline] handleProdDeployComplete: feature ${featureId} — deploy handled at project level, no-op`,
  );
}
