/**
 * zazigv2 — create-project Edge Function
 *
 * Creates a new project record. The Project Architect contractor
 * calls this when structuring an approved plan.
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
    const { company_id, name, description, status } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return jsonResponse({ error: "name is required (non-empty string)" }, 400);
    }

    if (!company_id) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }

    // Validate company exists
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return jsonResponse({ error: `Company not found: ${company_id}` }, 404);
    }

    // Insert project
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        company_id,
        name: name.trim(),
        description: description ?? null,
        status: status ?? "active",
      })
      .select("id")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ project_id: project.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
