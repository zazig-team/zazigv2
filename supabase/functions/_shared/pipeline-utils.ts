/**
 * zazigv2 — Shared pipeline utilities
 *
 * Functions used by both the orchestrator (cron) and agent-event (handlers).
 * Log prefix: [pipeline]
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { SlotType } from "@zazigv2/shared";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

// ---------------------------------------------------------------------------
// GitHub helpers
// ---------------------------------------------------------------------------

export function parseGitHubRepoUrl(url: string): { owner: string; repo: string } {
  const match = url.match(
    /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?(?:\/.*)?$/,
  );

  if (!match) {
    throw new Error(`Invalid GitHub repository URL: ${url}`);
  }

  const [, owner, repo] = match;
  return { owner, repo };
}

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

/**
 * Best-effort project rule injection for job contexts.
 * Rules are scoped by project_id and applies_to contains job_type.
 */
export async function injectProjectRulesIntoContext(
  supabase: SupabaseClient,
  projectId: string | null | undefined,
  jobType: string,
  existingContext: string | null,
  logPrefix = "[pipeline]",
): Promise<string | null> {
  if (!projectId || !jobType) return existingContext;

  const { data: rules, error } = await supabase
    .from("project_rules")
    .select("rule_text")
    .eq("project_id", projectId)
    .contains("applies_to", [jobType])
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      `${logPrefix} failed to query project_rules for project ${projectId} and job_type ${jobType}:`,
      error.message,
    );
    return existingContext;
  }

  if (!rules || rules.length === 0) return existingContext;

  try {
    const parsed = JSON.parse(existingContext ?? "{}") as Record<string, unknown>;
    parsed.project_rules = rules
      .map((rule) => rule.rule_text)
      .filter((rule): rule is string => typeof rule === "string" && rule.length > 0);
    if (!Array.isArray(parsed.project_rules) || parsed.project_rules.length === 0) {
      delete parsed.project_rules;
    }
    return JSON.stringify(parsed);
  } catch {
    console.warn(
      `${logPrefix} context is not valid JSON; skipping project_rules injection for job_type ${jobType}`,
    );
    return existingContext;
  }
}

interface IdeaMessageHistoryRow {
  sender: string | null;
  content: string | null;
  created_at: string | null;
}

/**
 * Fetches and formats idea_messages conversation history for agent grounding.
 * Returns oldest-first lines in the format: [timestamp] sender: content.
 */
