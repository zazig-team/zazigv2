/**
 * zazigv2 — diagnose-feature Edge Function
 *
 * Gathers all diagnostic data for a failed feature (error, job results,
 * job_logs) then commissions a Sonnet agent to analyze and produce
 * a diagnosis report.
 *
 * Flow: gather data (cheap) → commission agent (smart)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
  );
}

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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json();
    const { company_id, feature_id } = body as {
      company_id?: string;
      feature_id?: string;
    };

    if (!company_id) return jsonResponse({ error: "company_id is required" }, 400);
    if (!feature_id) return jsonResponse({ error: "feature_id is required" }, 400);

    // --- 1. Fetch feature ---

    const { data: feature, error: featureErr } = await supabase
      .from("features")
      .select("id, title, status, error, spec, acceptance_tests, branch, description, project_id")
      .eq("id", feature_id)
      .eq("company_id", company_id)
      .single();

    if (featureErr || !feature) {
      return jsonResponse(
        { error: `Feature not found: ${featureErr?.message ?? feature_id}` },
        404,
      );
    }

    if (feature.status !== "failed") {
      return jsonResponse(
        { error: `Feature status is '${feature.status}', must be 'failed' to diagnose` },
        400,
      );
    }

    // --- 2. Fetch all jobs ---

    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, status, role, model, job_type, result, context, created_at")
      .eq("feature_id", feature_id)
      .order("created_at", { ascending: true });

    // --- 3. Fetch job_logs for failed jobs ---

    const failedJobIds = (jobs ?? [])
      .filter((j: { status: string }) => j.status === "failed")
      .map((j: { id: string }) => j.id);

    let jobLogs: Array<{ job_id: string; type: string; content: string }> = [];
    if (failedJobIds.length > 0) {
      const { data: logs } = await supabase
        .from("job_logs")
        .select("job_id, type, content")
        .in("job_id", failedJobIds);
      jobLogs = (logs ?? []) as typeof jobLogs;
    }

    // --- 4. Assemble diagnostic context ---

    const jobSummaries = (jobs ?? []).map((j: Record<string, unknown>) => {
      const summary: Record<string, unknown> = {
        id: (j.id as string).slice(0, 8),
        title: j.title,
        status: j.status,
        role: j.role,
        model: j.model,
        job_type: j.job_type,
      };
      if (j.result) summary.result = (j.result as string).slice(0, 2000);
      if (j.status === "failed" && j.context) {
        summary.context_snippet = (j.context as string).slice(0, 1000);
      }
      return summary;
    });

    const logsByJobId: Record<string, string[]> = {};
    for (const log of jobLogs) {
      if (!logsByJobId[log.job_id]) logsByJobId[log.job_id] = [];
      // Truncate logs to avoid blowing up context
      logsByJobId[log.job_id].push(
        `[${log.type}] ${log.content.slice(0, 3000)}`,
      );
    }

    const diagnosticContext = `# Feature Failure Diagnosis

## Feature
- **Title:** ${feature.title}
- **ID:** ${feature.id}
- **Status:** ${feature.status}
- **Error:** ${feature.error ?? "none recorded"}
- **Branch:** ${feature.branch ?? "none"}

## Description
${feature.description ?? "No description"}

## Spec
${feature.spec ? feature.spec.slice(0, 3000) : "No spec"}

## Acceptance Tests
${feature.acceptance_tests ? feature.acceptance_tests.slice(0, 2000) : "None"}

## Jobs (${(jobs ?? []).length} total)
${jobSummaries.map((j: Record<string, unknown>) => `
### ${j.title} (${j.status})
- Role: ${j.role} | Model: ${j.model} | Type: ${j.job_type}
${j.result ? `- Result: ${j.result}` : "- No result recorded"}
${j.context_snippet ? `- Context: ${j.context_snippet}` : ""}
`).join("\n")}

## Failed Job Logs
${failedJobIds.length === 0 ? "No failed jobs found." : failedJobIds.map((id: string) => {
  const logs = logsByJobId[id];
  if (!logs || logs.length === 0) return `### Job ${id.slice(0, 8)}\nNo logs recorded.`;
  return `### Job ${id.slice(0, 8)}\n${logs.join("\n")}`;
}).join("\n\n")}

---

## Your Task

You are a diagnostician. Analyze the above failure data and produce a structured diagnosis report.

1. **Root Cause**: What specifically went wrong? Be precise — name the file, the error, the misunderstanding.
2. **Failure Chain**: Trace the sequence of events that led to failure. Which job failed first? Did that cascade?
3. **What Was Attempted**: What did the agent(s) actually try to do? Did they get close?
4. **Recommended Fix**: Concrete, actionable steps to fix this. Be specific enough that an engineer agent can act on it.
5. **Complexity Assessment**: Is this a simple fix (config/typo), medium (logic change), or complex (architectural issue)?

Keep it concise. If the logs don't contain enough info, say what's missing.

## IMPORTANT: Output Instructions

You MUST write your diagnosis report to the file \`.claude/senior-engineer-report.md\`.
The file MUST start with exactly this line:

status: pass

Then leave a blank line, then write your full diagnosis report below.
This format is required for the system to capture your report. Do NOT skip this step.`;

    // --- 5. Create diagnose job ---

    const { data: job, error: jobErr } = await supabase.from("jobs").insert({
      company_id,
      project_id: feature.project_id,
      feature_id,
      title: `Diagnose: ${feature.title}`,
      role: "senior-engineer",
      job_type: "code",
      complexity: "simple",
      slot_type: "claude_code",
      status: "queued",
      context: diagnosticContext,
    }).select("id").single();

    if (jobErr || !job) {
      return jsonResponse(
        { error: `Failed to create diagnose job: ${jobErr?.message ?? "unknown"}` },
        500,
      );
    }

    return jsonResponse({ job_id: job.id, feature_id });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
