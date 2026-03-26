import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

function parseCompanyFlag(args: string[]): { companyId?: string; rest: string[] } {
  const idx = args.indexOf("--company");
  if (idx === -1) return { rest: args };
  const before = args.slice(0, idx);
  const after = args.slice(idx + 2);
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return { rest: [...before, ...after] };
  return { companyId: value, rest: [...before, ...after] };
}

function parseNumericFlag(args: string[], name: string): number | undefined {
  const eqValue = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (eqValue !== undefined) {
    const parsed = Number.parseInt(eqValue, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringFlag(args: string[], name: string): string | undefined {
  const eqValue = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (eqValue !== undefined) return eqValue;

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`) || args.some((arg) => arg.startsWith(`--${name}=`));
}

function printUsage(): void {
  process.stderr.write("Usage: zazig jobs --company <uuid> [flags]\n");
  process.stderr.write("\n");
  process.stderr.write("Flags:\n");
  process.stderr.write("  --company <uuid>       Company ID (required)\n");
  process.stderr.write("  --id <uuid>            Single job lookup by job ID (optional)\n");
  process.stderr.write("  --feature-id <uuid>    Filter by feature ID (optional)\n");
  process.stderr.write("  --status <string>      Filter by status e.g. queued/executing/complete (optional)\n");
  process.stderr.write("  --limit <number>       Max results (default 20)\n");
  process.stderr.write("  --offset <number>      Skip first N results (default 0)\n");
  process.stderr.write("  --help                 Show this help message\n");
}

export async function jobs(args: string[]): Promise<void> {
  if (hasFlag(args, "help")) {
    printUsage();
    process.exit(0);
  }

  const { companyId: company_id, rest } = parseCompanyFlag(args);
  if (!company_id) {
    printUsage();
    process.exit(1);
  }

  const job_id = parseStringFlag(rest, "id");
  const feature_id = parseStringFlag(rest, "feature-id");
  const status = parseStringFlag(rest, "status");
  const limit = parseNumericFlag(rest, "limit") ?? 20;
  const offset = parseNumericFlag(rest, "offset") ?? 0;

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ "error": "Not logged in. Run zazig login" }));
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

  const body = {
    company_id,
    ...(job_id ? { job_id } : {}),
    ...(feature_id ? { feature_id } : {}),
    ...(status ? { status } : {}),
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
    process.stderr.write(JSON.stringify({ "error": `HTTP ${response.status}: ${errorBody}` }));
    process.exit(1);
  }

  const data = (await response.json()) as { jobs?: unknown[]; total?: number; total_count?: number };
  process.stdout.write(JSON.stringify(data));

  const count = Array.isArray(data.jobs) ? data.jobs.length : 0;
  const total = typeof data.total === "number"
    ? data.total
    : typeof data.total_count === "number"
      ? data.total_count
      : count;
  const start = count > 0 ? offset + 1 : 0;
  const end = offset + count;
  process.stderr.write(
    `Showing ${start}-${end} of ${total} (--limit ${limit} --offset ${offset})\n`,
  );
  process.exit(0);
}
