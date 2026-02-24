/**
 * zazigv2 — batch-create-jobs Edge Function
 *
 * Atomically inserts multiple jobs for a feature. The Breakdown Specialist
 * calls this after decomposing a feature into jobs via jobify.
 *
 * Handles temp:N references in depends_on — resolves array-index placeholders
 * to real UUIDs after all jobs are inserted.
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

const VALID_COMPLEXITIES = ["simple", "medium", "complex"] as const;
const VALID_JOB_TYPES = [
  "code", "infra", "design", "research", "docs", "bug",
  "persistent_agent", "verify", "breakdown", "combine", "deploy", "review",
] as const;

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
    const { feature_id, jobs } = body;

    // --- Validate top-level inputs ---

    if (!feature_id) {
      return jsonResponse({ error: "feature_id is required" }, 400);
    }

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return jsonResponse({ error: "jobs array is required and must be non-empty" }, 400);
    }

    // --- Validate feature exists and is ready_for_breakdown ---

    const { data: feature, error: featureError } = await supabase
      .from("features")
      .select("id, company_id, project_id, status")
      .eq("id", feature_id)
      .single();

    if (featureError || !feature) {
      return jsonResponse({ error: `Feature not found: ${feature_id}` }, 404);
    }

    if (feature.status !== "ready_for_breakdown") {
      return jsonResponse(
        { error: `Feature status is '${feature.status}' — must be 'ready_for_breakdown'` },
        400,
      );
    }

    // --- Validate each job ---

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const prefix = `jobs[${i}]`;

      if (!job.title || typeof job.title !== "string") {
        return jsonResponse({ error: `${prefix}.title is required` }, 400);
      }
      if (!job.spec || typeof job.spec !== "string") {
        return jsonResponse({ error: `${prefix}.spec is required (non-empty string)` }, 400);
      }
      if (!job.acceptance_tests || typeof job.acceptance_tests !== "string") {
        return jsonResponse({ error: `${prefix}.acceptance_tests is required (non-empty string)` }, 400);
      }
      if (!job.role || typeof job.role !== "string") {
        return jsonResponse({ error: `${prefix}.role is required` }, 400);
      }
      if (!job.job_type || !(VALID_JOB_TYPES as readonly string[]).includes(job.job_type)) {
        return jsonResponse(
          { error: `${prefix}.job_type must be one of: ${VALID_JOB_TYPES.join(", ")}` },
          400,
        );
      }
      if (!job.complexity || !(VALID_COMPLEXITIES as readonly string[]).includes(job.complexity)) {
        return jsonResponse(
          { error: `${prefix}.complexity must be one of: ${VALID_COMPLEXITIES.join(", ")}` },
          400,
        );
      }

      // Validate depends_on references
      if (job.depends_on && Array.isArray(job.depends_on)) {
        for (const dep of job.depends_on) {
          if (typeof dep === "string" && dep.startsWith("temp:")) {
            const idx = parseInt(dep.slice(5), 10);
            if (isNaN(idx) || idx < 0 || idx >= jobs.length) {
              return jsonResponse(
                { error: `${prefix}.depends_on has invalid temp reference '${dep}' — index out of range` },
                400,
              );
            }
            if (idx >= i) {
              return jsonResponse(
                { error: `${prefix}.depends_on references '${dep}' — can only depend on earlier jobs (lower index)` },
                400,
              );
            }
          }
        }
      }
    }

    // --- Resolve complexity → model via complexity_routing table ---

    const { data: routingRows, error: routingError } = await supabase
      .from("complexity_routing")
      .select("company_id, complexity, role_id, roles(default_model)")
      .or(`company_id.eq.${feature.company_id},company_id.is.null`);

    if (routingError) {
      return jsonResponse({ error: `Failed to read complexity_routing: ${routingError.message}` }, 500);
    }

    // Build complexity → model map. Company-specific rows override globals (null company_id).
    const modelMap: Record<string, string> = {};
    // First pass: apply globals (company_id is null)
    for (const row of routingRows ?? []) {
      if (row.company_id !== null) continue;
      if (!row.roles) continue;
      const roles = row.roles as unknown as { default_model: string };
      modelMap[row.complexity] = roles.default_model;
    }
    // Second pass: company-specific overrides
    for (const row of routingRows ?? []) {
      if (row.company_id === null) continue;
      if (!row.roles) continue;
      const roles = row.roles as unknown as { default_model: string };
      modelMap[row.complexity] = roles.default_model;
    }

    // --- Insert all jobs, collecting UUIDs ---

    const createdJobIds: string[] = [];

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];

      // Resolve temp:N references to real UUIDs
      const resolvedDeps: string[] = [];
      if (job.depends_on && Array.isArray(job.depends_on)) {
        for (const dep of job.depends_on) {
          if (typeof dep === "string" && dep.startsWith("temp:")) {
            const idx = parseInt(dep.slice(5), 10);
            resolvedDeps.push(createdJobIds[idx]);
          } else {
            // Direct UUID reference (unlikely in batch but supported)
            resolvedDeps.push(dep);
          }
        }
      }

      const model = modelMap[job.complexity] ?? null;

      const { data: inserted, error: insertError } = await supabase
        .from("jobs")
        .insert({
          company_id: feature.company_id,
          project_id: feature.project_id ?? null,
          feature_id,
          title: job.title,
          context: job.spec,
          acceptance_tests: job.acceptance_tests,
          role: job.role,
          job_type: job.job_type,
          complexity: job.complexity,
          model,
          depends_on: resolvedDeps,
          sequence: i + 1,
          status: "queued",
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        // Rollback: delete any jobs we already inserted in this batch
        if (createdJobIds.length > 0) {
          await supabase.from("jobs").delete().in("id", createdJobIds);
        }
        return jsonResponse(
          { error: `Failed to insert job ${i} (${job.title}): ${insertError?.message ?? "unknown error"}` },
          500,
        );
      }

      createdJobIds.push(inserted.id);
    }

    // --- Update feature status to 'breakdown' ---

    const { error: updateError } = await supabase
      .from("features")
      .update({ status: "breakdown" })
      .eq("id", feature_id);

    if (updateError) {
      return jsonResponse({ error: `Jobs created but failed to update feature status: ${updateError.message}` }, 500);
    }

    // --- Insert feature_status_changed event ---

    await supabase.from("events").insert({
      company_id: feature.company_id,
      event_type: "feature_status_changed",
      detail: { feature_id, from: "ready_for_breakdown", to: "breakdown", job_count: jobs.length },
    });

    // --- Return summary ---

    const result = jobs.map((job: { title: string }, i: number) => ({
      job_id: createdJobIds[i],
      title: job.title,
      status: "queued",
    }));

    return jsonResponse({ jobs: result });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
