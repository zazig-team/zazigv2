/**
 * zazigv2 — batch-create-ideas Edge Function
 *
 * Atomically inserts multiple ideas into the Ideas Inbox and cross-links
 * them as siblings via the related_ideas field. The ideaify skill calls
 * this after splitting a raw input into individual idea records.
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
    const { ideas } = body;

    // --- Validate top-level inputs ---

    if (!Array.isArray(ideas) || ideas.length === 0) {
      return jsonResponse({ error: "ideas array is required and must be non-empty" }, 400);
    }

    // --- Validate each idea ---

    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];
      const prefix = `ideas[${i}]`;

      if (!idea.raw_text || typeof idea.raw_text !== "string" || idea.raw_text.trim() === "") {
        return jsonResponse({ error: `${prefix}.raw_text is required (non-empty string)` }, 400);
      }

      if (
        !idea.originator || typeof idea.originator !== "string" ||
        idea.originator.trim() === ""
      ) {
        return jsonResponse(
          { error: `${prefix}.originator is required (non-empty string)` },
          400,
        );
      }
    }

    // --- Resolve company_id from first idea's company_id or job_id ---

    const firstIdea = ideas[0];
    let company_id: string;

    if (firstIdea.company_id) {
      company_id = firstIdea.company_id;
    } else if (firstIdea.job_id) {
      const { data: job, error: jobError } = await supabase
        .from("jobs")
        .select("company_id")
        .eq("id", firstIdea.job_id)
        .single();

      if (jobError || !job) {
        return jsonResponse({ error: `Job not found: ${firstIdea.job_id}` }, 404);
      }

      company_id = job.company_id;
    } else {
      return jsonResponse(
        { error: "ideas[0].company_id or ideas[0].job_id is required to resolve tenant" },
        400,
      );
    }

    // --- Insert all ideas, collecting IDs ---

    const createdIdeaIds: string[] = [];

    for (let i = 0; i < ideas.length; i++) {
      const idea = ideas[i];

      const { data: inserted, error: insertError } = await supabase
        .from("ideas")
        .insert({
          company_id,
          raw_text: idea.raw_text.trim(),
          originator: idea.originator.trim(),
          source: idea.source ?? "api",
          source_ref: idea.source_ref ?? null,
          tags: idea.tags ?? null,
          priority: idea.priority ?? "medium",
          suggested_scope: idea.suggested_scope ?? null,
          suggested_exec: idea.suggested_exec ?? null,
          complexity_estimate: idea.complexity_estimate ?? null,
          project_id: idea.project_id ?? null,
          status: "new",
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        // Rollback: delete any ideas we already inserted in this batch
        if (createdIdeaIds.length > 0) {
          await supabase.from("ideas").delete().in("id", createdIdeaIds);
        }
        return jsonResponse(
          {
            error: `Failed to insert idea ${i}: ${insertError?.message ?? "unknown error"}`,
          },
          500,
        );
      }

      createdIdeaIds.push(inserted.id);
    }

    // --- Cross-link related_ideas: each idea gets all other idea IDs in the batch ---

    for (let i = 0; i < createdIdeaIds.length; i++) {
      const relatedIds = createdIdeaIds.filter((_, j) => j !== i);
      await supabase
        .from("ideas")
        .update({ related_ideas: relatedIds })
        .eq("id", createdIdeaIds[i]);
    }

    // --- Emit idea_created event for each created idea (fire and forget) ---

    for (let i = 0; i < createdIdeaIds.length; i++) {
      await supabase.from("events").insert({
        company_id,
        event_type: "idea_created",
        detail: {
          idea_id: createdIdeaIds[i],
          originator: ideas[i].originator,
          batch_size: ideas.length,
        },
      });
    }

    // --- Return summary ---

    const result = createdIdeaIds.map((idea_id, i) => ({
      idea_id,
      title: ideas[i].raw_text.slice(0, 100).trim(),
      status: "new",
    }));

    return jsonResponse({ ideas: result });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
