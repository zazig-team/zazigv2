/**
 * zazigv2 — Slack Events Edge Function (inbound webhook)
 *
 * Receives Slack webhook events (message.im, app_mention, message.channels)
 * and routes inbound messages to the running local agent via Supabase Realtime.
 *
 * Deploy with: --no-verify-jwt (Slack doesn't send JWTs)
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient } from "@supabase/supabase-js";
import { PROTOCOL_VERSION } from "@zazigv2/shared";
import type { MessageInbound } from "@zazigv2/shared";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SLACK_SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
  );
}

// SLACK_SIGNING_SECRET validated at request time (not startup) so url_verification
// can work before the secret is configured in Supabase.

// ---------------------------------------------------------------------------
// Event deduplication (in-memory bounded Set, max 1000 entries)
// ---------------------------------------------------------------------------

const MAX_SEEN_EVENTS = 1000;
const seenEventIds = new Set<string>();
const seenEventOrder: string[] = [];

function isDuplicate(eventId: string): boolean {
  if (seenEventIds.has(eventId)) return true;
  seenEventIds.add(eventId);
  seenEventOrder.push(eventId);
  if (seenEventOrder.length > MAX_SEEN_EVENTS) {
    const oldest = seenEventOrder.shift()!;
    seenEventIds.delete(oldest);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Slack request signature verification
// ---------------------------------------------------------------------------

async function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
): Promise<boolean> {
  if (!timestamp || !signature) return false;

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) return false;

  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(SLACK_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(sigBaseString));
  const hexDigest = "v0=" + Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (hexDigest.length !== signature.length) return false;
  const a = encoder.encode(hexDigest);
  const b = encoder.encode(signature);
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdminClient() {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Slack "agent offline" reply
// ---------------------------------------------------------------------------

async function postOfflineReply(
  botToken: string,
  channel: string,
  threadTs: string,
): Promise<void> {
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel,
        thread_ts: threadTs,
        text: "The CPO is currently offline. Your message will not be delivered until the CPO is back online.",
      }),
    });
  } catch (err) {
    console.error("[slack-events] Failed to post offline reply:", err);
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const rawBody = await req.text();

  // Parse JSON first — needed for url_verification which must respond immediately
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // Handle url_verification challenge BEFORE signature check
  // (Slack sends this during app setup; must respond with challenge value)
  if (body.type === "url_verification") {
    return jsonResponse({ challenge: body.challenge as string });
  }

  // Verify Slack request signature for all other requests
  if (!SLACK_SIGNING_SECRET) {
    console.error("[slack-events] SLACK_SIGNING_SECRET not set — rejecting request");
    return jsonResponse({ error: "Server not configured" }, 500);
  }
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");
  const valid = await verifySlackSignature(rawBody, timestamp, signature);
  if (!valid) {
    console.warn("[slack-events] Invalid Slack signature — rejecting request");
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  // Only handle event_callback
  if (body.type !== "event_callback") {
    return jsonResponse({ ok: true });
  }

  const eventId = body.event_id as string;
  const teamId = body.team_id as string;
  const event = body.event as Record<string, unknown> | undefined;

  if (!event || !eventId || !teamId) {
    return jsonResponse({ ok: true });
  }

  // Deduplicate by event_id
  if (isDuplicate(eventId)) {
    console.log(`[slack-events] Duplicate event ${eventId} — skipping`);
    return jsonResponse({ ok: true });
  }

  // Skip bot messages
  if (event.bot_id) {
    return jsonResponse({ ok: true });
  }

  // Only handle message-like events
  const eventType = event.type as string;
  const eventSubtype = event.subtype as string | undefined;
  if (eventType !== "message" && eventType !== "app_mention") {
    return jsonResponse({ ok: true });
  }
  // Skip message subtypes (edits, deletes, joins, etc.) — only handle plain messages
  if (eventSubtype) {
    return jsonResponse({ ok: true });
  }

  const channel = event.channel as string;
  const text = event.text as string;
  const user = event.user as string;
  const ts = event.ts as string;

  if (!channel || !text || !ts) {
    return jsonResponse({ ok: true });
  }

  console.log(`[slack-events] Processing event ${eventId} from team ${teamId} channel ${channel}`);

  const supabase = makeAdminClient();

  // Look up team_id → company_id + bot_token from slack_installations
  const { data: installation, error: installErr } = await supabase
    .from("slack_installations")
    .select("company_id, bot_token")
    .eq("team_id", teamId)
    .single();

  if (installErr || !installation) {
    console.error(`[slack-events] No installation found for team ${teamId}:`, installErr?.message);
    return jsonResponse({ ok: true });
  }

  // Find running persistent agent (CPO)
  // Query jobs for persistent_agent that is currently executing, join with machines for machine name
  const { data: agentJob, error: jobErr } = await supabase
    .from("jobs")
    .select("id, machine_id, machines!inner(name, status)")
    .eq("company_id", installation.company_id)
    .eq("job_type", "persistent_agent")
    .eq("status", "executing")
    .limit(1)
    .single();

  const machineRow = agentJob?.machines as unknown as { name: string; status: string } | null;
  const agentOnline = !jobErr && agentJob && machineRow && machineRow.status === "online";

  if (agentOnline) {
    // Generate conversationId and broadcast MessageInbound
    // Channel-level replies — no thread_ts so the CPO responds at the channel level
    const conversationId = `slack:${teamId}:${channel}`;
    const machineName = machineRow!.name;

    const messageInbound: MessageInbound = {
      type: "message_inbound",
      protocolVersion: PROTOCOL_VERSION,
      conversationId,
      from: user ? `<@${user}>` : "unknown",
      text,
    };

    // Broadcast via Realtime to agent:{machineName} channel
    const realtimeChannel = supabase.channel(`agent:${machineName}`);
    await new Promise<void>((resolve) => {
      realtimeChannel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          const result = await realtimeChannel.send({
            type: "broadcast",
            event: "message",
            payload: messageInbound,
          });
          if (result !== "ok") {
            console.error(
              `[slack-events] Realtime broadcast failed on agent:${machineName}: ${result}`,
            );
          } else {
            console.log(
              `[slack-events] Broadcast MessageInbound to agent:${machineName} (conversation: ${conversationId})`,
            );
          }
          await realtimeChannel.unsubscribe();
          resolve();
        }
      });
    });
  } else {
    // Agent offline — reply to Slack
    console.log(`[slack-events] No running agent for company ${installation.company_id} — posting offline reply`);
    await postOfflineReply(installation.bot_token, channel, ts);
  }

  // Always return 200 within 3 seconds (Slack requires fast ack)
  return jsonResponse({ ok: true });
});
