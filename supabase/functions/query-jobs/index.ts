/**
 * zazigv2 — query-jobs Edge Function
 *
 * Bounded read of jobs by job_id, feature_id, or status filter.
 * Used by the Verification Specialist to poll job status during
 * active acceptance testing.
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

const JOB_SELECT = "id, title, status, role, job_type, complexity, depends_on, started_at, completed_at, result, feature_id, project_id";

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
    const { job_id, feature_id, status, limit = 20, offset = 0 } = body;

    if (!job_id && !feature_id && !status) {
      return jsonResponse(
        { error: "At least one of job_id, feature_id, or status is required" },
        400,
      );
    }

    // Single job by ID
    if (job_id) {
      const { data, error } = await supabase
        .from("jobs")
        .select(JOB_SELECT)
        .eq("id", job_id)
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 404);
      }

      return jsonResponse({ jobs: [data] });
    }

    // Jobs for a feature, optionally filtered by status
    const pageLimit = typeof limit === "number" ? limit : Number(limit);
    const pageOffset = typeof offset === "number" ? offset : Number(offset);

    let query = supabase
      .from("jobs")
      .select(JOB_SELECT, { count: "exact" })
      .range(pageOffset, pageOffset + pageLimit - 1);

    if (feature_id) {
      query = query.eq("feature_id", feature_id);
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ jobs: data ?? [], total_count: count ?? null });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
