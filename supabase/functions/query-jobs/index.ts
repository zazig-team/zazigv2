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

const JOB_SELECT = "id, title, status, role, job_type, complexity, depends_on, created_at, started_at, updated_at, completed_at, result, error_message, error_details, feature_id, idea_id, project_id";

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
      job_id,
      id,
      feature_id,
      company_id,
      status,
      limit: rawLimit,
      offset: rawOffset,
    } = body;
    const limit = Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 20;
    const offset = Number.isFinite(Number(rawOffset)) ? Number(rawOffset) : 0;
    const singleJobId = id ?? job_id;

    if (!singleJobId && !feature_id && !company_id) {
      return jsonResponse(
        { error: "At least one of job_id, feature_id, or company_id is required" },
        400,
      );
    }

    // Single job by ID
    if (singleJobId) {
      const { data, error } = await supabase
        .from("jobs")
        .select(JOB_SELECT)
        .eq("id", singleJobId)
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 404);
      }

      return jsonResponse({ jobs: [data] });
    }

    // Jobs for a feature, optionally filtered by status
    if (feature_id) {
      let query = supabase
        .from("jobs")
        .select(JOB_SELECT)
        .eq("feature_id", feature_id);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query.range(offset, offset + limit - 1);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      return jsonResponse({ jobs: data ?? [] });
    }

    // Jobs for a company (no feature_id or job_id specified)
    let companyQuery = supabase
      .from("jobs")
      .select(JOB_SELECT + ", count()", { count: "exact" })
      .eq("company_id", company_id);

    if (status) {
      companyQuery = companyQuery.eq("status", status);
    }

    companyQuery = companyQuery.order("created_at", { ascending: false });

    const { data, error, count } = await companyQuery.range(offset, offset + limit - 1);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ jobs: data ?? [], total: count ?? 0 });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
