/**
 * zazigv2 — query-idea-status Edge Function
 *
 * Takes an idea_id, traces the idea through the pipeline chain
 * (idea → feature → jobs, or idea → job, or idea → research),
 * and returns a structured status summary.
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

    // Fetch the idea
    const { data: idea, error: ideaError } = await supabase
      .from("ideas")
      .select("*")
      .eq("id", idea_id)
      .single();

    if (ideaError || !idea) {
      return jsonResponse({ error: "Idea not found" }, 404);
    }

    const ideaSummary = {
      id: idea.id,
      title: idea.title,
      status: idea.status,
      raw_text: idea.raw_text,
      created_at: idea.created_at,
      promoted_at: idea.promoted_at,
    };

    // Not promoted
    if (!idea.promoted_to_type) {
      return jsonResponse({
        idea: ideaSummary,
        promoted_to: null,
        summary: `Idea '${idea.title || idea.raw_text}' is ${idea.status}. Not yet promoted.`,
      });
    }

    // Promoted to feature
    if (idea.promoted_to_type === "feature" && idea.promoted_to_id) {
      const { data: feature } = await supabase
        .from("features")
        .select("id, title, status")
        .eq("id", idea.promoted_to_id)
        .single();

      if (!feature) {
        return jsonResponse({
          idea: ideaSummary,
          promoted_to: { type: "feature", id: idea.promoted_to_id, error: "Feature not found" },
          summary: `Idea '${idea.title || idea.raw_text}' was promoted to a feature but the feature was not found.`,
        });
      }

      // Count jobs by status for this feature
      const { data: jobs } = await supabase
        .from("jobs")
        .select("status")
        .eq("feature_id", feature.id);

      const jobCounts = { total: 0, complete: 0, failed: 0, in_progress: 0, queued: 0 };
      if (jobs) {
        jobCounts.total = jobs.length;
        for (const job of jobs) {
          if (job.status === "complete") jobCounts.complete++;
          else if (job.status === "failed") jobCounts.failed++;
          else if (job.status === "in_progress") jobCounts.in_progress++;
          else if (job.status === "queued") jobCounts.queued++;
        }
      }

      const pct = jobCounts.total > 0
        ? Math.round((jobCounts.complete / jobCounts.total) * 100)
        : 0;

      return jsonResponse({
        idea: ideaSummary,
        promoted_to: {
          type: "feature",
          id: feature.id,
          title: feature.title,
          status: feature.status,
          jobs: jobCounts,
        },
        summary: jobCounts.total > 0
          ? `Idea '${idea.title || idea.raw_text}' is ${feature.status} as feature '${feature.title}'. ${jobCounts.complete}/${jobCounts.total} jobs complete (${pct}%).`
          : `Idea '${idea.title || idea.raw_text}' is ${feature.status} as feature '${feature.title}'. No jobs yet.`,
      });
    }

    // Promoted to job
    if (idea.promoted_to_type === "job" && idea.promoted_to_id) {
      const { data: job } = await supabase
        .from("jobs")
        .select("id, title, status")
        .eq("id", idea.promoted_to_id)
        .single();

      if (!job) {
        return jsonResponse({
          idea: ideaSummary,
          promoted_to: { type: "job", id: idea.promoted_to_id, error: "Job not found" },
          summary: `Idea '${idea.title || idea.raw_text}' was promoted to a job but the job was not found.`,
        });
      }

      return jsonResponse({
        idea: ideaSummary,
        promoted_to: {
          type: "job",
          id: job.id,
          title: job.title,
          status: job.status,
        },
        summary: `Idea '${idea.title || idea.raw_text}' is a standalone job '${job.title}' (${job.status}).`,
      });
    }

    // Promoted to research
    if (idea.promoted_to_type === "research") {
      return jsonResponse({
        idea: ideaSummary,
        promoted_to: { type: "research" },
        summary: `Idea '${idea.title || idea.raw_text}' has been promoted to research.`,
      });
    }

    // Fallback for unknown promoted_to_type
    return jsonResponse({
      idea: ideaSummary,
      promoted_to: { type: idea.promoted_to_type },
      summary: `Idea '${idea.title || idea.raw_text}' promoted to ${idea.promoted_to_type}.`,
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
