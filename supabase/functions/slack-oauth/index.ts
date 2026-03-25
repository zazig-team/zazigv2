/**
 * zazigv2 — Slack OAuth Callback Edge Function
 *
 * Handles the Slack OAuth redirect. Exchanges the authorization code for a
 * bot token and upserts the installation into slack_installations.
 *
 * Deploy with: supabase functions deploy slack-oauth --no-verify-jwt
 * Secrets: SLACK_CLIENT_ID, SLACK_CLIENT_SECRET
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SLACK_CLIENT_ID = Deno.env.get("SLACK_CLIENT_ID");
const SLACK_CLIENT_SECRET = Deno.env.get("SLACK_CLIENT_SECRET");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token: string;
  bot_user_id: string;
  app_id: string;
  scope: string;
  authed_user: { id: string };
  team: { id: string; name: string };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state"); // company_id UUID

  if (!code || !state) {
    return new Response("Missing code or state parameter", { status: 400 });
  }

  if (!SLACK_CLIENT_ID || !SLACK_CLIENT_SECRET) {
    console.error("[slack-oauth] Missing SLACK_CLIENT_ID or SLACK_CLIENT_SECRET");
    return new Response("Server configuration error", { status: 500 });
  }

  // Exchange the authorization code for a bot token.
  // redirect_uri must match the one sent in the initial authorization request.
  const redirectUri = `${SUPABASE_URL}/functions/v1/slack-oauth`;
  const tokenRes = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData: SlackOAuthResponse = await tokenRes.json();

  if (!tokenData.ok) {
    console.error("[slack-oauth] Slack oauth.v2.access failed:", tokenData.error);
    return new Response(`Slack OAuth error: ${tokenData.error}`, { status: 400 });
  }

  // Upsert into slack_installations using service_role client (bypasses RLS).
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { error: upsertErr } = await supabase
    .from("slack_installations")
    .upsert(
      {
        team_id: tokenData.team.id,
        company_id: state,
        team_name: tokenData.team.name,
        bot_token: tokenData.access_token,
        bot_user_id: tokenData.bot_user_id,
        app_id: tokenData.app_id,
        scope: tokenData.scope,
        authed_user_id: tokenData.authed_user.id,
      },
      { onConflict: "team_id" },
    );

  if (upsertErr) {
    console.error("[slack-oauth] Upsert failed:", upsertErr.message);
    return new Response(`Database error: ${upsertErr.message}`, { status: 500 });
  }

  console.log(
    `[slack-oauth] Installed workspace ${tokenData.team.name} (${tokenData.team.id}) for company ${state}`,
  );

  // Return a simple success page.
  return new Response(
    "<html><body><h1>Zazig connected!</h1><p>Workspace connected successfully.</p></body></html>",
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
});