export async function fetchIdeaConversationHistory(
  supabase: SupabaseClient,
  ideaId: string,
  limit = 50,
): Promise<string> {
  if (!ideaId) return "";
  const boundedLimit = Math.max(1, Math.min(limit, 200));

  const { data: messages, error } = await supabase
    .from("idea_messages")
    .select("sender, content, created_at")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: true })
    .limit(boundedLimit);

  if (error) {
    console.error(
      `[pipeline] failed to fetch idea_messages conversation history for idea ${ideaId}:`,
      error.message,
    );
    return "";
  }

  const lines = ((messages ?? []) as IdeaMessageHistoryRow[])
    .map((message) => {
      const sender = typeof message.sender === "string" && message.sender.length > 0
        ? message.sender
        : "unknown";
      const content = typeof message.content === "string"
        ? message.content.trim()
        : "";
      if (!content) return null;
      const createdAt = typeof message.created_at === "string" && message.created_at.length > 0
        ? message.created_at
        : "unknown-time";
      return `[${createdAt}] ${sender}: ${content}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

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
    .in("status", ["created", "queued"])
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
    .in("status", ["executing"])
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
 * Triggers the test writing step after breakdown completes.
 * Transitions feature from 'breaking_down' → 'writing_tests' and creates a test job.
 * Idempotent: CAS on status prevents double-transition; checks for existing test job.
 */
export async function triggerTestWriting(
  supabase: SupabaseClient,
  featureId: string,
): Promise<void> {
  const { data: feature, error } = await supabase
    .from("features")
    .select("company_id, project_id, title, spec, acceptance_tests")
    .eq("id", featureId)
    .single();

  if (error || !feature) {
    console.error(
      `[pipeline] triggerTestWriting: feature ${featureId} not found`,
    );
    return;
  }

  const { data: updated, error: transitionErr } = await supabase
    .from("features")
    .update({ status: "writing_tests" })
    .eq("id", featureId)
    .eq("status", "breaking_down")
    .select("id");

  if (transitionErr) {
    console.error(
      `[pipeline] triggerTestWriting: failed to transition feature ${featureId} to writing_tests:`,
      transitionErr.message,
    );
    return;
  }

  if (!updated || updated.length === 0) {
    console.log(
      `[pipeline] triggerTestWriting: feature ${featureId} not in breaking_down — skipping (already transitioned)`,
    );
    return;
  }

  const { data: existing } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("feature_id", featureId)
    .eq("job_type", "test")
    .in("status", ["created", "queued", "executing", "blocked", "complete"])
    .maybeSingle();

  if (existing) {
    console.log(
      `[pipeline] triggerTestWriting: test job ${existing.id} (${existing.status}) already exists for feature ${featureId}, skipping`,
    );
    return;
  }

  const baseContext = JSON.stringify({
    type: "test",
    featureId,
    title: feature.title,
    spec: feature.spec,
    acceptance_tests: feature.acceptance_tests,
    test_dir: "tests/features/",
    example_tests: ["packages/local-agent/src/executor.test.ts"],
  });
  const finalContext = await injectProjectRulesIntoContext(
    supabase,
    feature.project_id,
    "test",
    baseContext,
    "[pipeline] triggerTestWriting:",
  );

  const { data: job, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      title: "Writing tests for feature",
      role: "test-engineer",
      job_type: "test",
      slot_type: "claude_code",
      model: "claude-sonnet-4-6",
      complexity: "medium",
      status: "created",
      context: finalContext,
    })
    .select("id")
    .single();

  if (insertErr || !job) {
    console.error(
      `[pipeline] triggerTestWriting: failed to insert test job for feature ${featureId}:`,
      insertErr?.message,
    );
    return;
  }

  console.log(
    `[pipeline] triggerTestWriting: queued test job ${job.id} for feature ${featureId}`,
  );

  // Wire root code jobs to depend on the test job so they start with test files in their branch.
  // Only jobs with no existing dependencies are updated — jobs that already depend on something
  // will inherit the test branch transitively through their dependency chain.
  const { data: rootJobs, error: rootJobsErr } = await supabase
    .from("jobs")
    .select("id, depends_on")
    .eq("feature_id", featureId)
    .eq("job_type", "code")
    .in("status", ["created", "queued"]);

  if (rootJobsErr) {
    console.error(
      `[pipeline] triggerTestWriting: failed to query code jobs for feature ${featureId}:`,
      rootJobsErr.message,
    );
    return;
  }

  const rootJobIds = (rootJobs ?? [])
    .filter((j: { depends_on: string[] | null }) => !j.depends_on || j.depends_on.length === 0)
    .map((j: { id: string }) => j.id);

  if (rootJobIds.length > 0) {
    const { error: depErr } = await supabase
      .from("jobs")
      .update({ depends_on: [job.id] })
      .in("id", rootJobIds);

    if (depErr) {
      console.error(
        `[pipeline] triggerTestWriting: failed to set test dependency on ${rootJobIds.length} code jobs:`,
        depErr.message,
      );
    } else {
      console.log(
        `[pipeline] triggerTestWriting: wired ${rootJobIds.length} root code jobs to depend on test job ${job.id}`,
      );
    }
  }
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
    "test",
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
  const baseCombineContext = JSON.stringify({
    type: "combine",
    featureId,
    featureBranch: feature.branch,
    jobBranches,
  });
  const combineContext = await injectProjectRulesIntoContext(
    supabase,
    feature.project_id,
    "combine",
    baseCombineContext,
    "[pipeline] triggerCombining:",
  );

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
      status: "created",
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
      .in("status", ["created", "queued"]);
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

/**
 * Triggers CI checking for a combined feature with a PR.
 * Inserts a ci-checker job and transitions the feature from 'combining_and_pr' → 'ci_checking'.
 */
export async function triggerCICheck(
  supabase: SupabaseClient,
  featureId: string,
  prUrl: string,
  prNumber: number | null,
  owner: string,
  repo: string,
  branch: string,
): Promise<void> {
  // Fetch feature details
  const { data: feature, error: fetchErr } = await supabase
    .from("features")
    .select("company_id, project_id")
    .eq("id", featureId)
    .single();

  if (fetchErr || !feature) {
    console.error(
      `[pipeline] triggerCICheck: feature ${featureId} not found`,
    );
    return;
  }

  // CAS transition: combining_and_pr → ci_checking (must succeed before creating the job)
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "ci_checking", updated_at: new Date().toISOString() })
    .eq("id", featureId)
    .eq("status", "combining_and_pr")
    .select("id");

  if (updateErr) {
    console.error(
      `[pipeline] triggerCICheck: failed to set feature ${featureId} to ci_checking:`,
      updateErr.message,
    );
    return;
  }

  if (!updated || updated.length === 0) {
    console.log(
      `[pipeline] triggerCICheck: feature ${featureId} not in combining_and_pr — skipping`,
    );
    return;
  }

  // Idempotency: check no active ci_check job exists
  const { data: existingCICheck } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("feature_id", featureId)
    .eq("job_type", "ci_check")
    .in("status", ["created", "queued", "executing"])
    .limit(1);

  if (existingCICheck && existingCICheck.length > 0) {
    console.log(
      `[pipeline] triggerCICheck: ci_check job already active for feature ${featureId} (${existingCICheck[0].id}) — skipping`,
    );
    return;
  }

  const ciContext = JSON.stringify({
    type: "ci_check",
    featureId,
    prUrl,
    prNumber,
    owner,
    repo,
    branch,
  });

  const { data: ciJob, error: insertErr } = await supabase
    .from("jobs")
    .insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: featureId,
      title: `CI check: ${branch}`,
      role: "ci-checker",
      job_type: "ci_check",
      complexity: "simple",
      slot_type: "claude_code",
      status: "created",
      context: ciContext,
      branch,
    })
    .select("id")
    .single();

  if (insertErr || !ciJob) {
    console.error(
      `[pipeline] triggerCICheck: failed to insert ci_check job for feature ${featureId}:`,
      insertErr?.message,
    );
    return;
  }

  console.log(
    `[pipeline] Created ci_check job ${ciJob.id} for feature ${featureId} (${owner}/${repo}@${branch})`,
  );
}

/**
 * Triggers the merge step for a combined feature.
 * Inserts a merge job and transitions the feature from ci_checking → merging.
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
    .in("status", ["created", "queued", "executing", "complete"])
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
      status: "created",
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

  // CAS transition: ci_checking → merging
  const { data: updated, error: updateErr } = await supabase
    .from("features")
    .update({ status: "merging", updated_at: new Date().toISOString() })
    .eq("id", featureId)
    .eq("status", "ci_checking")
    .select("id");

  if (updateErr || !updated || updated.length === 0) {
    if (updateErr) {
      console.error(
        `[pipeline] triggerMerging: failed to set feature ${featureId} to merging:`,
        updateErr.message,
      );
    } else {
      console.log(
        `[pipeline] triggerMerging: feature ${featureId} not in ci_checking — rolling back queued merge job`,
      );
    }

    const { error: rollbackErr } = await supabase
      .from("jobs")
      .update({
        status: "cancelled",
        result: "merge_not_started_feature_not_ci_checking",
      })
      .eq("id", mergeJob.id)
      .in("status", ["created", "queued"]);
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
