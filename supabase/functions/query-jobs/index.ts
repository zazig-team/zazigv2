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

const JOB_SELECT = "id, title, status, role, job_type, complexity, depends_on, started_at, completed_at, result, feature_id, project_id, updated_at, created_at";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enrichJob(job: Record<string, any>): Record<string, unknown> {
  const isFailed = job.status === "failed";
  return {
    ...job,
    error_message: isFailed ? (job.result ?? null) : null,
    error_details: null,
  };
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
      job_id,
      id,
      feature_id,
      status,
      limit: rawLimit,
      offset: rawOffset,
    } = body;
    const limit = Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 20;
    const offset = Number.isFinite(Number(rawOffset)) ? Number(rawOffset) : 0;
    const singleJobId = id ?? job_id;

    if (!singleJobId && !feature_id) {
      return jsonResponse(
        { error: "At least one of job_id or feature_id is required" },
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

      return jsonResponse({ jobs: [enrichJob(data)] });
    }

    // Jobs for a feature, optionally filtered by status
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

    return jsonResponse({ jobs: (data ?? []).map(enrichJob) });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
