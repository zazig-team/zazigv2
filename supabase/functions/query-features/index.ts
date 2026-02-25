/**
 * zazigv2 — query-features Edge Function
 *
 * Bounded read of features for a given project_id or feature_id.
 * The Breakdown Specialist needs to read a feature's spec and
 * acceptance criteria before running jobify.
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

const FEATURE_SELECT = "id, title, description, spec, acceptance_tests, human_checklist, status, priority, project_id";

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
    const { feature_id, project_id, status } = body;

    if (!feature_id && !project_id) {
      return jsonResponse(
        { error: "At least one of feature_id or project_id is required" },
        400,
      );
    }

    // Single feature by ID
    if (feature_id) {
      const { data, error } = await supabase
        .from("features")
        .select(FEATURE_SELECT)
        .eq("id", feature_id)
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 404);
      }

      return jsonResponse({ features: [data] });
    }

    // Features for a project, optionally filtered by status
    let query = supabase
      .from("features")
      .select(FEATURE_SELECT)
      .eq("project_id", project_id);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ features: data ?? [] });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
