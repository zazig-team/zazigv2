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

function parseStringFlag(args: string[], name: string): string | undefined {
  const eqValue = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (eqValue !== undefined) return eqValue;

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

export async function ideas(args: string[]): Promise<void> {
  const companyId = parseCompanyFlag(args);
  if (!companyId) {
    process.stderr.write("Usage: zazig ideas --company <company-id>\n");
    process.exit(1);
  }

  const status = parseStringFlag(args, "status");
  const ideaId = parseStringFlag(args, "id");
  const source = parseStringFlag(args, "source");
  const domain = parseStringFlag(args, "domain");
  const search = parseStringFlag(args, "search");
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

  const body = {
    company_id: companyId,
    ...(status !== undefined ? { status } : {}),
    ...(ideaId !== undefined ? { idea_id: ideaId } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(domain !== undefined ? { domain } : {}),
    ...(search !== undefined ? { search } : {}),
    limit,
    offset,
  };

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetch(`${supabaseUrl}/functions/v1/query-ideas`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      "x-company-id": companyId,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    process.stderr.write(JSON.stringify({ "error": `HTTP ${response.status}: ${errorBody}` }));
    process.exit(1);
  }

  const data = (await response.json()) as { ideas?: unknown[]; total?: number };
  process.stdout.write(JSON.stringify(data));
  const count = Array.isArray(data.ideas) ? data.ideas.length : 0;
  const total = typeof data.total === "number" ? data.total : count;
  process.stderr.write(
    `Showing ${offset + 1}-${offset + count} of ${total} (--limit ${limit} --offset ${offset})\n`,
  );
  process.exit(0);
}
