/**
 * zazigv2 — Slack Create Channel Edge Function
 *
 * Creates a Slack channel for CPO conversations and stores the channel ID
 * on the company record. Called by `zazig setup` after Slack OAuth.
 *
 * Deploy with: supabase functions deploy slack-create-channel --no-verify-jwt
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body: { company_id: string; channel_name: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { company_id, channel_name } = body;
  if (!company_id || !channel_name) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing company_id or channel_name" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // Look up bot token for this company
  const { data: installation, error: installErr } = await supabase
    .from("slack_installations")
    .select("bot_token, bot_user_id, authed_user_id")
    .eq("company_id", company_id)
    .limit(1)
    .single();

  if (installErr || !installation) {
    return new Response(
      JSON.stringify({ ok: false, error: "No Slack installation found for this company" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Create the channel via Slack API
  const createRes = await fetch("https://slack.com/api/conversations.create", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${installation.bot_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: channel_name, is_private: false }),
  });

  const createData = await createRes.json();

  let channelId: string;

  if (createData.ok) {
    channelId = createData.channel.id;
  } else if (createData.error === "name_taken") {
    // Channel already exists — look it up and join it
    const listRes = await fetch(
      `https://slack.com/api/conversations.list?types=public_channel&limit=200`,
      {
        headers: { Authorization: `Bearer ${installation.bot_token}` },
      },
    );
    const listData = await listRes.json();
    const existing = listData.channels?.find(
      (c: { name: string }) => c.name === channel_name,
    );

    if (!existing) {
      return new Response(
        JSON.stringify({ ok: false, error: `Channel #${channel_name} exists but could not be found` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    channelId = existing.id;

    // Join the channel
    await fetch("https://slack.com/api/conversations.join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installation.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: channelId }),
    });
  } else {
    console.error("[slack-create-channel] conversations.create failed:", createData.error);
    return new Response(
      JSON.stringify({ ok: false, error: `Slack API error: ${createData.error}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Invite the installing user so the channel appears in their sidebar
  if (installation.authed_user_id) {
    const inviteRes = await fetch("https://slack.com/api/conversations.invite", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${installation.bot_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: channelId,
        users: installation.authed_user_id,
      }),
    });
    const inviteData = await inviteRes.json();
    if (!inviteData.ok && inviteData.error !== "already_in_channel") {
      console.warn("[slack-create-channel] Failed to invite user:", inviteData.error);
    }
  }

  // Store channel ID on the company record
  const { error: updateErr } = await supabase
    .from("companies")
    .update({ slack_channels: [channelId] })
    .eq("id", company_id);

  if (updateErr) {
    console.error("[slack-create-channel] Failed to update company:", updateErr.message);
    return new Response(
      JSON.stringify({ ok: false, error: `Database error: ${updateErr.message}` }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  console.log(`[slack-create-channel] Created/joined #${channel_name} (${channelId}) for company ${company_id}`);

  return new Response(
    JSON.stringify({ ok: true, channel_id: channelId, channel_name }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
