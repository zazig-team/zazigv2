import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function projects(args: string[]): Promise<void> {
  const includeFeatures = args.includes("--include-features");

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ "error": "Not logged in. Run zazig login" }));
    process.exit(1);
  }

  const { company_id } = loadConfig();

  const select = includeFeatures ? "id,name,description,status,features(id,title,description,priority,status)" : "id,name,description,status";

  const url = `${creds.supabaseUrl}/rest/v1/projects?select=${select}&company_id=eq.${company_id}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      Prefer: "return=representation",
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
