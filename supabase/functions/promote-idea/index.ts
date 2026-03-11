/**
 * zazigv2 — promote-idea Edge Function
 *
 * Atomically promotes a triaged idea to a feature, job, or research task.
 * Writes to two tables (ideas + features/jobs) with best-effort atomicity
 * via compensating deletes.
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

const VALID_PROMOTE_TO = ["feature", "job", "research", "capability"] as const;
type PromoteToType = typeof VALID_PROMOTE_TO[number];

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Auth ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { idea_id, promote_to, project_id, title } = body;

    // --- Validate inputs ---

    if (!idea_id) {
      return jsonResponse({ error: "idea_id is required" }, 400);
    }

    if (!promote_to || !(VALID_PROMOTE_TO as readonly string[]).includes(promote_to)) {
      return jsonResponse(
        { error: `promote_to is required and must be one of: ${VALID_PROMOTE_TO.join(", ")}` },
        400,
      );
    }

    const requiresProjectId = promote_to === "feature" || promote_to === "job";
    if (requiresProjectId && !project_id) {
      return jsonResponse(
        { error: `project_id is required when promote_to is '${promote_to}'` },
        400,
      );
    }

    // --- Fetch idea ---

    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, company_id, status, raw_text, title, description, spec, acceptance_tests, human_checklist, priority")
      .eq("id", idea_id)
      .single();

    if (ideaError || !idea) {
      return jsonResponse({ error: `Idea not found: ${idea_id}` }, 404);
    }

    const promotableStatuses = ["triaged", "workshop", "specced"];
    if (!promotableStatuses.includes(idea.status)) {
      return jsonResponse(
        { error: `Idea status is '${idea.status}' — must be 'triaged', 'workshop', or 'specced' to promote` },
        400,
      );
    }

    // --- Resolve title ---

    const resolvedTitle = title || idea.title || idea.raw_text;

    // --- Create target entity ---

    let promoted_to_id: string | null = null;
    let created_table: string | null = null;

    if (promote_to === "feature") {
      const { data: feature, error: featureError } = await supabase
        .from("features")
        .insert({
          company_id: idea.company_id,
          project_id,
          title: resolvedTitle,
          description: idea.description || idea.raw_text,
          spec: idea.spec || null,
          acceptance_tests: idea.acceptance_tests || null,
          human_checklist: idea.human_checklist || null,
          priority: idea.priority || "medium",
          status: "breaking_down",
          source_idea_id: idea.id,
        })
        .select("id")
        .single();

      if (featureError || !feature) {
        return jsonResponse(
          { error: `Failed to create feature: ${featureError?.message ?? "unknown error"}` },
          500,
        );
      }

      promoted_to_id = feature.id;
      created_table = "features";
    } else if (promote_to === "job") {
      // Note: jobs table uses `context` for description, not `spec`
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .insert({
          company_id: idea.company_id,
          feature_id: null,
          title: resolvedTitle,
          context: idea.raw_text,
          status: "queued",
          role: "senior-engineer",
          job_type: "code",
          complexity: "simple",
        })
        .select("id")
        .single();

      if (jobError || !job) {
        return jsonResponse(
          { error: `Failed to create job: ${jobError?.message ?? "unknown error"}` },
          500,
        );
      }

      promoted_to_id = job.id;
      created_table = "jobs";
    } else if (promote_to === "research") {
      // No entity created for research promotions.
      promoted_to_id = null;
    } else if (promote_to === "capability") {
      // Do NOT create a capability entity here.
      // Set idea status to 'hardening' — the hardening pipeline runs asynchronously.
      // promoted_to_id remains null (set after hardening completes).
      promoted_to_id = null;
    }

    // --- Update idea atomically ---
    const ideaUpdateStatus = promote_to === "capability" ? "hardening" : "promoted";

    const { error: updateError } = await supabase
      .from("ideas")
      .update({
        status: ideaUpdateStatus,
        promoted_to_type: promote_to as PromoteToType,
        promoted_to_id,
        promoted_at: new Date().toISOString(),
        promoted_by: "system",
      })
      .eq("id", idea_id);

    if (updateError) {
      // Compensating delete: roll back the created entity
      if (promoted_to_id && created_table) {
        console.error(
          `Idea update failed after creating ${created_table} ${promoted_to_id}. Attempting compensating delete.`,
        );
        const { error: deleteError } = await supabase
          .from(created_table)
          .delete()
          .eq("id", promoted_to_id);

        if (deleteError) {
          console.error(
            `Compensating delete of ${created_table} ${promoted_to_id} also failed: ${deleteError.message}. Manual cleanup required.`,
          );
        }
      }

      return jsonResponse(
        { error: `Failed to update idea: ${updateError.message}` },
        500,
      );
    }

    // --- Emit event ---

    await supabase.from("events").insert({
      company_id: idea.company_id,
      event_type: "idea_promoted",
      detail: { promoted_to_type: promote_to, promoted_to_id },
    });

    // --- Return result ---

    return jsonResponse({
      idea_id,
      promoted_to_type: promote_to,
      promoted_to_id,
      ...(promote_to === "capability" ? { hardening_queued: true } : {}),
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
