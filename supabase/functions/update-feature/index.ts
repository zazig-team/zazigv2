/**
 * zazigv2 — update-feature Edge Function
 *
 * Updates an existing feature on behalf of the CPO agent.
 * Guards status transitions: CPO may only set 'created' or 'ready_for_breakdown'.
 * Fires a feature_status_changed event when status → ready_for_breakdown.
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

// CPO can only set these statuses — all others are orchestrator-managed
const ALLOWED_CPO_STATUSES = ["created", "ready_for_breakdown"] as const;

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
    const { feature_id, title, description, priority, status, job_id } = body;

    if (!feature_id) {
      return jsonResponse({ error: "feature_id is required" }, 400);
    }

    // Guard status transitions
    if (status && !ALLOWED_CPO_STATUSES.includes(status)) {
      return jsonResponse(
        { error: `Cannot set status '${status}' — CPO may only set: ${ALLOWED_CPO_STATUSES.join(", ")}` },
        400,
      );
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (job_id !== undefined) updates.job_id = job_id;

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ ok: true, note: "nothing to update" });
    }

    const { error } = await supabase
      .from("features")
      .update(updates)
      .eq("id", feature_id);

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    // If status changed to ready_for_breakdown, insert event so orchestrator picks it up
    if (status === "ready_for_breakdown") {
      await supabase.from("events").insert({
        feature_id,
        event: "feature_status_changed",
        detail: { from: null, to: "ready_for_breakdown" },
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
