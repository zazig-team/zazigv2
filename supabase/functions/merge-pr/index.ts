/**
 * zazigv2 — merge-pr Edge Function
 *
 * Merges a feature's GitHub PR into master and marks the feature complete.
 * Called by the CPO via the merge_pr MCP tool.
 *
 * Runtime: Deno / Supabase Edge Functions
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Parse a GitHub PR URL into owner, repo, and PR number.
 * Handles: https://github.com/owner/repo/pull/123
 */
function parsePrUrl(prUrl: string): { owner: string; repo: string; prNumber: number } | null {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) };
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

    const { featureId } = await req.json() as { featureId?: string };
    if (!featureId) {
      return jsonResponse({ error: "featureId is required" }, 400);
    }

    if (!GITHUB_TOKEN) {
      return jsonResponse({ error: "GITHUB_TOKEN not configured on server" }, 500);
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // 1. Look up the feature and its pr_url
    const { data: feature, error: fetchErr } = await supabase
      .from("features")
      .select("id, status, pr_url, title")
      .eq("id", featureId)
      .single();

    if (fetchErr || !feature) {
      return jsonResponse({ error: `Feature not found: ${featureId}` }, 404);
    }

    if (feature.status !== "pr_ready") {
      return jsonResponse({
        error: `Feature is in status '${feature.status}', expected 'pr_ready'`,
      }, 409);
    }

    if (!feature.pr_url) {
      return jsonResponse({ error: "Feature has no PR URL — cannot merge" }, 400);
    }

    // 2. Parse the PR URL
    const parsed = parsePrUrl(feature.pr_url);
    if (!parsed) {
      return jsonResponse({
        error: `Cannot parse PR URL: ${feature.pr_url}`,
      }, 400);
    }

    // 3. Merge the PR via GitHub API
    const mergeResp = await fetch(
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/pulls/${parsed.prNumber}/merge`,
      {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merge_method: "squash",
          commit_title: `feat: ${feature.title ?? featureId}`,
        }),
      },
    );

    if (!mergeResp.ok) {
      const body = await mergeResp.text();
      console.error(`[merge-pr] GitHub merge failed for PR #${parsed.prNumber} (HTTP ${mergeResp.status}): ${body}`);
      return jsonResponse({
        error: `GitHub merge failed (HTTP ${mergeResp.status}): ${body}`,
      }, 502);
    }

    const mergeResult = await mergeResp.json() as { sha?: string; message?: string };
    console.log(`[merge-pr] PR #${parsed.prNumber} merged for feature ${featureId}: ${mergeResult.sha ?? "unknown sha"}`);

    // 4. Mark feature as complete
    const { error: updateErr } = await supabase
      .from("features")
      .update({ status: "complete", updated_at: new Date().toISOString() })
      .eq("id", featureId)
      .eq("status", "pr_ready");

    if (updateErr) {
      console.error(`[merge-pr] Failed to update feature ${featureId} to complete:`, updateErr.message);
      return jsonResponse({
        error: `PR merged but failed to update feature status: ${updateErr.message}`,
        merged: true,
        sha: mergeResult.sha,
      }, 500);
    }

    return jsonResponse({
      success: true,
      message: `PR #${parsed.prNumber} merged and feature marked complete`,
      sha: mergeResult.sha,
    });
  } catch (err) {
    console.error("[merge-pr] Unexpected error:", err);
    return jsonResponse({ error: String(err) }, 500);
  }
});
