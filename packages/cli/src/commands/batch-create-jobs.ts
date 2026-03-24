import { readFileSync } from "node:fs";
import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

function parseStringFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    const value = eq.slice(`--${name}=`.length);
    return value.length > 0 ? value : undefined;
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function fail(error: string): never {
  process.stderr.write(JSON.stringify({ "error": error }));
  process.exit(1);
}

function parseJobsPayload(jobs: string | undefined, jobsFile: string | undefined): unknown[] {
  if ((jobs && jobsFile) || (!jobs && !jobsFile)) {
    fail("Provide exactly one of --jobs <json> or --jobs-file <path>");
  }

  let rawJobs = "";
  if (jobs) {
    rawJobs = jobs;
  } else {
    if (!jobsFile) fail("Missing required flag: --jobs-file <path>");
    try {
      rawJobs = readFileSync(jobsFile, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(`Failed to read --jobs-file at ${jobsFile}: ${message}`);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJobs);
  } catch (error) {
    const source = jobs ? "--jobs" : "--jobs-file";
    const message = error instanceof Error ? error.message : String(error);
    fail(`Invalid JSON for ${source}: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    const source = jobs ? "--jobs" : "--jobs-file";
    fail(`Invalid payload for ${source}: expected a JSON array of job objects`);
  }

  return parsed;
}

export async function batchCreateJobs(args: string[]): Promise<void> {
  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const feature_id = parseStringFlag(args, "feature-id");
  if (!feature_id) fail("Missing required flag: --feature-id <uuid>");

  const jobsArg = parseStringFlag(args, "jobs");
  const jobsFile = parseStringFlag(args, "jobs-file");
  const jobs = parseJobsPayload(jobsArg, jobsFile);

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    fail("Not logged in. Run zazig login");
  }

  const config = (() => {
    try {
      return loadConfig() as { supabaseUrl?: string; supabase_url?: string };
    } catch {
      return undefined;
    }
  })();
  const supabaseUrl = config?.supabaseUrl ?? config?.supabase_url ?? creds.supabaseUrl;

  const response = await fetch(`${supabaseUrl}/functions/v1/batch-create-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "x-company-id": company_id,
    },
    body: JSON.stringify({
      feature_id,
      jobs,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    fail(`HTTP ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
