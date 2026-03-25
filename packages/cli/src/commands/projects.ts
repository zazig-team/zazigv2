import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

function parseCompanyFlag(args: string[]): string | undefined {
  const idx = args.indexOf("--company");
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
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

export async function projects(args: string[]): Promise<void> {
  const company_id = parseCompanyFlag(args);
  if (!company_id) {
    process.stderr.write("Usage: zazig projects --company <company-id>\n");
    process.exit(1);
  }

  const includeFeatures = args.includes("--include-features");
  const limit = parseNumericFlag(args, "limit") ?? 20;
  const offset = parseNumericFlag(args, "offset") ?? 0;

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

  // query-projects returns the same base projection as select=id,name,description,status.
  const body = {
    company_id,
    limit,
    offset,
    include_features: includeFeatures,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/query-projects`, {
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
    const body = await response.text();
    process.stderr.write(JSON.stringify({ "error": `HTTP ${response.status}: ${body}` }));
    process.exit(1);
  }

  const data = (await response.json()) as { projects?: unknown[]; total?: number };
  process.stdout.write(JSON.stringify(data));
  const count = Array.isArray(data.projects) ? data.projects.length : 0;
  const total = typeof data.total === "number" ? data.total : count;
  process.stderr.write(
    `Showing ${offset + 1}-${offset + count} of ${total} (--limit ${limit} --offset ${offset})\n`,
  );
  process.exit(0);
}
