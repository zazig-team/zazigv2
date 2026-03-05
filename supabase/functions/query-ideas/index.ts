/**
 * zazigv2 — query-ideas Edge Function
 *
 * POST endpoint for querying ideas with optional filters.
 * Supports single-idea lookup, field-based filters, and full-text search.
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

    const url = new URL(req.url);
    const itemTypeParam = url.searchParams.get("item_type");
    const horizonParam = url.searchParams.get("horizon");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const {
      idea_id,
      status,
      statuses,
      domain,
      source,
      priority,
      project_id,
      search,
      company_id,
      limit = 50,
    } = body;

    // Single idea by ID — return all columns
    if (idea_id) {
      let singleQuery = supabase
        .from("ideas")
        .select("*")
        .eq("id", idea_id);

      if (company_id) {
        singleQuery = singleQuery.eq("company_id", company_id);
      }
      if (itemTypeParam) {
        singleQuery = singleQuery.eq("item_type", itemTypeParam);
      }
      if (horizonParam) {
        singleQuery = singleQuery.eq("horizon", horizonParam);
      }

      const { data, error } = await singleQuery.single();

      if (error) {
        return jsonResponse({ error: error.message }, 404);
      }

      return jsonResponse({ ideas: [data] });
    }

    // Filtered query
    let query = supabase.from("ideas").select("*");

    if (Array.isArray(statuses) && statuses.length > 0) {
      query = query.in("status", statuses);
    } else if (status) {
      query = query.eq("status", status);
    }
    if (domain) {
      query = query.eq("domain", domain);
    }
    if (source) {
      query = query.eq("source", source);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }
    if (project_id) {
      query = query.eq("project_id", project_id);
    }
    if (itemTypeParam) {
      query = query.eq("item_type", itemTypeParam);
    }
    if (horizonParam) {
      query = query.eq("horizon", horizonParam);
    }

    // Full-text search over title + description via the `fts` generated column
    if (search) {
      query = query.textSearch("fts", search, { config: "english" });
    }

    if (company_id) {
      query = query.eq("company_id", company_id);
    }

    query = query
      .order("created_at", { ascending: false })
      .limit(limit);

    const { data, error } = await query;

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ ideas: data ?? [] });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
