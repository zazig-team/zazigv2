import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

type ParsedFlag = {
  provided: boolean;
  value?: string;
};

type FeatureRecord = {
  id?: string;
  title?: string;
  status?: string;
  priority?: string;
  retry_count?: number;
};

type JobRecord = {
  id?: string;
  title?: string;
  status?: string;
  error_message?: string;
  error_details?: string;
  started_at?: string;
  updated_at?: string;
  completed_at?: string;
  retry_count?: number;
  retries?: number;
  retry_attempts?: number;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STUCK_JOB_THRESHOLD_MS = 60 * 60 * 1000;

function parseFlag(args: string[], name: string): ParsedFlag {
  const eq = args.find((arg) => arg.startsWith(`--${name}=`));
  if (eq !== undefined) {
    const value = eq.slice(`--${name}=`.length);
    return { provided: true, value: value.length > 0 ? value : undefined };
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) {
    return { provided: false };
  }

  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    return { provided: true, value: undefined };
  }

  return { provided: true, value };
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function fail(message: string): never {
  process.stderr.write(JSON.stringify({ error: message }));
  process.exit(1);
}

function printHelp(): void {
  process.stdout.write("Usage: zazig feature-errors --company <company-id> --id <feature-id> [--json]\n\n");
  process.stdout.write("Required:\n");
  process.stdout.write("  --company <uuid>       Company UUID\n");
  process.stdout.write("  --id <uuid>            Feature UUID\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --json                 Print raw JSON payload instead of formatted output\n");
  process.stdout.write("  --help                 Show this help\n");
}

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function toIsoOrUnknown(value: string | undefined): string {
  return value && value.length > 0 ? value : "unknown";
}

function getRecommendation(
  feature: FeatureRecord | undefined,
  jobs: JobRecord[],
  failedJobs: JobRecord[],
  stuckJobs: Array<JobRecord & { runningForMs: number }>,
): string {
  const allFailed = jobs.length > 0 && failedJobs.length === jobs.length;
  if (allFailed) {
    const uniqueErrors = new Set(
      failedJobs.map((job) => String(job.error_message ?? "").trim()).filter((msg) => msg.length > 0),
    );
    if (uniqueErrors.size === 1) {
      return "Retry failed jobs - error may be transient";
    }
  }

  if (stuckJobs.length > 0) {
    const title = String(stuckJobs[0]?.title ?? stuckJobs[0]?.id ?? "unknown job");
    return `Investigate stuck job: ${title}`;
  }

  const featureStatus = String(feature?.status ?? "").toLowerCase();
  if ((featureStatus === "merging" || featureStatus === "building") && failedJobs.length > 0) {
    return "Cancel and re-create feature";
  }

  return "Review error messages above for details";
}

export async function featureErrors(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h") || args.includes("help")) {
    printHelp();
    process.exit(0);
  }

  const company = parseFlag(args, "company");
  const id = parseFlag(args, "id");
  const jsonOutput = args.includes("--json");

  if (!company.value) {
    fail("Missing required flag: --company <uuid>");
  }
  if (!isUuid(company.value)) {
    fail("Invalid --company value: expected UUID");
  }
  if (!id.value) {
    fail("Missing required flag: --id <uuid>");
  }
  if (!isUuid(id.value)) {
    fail("Invalid --id value: expected UUID");
  }

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
  const company_id = company.value;
  const feature_id = id.value;

  const featureResponse = await fetch(`${supabaseUrl}/functions/v1/query-features`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "x-company-id": company_id,
    },
    body: JSON.stringify({ feature_id, company_id }),
  });

  if (!featureResponse.ok) {
    const errorBody = await featureResponse.text().catch(() => "unknown error");
    fail(`HTTP ${featureResponse.status}: ${errorBody}`);
  }

  const featureData = (await featureResponse.json()) as { features?: FeatureRecord[] };
  const feature = Array.isArray(featureData.features) ? featureData.features[0] : undefined;
  if (!feature) {
    fail("Feature not found");
  }

  const jobsResponse = await fetch(`${supabaseUrl}/functions/v1/query-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "x-company-id": company_id,
    },
    body: JSON.stringify({ feature_id, company_id, limit: 100, offset: 0 }),
  });

  if (!jobsResponse.ok) {
    const errorBody = await jobsResponse.text().catch(() => "unknown error");
    fail(`HTTP ${jobsResponse.status}: ${errorBody}`);
  }

  const jobsData = (await jobsResponse.json()) as { jobs?: JobRecord[] };
  const jobs = Array.isArray(jobsData.jobs) ? jobsData.jobs : [];
  const now = Date.now();

  let completeCount = 0;
  let failedCount = 0;
  let runningCount = 0;
  let queuedCount = 0;

  const failedJobs: JobRecord[] = [];
  const stuckJobs: Array<JobRecord & { runningForMs: number }> = [];

  for (const job of jobs) {
    const status = String(job.status ?? "").toLowerCase();
    if (status === "complete" || status === "completed") {
      completeCount += 1;
    } else if (status === "failed") {
      failedCount += 1;
      failedJobs.push(job);
    } else if (status === "running") {
      runningCount += 1;
      if (job.started_at) {
        const started = Date.parse(job.started_at);
        if (Number.isFinite(started)) {
          const runningForMs = now - started;
          if (runningForMs > STUCK_JOB_THRESHOLD_MS) {
            stuckJobs.push({ ...job, runningForMs });
          }
        }
      }
    } else if (status === "queued" || status === "pending") {
      queuedCount += 1;
    } else {
      queuedCount += 1;
    }
  }

  const recommendation = getRecommendation(feature, jobs, failedJobs, stuckJobs);
  const payload = {
    feature,
    jobs,
    summary: {
      complete: completeCount,
      failed: failedCount,
      running: runningCount,
      queued: queuedCount,
      total: jobs.length,
      stuck: stuckJobs.length,
    },
    recommendation,
  };

  if (jsonOutput) {
    process.stdout.write(JSON.stringify(payload));
    process.exit(0);
  }

  process.stdout.write(`Feature: ${String(feature.title ?? feature.id ?? "unknown")}\n`);
  process.stdout.write(
    `Status:  ${String(feature.status ?? "unknown")}  Priority: ${String(feature.priority ?? "unknown")}\n\n`,
  );

  process.stdout.write(
    `Job Summary: ${completeCount} complete, ${failedCount} failed, ${runningCount} running, ${queuedCount} queued of ${jobs.length} total\n\n`,
  );

  process.stdout.write("Failed Jobs:\n");
  if (failedJobs.length === 0) {
    process.stdout.write("  (none)\n\n");
  } else {
    for (const job of failedJobs) {
      const retryValue = job.retry_count ?? job.retries ?? job.retry_attempts;
      const retryDisplay = retryValue === undefined ? "unknown" : String(retryValue);
      process.stdout.write(`  - ${String(job.title ?? job.id ?? "untitled")}\n`);
      process.stdout.write(`    Error: ${toIsoOrUnknown(job.error_message)}\n`);
      if (job.error_details) process.stdout.write(`    Details: ${job.error_details}\n`);
      process.stdout.write(`    Failed at: ${toIsoOrUnknown(job.completed_at ?? job.updated_at)}\n`);
      process.stdout.write(`    Retries: ${retryDisplay}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write("Stuck Jobs (running >1h):\n");
  if (stuckJobs.length === 0) {
    process.stdout.write("  (none)\n\n");
  } else {
    for (const job of stuckJobs) {
      process.stdout.write(`  ! ${String(job.title ?? job.id ?? "untitled")}\n`);
      process.stdout.write(`    Running for: ${formatDuration(job.runningForMs)}\n`);
      process.stdout.write(`    Last activity: ${toIsoOrUnknown(job.updated_at)}\n`);
    }
    process.stdout.write("\n");
  }

  process.stdout.write(`Recommendation: ${recommendation}\n`);
  process.exit(0);
}
