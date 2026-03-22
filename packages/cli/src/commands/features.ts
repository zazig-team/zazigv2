import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function features(args: string[]): Promise<void> {
  const project_id = args.find((a) => !a.startsWith("--"));
  const idFlag = args.find((a) => a.startsWith("--id="));
  const statusFlag = args.find((a) => a.startsWith("--status="));

  const feature_id = idFlag?.slice("--id=".length);
  const status = statusFlag?.slice("--status=".length);

  if (!project_id && !feature_id) {
    process.stderr.write(JSON.stringify({ error: "project_id or --id is required" }));
    process.exit(1);
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ error: "Not logged in. Run zazig login" }));
    process.exit(1);
  }

  let company_id: string | undefined;
  try {
    company_id = loadConfig().company_id;
  } catch {
    company_id = undefined;
  }

  const body = {
    ...(project_id ? { project_id } : {}),
    ...(feature_id ? { feature_id } : {}),
    ...(status ? { status } : {}),
  };

  const response = await fetch(`${creds.supabaseUrl}/functions/v1/query-features`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: DEFAULT_SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(company_id ? { "x-company-id": company_id } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    process.stderr.write(JSON.stringify({ error: `HTTP ${response.status}: ${errorBody}` }));
    process.exit(1);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
