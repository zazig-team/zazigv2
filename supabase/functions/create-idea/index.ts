/**
 * zazigv2 — create-idea Edge Function
 *
 * Creates a new idea record and emits an idea_created event.
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
      raw_text,
      originator,
      source,
      title,
      description,
      scope,
      complexity,
      domain,
      autonomy,
      tags,
      flags,
      clarification_notes,
      processed_by,
      source_ref,
      project_id,
      priority,
      suggested_exec,
      company_id: explicit_company_id,
      job_id,
      item_type,
    } = body;

    if (!raw_text) {
      return jsonResponse({ error: "raw_text is required" }, 400);
    }
    if (!originator) {
      return jsonResponse({ error: "originator is required" }, 400);
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

    // Insert idea
    const { data: idea, error } = await supabase
      .from("ideas")
      .insert({
        raw_text,
        originator,
        status: "new",
        company_id: company_id ?? null,
        source: source ?? null,
        title: title ?? null,
        description: description ?? null,
        scope: scope ?? null,
        complexity: complexity ?? null,
        domain: domain ?? null,
        autonomy: autonomy ?? null,
        tags: tags ?? null,
        flags: flags ?? null,
        clarification_notes: clarification_notes ?? null,
        processed_by: processed_by ?? null,
        source_ref: source_ref ?? null,
        project_id: project_id ?? null,
        priority: priority ?? "medium",
        suggested_exec: suggested_exec ?? null,
        item_type: item_type ?? "idea",
      })
      .select("id")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    // Emit idea_created event
    await supabase.from("events").insert({
      company_id: company_id ?? null,
      idea_id: idea.id,
      event_type: "idea_created",
    });

    return jsonResponse({ idea_id: idea.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
