import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

function parseCompanyFlag(args: string[]): string | undefined {
  const idx = args.indexOf("--company");
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

export async function snapshot(args: string[]): Promise<void> {
  const companyId = parseCompanyFlag(args);
  if (!companyId) {
    process.stderr.write("Usage: zazig snapshot --company <company-id>\n");
    process.exit(1);
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ "error": "Not logged in. Run zazig login" }));
    process.exit(1);
  }

  const endpoint = new URL(`${creds.supabaseUrl}/functions/v1/get-pipeline-snapshot`);
  endpoint.searchParams.set("company_id", companyId);

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "x-company-id": companyId,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    process.stderr.write(JSON.stringify({ "error": `HTTP ${response.status}: ${body}` }));
    process.exit(1);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
