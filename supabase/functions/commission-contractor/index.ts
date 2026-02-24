/**
 * zazigv2 — commission-contractor Edge Function
 *
 * Creates a single queued job for a contractor role (project-architect,
 * breakdown-specialist, monitoring-agent). Called by the CPO when it needs
 * to commission work that doesn't fit the normal feature→job pipeline.
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

const CONTRACTOR_ROLES = ["project-architect", "breakdown-specialist", "monitoring-agent"] as const;
type ContractorRole = typeof CONTRACTOR_ROLES[number];

const ROLE_JOB_TITLES: Record<ContractorRole, string> = {
  "project-architect": "Structure project into features",
  "breakdown-specialist": "Break down feature into jobs",
  "monitoring-agent": "Automated codebase scan",
};

const ROLE_JOB_TYPES: Record<ContractorRole, string> = {
  "project-architect": "design",
  "breakdown-specialist": "breakdown",
  "monitoring-agent": "research",
};

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
    const { company_id, role, project_id, feature_id, context } = body;

    // --- Validate inputs ---

    if (!company_id) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }

    if (!role || !(CONTRACTOR_ROLES as readonly string[]).includes(role)) {
      return jsonResponse(
        { error: `role must be one of: ${CONTRACTOR_ROLES.join(", ")}` },
        400,
      );
    }

    if (!project_id) {
      return jsonResponse({ error: "project_id is required" }, 400);
    }

    // breakdown-specialist requires feature_id (they break down a specific feature)
    if (role === "breakdown-specialist" && !feature_id) {
      return jsonResponse(
        { error: "feature_id is required for breakdown-specialist" },
        400,
      );
    }

    // project-architect must NOT have feature_id (they create features)
    if (role === "project-architect" && feature_id) {
      return jsonResponse(
        { error: "feature_id must not be provided for project-architect" },
        400,
      );
    }

    // --- Verify role exists in roles table ---

    const { data: roleRow, error: roleError } = await supabase
      .from("roles")
      .select("id")
      .eq("name", role)
      .single();

    if (roleError || !roleRow) {
      return jsonResponse({ error: `Role '${role}' not found in roles table` }, 404);
    }

    // --- Build and insert the job ---

    const title = ROLE_JOB_TITLES[role as ContractorRole];
    const job_type = ROLE_JOB_TYPES[role as ContractorRole];

    const { data: inserted, error: insertError } = await supabase
      .from("jobs")
      .insert({
        company_id,
        project_id,
        feature_id: feature_id ?? null,
        role,
        job_type,
        complexity: "medium",
        status: "queued",
        title,
        context: context ?? null,
        depends_on: [],
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      return jsonResponse(
        { error: `Failed to insert job: ${insertError?.message ?? "unknown error"}` },
        500,
      );
    }

    // --- Fire event ---

    await supabase.from("events").insert({
      company_id,
      event_type: "contractor_commissioned",
      detail: { role, project_id, feature_id: feature_id ?? null, job_id: inserted.id },
    });

    // --- Return result ---

    return jsonResponse({ job_id: inserted.id, role, status: "queued" });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
