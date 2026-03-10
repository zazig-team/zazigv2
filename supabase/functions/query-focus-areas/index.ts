/**
 * zazigv2 — query-focus-areas Edge Function
 *
 * Reads focus areas for a company, optionally including linked goals.
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

const FOCUS_AREA_SELECT = "id, company_id, title, description, status, health, position, domain_tags, proposed_by, approved_at, created_at, updated_at";

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
      focus_area_id,
      status,
      include_goals,
      company_id: explicit_company_id,
      job_id,
    } = body;

    // Single lookup by ID — no company_id needed
    if (focus_area_id) {
      const { data, error } = await supabase
        .from("focus_areas")
        .select(FOCUS_AREA_SELECT)
        .eq("id", focus_area_id)
        .single();

      if (error) {
        return jsonResponse({ error: error.message }, 404);
      }

      const focusAreas = [data];

      if (include_goals) {
        await attachGoals(supabase, focusAreas);
      }

      return jsonResponse({ focus_areas: focusAreas });
    }

    // List query — requires company_id
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
      return jsonResponse({ error: "Cannot resolve company_id — provide company_id, job_id, or focus_area_id" }, 400);
    }

    let query = supabase
      .from("focus_areas")
      .select(FOCUS_AREA_SELECT)
      .eq("company_id", company_id)
      .order("position", { ascending: true });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    const focusAreas = data ?? [];

    if (include_goals && focusAreas.length > 0) {
      await attachGoals(supabase, focusAreas);
    }

    return jsonResponse({ focus_areas: focusAreas });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Goal attachment helper
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function attachGoals(supabase: any, focusAreas: any[]): Promise<void> {
  const ids = focusAreas.map((fa) => fa.id);

  // Get all junction rows for these focus areas
  const { data: links } = await supabase
    .from("focus_area_goals")
    .select("focus_area_id, goal_id")
    .in("focus_area_id", ids);

  if (!links || links.length === 0) {
    for (const fa of focusAreas) {
      fa.goals = [];
    }
    return;
  }

  // Collect unique goal IDs and fetch them
  const goalIds = [...new Set(links.map((l: { goal_id: string }) => l.goal_id))];
  const { data: goals } = await supabase
    .from("goals")
    .select("id, title, description, time_horizon, metric, target, target_date, status")
    .in("id", goalIds);

  const goalMap = new Map((goals ?? []).map((g: { id: string }) => [g.id, g]));

  // Build a map of focus_area_id → goals[]
  const faGoalMap = new Map<string, unknown[]>();
  for (const link of links) {
    const goal = goalMap.get(link.goal_id);
    if (goal) {
      if (!faGoalMap.has(link.focus_area_id)) {
        faGoalMap.set(link.focus_area_id, []);
      }
      faGoalMap.get(link.focus_area_id)!.push(goal);
    }
  }

  for (const fa of focusAreas) {
    fa.goals = faGoalMap.get(fa.id) ?? [];
  }
}
