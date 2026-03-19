/**
 * zazigv2 — create-feature Edge Function
 *
 * Creates a new feature record on behalf of the CPO agent.
 * Resolves company_id from the provided job_id.
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
      project_id,
      title,
      description,
      priority,
      job_id,
      company_id: explicit_company_id,
      spec,
      acceptance_tests,
      human_checklist,
      fast_track,
      depends_on,
    } = body;

    if (!title) {
      return jsonResponse({ error: "title is required" }, 400);
    }

    if (fast_track !== undefined && typeof fast_track !== "boolean") {
      return jsonResponse({ error: "fast_track must be a boolean when provided" }, 400);
    }

    if (depends_on !== undefined) {
      if (!Array.isArray(depends_on) || depends_on.some((dep) => typeof dep !== "string")) {
        return jsonResponse({ error: "depends_on must be an array of UUID strings when provided" }, 400);
      }
    }

    // Resolve company_id: explicit param > job lookup
    let company_id: string | null = explicit_company_id ?? null;
    if (!company_id && job_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("company_id")
        .eq("id", job_id)
        .single();
      company_id = job?.company_id ?? null;
    }

    if (!company_id) {
      return jsonResponse({ error: "Cannot resolve company_id — provide company_id or valid job_id" }, 400);
    }

    // Insert feature
    const insertPayload: Record<string, unknown> = {
      company_id,
      project_id: project_id ?? null,
      title,
      description: description ?? null,
      priority: priority ?? "medium",
      status: "breaking_down",
    };
    if (spec !== undefined) insertPayload.spec = spec;
    if (acceptance_tests !== undefined) insertPayload.acceptance_tests = acceptance_tests;
    if (human_checklist !== undefined) insertPayload.human_checklist = human_checklist;
    if (fast_track !== undefined) insertPayload.fast_track = fast_track;
    if (depends_on !== undefined) insertPayload.depends_on = depends_on;

    const { data: feature, error } = await supabase
      .from("features")
      .insert(insertPayload)
      .select("id, company_id")
      .single();

    if (error) {
      if (`${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`.includes("no_self_dep")) {
        return jsonResponse({ error: "A feature cannot depend on itself" }, 400);
      }
      return jsonResponse({ error: error.message }, 500);
    }

    // Emit event so orchestrator picks up the new breaking_down feature
    await supabase.from("events").insert({
      company_id: feature.company_id,
      feature_id: feature.id,
      event_type: "feature_status_changed",
      detail: { from: null, to: "breaking_down" },
    });

    return jsonResponse({ feature_id: feature.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
