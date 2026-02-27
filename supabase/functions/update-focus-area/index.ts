/**
 * zazigv2 — update-focus-area Edge Function
 *
 * Updates a focus area's scalar fields and manages junction table links
 * for both focus_area_goals and feature_focus_areas.
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
      focus_area_id,
      title,
      description,
      status,
      position,
      domain_tags,
      approved_at,
      add_goal_ids,
      remove_goal_ids,
      add_feature_ids,
      remove_feature_ids,
    } = body;

    if (!focus_area_id) {
      return jsonResponse({ error: "focus_area_id is required" }, 400);
    }

    // Build scalar update object
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (position !== undefined) updates.position = position;
    if (domain_tags !== undefined) updates.domain_tags = domain_tags;
    if (approved_at !== undefined) updates.approved_at = approved_at;

    // Apply scalar updates if any
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from("focus_areas")
        .update(updates)
        .eq("id", focus_area_id);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }
    }

    // Manage focus_area_goals links
    if (add_goal_ids && Array.isArray(add_goal_ids) && add_goal_ids.length > 0) {
      const rows = add_goal_ids.map((goal_id: string) => ({
        focus_area_id,
        goal_id,
      }));

      const { error } = await supabase
        .from("focus_area_goals")
        .upsert(rows, { onConflict: "focus_area_id,goal_id", ignoreDuplicates: true });

      if (error) {
        return jsonResponse({ error: `add_goal_ids failed: ${error.message}` }, 500);
      }
    }

    if (remove_goal_ids && Array.isArray(remove_goal_ids) && remove_goal_ids.length > 0) {
      const { error } = await supabase
        .from("focus_area_goals")
        .delete()
        .eq("focus_area_id", focus_area_id)
        .in("goal_id", remove_goal_ids);

      if (error) {
        return jsonResponse({ error: `remove_goal_ids failed: ${error.message}` }, 500);
      }
    }

    // Manage feature_focus_areas links
    if (add_feature_ids && Array.isArray(add_feature_ids) && add_feature_ids.length > 0) {
      const rows = add_feature_ids.map((feature_id: string) => ({
        feature_id,
        focus_area_id,
      }));

      const { error } = await supabase
        .from("feature_focus_areas")
        .upsert(rows, { onConflict: "feature_id,focus_area_id", ignoreDuplicates: true });

      if (error) {
        return jsonResponse({ error: `add_feature_ids failed: ${error.message}` }, 500);
      }
    }

    if (remove_feature_ids && Array.isArray(remove_feature_ids) && remove_feature_ids.length > 0) {
      const { error } = await supabase
        .from("feature_focus_areas")
        .delete()
        .eq("focus_area_id", focus_area_id)
        .in("feature_id", remove_feature_ids);

      if (error) {
        return jsonResponse({ error: `remove_feature_ids failed: ${error.message}` }, 500);
      }
    }

    return jsonResponse({ updated: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
