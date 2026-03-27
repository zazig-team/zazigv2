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

function parseCommaSeparatedFlag(args: string[], name: string): string[] | undefined {
  const value = parseStringFlag(args, name);
  if (value === undefined) return undefined;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function fail(error: unknown): never {
  if (typeof error === "string") {
    process.stderr.write(JSON.stringify({ error }));
  } else {
    process.stderr.write(JSON.stringify(error));
  }
  process.exit(1);
}

function printHelp(): void {
  const help = `Usage: zazig create-project-rule --company <uuid> --project-id <uuid> --rule-text <string> --applies-to <string>

Flags:
  --company <uuid>       Company ID (required)
  --project-id <uuid>    Project ID to add the rule to (required)
  --rule-text <string>   Rule text (required)
  --applies-to <string>  Comma-separated job types (required, e.g. "code,combine")
  --help, -h             Show this help and exit

Example:
  zazig create-project-rule --company <uuid> --project-id <uuid> --rule-text "Always use TypeScript" --applies-to "code,combine"`;
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
  const rule_text = parseStringFlag(args, "rule-text");
  const applies_to = parseCommaSeparatedFlag(args, "applies-to");

  if (!project_id) fail("Missing required flag: --project-id <uuid>");
  if (!rule_text) fail("Missing required flag: --rule-text <string>");
  if (!applies_to || applies_to.length === 0) {
    fail("Missing required flag: --applies-to <string> (comma-separated, e.g. code,combine)");
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
    const errorText = await response.text().catch(() => "");
    let errorJson: unknown;
    try {
      errorJson = errorText ? JSON.parse(errorText) : { error: "unknown error" };
    } catch {
      errorJson = { error: errorText || "unknown error" };
    }
    fail({
      status: response.status,
      ...((errorJson && typeof errorJson === "object") ? errorJson : { error: String(errorJson) }),
    });
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
