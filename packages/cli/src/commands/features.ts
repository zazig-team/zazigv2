import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";

function parseCompanyFlag(args: string[]): { companyId?: string; rest: string[] } {
  const idx = args.indexOf("--company");
  if (idx === -1) return { rest: args };
  const before = args.slice(0, idx);
  const after = args.slice(idx + 2);
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return { rest: [...before, ...after] };
  return { companyId: value, rest: [...before, ...after] };
}

export async function features(args: string[]): Promise<void> {
  const { companyId: company_id, rest } = parseCompanyFlag(args);
  if (!company_id) {
    process.stderr.write("Usage: zazig features --company <company-id>\n");
    process.exit(1);
  }

  const project_id = rest.find((a) => !a.startsWith("--"));
  const idFlag = rest.find((a) => a.startsWith("--id="));
  const statusFlag = rest.find((a) => a.startsWith("--status="));

  const feature_id = idFlag?.slice("--id=".length);
  const status = statusFlag?.slice("--status=".length);

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

  const body = {
    company_id,
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
      "x-company-id": company_id,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown error");
    process.stderr.write(JSON.stringify({ "error": `HTTP ${response.status}: ${errorBody}` }));
    process.exit(1);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
