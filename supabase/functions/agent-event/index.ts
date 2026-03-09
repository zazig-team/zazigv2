/**
 * zazigv2 — agent-event Edge Function
 *
 * Receives agent lifecycle events and routes them through orchestrator handlers
 * with explicit caller context for structured logging.
 */

import { createClient } from "@supabase/supabase-js";
import { handleAgentEventMessage } from "../orchestrator/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
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

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const payloadRecord = payload && typeof payload === "object"
    ? payload as Record<string, unknown>
    : null;
  const payloadJobId = typeof payloadRecord?.jobId === "string"
    ? payloadRecord.jobId
    : undefined;

  try {
    await handleAgentEventMessage(supabase, payload, {
      caller: "agent-event",
      jobId: payloadJobId,
    });
    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[agent-event] Failed to process agent event${
        payloadJobId ? ` for job ${payloadJobId}` : ""
      }:`,
      message,
    );
    return jsonResponse({ ok: false, error: message }, 500);
  }
});
