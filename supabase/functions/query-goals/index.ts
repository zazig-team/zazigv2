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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

      const goals = [data];
      await attachProgress(supabase, goals);

      return jsonResponse({ goals });
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
        {
          error:
            "Cannot resolve company_id — provide goal_id, company_id, or valid job_id",
        },
        400,
      );
    }

    let query = supabase
      .from("goals")
      .select(GOAL_SELECT)
      .eq("company_id", company_id)
      .order("position", { ascending: true });

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

    const goals = data ?? [];
    await attachProgress(supabase, goals);

    return jsonResponse({ goals });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});

// ---------------------------------------------------------------------------
// Goal progress helper
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
async function attachProgress(supabase: any, goals: any[]): Promise<void> {
  if (goals.length === 0) return;

  const goalIds = goals.map((goal) => goal.id);

  const { data: goalFocusLinks, error: goalFocusError } = await supabase
    .from("focus_area_goals")
    .select("goal_id, focus_area_id")
    .in("goal_id", goalIds);

  if (goalFocusError) {
    throw new Error(
      `Failed to fetch goal-focus links: ${goalFocusError.message}`,
    );
  }

  if (!goalFocusLinks || goalFocusLinks.length === 0) {
    for (const goal of goals) {
      goal.progress = 0;
    }
    return;
  }

  const focusAreaIds = [
    ...new Set(
      goalFocusLinks.map((link: { focus_area_id: string }) =>
        link.focus_area_id
      ),
    ),
  ];

  const { data: focusFeatureLinks, error: focusFeatureError } = await supabase
    .from("feature_focus_areas")
    .select("focus_area_id, feature_id")
    .in("focus_area_id", focusAreaIds);

  if (focusFeatureError) {
    throw new Error(
      `Failed to fetch focus-feature links: ${focusFeatureError.message}`,
    );
  }

  if (!focusFeatureLinks || focusFeatureLinks.length === 0) {
    for (const goal of goals) {
      goal.progress = 0;
    }
    return;
  }

  const featureIds = [
    ...new Set(
      focusFeatureLinks.map((link: { feature_id: string }) => link.feature_id),
    ),
  ];

  const { data: features, error: featureError } = await supabase
    .from("features")
    .select("id, status")
    .in("id", featureIds);

  if (featureError) {
    throw new Error(`Failed to fetch features: ${featureError.message}`);
  }

  const completedFeatureIds = new Set(
    (features ?? [])
      .filter((feature: { status: string }) =>
        feature.status === "complete" || feature.status === "shipped"
      )
      .map((feature: { id: string }) => feature.id),
  );

  const featuresByFocusArea = new Map<string, Set<string>>();
  for (const link of focusFeatureLinks) {
    if (!featuresByFocusArea.has(link.focus_area_id)) {
      featuresByFocusArea.set(link.focus_area_id, new Set());
    }
    featuresByFocusArea.get(link.focus_area_id)!.add(link.feature_id);
  }

  const featuresByGoal = new Map<string, Set<string>>();
  for (const link of goalFocusLinks) {
    const linkedFeatures = featuresByFocusArea.get(link.focus_area_id);
    if (!linkedFeatures) continue;

    if (!featuresByGoal.has(link.goal_id)) {
      featuresByGoal.set(link.goal_id, new Set());
    }

    const goalFeatures = featuresByGoal.get(link.goal_id)!;
    for (const featureId of linkedFeatures) {
      goalFeatures.add(featureId);
    }
  }

  for (const goal of goals) {
    const goalFeatureIds = featuresByGoal.get(goal.id) ?? new Set<string>();
    const totalFeatures = goalFeatureIds.size;

    if (totalFeatures === 0) {
      goal.progress = 0;
      continue;
    }

    let completedFeatures = 0;
    for (const featureId of goalFeatureIds) {
      if (completedFeatureIds.has(featureId)) {
        completedFeatures += 1;
      }
    }

    goal.progress = Math.round((completedFeatures / totalFeatures) * 100);
  }
}
