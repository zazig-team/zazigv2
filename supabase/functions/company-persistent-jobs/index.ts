/**
 * company-persistent-jobs — returns persistent role definitions for a company.
 *
 * GET /functions/v1/company-persistent-jobs?company_id=X
 *
 * For each persistent role in the company, assembles the prompt stack
 * (personality + role prompt) and returns the complete workspace definition.
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
  throw new Error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown> | unknown[], status = 200): Response {
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

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  const url = new URL(req.url);
  const companyId = url.searchParams.get("company_id");
  if (!companyId) {
    return jsonResponse({ error: "Missing company_id parameter" }, 400);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Fetch persistent roles that belong to this company (via company_roles)
    const { data: roles, error: rolesError } = await supabase
      .from("roles")
      .select("name, prompt, skills, default_model, slot_type, company_roles!inner(company_id)")
      .eq("is_persistent", true)
      .eq("company_roles.company_id", companyId);

    if (rolesError) {
      return jsonResponse({ error: `Failed to fetch roles: ${rolesError.message}` }, 500);
    }

    if (!roles || roles.length === 0) {
      return jsonResponse([]);
    }

    // Fetch personalities for this company
    const { data: personalities, error: persError } = await supabase
      .from("exec_personalities")
      .select("role_id, compiled_prompt, compiled_sub_agent_prompt, roles!inner(name)")
      .eq("company_id", companyId);

    if (persError) {
      console.warn(`Failed to fetch personalities: ${persError.message}`);
    }

    // Assemble prompt stack for each role
    const result = roles.map((role) => {
      const personality = personalities?.find(
        (p: Record<string, unknown>) =>
          (p.roles as Record<string, unknown>)?.name === role.name
      );

      const parts: string[] = [];
      parts.push(`# ${role.name.toUpperCase()}`);
      if (personality?.compiled_prompt) {
        parts.push(String(personality.compiled_prompt));
        parts.push("---");
      }
      if (role.prompt) {
        parts.push(role.prompt);
      }

      return {
        role: role.name,
        prompt_stack: parts.join("\n\n"),
        skills: role.skills ?? [],
        model: role.default_model ?? "claude-opus-4-6",
        slot_type: role.slot_type ?? "claude_code",
        compiled_sub_agent_prompt: personality?.compiled_sub_agent_prompt ?? null,
      };
    });

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
