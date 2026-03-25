/**
 * zazigv2 — create-focus-area Edge Function
 *
 * Creates a new focus area and optionally links it to goals.
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
      title,
      description,
      domain_tags,
      proposed_by,
      goal_ids,
      company_id: explicit_company_id,
      job_id,
    } = body;

    if (!title) {
      return jsonResponse({ error: "title is required" }, 400);
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

    // Insert focus area
    const { data: focusArea, error } = await supabase
      .from("focus_areas")
      .insert({
        company_id,
        title,
        description: description ?? null,
        domain_tags: domain_tags ?? [],
        proposed_by: proposed_by ?? null,
      })
      .select("id")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    // Link to goals if provided
    if (goal_ids && Array.isArray(goal_ids) && goal_ids.length > 0) {
      const rows = goal_ids.map((goal_id: string) => ({
        focus_area_id: focusArea.id,
        goal_id,
      }));

      const { error: linkError } = await supabase
        .from("focus_area_goals")
        .insert(rows);

      if (linkError) {
        return jsonResponse({ error: `Focus area created but goal linking failed: ${linkError.message}` }, 500);
      }
    }

    return jsonResponse({ focus_area_id: focusArea.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
