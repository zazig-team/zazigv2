/**
 * zazigv2 — get-pipeline-snapshot Edge Function
 *
 * Reads the cached pipeline snapshot for a company from pipeline_snapshots.
 * If no snapshot row exists yet, it performs a cold-start refresh first.
 *
 * GET /functions/v1/get-pipeline-snapshot?company_id=<uuid>
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

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return atob(normalized + "=".repeat(padding));
}

/**
 * Best-effort extraction of company_id from JWT payload.
 * Falls back to null when the header is absent, malformed, or non-JWT.
 */
function companyIdFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;

    if (typeof payload.company_id === "string" && payload.company_id.length > 0) {
      return payload.company_id;
    }
    if (typeof payload.companyId === "string" && payload.companyId.length > 0) {
      return payload.companyId;
    }

    const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
    if (typeof appMetadata?.company_id === "string" && appMetadata.company_id.length > 0) {
      return appMetadata.company_id;
    }

    const userMetadata = payload.user_metadata as Record<string, unknown> | undefined;
    if (typeof userMetadata?.company_id === "string" && userMetadata.company_id.length > 0) {
      return userMetadata.company_id;
    }
  } catch {
    return null;
  }

  return null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get("company_id") ?? companyIdFromAuthHeader(authHeader);
  if (!companyId) {
    return jsonResponse({ error: "Missing company_id (query param or auth context)" }, 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: existing, error: existingErr } = await supabase
      .from("pipeline_snapshots")
      .select("snapshot, updated_at")
      .eq("company_id", companyId)
      .maybeSingle();

    if (existingErr) {
      return jsonResponse({ error: `Failed to read pipeline snapshot: ${existingErr.message}` }, 500);
    }

    let row = existing;
    if (!row) {
      const { error: refreshErr } = await supabase.rpc("refresh_pipeline_snapshot", {
        p_company_id: companyId,
      });
      if (refreshErr) {
        return jsonResponse({ error: `Failed to refresh pipeline snapshot: ${refreshErr.message}` }, 500);
      }

      const { data: refreshed, error: refreshedErr } = await supabase
        .from("pipeline_snapshots")
        .select("snapshot, updated_at")
        .eq("company_id", companyId)
        .maybeSingle();

      if (refreshedErr) {
        return jsonResponse({ error: `Failed to read refreshed snapshot: ${refreshedErr.message}` }, 500);
      }

      if (!refreshed) {
        return jsonResponse({ error: "Pipeline snapshot not found after refresh" }, 404);
      }

      row = refreshed;
    }

    return jsonResponse({
      snapshot: row.snapshot,
      updated_at: row.updated_at,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
