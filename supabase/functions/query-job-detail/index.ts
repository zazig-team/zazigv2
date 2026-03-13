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

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return atob(normalized + "=".repeat(padding));
}

function companyIdFromAuthHeader(authHeader: string): string | null {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<
      string,
      unknown
    >;

    if (
      typeof payload.company_id === "string" && payload.company_id.length > 0
    ) {
      return payload.company_id;
    }
    if (typeof payload.companyId === "string" && payload.companyId.length > 0) {
      return payload.companyId;
    }

    const appMetadata = payload.app_metadata as
      | Record<string, unknown>
      | undefined;
    if (
      typeof appMetadata?.company_id === "string" &&
      appMetadata.company_id.length > 0
    ) {
      return appMetadata.company_id;
    }

    const userMetadata = payload.user_metadata as
      | Record<string, unknown>
      | undefined;
    if (
      typeof userMetadata?.company_id === "string" &&
      userMetadata.company_id.length > 0
    ) {
      return userMetadata.company_id;
    }
  } catch {
    return null;
  }

  return null;
}

const JOB_SELECT =
  "id, title, status, role, model, job_type, slot_type, progress, started_at, completed_at, branch, blocked_reason, result, machine_id";

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

    const companyId = companyIdFromAuthHeader(authHeader);
    if (!companyId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json() as { job_id?: unknown };
    const jobId = typeof body.job_id === "string" ? body.job_id.trim() : "";

    if (!jobId) {
      return jsonResponse({ error: "job_id is required" }, 400);
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("id", jobId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (jobError) {
      return jsonResponse({ error: jobError.message }, 500);
    }

    // Return 403 for both missing and out-of-scope jobs to avoid leaking existence.
    if (!job) {
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
      ...job,
      machine_name: machineName,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
