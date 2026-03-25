/**
 * zazigv2 — batch-create-features Edge Function
 *
 * Atomically inserts multiple feature outlines for a project. The Project
 * Architect contractor calls this after decomposing a plan into features
 * via featurify.
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

const VALID_PRIORITIES = ["low", "medium", "high"] as const;

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
    const { project_id, features } = body;

    // --- Validate top-level inputs ---

    if (!project_id) {
      return jsonResponse({ error: "project_id is required" }, 400);
    }

    if (!Array.isArray(features) || features.length === 0) {
      return jsonResponse({ error: "features array is required and must be non-empty" }, 400);
    }

    // --- Validate project exists and resolve company_id ---

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, company_id")
      .eq("id", project_id)
      .single();

    if (projectError || !project) {
      return jsonResponse({ error: `Project not found: ${project_id}` }, 404);
    }

    const company_id = project.company_id;

    // --- Validate each feature ---

    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const prefix = `features[${i}]`;

      if (!feature.title || typeof feature.title !== "string" || feature.title.trim() === "") {
        return jsonResponse({ error: `${prefix}.title is required (non-empty string)` }, 400);
      }

      if (feature.priority && !(VALID_PRIORITIES as readonly string[]).includes(feature.priority)) {
        return jsonResponse(
          { error: `${prefix}.priority must be one of: ${VALID_PRIORITIES.join(", ")}` },
          400,
        );
      }

      if (feature.depends_on_index && Array.isArray(feature.depends_on_index)) {
        for (const idx of feature.depends_on_index) {
          if (typeof idx !== "number" || idx < 0 || idx >= features.length) {
            return jsonResponse(
              { error: `${prefix}.depends_on_index contains invalid index: ${idx}` },
              400,
            );
          }
        }
      }
    }

    // --- Insert all features, collecting IDs ---

    const createdFeatureIds: string[] = [];

    for (let i = 0; i < features.length; i++) {
      const feature = features[i];

      // Build description, appending dependency note if depends_on_index is provided
      let description = feature.description ?? null;
      if (feature.depends_on_index && Array.isArray(feature.depends_on_index) && feature.depends_on_index.length > 0) {
        const depTitles = feature.depends_on_index
          .map((idx: number) => features[idx].title)
          .join(", ");
        const depNote = `Dependencies: ${depTitles}`;
        description = description ? `${description}\n\n${depNote}` : depNote;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("features")
        .insert({
          company_id,
          project_id,
          title: feature.title.trim(),
          description,
          priority: feature.priority ?? "medium",
          status: "breaking_down",
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        // Rollback: delete any features we already inserted in this batch
        if (createdFeatureIds.length > 0) {
          await supabase.from("features").delete().in("id", createdFeatureIds);
        }
        return jsonResponse(
          { error: `Failed to insert feature ${i} (${feature.title}): ${insertError?.message ?? "unknown error"}` },
          500,
        );
      }

      createdFeatureIds.push(inserted.id);
    }

    // --- Return summary ---

    const result = features.map((feature: { title: string }, i: number) => ({
      feature_id: createdFeatureIds[i],
      title: feature.title,
      status: "breaking_down",
    }));

    return jsonResponse({ features: result });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
