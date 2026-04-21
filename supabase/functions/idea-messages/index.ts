/**
 * zazigv2 — idea-messages Edge Function
 *
 * GET  /idea-messages?idea_id=<uuid>            -> list messages (ascending)
 * POST /idea-messages                            -> insert message
 *
 * Auth:
 * - Accepts bearer token from the request.
 * - service_role token: uses admin client (RLS bypass).
 * - non-service token: uses auth-bound client so RLS applies.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SENDERS = new Set(["job", "user"]);

type IdeaMessageInsertBody = {
  idea_id?: unknown;
  content?: unknown;
  sender?: unknown;
  job_id?: unknown;
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseBearerToken(authHeader: string): string | null {
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isServiceRoleToken(token: string): boolean {
  if (token === SUPABASE_SERVICE_ROLE_KEY) return true;

  // Legacy JWT service_role keys include role in the payload.
  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function createRequestClient(authHeader: string, token: string): SupabaseClient {
  if (isServiceRoleToken(token)) {
    return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }

  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

async function ensureIdeaExists(
  supabase: SupabaseClient,
  ideaId: string,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { data: idea, error } = await supabase
    .from("ideas")
    .select("id")
    .eq("id", ideaId)
    .maybeSingle();

  if (error) {
    return { ok: false, response: jsonResponse({ error: error.message }, 500) };
  }

  if (!idea) {
    return { ok: false, response: jsonResponse({ error: "Idea not found" }, 404) };
  }

  return { ok: true };
}

async function handleGet(req: Request, supabase: SupabaseClient): Promise<Response> {
  const url = new URL(req.url);
  const ideaId = toTrimmedString(url.searchParams.get("idea_id"));

  if (!ideaId) {
    return jsonResponse({ error: "idea_id is required" }, 400);
  }
  if (!isUuid(ideaId)) {
    return jsonResponse({ error: "idea_id must be a valid UUID" }, 400);
  }

  const ideaCheck = await ensureIdeaExists(supabase, ideaId);
  if (!ideaCheck.ok) {
    return ideaCheck.response;
  }

  const { data: messages, error } = await supabase
    .from("idea_messages")
    .select("id, idea_id, job_id, sender, content, created_at")
    .eq("idea_id", ideaId)
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ messages: messages ?? [] });
}

async function handlePost(req: Request, supabase: SupabaseClient): Promise<Response> {
  let body: IdeaMessageInsertBody;
  try {
    body = await req.json() as IdeaMessageInsertBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const ideaId = toTrimmedString(body.idea_id);
  const content = toTrimmedString(body.content);
  const sender = toTrimmedString(body.sender);
  const jobId = body.job_id == null ? null : toTrimmedString(body.job_id);

  if (!ideaId) {
    return jsonResponse({ error: "idea_id is required" }, 400);
  }
  if (!isUuid(ideaId)) {
    return jsonResponse({ error: "idea_id must be a valid UUID" }, 400);
  }
  if (!content) {
    return jsonResponse({ error: "content is required" }, 400);
  }
  if (!sender) {
    return jsonResponse({ error: "sender is required" }, 400);
  }
  if (!VALID_SENDERS.has(sender)) {
    return jsonResponse({ error: "sender must be one of: job, user" }, 400);
  }
  if (body.job_id != null && !jobId) {
    return jsonResponse({ error: "job_id must be a non-empty string when provided" }, 400);
  }
  if (jobId && !isUuid(jobId)) {
    return jsonResponse({ error: "job_id must be a valid UUID when provided" }, 400);
  }

  const ideaCheck = await ensureIdeaExists(supabase, ideaId);
  if (!ideaCheck.ok) {
    return ideaCheck.response;
  }

  const { data: inserted, error } = await supabase
    .from("idea_messages")
    .insert({
      idea_id: ideaId,
      content,
      sender,
      job_id: jobId,
    })
    .select("id, idea_id, job_id, sender, content, created_at")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse(
    {
      id: inserted.id,
      idea_id: inserted.idea_id,
      job_id: inserted.job_id,
      sender: inserted.sender,
      content: inserted.content,
      created_at: inserted.created_at,
    },
    201,
  );
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

    const token = parseBearerToken(authHeader);
    if (!token) {
      return jsonResponse({ error: "Invalid authorization header" }, 401);
    }

    const supabase = createRequestClient(authHeader, token);

    if (req.method === "GET") {
      return await handleGet(req, supabase);
    }

    if (req.method === "POST") {
      return await handlePost(req, supabase);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
