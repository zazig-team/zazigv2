/**
 * zazigv2 — create-action-item Edge Function
 *
 * Creates an action item for human attention and emits action_item_created.
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

const ACTION_ITEM_CTA_TYPES = [
  "acknowledge",
  "provide_secret",
  "approve",
  "external_link",
] as const;

type ActionItemCtaType = (typeof ACTION_ITEM_CTA_TYPES)[number];

function isActionItemCtaType(value: unknown): value is ActionItemCtaType {
  return typeof value === "string" &&
    ACTION_ITEM_CTA_TYPES.includes(value as ActionItemCtaType);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
    const companyId = toTrimmedString(body.company_id);
    const sourceRole = toTrimmedString(body.source_role);
    const sourceJobId = toTrimmedString(body.source_job_id);
    const title = toTrimmedString(body.title);
    const detail = toTrimmedString(body.detail);
    const ctaLabel = toTrimmedString(body.cta_label) ?? "Resolve";
    const ctaTypeInput = body.cta_type;
    const ctaPayload = body.cta_payload;

    if (!companyId) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }

    if (!title) {
      return jsonResponse({ error: "title is required" }, 400);
    }

    let ctaType: ActionItemCtaType = "acknowledge";
    if (ctaTypeInput !== undefined) {
      if (!isActionItemCtaType(ctaTypeInput)) {
        return jsonResponse(
          {
            error:
              "cta_type must be one of: acknowledge, provide_secret, approve, external_link",
          },
          400,
        );
      }
      ctaType = ctaTypeInput;
    }

    if (ctaPayload !== undefined && ctaPayload !== null && !isRecord(ctaPayload)) {
      return jsonResponse(
        { error: "cta_payload must be an object when provided" },
        400,
      );
    }

    const { data: actionItem, error: actionItemErr } = await supabase
      .from("action_items")
      .insert({
        company_id: companyId,
        source_role: sourceRole ?? null,
        source_job_id: sourceJobId ?? null,
        title,
        detail: detail ?? null,
        cta_label: ctaLabel,
        cta_type: ctaType,
        cta_payload: ctaPayload ?? null,
      })
      .select("id")
      .single();

    if (actionItemErr) {
      return jsonResponse({ error: actionItemErr.message }, 500);
    }

    const { error: eventErr } = await supabase.from("events").insert({
      company_id: companyId,
      event_type: "action_item_created",
      detail: {
        action_item_id: actionItem.id,
        title,
        source_role: sourceRole ?? null,
      },
    });

    if (eventErr) {
      console.error(
        `[create-action-item] Failed to insert action_item_created event for ${actionItem.id}: ${eventErr.message}`,
      );
    }

    return jsonResponse({ action_item_id: actionItem.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
