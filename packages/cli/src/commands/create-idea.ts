import { getValidCredentials } from "../lib/credentials.js";
import { DEFAULT_SUPABASE_ANON_KEY } from "../lib/constants.js";
import { loadConfig } from "../lib/config.js";

const VALID_SOURCE = new Set(["terminal", "slack", "telegram", "agent", "web", "api", "monitoring"]);
const VALID_DOMAIN = new Set(["product", "engineering", "marketing", "cross-cutting", "unknown"]);
const VALID_PRIORITY = new Set(["low", "medium", "high", "urgent"]);

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

function fail(error: string): never {
  process.stderr.write(JSON.stringify({ error }));
  process.exit(1);
}

function printHelp(): void {
  const help = `Usage: zazig create-idea --company <uuid> --raw-text <string> --originator <string> [options]

Flags:
  --company <uuid>        Company ID (required)
  --raw-text <string>     Raw idea text (required)
  --originator <string>   Who submitted the idea (required)
  --title <string>        Idea title (optional)
  --description <string>  Idea description (optional)
  --source <enum>         Source channel: terminal, slack, telegram, agent, web, api, monitoring (optional)
  --domain <enum>         Domain: product, engineering, marketing, cross-cutting, unknown (optional)
  --priority <enum>       Priority: low, medium, high, urgent (optional)
  --scope <string>        Scope description (optional)
  --complexity <string>   Complexity estimate (optional)
  --tags <csv>            Comma-separated tags (optional)
  --project-id <uuid>     Project ID (optional)

Example:
  zazig create-idea --company <uuid> --raw-text "We should add dark mode" --originator "alice" --source terminal --priority medium`;
  console.log(help);
  process.exit(0);
}

export async function createIdea(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
  }

  const company_id = parseStringFlag(args, "company");
  if (!company_id) fail("Missing required flag: --company <uuid>");

  const raw_text = parseStringFlag(args, "raw-text");
  const originator = parseStringFlag(args, "originator");
  const title = parseStringFlag(args, "title");
  const description = parseStringFlag(args, "description");
  const source = parseStringFlag(args, "source");
  const domain = parseStringFlag(args, "domain");
  const priority = parseStringFlag(args, "priority");
  const scope = parseStringFlag(args, "scope");
  const complexity = parseStringFlag(args, "complexity");
  const tags = parseCommaSeparatedFlag(args, "tags");
  const project_id = parseStringFlag(args, "project-id");

  if (!raw_text) fail("Missing required flag: --raw-text");
  if (!originator) fail("Missing required flag: --originator");
  if (source !== undefined && !VALID_SOURCE.has(source)) {
    fail("Invalid --source. Expected one of: terminal, slack, telegram, agent, web, api, monitoring");
  }
  if (domain !== undefined && !VALID_DOMAIN.has(domain)) {
    fail("Invalid --domain. Expected one of: product, engineering, marketing, cross-cutting, unknown");
  }
  if (priority !== undefined && !VALID_PRIORITY.has(priority)) {
    fail("Invalid --priority. Expected one of: low, medium, high, urgent");
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
    raw_text,
    originator,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(source !== undefined ? { source } : {}),
    ...(domain !== undefined ? { domain } : {}),
    ...(priority !== undefined ? { priority } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(complexity !== undefined ? { complexity } : {}),
    ...(tags !== undefined ? { tags } : {}),
    ...(project_id !== undefined ? { project_id } : {}),
  };

  const response = await fetch(`${supabaseUrl}/functions/v1/create-idea`, {
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
