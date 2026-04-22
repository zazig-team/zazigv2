import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

type ParsedFlag = {
  provided: boolean;
  value?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseFlag(args: string[], name: string): ParsedFlag {
  const eq = args.find((arg) => arg.startsWith(`--${name}=`));
  if (eq !== undefined) {
    const value = eq.slice(`--${name}=`.length);
    return {
      provided: true,
      value: value.length > 0 ? value : undefined,
    };
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

function parseNumericFlag(args: string[], name: string): { provided: boolean; value?: number } {
  const parsed = parseFlag(args, name);
  if (!parsed.provided) return { provided: false };
  if (!parsed.value) return { provided: true };
  const value = Number.parseInt(parsed.value, 10);
  if (!Number.isFinite(value)) return { provided: true };
  return { provided: true, value };
}

function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

function printHelp(): void {
  process.stdout.write("Usage: zazig jobs --company <company-id> [options]\n\n");
  process.stdout.write("Required:\n");
  process.stdout.write("  --company <uuid>       Company UUID\n\n");
  process.stdout.write("Options:\n");
  process.stdout.write("  --id <uuid>            Fetch a single job by id\n");
  process.stdout.write("  --feature-id <uuid>    Filter jobs by feature id\n");
  process.stdout.write("  --status <value>       Filter jobs by status\n");
  process.stdout.write("  --limit <number>       Max results per page (default: 20)\n");
  process.stdout.write("  --offset <number>      Results offset (default: 0)\n");
  process.stdout.write("  --help                 Show this help\n");
}

function fail(message: string): never {
  process.stderr.write(JSON.stringify({ error: message }));
  process.exit(1);
}

export async function jobs(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h") || args.includes("help")) {
    printHelp();
    process.exit(0);
  }

  const company = parseFlag(args, "company");
  const id = parseFlag(args, "id");
  const featureId = parseFlag(args, "feature-id");
  const status = parseFlag(args, "status");
  const limitFlag = parseNumericFlag(args, "limit");
  const offsetFlag = parseNumericFlag(args, "offset");

  if (!company.value) {
    fail("Missing required flag: --company <uuid>");
  }
  if (!isUuid(company.value)) {
    fail("Invalid --company value: expected UUID");
  }
  if (id.provided && !id.value) {
    fail("Invalid --id value: expected UUID");
  }
  if (id.value && !isUuid(id.value)) {
    fail("Invalid --id value: expected UUID");
  }
  if (featureId.provided && !featureId.value) {
    fail("Invalid --feature-id value: expected UUID");
  }
  if (featureId.value && !isUuid(featureId.value)) {
    fail("Invalid --feature-id value: expected UUID");
  }
  if (status.provided && status.value === undefined) {
    fail("Invalid --status value");
  }
  if (limitFlag.provided && limitFlag.value === undefined) {
    fail("Invalid --limit value: expected number");
  }
  if (offsetFlag.provided && offsetFlag.value === undefined) {
    fail("Invalid --offset value: expected number");
  }
  if (limitFlag.value !== undefined && limitFlag.value < 0) {
    fail("Invalid --limit value: expected non-negative number");
  }
  if (offsetFlag.value !== undefined && offsetFlag.value < 0) {
    fail("Invalid --offset value: expected non-negative number");
  }

  const limit = limitFlag.value ?? 20;
  const offset = offsetFlag.value ?? 0;
  const company_id = company.value;

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

  const body = {
    company_id,
    ...(id.value ? { id: id.value } : {}),
    ...(featureId.value ? { feature_id: featureId.value } : {}),
    ...(status.value !== undefined ? { status: status.value } : {}),
    limit,
    offset,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/query-jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      "x-company-id": company_id,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    fail(`HTTP ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as { jobs?: unknown[]; total?: number };
  process.stdout.write(JSON.stringify(data));
  const count = Array.isArray(data.jobs) ? data.jobs.length : 0;
  const total = typeof data.total === "number" ? data.total : count;
  process.stderr.write(
    `Showing ${offset + 1}-${offset + count} of ${total} (--limit ${limit} --offset ${offset})\n`,
  );

  // Human-readable summary of jobs
  if (Array.isArray(data.jobs) && data.jobs.length > 0) {
    process.stderr.write("\n");
    for (const job of data.jobs as Record<string, unknown>[]) {
      const statusStr = String(job.status ?? "unknown").toUpperCase();
      const title = String(job.title ?? job.id ?? "untitled");
      const created_at = job.created_at ? String(job.created_at) : "";
      const updated_at = job.updated_at ? String(job.updated_at) : "";
      const completed_at = job.completed_at ? String(job.completed_at) : "";
      const feature_id = job.feature_id ? String(job.feature_id) : "";
      process.stderr.write(`[${statusStr}] ${title}\n`);
      if (created_at) process.stderr.write(`  created:   ${created_at}\n`);
      if (updated_at) process.stderr.write(`  updated:   ${updated_at}\n`);
      if (completed_at) process.stderr.write(`  completed: ${completed_at}\n`);
      if (feature_id) process.stderr.write(`  feature:   ${feature_id}\n`);
      if (job.status === "failed") {
        const error_message = job.error_message ? String(job.error_message) : "";
        const error_details = job.error_details ? String(job.error_details) : "";
        if (error_message) process.stderr.write(`  Error: ${error_message}\n`);
        if (error_details) process.stderr.write(`  Details: ${error_details}\n`);
      }
    }
  }

  process.exit(0);
}
