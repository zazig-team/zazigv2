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

const JOB_SELECT =
  "id, title, status, role, job_type, complexity, depends_on, started_at, completed_at, result, feature_id, project_id, features:features!jobs_feature_id_fkey(title)";

type JobRow = Record<string, unknown> & {
  features?: { title?: unknown } | null;
};

function parseStatuses(status: unknown): string[] {
  if (Array.isArray(status)) {
    return status
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0);
  }

  if (typeof status === "string") {
    return status
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  return [];
}

function mapJobRecord(job: JobRow): Record<string, unknown> {
  const featureTitle =
    job.features && typeof job.features === "object"
      ? (job.features as { title?: unknown }).title
      : undefined;

  const mapped: Record<string, unknown> = { ...job };
  delete mapped.features;
  mapped.feature_title = typeof featureTitle === "string" ? featureTitle : null;
  return mapped;
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
    const { job_id, id, feature_id, status, limit: rawLimit, offset: rawOffset } = body;
    const limit = Number.isFinite(Number(rawLimit)) ? Number(rawLimit) : 20;
    const offset = Number.isFinite(Number(rawOffset)) ? Number(rawOffset) : 0;
    const singleJobId = id ?? job_id;
    const statuses = parseStatuses(status);

    if (!singleJobId && !feature_id && statuses.length === 0) {
      return jsonResponse(
        { error: "At least one of job_id, feature_id, or status is required" },
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

      return jsonResponse({ jobs: [mapJobRecord(data as JobRow)] });
    }

    // Jobs filtered by feature and/or status
    let query = supabase
      .from("jobs")
      .select(JOB_SELECT, { count: "exact" })
      .order("created_at", { ascending: false });

    if (feature_id) {
      query = query.eq("feature_id", feature_id);
    }

    if (statuses.length === 1) {
      query = query.eq("status", statuses[0]);
    } else if (statuses.length > 1) {
      query = query.in("status", statuses);
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    const jobs = (data ?? []).map((job) => mapJobRecord(job as JobRow));
    return jsonResponse({ jobs, total: count ?? jobs.length });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
