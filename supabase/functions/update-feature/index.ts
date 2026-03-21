/**
 * zazigv2 — update-feature Edge Function
 *
 * Updates an existing feature on behalf of the CPO agent.
 * Guards status transitions: CPO may only set 'breaking_down' or 'complete'.
 * Fires a feature_status_changed event when status → breaking_down.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
const ALLOWED_CPO_STATUSES = ["breaking_down", "complete", "cancelled"] as const;

async function wouldCreateCycle(
  supabase: SupabaseClient,
  featureId: string,
  proposedDeps: string[],
): Promise<{ cycle: boolean; path?: string[] }> {
  const { data: allFeatures, error } = await supabase
    .from("features")
    .select("id, depends_on");

  if (error) {
    throw new Error(`Failed to validate dependencies: ${error.message}`);
  }

  const depMap = new Map<string, string[]>();
  for (const feature of allFeatures ?? []) {
    const featureIdValue = feature.id as string;
    const featureDeps = Array.isArray(feature.depends_on)
      ? feature.depends_on.filter((dep) => typeof dep === "string")
      : [];
    depMap.set(featureIdValue, featureDeps);
  }

  // Simulate the proposed dependency update before walking the graph.
  depMap.set(featureId, proposedDeps);

  const queue: Array<{ node: string; path: string[] }> = proposedDeps.map((dep) => ({
    node: dep,
    path: [featureId, dep],
  }));
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (current.node === featureId) {
      return { cycle: true, path: current.path };
    }

    if (visited.has(current.node)) continue;
    visited.add(current.node);

    for (const dep of depMap.get(current.node) ?? []) {
      queue.push({ node: dep, path: [...current.path, dep] });
    }
  }

  return { cycle: false };
}

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
    const {
      feature_id,
      title,
      description,
      priority,
      status,
      spec,
      acceptance_tests,
      human_checklist,
      fast_track,
      job_id,
      depends_on,
    } = body;

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

    if (depends_on !== undefined) {
      if (!Array.isArray(depends_on) || depends_on.some((dep) => typeof dep !== "string")) {
        return jsonResponse({ error: "depends_on must be an array of UUID strings when provided" }, 400);
      }

      if (depends_on.includes(feature_id)) {
        return jsonResponse({ error: "A feature cannot depend on itself" }, 400);
      }

      const { cycle, path } = await wouldCreateCycle(supabase, feature_id, depends_on);
      if (cycle) {
        return jsonResponse(
          { error: `Circular dependency detected: ${(path ?? [feature_id]).join(" → ")}` },
          400,
        );
      }
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
    if (depends_on !== undefined) updates.depends_on = depends_on;
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
      if (`${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.includes("no_self_dep")) {
        return jsonResponse({ error: "A feature cannot depend on itself" }, 400);
      }
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
