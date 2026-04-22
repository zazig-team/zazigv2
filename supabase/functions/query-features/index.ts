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

const FEATURE_SELECT = "id, title, description, spec, acceptance_tests, human_checklist, status, priority, project_id, depends_on, promoted_version, updated_at, retry_count";
// Slim select for dedup checks — only what's needed to identify a duplicate
const DEDUP_SELECT = "id, title, description, status";

// ---------------------------------------------------------------------------
// Error summary helpers
// ---------------------------------------------------------------------------

type FeatureRow = Record<string, unknown>;

function computeHealth(feature: FeatureRow, failedJobCount: number): string {
  if (failedJobCount === 0) return "healthy";
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const updatedAt = feature.updated_at as string | null;
  if (!updatedAt || updatedAt < oneHourAgo) return "stuck";
  return "degraded";
}

async function enrichFeaturesWithErrorSummary(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  features: FeatureRow[],
): Promise<FeatureRow[]> {
  if (features.length === 0) return features;

  const featureIds = features.map((f) => f.id as string);

  const { data: failedJobs } = await supabase
    .from("jobs")
    .select("feature_id")
    .in("feature_id", featureIds)
    .eq("status", "failed");

  const failedCountMap: Record<string, number> = {};
  for (const job of failedJobs ?? []) {
    const fid = job.feature_id as string;
    failedCountMap[fid] = (failedCountMap[fid] ?? 0) + 1;
  }

  return features.map((f) => {
    const fid = f.id as string;
    const failed_job_count = failedCountMap[fid] ?? 0;
    const critical_error_count = failed_job_count;
    const health = computeHealth(f, failed_job_count);
    return { ...f, failed_job_count, critical_error_count, health };
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
    const { feature_id, project_id, status, limit = 20, offset = 0, search, dedup_mode } = body;

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

      const [enriched] = await enrichFeaturesWithErrorSummary(supabase, [data]);
      return jsonResponse({ features: [enriched], total: 1 });
    }

    // Features for a project, optionally filtered by status and/or search term.
    // dedup_mode=true returns a slim column set (id, title, description, status) —
    // enough for duplicate detection without bloating the LLM context with full specs.
    const selectCols = dedup_mode ? DEDUP_SELECT : FEATURE_SELECT;
    const effectiveLimit = dedup_mode && !search ? Math.min(limit, 20) : limit;

    let query = supabase
      .from("features")
      .select(selectCols, { count: "exact" })
      .eq("project_id", project_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + effectiveLimit - 1);

    // status can be a string (single) or array (multiple) — e.g. ["complete","building"]
    if (status) {
      if (Array.isArray(status)) {
        query = query.in("status", status);
      } else {
        query = query.eq("status", status);
      }
    }

    // search filters title and description server-side, dramatically reducing
    // the result set the LLM needs to reason over for duplicate detection
    if (search && typeof search === "string") {
      const safe = search.replace(/[%_\\]/g, "\\$&").trim();
      if (safe.length > 0) {
        query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
      }
    }

    const { data, error, count } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    const features = dedup_mode
      ? (data ?? [])
      : await enrichFeaturesWithErrorSummary(supabase, data ?? []);

    return jsonResponse({ features, total: count ?? 0 });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
