/**
 * zazigv2 — update-project Edge Function
 *
 * Updates project fields, including CI command settings.
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
    const { project_id, name, description, test_command, build_command } = body;

    if (!project_id) {
      return jsonResponse({ error: "project_id is required" }, 400);
    }

    const updates: Record<string, unknown> = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim() === "") {
        return jsonResponse({ error: "name must be a non-empty string when provided" }, 400);
      }
      updates.name = name.trim();
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return jsonResponse({ error: "description must be a string or null when provided" }, 400);
      }
      updates.description = description;
    }

    if (test_command !== undefined) {
      if (test_command !== null && typeof test_command !== "string") {
        return jsonResponse({ error: "test_command must be a string or null when provided" }, 400);
      }
      updates.test_command = typeof test_command === "string" ? test_command.trim() : null;
    }

    if (build_command !== undefined) {
      if (build_command !== null && typeof build_command !== "string") {
        return jsonResponse({ error: "build_command must be a string or null when provided" }, 400);
      }
      updates.build_command = typeof build_command === "string" ? build_command.trim() : null;
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({
        error: "At least one updatable field is required: name, description, test_command, build_command",
      }, 400);
    }

    const { data: project, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", project_id)
      .select("*")
      .maybeSingle();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    if (!project) {
      return jsonResponse({ error: `Project not found: ${project_id}` }, 404);
    }

    return jsonResponse({ project });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
