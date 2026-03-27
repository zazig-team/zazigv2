/**
 * zazigv2 — create-project-rule Edge Function
 *
 * Creates a project-scoped rule for future agent prompts.
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
    "authorization, x-client-info, apikey, content-type, x-company-id, x-job-id",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    const companyId = toTrimmedString(req.headers.get("x-company-id"));
    if (!companyId) {
      return jsonResponse({ error: "x-company-id header is required" }, 400);
    }

    const rawJobId = toTrimmedString(req.headers.get("x-job-id"));
    const sourceJobId = rawJobId && UUID_RE.test(rawJobId) ? rawJobId : null;

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const projectId = toTrimmedString(body.project_id);
    const ruleText = toTrimmedString(body.rule_text);
    const appliesTo = body.applies_to;

    if (!projectId) {
      return jsonResponse({ error: "project_id is required" }, 400);
    }

    if (!ruleText) {
      return jsonResponse({ error: "rule_text is required (non-empty string)" }, 400);
    }

    if (!Array.isArray(appliesTo) || appliesTo.length === 0) {
      return jsonResponse({ error: "applies_to must be a non-empty array of strings" }, 400);
    }

    const normalizedAppliesTo = appliesTo
      .map((entry) => toTrimmedString(entry))
      .filter((entry): entry is string => !!entry);

    if (normalizedAppliesTo.length !== appliesTo.length) {
      return jsonResponse({ error: "applies_to must contain only non-empty strings" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (projectError) {
      return jsonResponse({ error: projectError.message }, 500);
    }

    if (!project) {
      return jsonResponse({ error: "Project not found for this company" }, 404);
    }

    const { data: createdRule, error: insertError } = await supabase
      .from("project_rules")
      .insert({
        project_id: projectId,
        rule_text: ruleText,
        applies_to: normalizedAppliesTo,
        source_job_id: sourceJobId,
      })
      .select("id")
      .single();

    if (insertError || !createdRule) {
      return jsonResponse({ error: insertError?.message ?? "Failed to create project rule" }, 500);
    }

    return jsonResponse({ rule_id: createdRule.id }, 201);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
