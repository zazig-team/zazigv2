/**
 * zazigv2 — agent-inbound-poll Edge Function
 *
 * Combined heartbeat + job claim endpoint. Daemon calls every 10s.
 *
 * POST /functions/v1/agent-inbound-poll
 * Body: { machine_name, company_id, slots_available: { claude_code, codex }, agent_version }
 *
 * 1. Updates machine heartbeat (last_heartbeat, slots)
 * 2. Finds queued jobs this machine can handle (by slot_type capacity)
 * 3. Atomically claims them (queued → executing, sets machine_id)
 * 4. Returns claimed jobs as StartJob messages
 * 5. Returns requested expert sessions as StartExpert messages
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PROTOCOL_VERSION = 1;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExpertSessionRow {
  id: string;
  brief: string;
  headless: boolean;
  batch_id: string | null;
  items_total: number;
  status: string;
  expert_roles: {
    name: string;
    display_name: string;
    model: string;
    prompt: string;
    skills: string[] | null;
    mcp_tools: unknown;
    settings_overrides: unknown;
  };
}

function jsonResponse(body: unknown, status = 200): Response {
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
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  return !error && !!user;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function strArr(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const filtered = v.filter((s): s is string => typeof s === "string" && s.length > 0);
  return filtered.length > 0 ? filtered : undefined;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed — use POST" }, 405);
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
  } catch {
    return jsonResponse({ error: "Forbidden: auth validation failed" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const machineName = str(body.machine_name);
  const companyId = str(body.company_id);
  const agentVersion = str(body.agent_version);
  const slots = body.slots_available as { claude_code?: number; codex?: number } | undefined;

  if (!machineName || !companyId) {
    return jsonResponse({ error: "machine_name and company_id are required" }, 400);
  }

  const slotsClaudeCode = typeof slots?.claude_code === "number" ? slots.claude_code : 0;
  const slotsCodex = typeof slots?.codex === "number" ? slots.codex : 0;

  try {
    // ---------------------------------------------------------------
    // 1. Update machine heartbeat
    // ---------------------------------------------------------------
    const { error: heartbeatErr } = await supabaseAdmin
      .from("machines")
      .upsert(
        {
          company_id: companyId,
          name: machineName,
          status: "online",
          last_heartbeat: new Date().toISOString(),
          slots_claude_code: slotsClaudeCode,
          slots_codex: slotsCodex,
          ...(agentVersion ? { agent_version: agentVersion } : {}),
        },
        { onConflict: "company_id,name" },
      );

    if (heartbeatErr) {
      console.error("[agent-inbound-poll] Heartbeat upsert failed:", heartbeatErr.message);
      // Don't fail the whole request — still try to return jobs
    }

    const env = Deno.env.get("ZAZIG_ENV") ?? "production";
    const { data: latestVersion, error: latestVersionErr } = await supabaseAdmin
      .from("agent_versions")
      .select("version")
      .eq("env", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestVersionErr) {
      console.error("[agent-inbound-poll] agent_versions lookup failed:", latestVersionErr.message);
    }

    const versionMetadata: Record<string, unknown> = {};
    if (latestVersion?.version && latestVersion.version !== agentVersion) {
      versionMetadata.outdated = true;
      versionMetadata.required_version = latestVersion.version;
    }

    const baseResponse: Record<string, unknown> = {
      heartbeat: "ok",
      ...versionMetadata,
    };

    // ---------------------------------------------------------------
    // 2. Find queued jobs this machine can handle
    // ---------------------------------------------------------------
    if (slotsClaudeCode <= 0 && slotsCodex <= 0) {
      return jsonResponse({ jobs: [], ...baseResponse });
    }

    // Resolve machine ID for claiming
    const { data: machineRow, error: machineErr } = await supabaseAdmin
      .from("machines")
      .select("id")
      .eq("company_id", companyId)
      .eq("name", machineName)
      .single();

    if (machineErr || !machineRow) {
      return jsonResponse({ jobs: [], ...baseResponse, error: "Machine not found" });
    }

    const machineId = machineRow.id;

    // Query queued jobs for this company, ordered by created_at (FIFO)
    const { data: queuedJobs, error: queueErr } = await supabaseAdmin
      .from("jobs")
      .select(
        "id, title, context, acceptance_tests, complexity, role, job_type, feature_id, " +
        "depends_on, status, slot_type, model, project_id, prompt_stack, " +
        "features(branch), projects(repo_url)",
      )
      .eq("company_id", companyId)
      .eq("status", "queued")
      .order("created_at", { ascending: true });

    if (queueErr) {
      return jsonResponse({ error: `Failed to query jobs: ${queueErr.message}` }, 500);
    }

    // ---------------------------------------------------------------
    // 3. Claim jobs up to available slots
    // ---------------------------------------------------------------
    let remainingClaude = slotsClaudeCode;
    let remainingCodex = slotsCodex;
    const claimedMessages: Record<string, unknown>[] = [];

    for (const row of queuedJobs ?? []) {
      const r = row as Record<string, unknown>;
      const slotType = str(r.slot_type) ?? "claude_code";

      // Check capacity
      if (slotType === "codex" && remainingCodex <= 0) continue;
      if (slotType === "claude_code" && remainingClaude <= 0) continue;

      // Atomic CAS claim: only succeeds if still queued
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .from("jobs")
        .update({
          status: "executing",
          machine_id: machineId,
          started_at: new Date().toISOString(),
        })
        .eq("id", r.id)
        .eq("status", "queued")
        .select()
        .maybeSingle();

      if (claimErr || !claimed) continue; // Someone else claimed it — skip

      // Decrement available slots
      if (slotType === "codex") remainingCodex--;
      else remainingClaude--;

      // Build StartJob message matching daemon's isStartJob validator
      const features = r.features as Record<string, unknown> | null;
      const projects = r.projects as Record<string, unknown> | null;
      const jobId = String(r.id);
      const promptStack = str(r.prompt_stack);
      const context = str(r.context);

      const msg: Record<string, unknown> = {
        type: "start_job",
        protocolVersion: PROTOCOL_VERSION,
        jobId,
        cardId: jobId,
        cardType: str(r.job_type) ?? "code",
        complexity: str(r.complexity) ?? "medium",
        slotType,
        model: str(r.model) ?? "claude-sonnet-4-6",
        projectId: str(r.project_id) ?? "",
      };

      if (promptStack) msg.promptStackMinusSkills = promptStack;
      else if (context) msg.context = context;

      const repoUrl = str(projects?.repo_url);
      const featureBranch = str(features?.branch);
      if (repoUrl) msg.repoUrl = repoUrl;
      if (featureBranch) msg.featureBranch = featureBranch;
      if (str(r.role)) msg.role = str(r.role);
      if (str(r.title)) msg.title = str(r.title);
      if (str(r.acceptance_tests)) msg.acceptanceCriteria = str(r.acceptance_tests);

      claimedMessages.push(msg);

      // Stop if no capacity left
      if (remainingClaude <= 0 && remainingCodex <= 0) break;
    }

    // ---------------------------------------------------------------
    // 4. Find requested expert sessions for this machine
    // ---------------------------------------------------------------
    const thirtySecondsAgo = new Date(Date.now() - 30_000).toISOString();
    const { data: sessionsData, error: sessionsErr } = await supabaseAdmin
      .from("expert_sessions")
      .select(
        "id, brief, headless, batch_id, items_total, status, expert_roles(name, display_name, model, prompt, skills, mcp_tools, settings_overrides)",
      )
      .eq("status", "requested")
      .eq("machine_id", machineId)
      .gte("created_at", thirtySecondsAgo);

    if (sessionsErr) {
      console.error("[agent-inbound-poll] Expert sessions query failed:", sessionsErr.message);
      // Don't fail — still return jobs
    }

    const expertMessages = (sessionsData ?? []).map((row) => {
      const record = row as unknown as ExpertSessionRow;
      const role = record.expert_roles;
      return {
        type: "start_expert",
        protocolVersion: PROTOCOL_VERSION,
        session_id: record.id,
        model: role?.model ?? "claude-sonnet-4-6",
        brief: record.brief ?? "",
        headless: record.headless ?? false,
        batch_id: record.batch_id ?? undefined,
        auto_exit: record.headless ?? false,
        display_name: role?.display_name ?? role?.name ?? "Expert",
        role: {
          prompt: role?.prompt ?? "",
          skills: role?.skills ?? [],
          mcp_tools: role?.mcp_tools ?? { allowed: [] },
          settings_overrides: role?.settings_overrides ?? undefined,
        },
      };
    });

    return jsonResponse({
      jobs: claimedMessages,
      experts: expertMessages,
      ...baseResponse,
    });
  } catch (err) {
    console.error("[agent-inbound-poll] Error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
