/**
 * zazigv2 — update-feature Edge Function
 *
 * Updates an existing feature on behalf of the CPO agent.
 * Guards status transitions: CPO may only set 'breaking_down' or 'complete'.
 * Fires a feature_status_changed event when status → breaking_down.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// CPO can only set these statuses — all others are orchestrator-managed
const ALLOWED_CPO_STATUSES = ["breaking_down", "complete"] as const;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
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
    const { feature_id, title, description, priority, status, spec, acceptance_tests, human_checklist, fast_track, job_id } = body;

    if (!feature_id) {
      return jsonResponse({ error: "feature_id is required" }, 400);
    }

    // Guard status transitions
    if (status && !ALLOWED_CPO_STATUSES.includes(status)) {
      return jsonResponse(
        { error: `Cannot set status '${status}' — CPO may only set: ${ALLOWED_CPO_STATUSES.join(", ")}` },
        400,
      );
    }

    if (fast_track !== undefined && typeof fast_track !== "boolean") {
      return jsonResponse({ error: "fast_track must be a boolean when provided" }, 400);
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) {
      updates.status = status;
      if (status === "complete") updates.completed_at = new Date().toISOString();
    }
    if (spec !== undefined) updates.spec = spec;
    if (acceptance_tests !== undefined) updates.acceptance_tests = acceptance_tests;
    if (human_checklist !== undefined) updates.human_checklist = human_checklist;
    if (fast_track !== undefined) updates.fast_track = fast_track;
    // job_id and company_id are used for auth/resolution only — not stored on features

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ ok: true, note: "nothing to update" });
    }

    // Warn when spec is being set without a description — description is required
    // for dashboard readability and pipeline snapshot scanning.
    if (updates.spec !== undefined && !updates.description) {
      // Check if the existing feature already has a description
      const { data: existing } = await supabase
        .from("features")
        .select("description")
        .eq("id", feature_id)
        .single();
      if (!existing?.description) {
        console.warn(
          `[update-feature] WARNING: spec set on feature ${feature_id} but description is null. ` +
          "Features should always have a description when a spec is written.",
        );
      }
    }

    const { data: updated, error } = await supabase
      .from("features")
      .update(updates)
      .eq("id", feature_id)
      .select("company_id")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    // If status changed to breaking_down, insert event so orchestrator picks it up
    if (status === "breaking_down") {
      // Cancel all existing jobs from previous pipeline runs so the catch-up loop
      // doesn't re-fail the feature before the new breakdown can finish.
      await supabase
        .from("jobs")
        .update({ status: "cancelled", completed_at: new Date().toISOString() })
        .eq("feature_id", feature_id)
        .neq("status", "cancelled");

      await supabase.from("events").insert({
        company_id: updated.company_id,
        feature_id,
        event_type: "feature_status_changed",
        detail: { from: null, to: "breaking_down" },
      });
    }

    if (status === "complete") {
      await supabase.from("events").insert({
        company_id: updated.company_id,
        feature_id,
        event_type: "feature_status_changed",
        detail: { from: null, to: "complete", reason: "cpo_manual" },
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
