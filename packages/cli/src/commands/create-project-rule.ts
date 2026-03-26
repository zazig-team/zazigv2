import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

function parseStringFlag(args: string[], name: string): string | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    const value = eq.slice(`--${name}=`.length);
    return value.length > 0 ? value : undefined;
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

function fail(error: string): never {
  process.stderr.write(JSON.stringify({ error }));
  process.exit(1);
}

function printHelp(): void {
  const help = `Usage: zazig create-project-rule --company <uuid> --project-id <uuid> --rule-text <string> --applies-to <comma-separated>

Flags:
  --company <uuid>              Company ID (required)
  --project-id <uuid>           Project ID (required)
  --rule-text <string>          The rule content to record (required)
  --applies-to <string>         Comma-separated list of job types this rule applies to (required, e.g. code,combine)

Example:
  zazig create-project-rule --company <uuid> --project-id <uuid> --rule-text "Always run tests before merging" --applies-to code,combine`;
  console.log(help);
  process.exit(0);
}

export async function createProjectRule(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const project_id = parseStringFlag(args, "project-id");
  if (!project_id) fail("Missing required flag: --project-id <uuid>");

  const rule_text = parseStringFlag(args, "rule-text");
  if (!rule_text) fail("Missing required flag: --rule-text <string>");

  const appliesToRaw = parseStringFlag(args, "applies-to");
  if (!appliesToRaw) fail("Missing required flag: --applies-to (comma-separated, e.g. code,combine)");

  const applies_to = appliesToRaw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (applies_to.length === 0) {
    fail("--applies-to must be a non-empty comma-separated list");
  }

  let creds;
  try {
    creds = await getValidCredentials();
  } catch {
    fail("Not logged in. Run zazig login");
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
    company_id,
    project_id,
    rule_text,
    applies_to,
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/create-project-rule`, {
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
    fail(`HTTP ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
