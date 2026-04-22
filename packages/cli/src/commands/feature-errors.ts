import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

type Job = {
  id: string;
  title?: string;
  status: string;
  error_message?: string | null;
  error_details?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at?: string;
};

type Feature = {
  id: string;
  title: string;
  status: string;
  retry_count?: number;
  updated_at?: string;
};

function parseFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq !== undefined) return eq.slice(`--${name}=`.length);
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) return undefined;
  return val;
}

export async function featureErrors(args: string[]): Promise<void> {
  const companyId = parseFlag(args, "company");
  const featureId = parseFlag(args, "id");

  if (!companyId) {
    process.stderr.write(
      "Usage: zazig feature-errors --company <company-id> --id <feature-id>\n",
    );
    process.exit(1);
  }

  if (!featureId) {
    process.stderr.write(
      "Usage: zazig feature-errors --company <company-id> --id <feature-id>\n",
    );
    process.exit(1);
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write("Error: Not logged in. Run zazig login\n");
    process.exit(1);
  }

  const config = (() => {
    try {
      return loadConfig() as { supabaseUrl?: string; supabase_url?: string };
    } catch {
      return undefined;
    }
  })();
  const supabaseUrl = config?.supabaseUrl ?? config?.supabase_url ?? creds.supabaseUrl;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${creds.accessToken}`,
    apikey: DEFAULT_SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    "x-company-id": companyId,
  };

  // Fetch feature details
  const featureRes = await fetch(`${supabaseUrl}/functions/v1/query-features`, {
    method: "POST",
    headers,
    body: JSON.stringify({ company_id: companyId, feature_id: featureId }),
  });
  if (!featureRes.ok) {
    const err = await featureRes.text().catch(() => "unknown error");
    process.stderr.write(`Error fetching feature: HTTP ${featureRes.status}: ${err}\n`);
    process.exit(1);
  }
  const featureData = (await featureRes.json()) as { features?: Feature[] };
  const feature = featureData.features?.[0];
  if (!feature) {
    process.stderr.write(`Error: Feature ${featureId} not found\n`);
    process.exit(1);
  }

  // Fetch jobs for feature
  const jobsRes = await fetch(`${supabaseUrl}/functions/v1/query-jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ company_id: companyId, feature_id: featureId, limit: 100 }),
  });
  if (!jobsRes.ok) {
    const err = await jobsRes.text().catch(() => "unknown error");
    process.stderr.write(`Error fetching jobs: HTTP ${jobsRes.status}: ${err}\n`);
    process.exit(1);
  }
  const jobsData = (await jobsRes.json()) as { jobs?: Job[] };
  const allJobs = jobsData.jobs ?? [];

  // Compute breakdown
  const complete = allJobs.filter((j) =>
    ["complete", "done", "approved"].includes(j.status),
  );
  const failed = allJobs.filter((j) => j.status === "failed");
  const pending = allJobs.filter((j) =>
    ["queued", "dispatched"].includes(j.status),
  );
  const running = allJobs.filter((j) =>
    ["executing", "running"].includes(j.status),
  );

  const ONE_HOUR_MS = 60 * 60 * 1000; // 3600 seconds
  const now = Date.now();
  const stuck = running.filter((j) => {
    if (!j.started_at) return false;
    const elapsed = now - new Date(j.started_at).getTime();
    return elapsed > ONE_HOUR_MS;
  });

  // Build human-readable output
  let out = "";
  out += `Feature: ${feature.title}\n`;
  out += `Status:  ${feature.status}\n`;
  out += `\n`;
  out += `Jobs: ${allJobs.length} total — ${complete.length} complete, ${failed.length} failed, ${pending.length} pending, ${running.length} running\n`;

  if (failed.length > 0) {
    out += `\n--- Failed: ${failed.length} ---\n`;
    for (const job of failed) {
      out += `\n  Job: ${job.id}${job.title ? ` — ${job.title}` : ""}\n`;
      if (job.error_message) {
        out += `  Error: ${job.error_message}\n`;
      }
      const ts = job.completed_at ?? job.updated_at;
      if (ts) {
        out += `  Timestamp: ${ts}\n`;
      }
    }
  }

  const retryCount = feature.retry_count ?? 0;
  if (retryCount > 0) {
    out += `\nRetry count: ${retryCount}\n`;
  }

  if (stuck.length > 0) {
    out += `\n--- Stuck: ${stuck.length} ---\n`;
    for (const job of stuck) {
      const startedMs = new Date(job.started_at!).getTime();
      const elapsedMin = Math.floor((now - startedMs) / 60000);
      out += `\n  Job: ${job.id}${job.title ? ` — ${job.title}` : ""}\n`;
      out += `  Running: ${elapsedMin} minutes (stuck — exceeded 1 hour threshold)\n`;
      out += `  Elapsed: ${elapsedMin} min\n`;
    }
  }

  // Recommendation
  out += `\nRecommendation:\n`;
  if (stuck.length > 0) {
    out += `  * Cancel and re-create stuck jobs to unblock the feature\n`;
  }
  if (failed.length > 0) {
    out += `  * Investigate error messages above and retry failed jobs\n`;
  }
  if (stuck.length === 0 && failed.length === 0) {
    out += `  * No issues detected — feature is progressing normally\n`;
  }

  process.stdout.write(out);
  process.exit(0);
}
