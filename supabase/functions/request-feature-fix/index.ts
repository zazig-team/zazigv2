/**
 * zazigv2 — request-feature-fix Edge Function
 *
 * Given a failed job_id, clones the job with an escalated model,
 * moves the original to `failed_retrying`, and increments retry_count on the feature.
 *
 * Called by: orchestrator (failed job catch-up) and CPO (via MCP tool).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

const MAX_RETRIES = 5;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface JobRow {
  id: string;
  company_id: string;
  project_id: string | null;
  feature_id: string | null;
  title: string | null;
  role: string;
  job_type: string;
  complexity: string | null;
  slot_type: string | null;
  context: string | null;
  branch: string | null;
  depends_on: string[] | null;
  model: string | null;
  source: string | null;
}

interface Escalation {
  slot_type: string;
  model: string;
  role: string;
}

function escalateModel(job: JobRow): Escalation | null {
  if (job.slot_type === "codex") {
    return {
      slot_type: "claude_code",
      model: "claude-sonnet-4-6",
      role: "senior-engineer",
    };
  }
  if (job.slot_type === "claude_code" && job.model === "claude-sonnet-4-6") {
    return {
      slot_type: "claude_code",
      model: "claude-opus-4-6",
      role: "senior-engineer",
    };
  }
  // claude-opus-4-6 or unknown — escalation exhausted
  return null;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { job_id, reason } = body as { job_id?: string; reason?: string };

    if (!job_id) {
      return jsonResponse({ error: "job_id is required" }, 400);
    }
    if (!reason || reason.trim().length === 0) {
      return jsonResponse({ error: "reason is required" }, 400);
    }

    // 1. Fetch the failed job
    const { data: job, error: jobErr } = await supabase
      .from("jobs")
      .select(
        "id, company_id, project_id, feature_id, title, role, job_type, complexity, slot_type, context, branch, depends_on, model, source",
      )
      .eq("id", job_id)
      .eq("status", "failed")
      .single();

    if (jobErr || !job) {
      return jsonResponse(
        {
          error:
            `Failed job ${job_id} not found or not in failed status: ${
              jobErr?.message ?? "not found"
            }`,
        },
        404,
      );
    }

    const jobRow = job as JobRow;

    // 2. Check feature retry_count guard
    if (jobRow.feature_id) {
      const { data: feature, error: featureErr } = await supabase
        .from("features")
        .select("retry_count")
        .eq("id", jobRow.feature_id)
        .single();

      if (featureErr || !feature) {
        return jsonResponse(
          {
            error: `Could not fetch feature ${jobRow.feature_id}: ${
              featureErr?.message ?? "not found"
            }`,
          },
          404,
        );
      }

      const currentRetryCount =
        (feature as { retry_count: number }).retry_count ?? 0;
      if (currentRetryCount >= MAX_RETRIES) {
        return jsonResponse(
          {
            error:
              `Retry limit reached for feature ${jobRow.feature_id} (retry_count=${currentRetryCount}). Human attention required.`,
            retry_count: currentRetryCount,
          },
          409,
        );
      }
    }

    // 3. Determine model escalation
    const escalation = escalateModel(jobRow);
    if (!escalation) {
      return jsonResponse(
        {
          error:
            `Model escalation exhausted for job ${job_id} (slot_type=${jobRow.slot_type}, model=${jobRow.model}). Human attention required.`,
        },
        409,
      );
    }

    // 4. Parse original context
    let originalContext: unknown = jobRow.context;
    if (typeof jobRow.context === "string" && jobRow.context.trim().length > 0) {
      try {
        originalContext = JSON.parse(jobRow.context);
      } catch {
        originalContext = jobRow.context;
      }
    }

    // 5. Insert the new retry job
    const { data: newJob, error: insertErr } = await supabase
      .from("jobs")
      .insert({
        company_id: jobRow.company_id,
        project_id: jobRow.project_id,
        feature_id: jobRow.feature_id,
        title: jobRow.title,
        role: escalation.role,
        job_type: jobRow.job_type,
        complexity: jobRow.complexity,
        slot_type: escalation.slot_type,
        model: escalation.model,
        status: "created",
        context: JSON.stringify({
          type: "retry",
          original_job_id: job_id,
          escalated_from_model: jobRow.model,
          escalated_from_slot_type: jobRow.slot_type,
          originalContext,
          failureDiagnosis: reason,
        }),
        branch: jobRow.branch,
        depends_on: jobRow.depends_on ?? [],
        source: jobRow.source ?? "pipeline",
      })
      .select("id")
      .single();

    if (insertErr || !newJob) {
      return jsonResponse(
        { error: `Failed to insert retry job: ${insertErr?.message}` },
        500,
      );
    }

    // 6. Move original job to failed_retrying
    const { error: archiveErr } = await supabase
      .from("jobs")
      .update({ status: "failed_retrying" })
      .eq("id", job_id)
      .eq("status", "failed");

    if (archiveErr) {
      // Rollback the new job
      await supabase
        .from("jobs")
        .update({ status: "cancelled", result: "rollback_archive_failed" })
        .eq("id", (newJob as { id: string }).id);
      return jsonResponse(
        {
          error: `Failed to archive original job to failed_retrying: ${archiveErr.message}`,
        },
        500,
      );
    }

    // 7. Increment retry_count on feature
    if (jobRow.feature_id) {
      const { error: retryCountErr } = await supabase.rpc(
        "increment_feature_retry_count",
        { p_feature_id: jobRow.feature_id },
      );

      if (retryCountErr) {
        // Non-fatal: log but don't fail the whole operation
        console.error(
          `[request-feature-fix] Failed to increment retry_count for feature ${jobRow.feature_id}: ${retryCountErr.message}`,
        );
      }
    }

    const newJobId = (newJob as { id: string }).id;
    console.log(
      `[request-feature-fix] Retry job ${newJobId} created for failed job ${job_id} (feature ${jobRow.feature_id}), escalated ${jobRow.slot_type}/${jobRow.model} → ${escalation.slot_type}/${escalation.model}`,
    );

    return jsonResponse({
      new_job_id: newJobId,
      feature_id: jobRow.feature_id,
      escalated_to_model: escalation.model,
      escalated_to_slot_type: escalation.slot_type,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
