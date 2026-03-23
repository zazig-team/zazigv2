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

export async function projects(args: string[]): Promise<void> {
  const company_id = parseCompanyFlag(args);
  if (!company_id) {
    process.stderr.write("Usage: zazig projects --company <company-id>\n");
    process.exit(1);
  }

  const includeFeatures = args.includes("--include-features");

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

  const select = includeFeatures ? "id,name,description,status,features(id,title,description,priority,status)" : "id,name,description,status";

  const url = `${supabaseUrl}/rest/v1/projects?select=${select}&company_id=eq.${company_id}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      Prefer: "return=representation",
      "x-company-id": company_id,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    process.stderr.write(JSON.stringify({ "error": `HTTP ${response.status}: ${body}` }));
    process.exit(1);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
