/**
 * zazigv2 — update-idea Edge Function
 *
 * Updates triage metadata on an existing idea on behalf of the CPO agent.
 * Guards status transitions: status='promoted' must use the promote-idea endpoint.
 * Auto-sets triaged_by/triaged_at when status moves to 'triaged'.
 * Fires events: idea_triaged, idea_parked, idea_rejected based on new status.
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

// Status → event_type mapping (only statuses that emit events)
const STATUS_EVENT_MAP: Record<string, string> = {
  triaged: "idea_triaged",
  parked: "idea_parked",
  rejected: "idea_rejected",
  done: "idea_done",
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
    const {
      idea_id,
      title,
      description,
      status,
      item_type,
      horizon,
      priority,
      suggested_exec,
      tags,
      flags,
      clarification_notes,
      triage_notes,
      project_id,
      job_id,
    } = body;

    if (!idea_id) {
      return jsonResponse({ error: "idea_id is required" }, 400);
    }

    if (status === "promoted") {
      return jsonResponse(
        { error: "Cannot set status 'promoted' — use the promote-idea endpoint instead" },
        400,
      );
    }

    // Build update payload
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (status !== undefined) updates.status = status;
    if (item_type !== undefined) updates.item_type = item_type;
    if (horizon !== undefined) updates.horizon = horizon;
    if (priority !== undefined) updates.priority = priority;
    if (suggested_exec !== undefined) updates.suggested_exec = suggested_exec;
    if (tags !== undefined) updates.tags = tags;
    if (flags !== undefined) updates.flags = flags;
    if (clarification_notes !== undefined) updates.clarification_notes = clarification_notes;
    if (triage_notes !== undefined) updates.triage_notes = triage_notes;
    if (project_id !== undefined) updates.project_id = project_id;
    // job_id is used for identity resolution only — not stored on ideas

    // When status moves to 'triaged', auto-set triaged_by and triaged_at
    if (status === "triaged") {
      let triaged_by = "system";
      if (job_id) {
        const { data: job } = await supabase
          .from("jobs")
          .select("role")
          .eq("id", job_id)
          .single();
        if (job?.role) {
          triaged_by = `${job.role}:${job_id}`;
        }
      }
      updates.triaged_by = triaged_by;
      updates.triaged_at = new Date().toISOString();
    }

    // Horizon auto-management:
    // - parked + no explicit horizon => default to "soon"
    // - any non-parked status => clear horizon
    if (status !== undefined) {
      if (status === "parked") {
        if (horizon === undefined) {
          updates.horizon = "soon";
        }
      } else {
        updates.horizon = null;
      }
    }

    if (Object.keys(updates).length === 0) {
      return jsonResponse({ ok: true, note: "nothing to update" });
    }

    const { data: updated, error } = await supabase
      .from("ideas")
      .update(updates)
      .eq("id", idea_id)
      .select("company_id")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500);
    }

    // Emit event if status changed to a tracked state
    const eventType = status ? STATUS_EVENT_MAP[status] : null;
    if (eventType) {
      await supabase.from("events").insert({
        company_id: updated.company_id,
        event_type: eventType,
        detail: { idea_id, status },
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
