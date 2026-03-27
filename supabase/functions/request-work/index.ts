/**
 * zazigv2 — request-work Edge Function
 *
 * Synchronously requests a standalone operational job by delegating validation
 * + insertion to the atomic Postgres function `request_standalone_work(...)`.
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

    const body = await req.json();
    const {
      company_id,
      project_id,
      feature_id,
      role,
      context,
    } = body as {
      company_id?: string;
      project_id?: string;
      feature_id?: string | null;
      role?: string;
      context?: string;
    };

    if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);
    if (!project_id) return jsonResponse({ error: "project_id is required" }, 400);
    if (!role) return jsonResponse({ error: "role is required" }, 400);
    if (!context || context.trim().length === 0) {
      return jsonResponse({ error: "context is required" }, 400);
    }

    const { data, error } = await supabase.rpc("request_standalone_work", {
      p_company_id: company_id,
      p_project_id: project_id,
      p_feature_id: feature_id ?? null,
      p_role: role,
      p_context: context,
    });

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    if (!data) {
      return jsonResponse({ rejected: true, reason: "No response from request_standalone_work" }, 500);
    }

    return jsonResponse(data as Record<string, unknown>);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
