/**
 * zazigv2 — agent-event Edge Function
 *
 * Durable HTTP POST endpoint for daemon -> orchestrator agent messages.
 *
 * Auth: deployed with --no-verify-jwt, so JWT verification is handled here.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  isAgentMessage,
  type AgentMessage,
  type Heartbeat,
  type JobAck,
  type JobComplete,
  type JobFailed,
  type JobStatusMessage,
  type VerifyResult,
} from "@zazigv2/shared";
import {
  handleHeartbeat,
  handleJobAck,
  handleJobComplete,
  handleJobFailed,
  handleJobStatus,
  handleVerifyResult,
} from "./handlers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function parseBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

const KNOWN_TYPES = new Set<AgentMessage["type"]>([
  "job_complete",
  "job_failed",
  "verify_result",
  "heartbeat",
  "job_ack",
  "job_status",
  "stop_ack",
]);

async function callAsyncHandler<T>(
  handler: (supabase: SupabaseClient, msg: T) => Promise<void>,
  msg: T,
  supabaseAdmin: SupabaseClient,
): Promise<void> {
  await handler(supabaseAdmin, msg);
}

async function callSyncHandler<T>(
  handler: (supabase: SupabaseClient, msg: T) => void,
  msg: T,
  supabaseAdmin: SupabaseClient,
): Promise<void> {
  await Promise.resolve(handler(supabaseAdmin, msg));
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const token = parseBearerToken(req.headers.get("Authorization"));
  if (!token) {
    return jsonResponse({ ok: false, error: "Missing bearer token" }, 401);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabaseAdmin.auth.getUser(token);

  if (userErr || !user) {
    return jsonResponse({ ok: false, error: "Forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  if (!isAgentMessage(body)) {
    if (
      body &&
      typeof body === "object" &&
      "type" in body &&
      typeof (body as Record<string, unknown>).type === "string" &&
      !KNOWN_TYPES.has((body as Record<string, unknown>).type as AgentMessage["type"])
    ) {
      return jsonResponse({ ok: false, error: "Unknown message type" }, 400);
    }

    return jsonResponse({ ok: false, error: "Invalid message" }, 400);
  }

  try {
    switch (body.type) {
      case "job_complete":
        await callAsyncHandler(handleJobComplete, body as JobComplete, supabaseAdmin);
        break;
      case "job_failed":
        await callAsyncHandler(handleJobFailed, body as JobFailed, supabaseAdmin);
        break;
      case "verify_result":
        await callAsyncHandler(handleVerifyResult, body as VerifyResult, supabaseAdmin);
        break;
      case "heartbeat":
        await callAsyncHandler(handleHeartbeat, body as Heartbeat, supabaseAdmin);
        break;
      case "job_ack":
        await callSyncHandler(handleJobAck, body as JobAck, supabaseAdmin);
        break;
      case "job_status":
        await callAsyncHandler(handleJobStatus, body as JobStatusMessage, supabaseAdmin);
        break;
      case "stop_ack":
        console.log(
          `[agent-event] stop_ack received for job ${(body as { jobId?: string }).jobId ?? "unknown"}`,
        );
        break;
      default:
        return jsonResponse({ ok: false, error: "Unknown message type" }, 400);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[agent-event] handler error:", message);
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
