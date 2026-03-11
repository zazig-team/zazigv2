/**
 * zazigv2 — agent-inbound-poll Edge Function
 *
 * Daemon polling endpoint (every 10s) for inbound work that was previously
 * delivered over Realtime broadcasts.
 *
 * GET /functions/v1/agent-inbound-poll?machine_name=<name>&company_id=<uuid>
 */

import { createClient } from "@supabase/supabase-js";

console.log("[agent-inbound-poll] Module loading...");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

console.log("[agent-inbound-poll] SUPABASE_URL set:", !!SUPABASE_URL, "SERVICE_ROLE_KEY set:", !!SUPABASE_SERVICE_ROLE_KEY);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

// Pre-create admin client at module level (reused across requests)
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log("[agent-inbound-poll] Module loaded OK");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface JobRow {
  id: string;
  title: string | null;
  spec: string | null;
  acceptance_tests: string | null;
  complexity: string | null;
  role: string | null;
  job_type: string | null;
  feature_id: string | null;
  depends_on: string[] | null;
  status: string;
}

interface ExpertSessionRow {
  id: string;
  role_name: string;
  brief: string;
  machine_id: string | null;
  feature_id: string | null;
  project_id: string | null;
  branch_name: string | null;
  status: string;
}

type PollItem =
  | {
    type: "start_job";
    job_id: string;
    job: JobRow;
  }
  | {
    type: "start_expert";
    session_id: string;
    role_name: string;
    brief: string;
    feature_id: string | null;
    project_id: string | null;
    branch_name: string | null;
  };

function jsonResponse(body: Record<string, unknown> | PollItem[], status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

async function authenticateRequest(token: string): Promise<boolean> {
  // Allow service role key directly
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;

  // Validate as user JWT (same pattern as agent-event)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  console.log("[agent-inbound-poll] auth.getUser result:", error ? `error: ${error.message}` : `user: ${user?.email}`);
  return !error && !!user;
}

function requiredQueryParam(url: URL, key: string): string | null {
  const value = url.searchParams.get(key);
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = parseBearerToken(req.headers.get("Authorization"));
  if (!token) {
    return jsonResponse({ error: "Missing authorization header" }, 401);
  }

  try {
    const authenticated = await authenticateRequest(token);
    if (!authenticated) {
      return jsonResponse({ error: "Forbidden: invalid or expired token" }, 403);
    }
  } catch (authErr) {
    console.error("[agent-inbound-poll] Auth error:", authErr);
    return jsonResponse({ error: "Forbidden: auth validation failed" }, 403);
  }

  const url = new URL(req.url);
  const machineName = requiredQueryParam(url, "machine_name");
  const companyId = requiredQueryParam(url, "company_id");

  if (!machineName || !companyId) {
    return jsonResponse(
      { error: "machine_name and company_id query parameters are required" },
      400,
    );
  }

  try {
    const { data: jobsData, error: jobsErr } = await supabaseAdmin
      .from("jobs")
      .select(
        "id, title, spec, acceptance_tests, complexity, role, job_type, feature_id, depends_on, status, machines!inner(name, company_id)",
      )
      .eq("status", "dispatched")
      .eq("machines.name", machineName)
      .eq("machines.company_id", companyId);

    if (jobsErr) {
      return jsonResponse({ error: `Failed to fetch dispatched jobs: ${jobsErr.message}` }, 500);
    }

    const { data: sessionsData, error: sessionsErr } = await supabaseAdmin
      .from("expert_sessions")
      .select(
        "id, role_name, brief, machine_id, feature_id, project_id, branch_name, status, machines!inner(name, company_id)",
      )
      .eq("status", "requested")
      .eq("machines.name", machineName)
      .eq("machines.company_id", companyId);

    if (sessionsErr) {
      return jsonResponse({ error: `Failed to fetch requested expert sessions: ${sessionsErr.message}` }, 500);
    }

    const jobs = (jobsData ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const job: JobRow = {
        id: String(record.id),
        title: typeof record.title === "string" ? record.title : null,
        spec: typeof record.spec === "string" ? record.spec : null,
        acceptance_tests: typeof record.acceptance_tests === "string"
          ? record.acceptance_tests
          : null,
        complexity: typeof record.complexity === "string" ? record.complexity : null,
        role: typeof record.role === "string" ? record.role : null,
        job_type: typeof record.job_type === "string" ? record.job_type : null,
        feature_id: typeof record.feature_id === "string" ? record.feature_id : null,
        depends_on: Array.isArray(record.depends_on)
          ? record.depends_on.filter((v): v is string => typeof v === "string")
          : null,
        status: typeof record.status === "string" ? record.status : "dispatched",
      };
      return {
        type: "start_job" as const,
        job_id: job.id,
        job,
      };
    });

    const sessions = (sessionsData ?? []).map((row) => {
      const record = row as Record<string, unknown>;
      const session: ExpertSessionRow = {
        id: String(record.id),
        role_name: typeof record.role_name === "string" ? record.role_name : "",
        brief: typeof record.brief === "string" ? record.brief : "",
        machine_id: typeof record.machine_id === "string" ? record.machine_id : null,
        feature_id: typeof record.feature_id === "string" ? record.feature_id : null,
        project_id: typeof record.project_id === "string" ? record.project_id : null,
        branch_name: typeof record.branch_name === "string" ? record.branch_name : null,
        status: typeof record.status === "string" ? record.status : "requested",
      };
      return {
        type: "start_expert" as const,
        session_id: session.id,
        role_name: session.role_name,
        brief: session.brief,
        feature_id: session.feature_id,
        project_id: session.project_id,
        branch_name: session.branch_name,
      };
    });

    return jsonResponse([...jobs, ...sessions]);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
