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

function parseBooleanFlag(args: string[], name: string): boolean | undefined {
  const eq = args.find((a) => a.startsWith(`--${name}=`));
  if (eq) {
    const value = eq.slice(`--${name}=`.length).trim().toLowerCase();
    if (value === "" || value === "true") return true;
    if (value === "false") return false;
    return undefined;
  }

  const idx = args.indexOf(`--${name}`);
  if (idx === -1) return false;
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) return true;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return undefined;
}

function fail(error: string, details?: string): never {
  process.stderr.write(JSON.stringify(details ? { error, details } : { error }));
  process.exit(1);
}

function printHelp(): void {
  const help = `Usage: zazig start-expert-session --company <uuid> --role-name <string> --brief <string> --project-id <uuid> [options]

Flags:
  --company <uuid>         Company ID (required)
  --role-name <string>     Role to start (required)
  --brief <string>         Session brief (required)
  --machine-name <string>  Machine name (default: auto)
  --project-id <uuid>      Project ID to scope the session (required)
  --headless               Run headless (optional, presence = true)
  --batch-id <string>      Batch ID to associate session with (optional)

Example:
  zazig start-expert-session --company <uuid> --role-name test-deployment-expert --brief "Run deployment checks" --project-id <uuid> --headless`;
  console.log(help);
  process.exit(0);
}

export async function startExpertSession(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const role_name = parseStringFlag(args, "role-name");
  const brief = parseStringFlag(args, "brief");
  const machine_name = parseStringFlag(args, "machine-name") ?? "auto";
  const project_id = parseStringFlag(args, "project-id");
  const headless = parseBooleanFlag(args, "headless");
  const batch_id = parseStringFlag(args, "batch-id");

  if (!role_name) fail("Missing required flag: --role-name");
  if (!brief) fail("Missing required flag: --brief");
  if (!project_id) fail("Missing required flag: --project-id");
  if (args.some((a) => a.startsWith("--headless")) && headless === undefined) {
    fail("Invalid --headless. Use --headless, --headless=true, or --headless=false");
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
    role_name,
    brief,
    machine_name,
    project_id,
    headless,
    ...(batch_id !== undefined ? { batch_id } : {}),
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/start-expert-session`, {
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
    fail(`HTTP ${response.status}`, errorBody);
  }

  const data = await response.json();
  process.stdout.write(JSON.stringify(data));
  process.exit(0);
}
