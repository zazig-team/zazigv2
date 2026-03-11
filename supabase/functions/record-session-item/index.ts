/**
 * zazigv2 — record-session-item Edge Function
 *
 * Records per-item processing metrics for headless expert sessions.
 * Uses service-role access so local agents do not need direct PostgREST table/RPC permissions.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json() as Record<string, unknown>;
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    const ideaId = typeof body.idea_id === "string" ? body.idea_id : "";
    const route = typeof body.route === "string" ? body.route : null;
    const startedAt = typeof body.started_at === "string" ? body.started_at : null;
    const completedAt = typeof body.completed_at === "string" ? body.completed_at : null;

    if (!sessionId) {
      return jsonResponse({ error: "session_id is required" }, 400);
    }
    if (!ideaId) {
      return jsonResponse({ error: "idea_id is required" }, 400);
    }

    const row: Record<string, unknown> = {
      session_id: sessionId,
      idea_id: ideaId,
    };
    if (route) row.route = route;
    if (startedAt) row.started_at = startedAt;
    if (completedAt) row.completed_at = completedAt;

    if (completedAt && !startedAt) {
      const { data: existing } = await supabase
        .from("expert_session_items")
        .select("started_at")
        .eq("session_id", sessionId)
        .eq("idea_id", ideaId)
        .maybeSingle();

      if (existing?.started_at) {
        row.duration_ms = new Date(completedAt).getTime() - new Date(existing.started_at).getTime();
      }
    } else if (completedAt && startedAt) {
      row.duration_ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    }

    const { error: upsertErr } = await supabase
      .from("expert_session_items")
      .upsert(row, { onConflict: "session_id,idea_id" });

    if (upsertErr) {
      return jsonResponse({ error: `Failed to upsert session item: ${upsertErr.message}` }, 500);
    }

    if (completedAt) {
      const { error: syncErr } = await supabase.rpc("sync_session_items_processed", {
        p_session_id: sessionId,
      });
      if (syncErr) {
        return jsonResponse({ error: `Failed to sync items_processed: ${syncErr.message}` }, 500);
      }
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
