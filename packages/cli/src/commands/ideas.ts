import { getValidCredentials } from "../lib/credentials.js";
import { loadConfig } from "../lib/config.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

export async function ideas(args: string[]): Promise<void> {
  const status = args.find((a) => a.startsWith("--status="))?.split("=")[1];
  const ideaId = args.find((a) => a.startsWith("--id="))?.split("=")[1];
  const source = args.find((a) => a.startsWith("--source="))?.split("=")[1];
  const domain = args.find((a) => a.startsWith("--domain="))?.split("=")[1];
  const search = args.find((a) => a.startsWith("--search="))?.split("=")[1];
  const limitRaw = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = limitRaw !== undefined ? Number.parseInt(limitRaw, 10) : undefined;

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    process.stderr.write(JSON.stringify({ error: "Not logged in. Run zazig login" }));
    process.exit(1);
  }

  const cfg = loadConfig();
  const body = {
    company_id: cfg.company_id,
    ...(status !== undefined ? { status } : {}),
    ...(ideaId !== undefined ? { idea_id: ideaId } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(domain !== undefined ? { domain } : {}),
    ...(search !== undefined ? { search } : {}),
    ...(limit !== undefined && Number.isFinite(limit) ? { limit } : {}),
  };

  const anonKey = process.env["SUPABASE_ANON_KEY"] ?? DEFAULT_SUPABASE_ANON_KEY;
  const response = await fetch(`${creds.supabaseUrl}/functions/v1/query-ideas`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      apikey: anonKey,
      "Content-Type": "application/json",
      "x-company-id": cfg.company_id ?? "",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    process.stderr.write(JSON.stringify({ error: `HTTP ${response.status}: ${errorBody}` }));
    process.exit(1);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
