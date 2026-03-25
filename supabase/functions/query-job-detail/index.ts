/**
 * zazigv2 — query-job-detail Edge Function
 *
 * Company-scoped read for a single job with optional machine name enrichment.
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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

const JOB_SELECT =
  "id, title, status, role, model, job_type, slot_type, progress, started_at, completed_at, branch, blocked_reason, result, error_analysis, machine_id, company_id";

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

    const body = await req.json() as { job_id?: unknown };
    const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";

    if (!jobId) {
      return jsonResponse({ error: "job_id is required" }, 400);
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("id", jobId)
      .maybeSingle();

    if (jobError) {
      return jsonResponse({ error: jobError.message }, 500);
    }

    // Return 403 for both missing and out-of-scope jobs to avoid leaking existence.
    if (!job) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    if (!job.company_id) {
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

    let machineName: string | null = null;
    if (job.machine_id) {
      const { data: machine, error: machineError } = await supabase
        .from("machines")
        .select("name")
        .eq("id", job.machine_id)
        .maybeSingle();

      if (machineError) {
        return jsonResponse({ error: machineError.message }, 500);
      }

      machineName = machine?.name ?? null;
    }

    return jsonResponse({
      id: job.id,
      title: job.title,
      status: job.status,
      role: job.role,
      model: job.model,
      job_type: job.job_type,
      slot_type: job.slot_type,
      progress: job.progress,
      started_at: job.started_at,
      completed_at: job.completed_at,
      branch: job.branch,
      blocked_reason: job.blocked_reason,
      result: job.result,
      error_analysis: job.error_analysis,
      machine_id: job.machine_id,
      machine_name: machineName,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
