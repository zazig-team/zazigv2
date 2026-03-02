/**
 * zazigv2 — request-feature-fix Edge Function
 *
 * Cancels stale combine/verify jobs for a feature, moves it back to "building",
 * and queues a senior-engineer code job that inherits the feature branch.
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

const ALLOWED_STATUSES = ["building", "combining", "verifying", "pr_ready"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);
    if (!feature_id) return jsonResponse({ error: "feature_id is required" }, 400);
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
        { error: `Failed to fetch feature ${feature_id}: ${fetchErr?.message ?? "not found"}` },
        404,
      );
    }

    // 2. Validate status
    if (!ALLOWED_STATUSES.includes(feature.status)) {
      return jsonResponse(
        { error: `Feature status is '${feature.status}', must be one of: ${ALLOWED_STATUSES.join(", ")}` },
        409,
      );
    }

    const previousStatus = feature.status;

    // 3. Cancel all combine/verify/review jobs for this feature (including completed ones).
    // Without this, the pipeline creates duplicate combine/verify jobs after the fix.
    const cancelStatuses = ["queued", "dispatched", "executing", "complete", "reviewing", "verifying"];
    const { error: cancelErr } = await supabase
      .from("jobs")
      .update({ status: "cancelled" })
      .eq("feature_id", feature_id)
      .in("job_type", ["combine", "review", "verify"])
      .in("status", cancelStatuses);

    if (cancelErr) {
      console.error(`[request-feature-fix] failed to cancel jobs for ${feature_id}:`, cancelErr.message);
    }

    // 4. Move feature to building (CAS guard on current status)
    const { data: updated, error: updateErr } = await supabase
      .from("features")
      .update({ status: "building", updated_at: new Date().toISOString() })
      .eq("id", feature_id)
      .eq("status", previousStatus)
      .select("id");

    if (updateErr) {
      return jsonResponse(
        { error: `Failed to reset feature to building: ${updateErr.message}` },
        500,
      );
    }
    if (!updated || updated.length === 0) {
      return jsonResponse(
        { error: `Feature ${feature_id} status changed concurrently — CAS failed` },
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

    // 6. Insert a new code job
    const fixContext = JSON.stringify({
      type: "feature_fix",
      failureDetails: reason,
      featureBranch: feature.branch,
      originalSpec: feature.spec ?? "",
    });

    const { data: insertedRows, error: insertErr } = await supabase.from("jobs").insert({
      company_id: feature.company_id,
      project_id: feature.project_id,
      feature_id: feature_id,
      title: "Feature fix",
      role: "senior-engineer",
      job_type: "code",
      complexity: "medium",
      slot_type: "claude_code",
      status: "queued",
      context: fixContext,
      branch: feature.branch,
    }).select("id");

    if (insertErr) {
      return jsonResponse(
        { error: `Failed to queue fix job: ${insertErr.message}` },
        500,
      );
    }

    const jobId = insertedRows?.[0]?.id;

    return jsonResponse({ job_id: jobId, feature_id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
