/**
 * zazigv2 — query-search Edge Function
 *
 * Unified bounded search across ideas, features, and jobs.
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

type SearchItem = {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string | null;
  created_at: string;
  updated_at: string;
};

type GroupedResult = {
  items: SearchItem[];
  count: number;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function truncateDescription(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  return text.length > 200 ? text.slice(0, 200) : text;
}

function normalizeItem(row: Record<string, unknown>): SearchItem {
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    description: truncateDescription(row.description),
    status: String(row.status ?? ""),
    priority: row.priority === null || row.priority === undefined ? null : String(row.priority),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function parseTypes(type: unknown): Set<"idea" | "feature" | "job"> {
  const allTypes: Array<"idea" | "feature" | "job"> = ["idea", "feature", "job"];
  if (typeof type !== "string" || type.trim().length === 0) {
    return new Set(allTypes);
  }

  const parsed = type
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is "idea" | "feature" | "job" => allTypes.includes(entry as "idea" | "feature" | "job"));

  return parsed.length > 0 ? new Set(parsed) : new Set(allTypes);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed. Use POST." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const body = await req.json();
    const {
      company_id,
      query,
      type,
      status,
      limit: rawLimit = 20,
      offset: rawOffset = 0,
    } = body;

    if (typeof company_id !== "string" || company_id.trim().length === 0) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }

    if (typeof query !== "string" || query.trim().length === 0) {
      return jsonResponse({ error: "query is required and must be non-empty" }, 400);
    }

    const parsedLimit = Number(rawLimit);
    const parsedOffset = Number(rawOffset);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.floor(parsedLimit))) : 20;
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, Math.floor(parsedOffset)) : 0;

    // Escape wildcard characters before building the ilike pattern.
    const sanitizedQuery = query.trim().replace(/[%_]/g, "\\$&");
    const ilikePattern = `%${sanitizedQuery}%`;

    const requestedTypes = parseTypes(type);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let ideas: GroupedResult = { items: [], count: 0 };
    let features: GroupedResult = { items: [], count: 0 };
    let jobs: GroupedResult = { items: [], count: 0 };

    if (requestedTypes.has("idea")) {
      let ideasQuery = supabase
        .from("ideas")
        .select("id, title, description, status, priority, created_at, updated_at", { count: "exact" })
        .eq("company_id", company_id)
        .or(`title.ilike.${ilikePattern},description.ilike.${ilikePattern}`)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (typeof status === "string" && status.trim().length > 0) {
        ideasQuery = ideasQuery.eq("status", status);
      }

      const { data, error, count } = await ideasQuery;
      if (error) {
        throw error;
      }

      ideas = {
        items: (data ?? []).map((row) => normalizeItem(row as Record<string, unknown>)),
        count: count ?? 0,
      };
    }

    if (requestedTypes.has("feature")) {
      let featuresQuery = supabase
        .from("features")
        .select("id, title, description, status, priority, created_at, updated_at", { count: "exact" })
        .eq("company_id", company_id)
        .or(`title.ilike.${ilikePattern},description.ilike.${ilikePattern}`)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (typeof status === "string" && status.trim().length > 0) {
        featuresQuery = featuresQuery.eq("status", status);
      }

      const { data, error, count } = await featuresQuery;
      if (error) {
        throw error;
      }

      features = {
        items: (data ?? []).map((row) => normalizeItem(row as Record<string, unknown>)),
        count: count ?? 0,
      };
    }

    if (requestedTypes.has("job")) {
      let jobsQuery = supabase
        .from("jobs")
        .select("id, title, description, status, priority, created_at, updated_at", { count: "exact" })
        .eq("company_id", company_id)
        .or(`title.ilike.${ilikePattern},description.ilike.${ilikePattern}`)
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (typeof status === "string" && status.trim().length > 0) {
        jobsQuery = jobsQuery.eq("status", status);
      }

      const { data, error, count } = await jobsQuery;
      if (error) {
        throw error;
      }

      jobs = {
        items: (data ?? []).map((row) => normalizeItem(row as Record<string, unknown>)),
        count: count ?? 0,
      };
    }

    return jsonResponse({
      ideas,
      features,
      jobs,
      total: ideas.count + features.count + jobs.count,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
