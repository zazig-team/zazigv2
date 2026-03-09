/**
 * zazigv2 — request-feature-fix Edge Function
 *
 * Re-queues only the failed jobs for a feature, moves it back to "building",
 * and clears the feature error so the orchestrator can continue from the
 * existing completed work.
 *
 * Called by: orchestrator (handleVerificationFailed) and CPO (via MCP tool).
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

const ALLOWED_STATUSES = [
  "building",
  "combining",
  "verifying",
  "pr_ready",
  "failed",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface FailedJobRow {
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
    const { company_id, feature_id, reason } = body as {
      company_id?: string;
      feature_id?: string;
      reason?: string;
    };

    if (!company_id) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }
    if (!feature_id) {
      return jsonResponse({ error: "feature_id is required" }, 400);
    }
    if (!reason || reason.trim().length === 0) {
      return jsonResponse({ error: "reason is required" }, 400);
    }

    // 1. Fetch feature details
    const { data: feature, error: fetchErr } = await supabase
      .from("features")
      .select("company_id, project_id, branch, spec, status")
      .eq("id", feature_id)
      .eq("company_id", company_id)
      .single();

    if (fetchErr || !feature) {
      return jsonResponse(
        {
          error: `Failed to fetch feature ${feature_id}: ${
            fetchErr?.message ?? "not found"
          }`,
        },
        404,
      );
    }

    // 2. Validate status
    if (!ALLOWED_STATUSES.includes(feature.status)) {
      return jsonResponse(
        {
          error: `Feature status is '${feature.status}', must be one of: ${
            ALLOWED_STATUSES.join(", ")
          }`,
        },
        409,
      );
    }

    const previousStatus = feature.status;

    // 3. Find the failed jobs for this feature. Only these jobs get retried.
    const { data: failedJobs, error: failedJobsErr } = await supabase
      .from("jobs")
      .select(
        "id, company_id, project_id, feature_id, title, role, job_type, complexity, slot_type, context, branch, depends_on, model",
      )
      .eq("feature_id", feature_id)
      .eq("status", "failed");

    if (failedJobsErr) {
      return jsonResponse(
        {
          error:
            `Failed to fetch failed jobs for feature ${feature_id}: ${failedJobsErr.message}`,
        },
        500,
      );
    }

    if (!failedJobs || failedJobs.length === 0) {
      return jsonResponse(
        { error: `No failed jobs found for feature ${feature_id}` },
        409,
      );
    }

    const retryJobs = (failedJobs as FailedJobRow[]).map((job) => {
      let originalContext: unknown = job.context;
      if (typeof job.context === "string" && job.context.trim().length > 0) {
        try {
          originalContext = JSON.parse(job.context);
        } catch {
          originalContext = job.context;
        }
      }

      return {
        company_id: job.company_id,
        project_id: job.project_id,
        feature_id: job.feature_id,
        title: job.title,
        role: job.role,
        job_type: job.job_type,
        complexity: job.complexity,
        slot_type: job.slot_type,
        status: "queued",
        context: JSON.stringify({
          type: "retry",
          originalContext,
          failureDiagnosis: reason,
        }),
        branch: job.branch,
        depends_on: job.depends_on ?? [],
        model: job.model,
      };
    });

    const { data: insertedRetryRows, error: insertErr } = await supabase
      .from("jobs")
      .insert(retryJobs)
      .select("id");

    if (insertErr) {
      return jsonResponse(
        { error: `Failed to queue retry jobs: ${insertErr.message}` },
        500,
      );
    }

    const insertedRetryIds = (insertedRetryRows ?? []).map((
      row: { id: string },
    ) => row.id);

    // 4. Cancel the old failed jobs so Task 0 does not immediately fail the feature again.
    const failedJobIds = (failedJobs as FailedJobRow[]).map((job) => job.id);
    const { error: cancelFailedErr } = await supabase
      .from("jobs")
      .update({ status: "cancelled" })
      .in("id", failedJobIds)
      .eq("status", "failed");

    if (cancelFailedErr) {
      await supabase
        .from("jobs")
        .update({
          status: "cancelled",
          result: "rollback_request_feature_fix_cancel_failed_jobs",
        })
        .in("id", insertedRetryIds);
      return jsonResponse(
        {
          error:
            `Failed to cancel failed jobs for feature ${feature_id}: ${cancelFailedErr.message}`,
        },
        500,
      );
    }

    // 5. Move feature to building (CAS guard on current status) and clear the error.
    const { data: updated, error: updateErr } = await supabase
      .from("features")
      .update({
        status: "building",
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", feature_id)
      .eq("status", previousStatus)
      .select("id");

    if (updateErr) {
      await supabase
        .from("jobs")
        .update({
          status: "cancelled",
          result: "rollback_request_feature_fix_feature_update_failed",
        })
        .in("id", insertedRetryIds);
      return jsonResponse(
        { error: `Failed to reset feature to building: ${updateErr.message}` },
        500,
      );
    }
    if (!updated || updated.length === 0) {
      await supabase
        .from("jobs")
        .update({
          status: "cancelled",
          result: "rollback_request_feature_fix_feature_cas_failed",
        })
        .in("id", insertedRetryIds);
      return jsonResponse(
        {
          error:
            `Feature ${feature_id} status changed concurrently — CAS failed`,
        },
        409,
      );
    }

    // 5. Log event
    await supabase.from("events").insert({
      company_id: feature.company_id,
      event_type: "feature_status_changed",
      detail: {
        featureId: feature_id,
        from: previousStatus,
        to: "building",
        reason: reason.slice(0, 500),
      },
    });

    return jsonResponse({ retried_job_ids: insertedRetryIds, feature_id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
