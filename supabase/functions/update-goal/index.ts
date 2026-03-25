/**
 * zazigv2 — update-goal Edge Function
 *
 * Updates an existing goal. Auto-sets achieved_at when
 * status transitions to 'achieved' without an explicit timestamp.
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
      goal_id,
      title,
      description,
      time_horizon,
      metric,
      target,
      target_date,
      status,
      achieved_at,
      position,
    } = body;

    if (!goal_id) {
      return jsonResponse({ error: "goal_id is required" }, 400);
    }

    // Build update payload with only provided fields
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (time_horizon !== undefined) updates.time_horizon = time_horizon;
    if (metric !== undefined) updates.metric = metric;
    if (target !== undefined) updates.target = target;
    if (target_date !== undefined) updates.target_date = target_date;
    if (status !== undefined) updates.status = status;
    if (achieved_at !== undefined) updates.achieved_at = achieved_at;
    if (position !== undefined) updates.position = position;

    // Auto-set achieved_at when transitioning to 'achieved'
    if (status === "achieved" && achieved_at === undefined) {
      updates.achieved_at = new Date().toISOString();
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ updated: true, note: "nothing to update" });
    }

    const { error } = await supabase
      .from("goals")
      .update(updates)
      .eq("id", goal_id);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ updated: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
