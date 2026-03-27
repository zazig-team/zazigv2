/**
 * zazigv2 — update-decision Edge Function
 *
 * Resolves, defers, or annotates a founder-facing decision.
 * Emits decision_resolved and broadcasts DecisionResolved to orchestrator.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

const DECISION_ACTIONS = ["resolve", "defer", "add_note"] as const;
type DecisionAction = (typeof DECISION_ACTIONS)[number];

interface DecisionRow {
  company_id: string;
  from_role: string;
  status: string;
  resolution: unknown;
  options: unknown;
}

interface DecisionResolvedPayload {
  type: "DecisionResolved";
  decisionId: string;
  companyId: string;
  fromRole: string;
  action: string;
  selectedOption: string | null;
  note: string | null;
}

function isDecisionAction(value: unknown): value is DecisionAction {
  return typeof value === "string" &&
    DECISION_ACTIONS.includes(value as DecisionAction);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractOptionLabels(options: unknown): string[] {
  if (!Array.isArray(options)) return [];

  const labels: string[] = [];
  for (const option of options) {
    if (!option || typeof option !== "object" || Array.isArray(option)) continue;
    const label = (option as Record<string, unknown>).label;
    if (typeof label === "string" && label.trim().length > 0) {
      labels.push(label.trim());
    }
  }
  return labels;
}

function extractNotes(resolution: Record<string, unknown>): string[] {
  const notes = resolution.notes;
  if (!Array.isArray(notes)) return [];

  return notes
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

async function broadcastDecisionResolved(
  supabase: SupabaseClient,
  payload: DecisionResolvedPayload,
): Promise<string> {
  const channel = supabase.channel("orchestrator:commands");

  return await new Promise<string>((resolve) => {
    let settled = false;

    const finish = async (result: string): Promise<void> => {
      if (settled) return;
      settled = true;
      try {
        await channel.unsubscribe();
      } catch {
        // no-op
      }
      resolve(result);
    };

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        const sendResult = await channel.send({
          type: "broadcast",
          event: "decision_resolved",
          payload,
        });
        await finish(String(sendResult));
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        await finish("error");
      }
    });

    setTimeout(() => {
      void finish("timed_out");
    }, 5_000);
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

    const body = await req.json() as Record<string, unknown>;
    const decisionId = toTrimmedString(body.decision_id);
    const actionInput = body.action;
    const selectedOption = toTrimmedString(body.selected_option);
    const note = toTrimmedString(body.note);

    if (!decisionId) {
      return jsonResponse({ error: "decision_id is required" }, 400);
    }

    if (!isDecisionAction(actionInput)) {
      return jsonResponse(
        { error: "action must be one of: resolve, defer, add_note" },
        400,
      );
    }

    if (actionInput === "resolve" && !selectedOption) {
      return jsonResponse(
        { error: "selected_option is required when action is resolve" },
        400,
      );
    }

    if (actionInput === "add_note" && !note) {
      return jsonResponse(
        { error: "note is required when action is add_note" },
        400,
      );
    }

    const { data: decision, error: fetchErr } = await supabase
      .from("decisions")
      .select("company_id, from_role, status, resolution, options")
      .eq("id", decisionId)
      .single();

    if (fetchErr || !decision) {
      return jsonResponse({ error: "Decision not found" }, 404);
    }

    const decisionRow = decision as DecisionRow;

    if (decisionRow.status !== "pending") {
      return jsonResponse(
        { error: `Decision is not pending (current status: ${decisionRow.status})` },
        400,
      );
    }

    if (actionInput === "resolve" && selectedOption) {
      const availableLabels = extractOptionLabels(decisionRow.options);
      if (
        availableLabels.length > 0 &&
        !availableLabels.includes(selectedOption)
      ) {
        return jsonResponse(
          {
            error:
              "selected_option must match one of the existing option labels",
          },
          400,
        );
      }
    }

    const updates: Record<string, unknown> = {};
    const now = new Date().toISOString();

    if (actionInput === "resolve") {
      updates.status = "resolved";
      updates.resolved_by = "human";
      updates.resolution = {
        selected_option: selectedOption,
        note: note ?? null,
      };
      updates.resolved_at = now;
    } else if (actionInput === "defer") {
      updates.status = "deferred";
      updates.resolved_by = "human";
      updates.resolution = {
        note: note ?? null,
      };
      updates.resolved_at = now;
    } else {
      const existingResolution = isRecord(decisionRow.resolution)
        ? { ...decisionRow.resolution }
        : {};
      const existingNotes = extractNotes(existingResolution);
      updates.resolution = {
        ...existingResolution,
        notes: [...existingNotes, note],
      };
    }

    const { data: updatedRows, error: updateErr } = await supabase
      .from("decisions")
      .update(updates)
      .eq("id", decisionId)
      .eq("status", "pending")
      .select("id");

    if (updateErr) {
      return jsonResponse({ error: updateErr.message }, 500);
    }

    if (!updatedRows || updatedRows.length === 0) {
      return jsonResponse(
        { error: "Decision is no longer pending" },
        409,
      );
    }

    const { error: eventErr } = await supabase.from("events").insert({
      company_id: decisionRow.company_id,
      event_type: "decision_resolved",
      detail: {
        decision_id: decisionId,
        action: actionInput,
        selected_option: selectedOption ?? null,
        note: note ?? null,
      },
    });

    if (eventErr) {
      console.error(
        `[update-decision] Failed to insert decision_resolved event for ${decisionId}: ${eventErr.message}`,
      );
    }

    const broadcastResult = await broadcastDecisionResolved(supabase, {
      type: "DecisionResolved",
      decisionId,
      companyId: decisionRow.company_id,
      fromRole: decisionRow.from_role,
      action: actionInput,
      selectedOption: selectedOption ?? null,
      note: note ?? null,
    });

    if (broadcastResult !== "ok") {
      return jsonResponse(
        {
          error:
            `Decision updated but orchestrator broadcast failed: ${broadcastResult}`,
        },
        500,
      );
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
