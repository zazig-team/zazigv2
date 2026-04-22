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

function parseProjectIdArg(args: string[]): string | undefined {
  const valueFlags = new Set(["--limit", "--offset", "--company", "--status", "--id"]);
  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current.startsWith("--")) continue;
    const previous = i > 0 ? args[i - 1] : undefined;
    if (previous && valueFlags.has(previous)) continue;
    return current;
  }
  return undefined;
}

export async function features(args: string[]): Promise<void> {
  const { companyId: company_id, rest } = parseCompanyFlag(args);
  if (!company_id) {
    process.stderr.write("Usage: zazig features --company <company-id>\n");
    process.exit(1);
  }

  const project_id = parseProjectIdArg(rest);
  const feature_id = parseStringFlag(rest, "id");
  const status = parseStringFlag(rest, "status");
  const limit = parseNumericFlag(rest, "limit") ?? 20;
  const offset = parseNumericFlag(rest, "offset") ?? 0;

  if (!project_id && !feature_id) {
    process.stderr.write(JSON.stringify({ "error": "project_id or --id is required" }));
    process.exit(1);
  }

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
    ...(project_id ? { project_id } : {}),
    ...(feature_id ? { feature_id } : {}),
    ...(status ? { status } : {}),
    limit,
    offset,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/query-features`, {
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

  type Feature = {
    id: string;
    title?: string;
    status?: string;
    failed_job_count?: number;
    critical_error_count?: number;
    health?: string;
  };
  const data = (await response.json()) as { features?: Feature[]; total?: number };
  process.stdout.write(JSON.stringify(data));
  const featureList = Array.isArray(data.features) ? data.features : [];
  const count = featureList.length;
  const total = typeof data.total === "number" ? data.total : count;
  process.stderr.write(
    `Showing ${offset + 1}-${offset + count} of ${total} (--limit ${limit} --offset ${offset})\n`,
  );
  for (const f of featureList) {
    const health = f.health ?? "healthy";
    const failedCount = f.failed_job_count ?? 0;
    const criticalCount = f.critical_error_count ?? 0;
    if (health !== "healthy" || failedCount > 0) {
      process.stderr.write(
        `  [${health.toUpperCase()}] ${f.title ?? f.id} — failed_job_count: ${failedCount}, critical_error_count: ${criticalCount}\n`,
      );
    }
  }
  process.exit(0);
}
