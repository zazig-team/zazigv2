/**
 * zazigv2 — query-idea-status Edge Function
 *
 * Traces an idea through the full pipeline chain:
 * idea → feature (with job counts) | job | research | unpromoted
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
    const { idea_id } = body;

    if (!idea_id) {
      return jsonResponse({ error: "idea_id is required" }, 400);
    }

    // Fetch idea
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("id, title, status, promoted_to_type, promoted_to_id, created_at, triaged_at, promoted_at")
      .eq("id", idea_id)
      .single();

    if (ideaError || !idea) {
      return jsonResponse({ error: "Idea not found" }, 404);
    }

    const ideaOut = {
      id: idea.id,
      title: idea.title,
      status: idea.status,
      created_at: idea.created_at,
      triaged_at: idea.triaged_at ?? null,
      promoted_at: idea.promoted_at ?? null,
    };

    // No promotion
    if (!idea.promoted_to_type) {
      return jsonResponse({
        idea: ideaOut,
        promoted_to: null,
        summary: `Idea '${idea.title}' is ${idea.status}.`,
      });
    }

    // Promoted to research
    if (idea.promoted_to_type === "research") {
      return jsonResponse({
        idea: ideaOut,
        promoted_to: { type: "research", id: idea.promoted_to_id },
        summary: `Idea '${idea.title}' is in research.`,
      });
    }

    // Promoted to a job
    if (idea.promoted_to_type === "job") {
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .select("id, title, status")
        .eq("id", idea.promoted_to_id)
        .single();

      if (jobError || !job) {
        return jsonResponse({ error: "Linked job not found" }, 404);
      }

      return jsonResponse({
        idea: ideaOut,
        promoted_to: { type: "job", id: job.id, title: job.title, status: job.status },
        summary: `Idea '${idea.title}' is ${job.status} as job '${job.title}'.`,
      });
    }

    // Promoted to a feature
    if (idea.promoted_to_type === "feature") {
      const { data: feature, error: featureError } = await supabase
        .from("features")
        .select("id, title, status")
        .eq("id", idea.promoted_to_id)
        .single();

      if (featureError || !feature) {
        return jsonResponse({ error: "Linked feature not found" }, 404);
      }

      // Fetch all jobs for this feature to count by status
      const { data: jobs, error: jobsError } = await supabase
        .from("jobs")
        .select("status")
        .eq("feature_id", feature.id);

      if (jobsError) {
        return jsonResponse({ error: jobsError.message }, 500);
      }

      const allJobs = jobs ?? [];
      const total = allJobs.length;
      const complete = allJobs.filter((j) => j.status === "complete").length;
      const in_progress = allJobs.filter((j) => j.status === "in_progress").length;
      const queued = allJobs.filter((j) => j.status === "queued").length;

      const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
      const summary = `Idea '${idea.title}' is ${feature.status} as feature '${feature.title}'. ${complete}/${total} jobs complete (${pct}%).`;

      return jsonResponse({
        idea: ideaOut,
        promoted_to: {
          type: "feature",
          id: feature.id,
          title: feature.title,
          status: feature.status,
          jobs: { total, complete, in_progress, queued },
        },
        summary,
      });
    }

    // Unknown promoted_to_type
    return jsonResponse({
      idea: ideaOut,
      promoted_to: { type: idea.promoted_to_type, id: idea.promoted_to_id },
      summary: `Idea '${idea.title}' was promoted to ${idea.promoted_to_type}.`,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
