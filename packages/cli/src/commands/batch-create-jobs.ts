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

function printHelp(): void {
  const help = `Usage: zazig batch-create-jobs --company <uuid> --feature-id <uuid> (--jobs <json> | --jobs-file <path>)

Flags:
  --company <uuid>       Company ID (required)
  --feature-id <uuid>    Feature ID — must be in 'breaking_down' status (required)
  --jobs <json>          Inline JSON array of job objects (mutually exclusive with --jobs-file)
  --jobs-file <path>     Path to a JSON file containing an array of job objects

Job object schema (all fields required):
  {
    "title":            string,          // Short job title
    "spec":             string,          // Implementation prompt — what to build
    "acceptance_tests": string,          // Gherkin acceptance criteria
    "role":             "senior-engineer" | "junior-engineer",
    "job_type":         "code",
    "complexity":       "simple" | "medium" | "complex",
    "depends_on":       string[]         // [] for root jobs, or ["temp:0", "temp:1"] to reference earlier jobs by array index
  }

Example:
  zazig batch-create-jobs --company <uuid> --feature-id <uuid> --jobs '[
    {"title":"Add user table","spec":"Create users table...","acceptance_tests":"Given...When...Then...","role":"senior-engineer","job_type":"code","complexity":"simple","depends_on":[]},
    {"title":"Add auth middleware","spec":"Create auth...","acceptance_tests":"Given...When...Then...","role":"senior-engineer","job_type":"code","complexity":"medium","depends_on":["temp:0"]}
  ]'`;
  console.log(help);
  process.exit(0);
}

export async function batchCreateJobs(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

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
