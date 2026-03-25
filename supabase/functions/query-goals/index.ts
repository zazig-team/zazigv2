/**
 * zazigv2 — query-goals Edge Function
 *
 * Reads goals scoped to a company. Supports single lookup by
 * goal_id or filtered list by status/time_horizon.
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

const GOAL_SELECT =
  "id, company_id, title, description, time_horizon, metric, target, target_date, status, achieved_at, position, created_at, updated_at";

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
      goal_id,
      status,
      time_horizon,
      company_id: explicit_company_id,
      job_id,
    } = body;

    // Single lookup by goal_id — no company_id resolution needed
    if (goal_id) {
      const { data, error } = await supabase
        .from("goals")
        .select(GOAL_SELECT)
        .eq("id", goal_id)
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 404);
      }

      return jsonResponse({ goals: [data] });
    }

    // List query — resolve company_id: explicit param > job lookup
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
      return jsonResponse(
        { error: "Cannot resolve company_id — provide goal_id, company_id, or valid job_id" },
        400,
      );
    }

    let query = supabase
      .from("goals")
      .select(GOAL_SELECT)
      .eq("company_id", company_id);

    if (status) {
      query = query.eq("status", status);
    }

    if (time_horizon) {
      query = query.eq("time_horizon", time_horizon);
    }

    const { data, error } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ goals: data ?? [] });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
