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

function parsePositionalQuery(args: string[]): string | undefined {
  const valueFlags = new Set(["--limit", "--offset", "--company", "--status", "--type"]);
  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current.startsWith("--")) continue;
    const previous = i > 0 ? args[i - 1] : undefined;
    if (previous && valueFlags.has(previous)) continue;
    return current;
  }
  return undefined;
}

export async function search(args: string[]): Promise<void> {
  const { companyId: company_id, rest } = parseCompanyFlag(args);
  if (!company_id) {
    process.stderr.write("Usage: zazig search <query> --company <company-id> [--type idea|feature|job] [--status <status>] [--limit N] [--offset N]\n");
    process.exit(1);
  }

  const query = parsePositionalQuery(rest);
  if (!query || query.trim().length === 0) {
    process.stderr.write("Usage: zazig search <query> --company <company-id> [--type idea|feature|job] [--status <status>] [--limit N] [--offset N]\n");
    process.exit(1);
  }

  const type = parseStringFlag(rest, "type");
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

  const body: Record<string, unknown> = {
    company_id,
    query,
    limit,
    offset,
  };
  if (type) body.type = type;
  if (status) body.status = status;

  const response = await fetch(`${supabaseUrl}/functions/v1/query-search`, {
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

  const data = (await response.json()) as { ideas?: { items?: unknown[]; count?: number }; features?: { items?: unknown[]; count?: number }; jobs?: { items?: unknown[]; count?: number }; total?: number };
  process.stdout.write(JSON.stringify(data, null, 2));
  const count =
    (Array.isArray(data.ideas?.items) ? data.ideas.items.length : 0) +
    (Array.isArray(data.features?.items) ? data.features.items.length : 0) +
    (Array.isArray(data.jobs?.items) ? data.jobs.items.length : 0);
  const total = typeof data.total === "number" ? data.total : count;
  process.stderr.write(
    `Showing ${offset + 1}-${offset + count} of ${total} (--limit ${limit} --offset ${offset})\n`,
  );
  process.exit(0);
}
