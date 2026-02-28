/**
 * zazigv2 — agent-message Edge Function (outbound relay)
 *
 * Receives outbound reply requests from agents (via the MCP tool) and routes
 * them to the correct external platform (Slack) by parsing the opaque
 * conversationId.
 *
 * Auth: Supabase verifies the JWT automatically (deployed WITHOUT --no-verify-jwt).
 * The function additionally checks the bearer token matches SUPABASE_ANON_KEY.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Slack adapter
// ---------------------------------------------------------------------------

async function sendSlack(
  teamId: string,
  channel: string,
  text: string,
  threadTs?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Fetch bot_token from slack_installations using service_role (bypasses RLS).
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("slack_installations")
    .select("bot_token")
    .eq("team_id", teamId)
    .single();

  if (error || !data) {
    console.error(
      `[agent-message] Failed to fetch bot_token for team ${teamId}:`,
      error?.message,
    );
    return { ok: false, error: `No Slack installation found for team ${teamId}` };
  }

  const botToken = data.bot_token as string;

  // Post to Slack chat.postMessage.
  const slackRes = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${botToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      channel,
      text,
      ...(threadTs ? { thread_ts: threadTs } : {}),
    }),
  });

  const slackBody = await slackRes.json();

  if (!slackBody.ok) {
    console.error(
      `[agent-message] Slack API error for team ${teamId}:`,
      slackBody.error,
    );
    return { ok: false, error: `Slack API error: ${slackBody.error}` };
  }

  console.log(
    `[agent-message] Message sent to Slack — team:${teamId} channel:${channel}${threadTs ? ` thread:${threadTs}` : ""}`,
  );
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  // Only accept POST.
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  // Auth: Supabase API Gateway verifies the JWT in the Authorization header
  // before the request reaches this function (deployed without --no-verify-jwt).
  // No additional token check needed here.

  // Parse request body.
  let body: { conversationId?: string; text?: string; jobId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const { conversationId: rawConversationId, text, jobId } = body;

  if (!text || typeof text !== "string") {
    return jsonResponse({ ok: false, error: "Missing or invalid text" }, 400);
  }
  if (!jobId || typeof jobId !== "string") {
    return jsonResponse({ ok: false, error: "Missing or invalid jobId" }, 400);
  }

  // Auto-resolve conversationId from the job's company when not provided.
  let conversationId = rawConversationId;
  if (!conversationId) {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });

    // Look up company_id from the job
    const { data: job } = await supabase
      .from("jobs")
      .select("company_id")
      .eq("id", jobId)
      .single();

    if (!job?.company_id) {
      return jsonResponse({ ok: false, error: `Could not resolve company for job ${jobId}` }, 400);
    }

    // Get default Slack channel from company
    const { data: company } = await supabase
      .from("companies")
      .select("slack_channels")
      .eq("id", job.company_id)
      .single();

    const channels = (company?.slack_channels ?? []) as string[];
    if (channels.length === 0) {
      return jsonResponse({ ok: false, error: "No Slack channel configured for this company" }, 400);
    }

    // Get team_id from slack_installations
    const { data: installation } = await supabase
      .from("slack_installations")
      .select("team_id")
      .eq("company_id", job.company_id)
      .limit(1)
      .single();

    if (!installation?.team_id) {
      return jsonResponse({ ok: false, error: "No Slack installation found for this company" }, 400);
    }

    conversationId = `slack:${installation.team_id}:${channels[0]}`;
    console.log(`[agent-message] Auto-resolved conversationId: ${conversationId}`);
  }

  console.log(
    `[agent-message] Outbound request — jobId:${jobId} conversationId:${conversationId}`,
  );

  // Parse conversationId: {adapter}:{adapter-specific-routing-data}
  const [adapter, ...rest] = conversationId.split(":");

  switch (adapter) {
    case "slack": {
      // Format: slack:{team_id}:{channel} or slack:{team_id}:{channel}:{thread_ts}
      const [teamId, channel, threadTs] = rest;
      if (!teamId || !channel) {
        return jsonResponse(
          { ok: false, error: "Invalid Slack conversationId format — expected slack:{team_id}:{channel}[:{thread_ts}]" },
          400,
        );
      }

      const result = await sendSlack(teamId, channel, text, threadTs || undefined);
      if (!result.ok) {
        return jsonResponse({ ok: false, error: result.error }, 502);
      }
      return jsonResponse({ ok: true });
    }

    default:
      return jsonResponse(
        { ok: false, error: `Unknown conversationId prefix: ${adapter}` },
        400,
      );
  }
});
