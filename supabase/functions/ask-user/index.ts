/**
 * zazigv2 — ask-user Edge Function
 *
 * Inserts a job-originated question into idea_messages, then waits for a user
 * reply using Realtime with polling fallback.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
}

const ASK_USER_TIMEOUT_MS = 10 * 60 * 1000;
const REALTIME_CONNECT_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 4_000;
const LOOP_SLEEP_MS = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type AskUserBody = {
  idea_id?: unknown;
  question?: unknown;
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

  try {
    const payload = JSON.parse(atob(token.split(".")[1] ?? ""));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function setIdeaAwaitingResponse(
  supabase: ReturnType<typeof createClient>,
  ideaId: string,
): Promise<void> {
  await supabase
    .from("ideas")
    .update({ status: "awaiting_response" })
    .eq("id", ideaId);
}

type UserMessageRow = {
  content: string;
  created_at: string;
  sender: string;
  idea_id: string;
};

async function waitForUserReplyViaPolling(
  supabase: ReturnType<typeof createClient>,
  ideaId: string,
  sinceIso: string,
  lastMessageAtMs: number,
): Promise<{ reply?: string; timeout: boolean; lastMessageAtMs: number }> {
  let cursorIso = sinceIso;
  let lastSeenAt = lastMessageAtMs;

  while (Date.now() - lastSeenAt < ASK_USER_TIMEOUT_MS) {
    const { data, error } = await supabase
      .from("idea_messages")
      .select("content, created_at, sender, idea_id")
      .eq("idea_id", ideaId)
      .eq("sender", "user")
      .gt("created_at", cursorIso)
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      throw new Error(`Polling failed: ${error.message}`);
    }

    const row = (data?.[0] as UserMessageRow | undefined);
    if (row) {
      const createdAtMs = parseMs(row.created_at) ?? Date.now();
      lastSeenAt = createdAtMs;
      cursorIso = row.created_at;
      return { reply: row.content, timeout: false, lastMessageAtMs: lastSeenAt };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return { timeout: true, lastMessageAtMs: lastSeenAt };
}

async function waitForRealtimeConnected(channel: { subscribe: (...args: unknown[]) => unknown }): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const connectTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve(false);
    }, REALTIME_CONNECT_TIMEOUT_MS);

    channel.subscribe((status: string) => {
      if (settled) return;
      if (status === "SUBSCRIBED") {
        settled = true;
        clearTimeout(connectTimeout);
        resolve(true);
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        clearTimeout(connectTimeout);
        resolve(false);
      }
    });
  });
}

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
    const token = parseBearerToken(authHeader);
    if (!token) {
      return jsonResponse({ error: "Invalid authorization header" }, 401);
    }
    if (!isServiceRoleToken(token)) {
      return jsonResponse({ error: "Service role token required" }, 401);
    }

    let body: AskUserBody;
    try {
      body = await req.json() as AskUserBody;
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const ideaId = toTrimmedString(body.idea_id);
    const question = toTrimmedString(body.question);
    const jobId = toTrimmedString(body.job_id);

    if (!ideaId || !isUuid(ideaId)) {
      return jsonResponse({ error: "idea_id must be a valid UUID" }, 400);
    }
    if (!question) {
      return jsonResponse({ error: "question is required" }, 400);
    }
    if (!jobId || !isUuid(jobId)) {
      return jsonResponse({ error: "job_id must be a valid UUID" }, 400);
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    const { data: inserted, error: insertError } = await supabase
      .from("idea_messages")
      .insert({
        idea_id: ideaId,
        sender: "job",
        content: question,
        job_id: jobId,
      })
      .select("created_at")
      .single();

    if (insertError) {
      return jsonResponse({ error: insertError.message }, 500);
    }

    const insertedAtIso = inserted?.created_at ?? new Date().toISOString();
    let lastMessageAtMs = parseMs(insertedAtIso) ?? Date.now();
    let realtimeReply: string | null = null;
    let realtimeClosed = false;

    const channel = supabase.channel(`ask-user-${ideaId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "idea_messages",
          filter: `idea_id=eq.${ideaId}`,
        },
        (payload) => {
          const row = payload.new as Partial<UserMessageRow> | null;
          if (!row || row.sender !== "user") return;
          const createdAtMs = parseMs(row.created_at) ?? Date.now();
          lastMessageAtMs = createdAtMs; // Reset inactivity timeout on each user message.
          realtimeReply = typeof row.content === "string" ? row.content : "";
        },
      );

    const realtimeConnected = await waitForRealtimeConnected(channel);

    if (realtimeConnected) {
      while (Date.now() - lastMessageAtMs < ASK_USER_TIMEOUT_MS) {
        if (realtimeReply !== null) {
          if (!realtimeClosed) {
            realtimeClosed = true;
            await supabase.removeChannel(channel);
          }
          return jsonResponse({ reply: realtimeReply });
        }
        await sleep(LOOP_SLEEP_MS);
      }
    }

    if (!realtimeClosed) {
      realtimeClosed = true;
      await supabase.removeChannel(channel);
    }

    const pollResult = await waitForUserReplyViaPolling(
      supabase,
      ideaId,
      insertedAtIso,
      lastMessageAtMs,
    );

    if (pollResult.reply !== undefined) {
      return jsonResponse({ reply: pollResult.reply });
    }

    await setIdeaAwaitingResponse(supabase, ideaId);
    return jsonResponse({
      timeout: true,
      message: "No reply received. Idea status set to awaiting_response.",
    });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
