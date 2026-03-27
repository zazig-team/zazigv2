/**
 * zazigv2 — create-decision Edge Function
 *
 * Creates a founder-facing decision record and emits decision_created.
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

const DECISION_CATEGORIES = [
  "routine",
  "tactical",
  "strategic",
  "foundational",
] as const;

type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

type DecisionOption = {
  label: string;
  description?: string;
  recommended?: boolean;
};

function isDecisionCategory(value: unknown): value is DecisionCategory {
  return typeof value === "string" &&
    DECISION_CATEGORIES.includes(value as DecisionCategory);
}

function parseOptions(value: unknown): { options: DecisionOption[]; error: string | null } {
  if (!Array.isArray(value)) {
    return { options: [], error: "options must be an array" };
  }

  if (value.length < 2) {
    return { options: [], error: "options must include at least 2 items" };
  }

  const parsed: DecisionOption[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { options: [], error: "each option must be an object" };
    }

    const entry = raw as Record<string, unknown>;
    const label = entry.label;
    const description = entry.description;
    const recommended = entry.recommended;

    if (typeof label !== "string" || label.trim().length === 0) {
      return { options: [], error: "each option.label must be a non-empty string" };
    }

    if (description !== undefined && typeof description !== "string") {
      return { options: [], error: "each option.description must be a string when provided" };
    }

    if (recommended !== undefined && typeof recommended !== "boolean") {
      return { options: [], error: "each option.recommended must be a boolean when provided" };
    }

    parsed.push({
      label: label.trim(),
      ...(description !== undefined ? { description } : {}),
      ...(recommended !== undefined ? { recommended } : {}),
    });
  }

  return { options: parsed, error: null };
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
    const companyId = typeof body.company_id === "string" ? body.company_id.trim() : "";
    const fromRole = typeof body.from_role === "string" ? body.from_role.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const context = body.context;
    const recommendationRationale = body.recommendation_rationale;
    const categoryInput = body.category;
    const expiresInHoursInput = body.expires_in_hours;

    if (!companyId) {
      return jsonResponse({ error: "company_id is required" }, 400);
    }

    if (!fromRole) {
      return jsonResponse({ error: "from_role is required" }, 400);
    }

    if (!title) {
      return jsonResponse({ error: "title is required" }, 400);
    }

    if (context !== undefined && typeof context !== "string") {
      return jsonResponse({ error: "context must be a string when provided" }, 400);
    }

    if (
      recommendationRationale !== undefined &&
      typeof recommendationRationale !== "string"
    ) {
      return jsonResponse(
        { error: "recommendation_rationale must be a string when provided" },
        400,
      );
    }

    let category: DecisionCategory = "tactical";
    if (categoryInput !== undefined) {
      if (!isDecisionCategory(categoryInput)) {
        return jsonResponse(
          {
            error:
              "category must be one of: routine, tactical, strategic, foundational",
          },
          400,
        );
      }
      category = categoryInput;
    }

    let expiresInHours = 24;
    if (expiresInHoursInput !== undefined) {
      if (
        typeof expiresInHoursInput !== "number" ||
        !Number.isFinite(expiresInHoursInput) ||
        expiresInHoursInput <= 0
      ) {
        return jsonResponse(
          { error: "expires_in_hours must be a positive number when provided" },
          400,
        );
      }
      expiresInHours = expiresInHoursInput;
    }

    const parsedOptions = parseOptions(body.options);
    if (parsedOptions.error) {
      return jsonResponse({ error: parsedOptions.error }, 400);
    }

    const expiresAt = new Date(
      Date.now() + expiresInHours * 60 * 60 * 1000,
    ).toISOString();

    const { data: decision, error: decisionErr } = await supabase
      .from("decisions")
      .insert({
        company_id: companyId,
        from_role: fromRole,
        category,
        title,
        context: context ?? null,
        options: parsedOptions.options,
        recommendation_rationale: recommendationRationale ?? null,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (decisionErr) {
      return jsonResponse({ error: decisionErr.message }, 500);
    }

    const { error: eventErr } = await supabase.from("events").insert({
      company_id: companyId,
      event_type: "decision_created",
      detail: {
        decision_id: decision.id,
        from_role: fromRole,
        title,
        category,
      },
    });

    if (eventErr) {
      console.error(
        `[create-decision] Failed to insert decision_created event for ${decision.id}: ${eventErr.message}`,
      );
    }

    return jsonResponse({ decision_id: decision.id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
