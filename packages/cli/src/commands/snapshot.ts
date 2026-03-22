import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function snapshot(): Promise<void> {
  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ "error": "Not logged in. Run zazig login" }));
    process.exit(1);
  }

  const cfg = loadConfig();
  const companyId = cfg.company_id ?? "";

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
