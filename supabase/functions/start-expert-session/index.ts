/**
 * zazigv2 — start-expert-session Edge Function
 *
 * Creates an expert session request for a company-scoped expert role and
 * dispatches a realtime command to the target machine daemon.
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-company-id",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return atob(normalized + "=".repeat(padding));
}

/**
 * Best-effort extraction of company_id from JWT payload.
 * Falls back to null when the header is absent, malformed, or non-JWT.
 */
function companyIdFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;

    if (typeof payload.company_id === "string" && payload.company_id.length > 0) {
      return payload.company_id;
    }
    if (typeof payload.companyId === "string" && payload.companyId.length > 0) {
      return payload.companyId;
    }

    const appMetadata = payload.app_metadata as Record<string, unknown> | undefined;
    if (typeof appMetadata?.company_id === "string" && appMetadata.company_id.length > 0) {
      return appMetadata.company_id;
    }

    const userMetadata = payload.user_metadata as Record<string, unknown> | undefined;
    if (typeof userMetadata?.company_id === "string" && userMetadata.company_id.length > 0) {
      return userMetadata.company_id;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveCompanyId(req: Request): string | null {
  const headerCompanyId = toTrimmedString(req.headers.get("x-company-id"));
  if (headerCompanyId) {
    return headerCompanyId;
  }

  return companyIdFromAuthHeader(req.headers.get("Authorization"));
}

interface ExpertRoleRow {
  id: string;
  name: string;
  display_name: string;
  model: string;
  prompt: string;
  skills: string[];
  mcp_tools: unknown;
  settings_overrides: unknown;
}

interface MachineRow {
  id: string;
  name: string;
}

interface StartExpertPayload {
  type: "start_expert";
  session_id: string;
  machine_id: string;
  role: {
    id: string;
    name: string;
    display_name: string;
    model: string;
    prompt: string;
    skills: string[];
    mcp_tools: unknown;
    settings_overrides: unknown;
  };
  brief: string;
  project_id: string | null;
}

async function broadcastStartExpert(
  supabase: SupabaseClient,
  machineName: string,
  companyId: string,
  payload: StartExpertPayload,
): Promise<string> {
  const channel = supabase.channel(`agent:${machineName}:${companyId}`);

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
          event: "start_expert",
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

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization header" }, 401);
    }

    const companyId = resolveCompanyId(req);
    if (!companyId) {
      return jsonResponse(
        { error: "Missing company context (x-company-id header or JWT company_id claim)" },
        400,
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const roleName = toTrimmedString(body.role_name);
    const brief = toTrimmedString(body.brief);
    const machineName = toTrimmedString(body.machine_id);
    const projectId = toTrimmedString(body.project_id);

    if (!roleName) {
      return jsonResponse({ error: "role_name is required" }, 400);
    }
    if (!brief) {
      return jsonResponse({ error: "brief is required" }, 400);
    }
    if (!machineName) {
      return jsonResponse({ error: "machine_id is required" }, 400);
    }

    const { data: roleData, error: roleErr } = await supabase
      .from("expert_roles")
      .select("id, name, display_name, model, prompt, skills, mcp_tools, settings_overrides")
      .eq("name", roleName)
      .maybeSingle();

    if (roleErr) {
      return jsonResponse({ error: `Failed to fetch expert role: ${roleErr.message}` }, 500);
    }

    if (!roleData) {
      return jsonResponse({ error: `Unknown expert role: ${roleName}` }, 400);
    }

    const role = roleData as ExpertRoleRow;

    const { data: machineData, error: machineErr } = await supabase
      .from("machines")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("name", machineName)
      .maybeSingle();

    if (machineErr) {
      return jsonResponse({ error: `Failed to fetch machine: ${machineErr.message}` }, 500);
    }

    if (!machineData) {
      return jsonResponse({ error: `Unknown machine name for company: ${machineName}` }, 400);
    }

    const machine = machineData as MachineRow;

    const { data: sessionData, error: sessionErr } = await supabase
      .from("expert_sessions")
      .insert({
        company_id: companyId,
        expert_role_id: role.id,
        machine_id: machine.id,
        triggered_by: "cpo",
        brief,
        status: "requested",
      })
      .select("id")
      .single();

    if (sessionErr || !sessionData) {
      return jsonResponse({ error: `Failed to create expert session: ${sessionErr?.message}` }, 500);
    }

    const sessionId = String((sessionData as { id: string }).id);

    const payload: StartExpertPayload = {
      type: "start_expert",
      session_id: sessionId,
      machine_id: machine.id,
      role: {
        id: role.id,
        name: role.name,
        display_name: role.display_name,
        model: role.model,
        prompt: role.prompt,
        skills: role.skills,
        mcp_tools: role.mcp_tools,
        settings_overrides: role.settings_overrides,
      },
      brief,
      project_id: projectId,
    };

    const broadcastResult = await broadcastStartExpert(
      supabase,
      machine.name,
      companyId,
      payload,
    );

    if (broadcastResult !== "ok") {
      return jsonResponse(
        {
          error: `Expert session created but Realtime broadcast failed: ${broadcastResult}`,
          session_id: sessionId,
        },
        500,
      );
    }

    return jsonResponse({ session_id: sessionId, status: "requested" });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
