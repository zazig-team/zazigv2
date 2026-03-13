/**
 * zazigv2 — query-job-logs Edge Function
 *
 * Reads a single job log by job_id and type, scoped to the
 * authenticated user's company.
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

function parseBearerToken(authHeader: string): string | null {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

    const token = parseBearerToken(authHeader);
    if (!token) {
      return jsonResponse({ error: "Invalid authorization header" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const { job_id, type } = body as {
      job_id?: string;
      type?: "lifecycle" | "tmux";
    };

    if (!job_id) {
      return jsonResponse({ error: "job_id is required" }, 400);
    }

    if (type !== "lifecycle" && type !== "tmux") {
      return jsonResponse({ error: "type must be one of: lifecycle, tmux" }, 400);
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("company_id")
      .eq("id", job_id)
      .maybeSingle();

    if (jobError) {
      return jsonResponse({ error: jobError.message }, 500);
    }

    if (!job?.company_id) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("user_companies")
      .select("company_id")
      .eq("user_id", user.id)
      .eq("company_id", job.company_id)
      .maybeSingle();

    if (membershipError) {
      return jsonResponse({ error: membershipError.message }, 500);
    }

    if (!membership) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const { data: logs, error: logsError } = await supabase
      .from("job_logs")
      .select("content, updated_at")
      .eq("job_id", job_id)
      .eq("type", type)
      .limit(1);

    if (logsError) {
      return jsonResponse({ error: logsError.message }, 500);
    }

    if (!logs || logs.length === 0) {
      return jsonResponse({ content: "", updated_at: null });
    }

    return jsonResponse({
      content: logs[0].content ?? "",
      updated_at: logs[0].updated_at ?? null,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
